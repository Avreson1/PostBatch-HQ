/**
 * PostBatch B2B SaaS Enterprise Dashboard
 * ========================================
 *
 * Professional executive dashboard for Saturday Boardroom Pitch Presentation:
 *   - Fixed Left Sidebar (dark theme: bg-slate-900)
 *   - Main Content Area (light theme: bg-slate-50)
 *   - Clean White Top Navbar with PostBatch Logo, Live API/Test Mode toggle, User Avatar
 *   - Two primary views:
 *       1. Merchant Simulator (Centered Shopify/WooCommerce checkout card)
 *       2. Fleet Dispatch Hub (12-column grid: Orders table + Leaflet GIS Map)
 *   - Instant transitions and high-performance reactive store
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { clusterOrders, SEED_ORDERS } from 'postbatch-engine';
import CheckoutView from './CheckoutView.jsx';
import RiderView from './RiderView.jsx';
import {
  NIPOST_API_KEY,
  NIPOST_API_URL,
  generateBoundingPolygon,
} from './src/services/nipostApi.js';

// Pre-initialize seed orders with GeoJSON delivery polygons
const INITIAL_SEED_ORDERS = SEED_ORDERS.map((order) => ({
  ...order,
  status: order.status || 'pending',
  polygon:
    order.polygon ||
    generateBoundingPolygon(
      order.coordinates.lat,
      order.coordinates.lng,
      order.formatted,
      order.names?.district || 'Delivery Zone'
    ),
  apiSource: 'offline_fallback',
}));

// ---------------------------------------------------------------------------
// Leaflet Marker DivIcon with Stop Number
// ---------------------------------------------------------------------------
function createStopIcon(stopNumber, colorHex, isSelected = false) {
  const size = isSelected ? 34 : 28;
  const borderSize = isSelected ? 3 : 2;
  const shadow = isSelected
    ? '0 0 12px rgba(255,255,255,0.9), 0 4px 8px rgba(0,0,0,0.5)'
    : '0 2px 6px rgba(0,0,0,0.35)';

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background-color: ${colorHex};
        color: #ffffff;
        width: ${size}px;
        height: ${size}px;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 800;
        font-size: ${isSelected ? '14px' : '12px'};
        border: ${borderSize}px solid #ffffff;
        box-shadow: ${shadow};
      ">
        ${stopNumber}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

// ---------------------------------------------------------------------------
// Dynamic Map Viewport Controller (Auto-fit & Resize handling)
// ---------------------------------------------------------------------------
function MapController({ bounds, selectedOrder, activeTab }) {
  const map = useMap();

  // Invalidate map size on tab switch or mount so Leaflet fills container cleanly
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 60);
    return () => clearTimeout(timer);
  }, [activeTab, map]);

  useEffect(() => {
    if (selectedOrder?.coordinates?.lat && selectedOrder?.coordinates?.lng) {
      map.flyTo([selectedOrder.coordinates.lat, selectedOrder.coordinates.lng], 15, {
        duration: 0.6,
      });
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 14,
      });
    }
  }, [bounds, selectedOrder, map]);

  return null;
}

// ===========================================================================
// Sub-Component: Fleet Dispatch Hub (View 2)
// ===========================================================================
function FleetDispatchHub({
  orders,
  incomingOrders = orders,
  batches = [],
  isClustering,
  onRunCluster,
  selectedOrder,
  setSelectedOrder,
  activeBatchKey,
  setActiveBatchKey,
  searchTerm,
  setSearchTerm,
  isLiveMode,
  activeTab,
  hasClustered,
  isClustered,
}) {
  // Identify selected batch if activeBatchKey is set (by districtKey, district name, or batchId)
  const selectedBatch = useMemo(() => {
    if (!activeBatchKey || !batches || batches.length === 0) return null;
    return (
      batches.find(
        (b) =>
          b.districtKey === activeBatchKey ||
          b.district?.toLowerCase() === activeBatchKey.toLowerCase() ||
          b.batchId === activeBatchKey ||
          b.zoneName === activeBatchKey ||
          b.districtCode === activeBatchKey
      ) || null
    );
  }, [batches, activeBatchKey]);

  // Determine whether clustering has already occurred
  const isClusteringDone = useMemo(() => {
    if (typeof hasClustered === 'boolean') return hasClustered;
    if (typeof isClustered === 'boolean') return isClustered;
    return Array.isArray(batches) && batches.length > 0;
  }, [hasClustered, isClustered, batches]);

  // Update table header title according to requirements:
  // - If a specific zone is selected on the map (e.g., "Wuse"): "{Zone Name} Batch Orders" (e.g., "Wuse Batch Orders")
  // - Otherwise: "Incoming Orders"
  const tableTitle = useMemo(() => {
    if (selectedBatch) {
      const zoneName =
        selectedBatch.district ||
        selectedBatch.names?.district ||
        selectedBatch.zoneName ||
        'Zone';
      return `${zoneName} Batch Orders`;
    }
    if (activeBatchKey) {
      return `${activeBatchKey} Batch Orders`;
    }
    return 'Incoming Orders';
  }, [selectedBatch, activeBatchKey]);

  // Filter batches displayed on GIS Leaflet map
  const displayedBatches = useMemo(() => {
    if (!activeBatchKey) return batches || [];
    return (batches || []).filter(
      (b) =>
        b.districtKey === activeBatchKey ||
        b.district?.toLowerCase() === activeBatchKey.toLowerCase()
    );
  }, [batches, activeBatchKey]);

  const mapBounds = useMemo(() => {
    const coords = [];
    for (const b of displayedBatches) {
      for (const o of b.orders || []) {
        if (o.coordinates?.lat && o.coordinates?.lng) {
          coords.push([o.coordinates.lat, o.coordinates.lng]);
        }
      }
    }
    return coords;
  }, [displayedBatches]);

  const orderBatchMeta = useMemo(() => {
    const meta = new Map();
    if (batches) {
      for (const batch of batches) {
        for (const order of batch.orders || []) {
          meta.set(order.orderId, {
            batchId: batch.batchId,
            districtKey: batch.districtKey,
            riderName: batch.riderName,
            color: batch.color,
            stopSequence: order.stopSequence,
          });
        }
      }
    }
    return meta;
  }, [batches]);

  // Determine table data source according to requirements:
  // 1. If a specific zone is selected on the map: populate with orders belonging to that clustered batch
  // 2. If "All Zones" is selected AND clustering has occurred: display all orders from all dispatched batches
  // 3. If "All Zones" is selected and clustering has NOT occurred: display raw incomingOrders
  const baseOrders = useMemo(() => {
    if (selectedBatch) {
      return selectedBatch.orders || [];
    }

    if (activeBatchKey) {
      const matched = (batches || []).find(
        (b) =>
          b.districtKey === activeBatchKey ||
          b.district?.toLowerCase() === activeBatchKey.toLowerCase()
      );
      if (matched?.orders) return matched.orders;
      const rawList = incomingOrders || orders || [];
      return rawList.filter(
        (o) =>
          o.batchKey === activeBatchKey ||
          o.segments?.district === activeBatchKey ||
          o.names?.district?.toLowerCase() === activeBatchKey.toLowerCase()
      );
    }

    if (isClusteringDone) {
      const allBatchOrders = (batches || []).flatMap((b) => b.orders || []);
      if (allBatchOrders.length > 0) {
        return allBatchOrders;
      }
    }

    return incomingOrders || orders || [];
  }, [selectedBatch, activeBatchKey, isClusteringDone, batches, incomingOrders, orders]);

  // Apply user search filter across displayed orders
  const filteredOrders = useMemo(() => {
    if (!searchTerm) return baseOrders;
    const term = searchTerm.toLowerCase();
    return baseOrders.filter(
      (o) =>
        o.orderId?.toLowerCase().includes(term) ||
        o.customerName?.toLowerCase().includes(term) ||
        o.item?.toLowerCase().includes(term) ||
        o.formatted?.toLowerCase().includes(term) ||
        o.postcode?.toLowerCase().includes(term) ||
        o.names?.district?.toLowerCase().includes(term) ||
        o.names?.lga?.toLowerCase().includes(term) ||
        o.names?.area?.toLowerCase().includes(term) ||
        o.address?.toLowerCase().includes(term)
    );
  }, [baseOrders, searchTerm]);

  return (
    <div className="h-full p-6 overflow-hidden">
      {/* 12-Column CSS Grid Layout */}
      <div className="grid grid-cols-12 gap-6 h-full">

        {/* ------------------------------------------------------------- */}
        {/* Left Column (col-span-5): Pristine White Card with Orders     */}
        {/* ------------------------------------------------------------- */}
        <div className="col-span-12 lg:col-span-5 flex flex-col h-full min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          
          {/* Card Header & Auto-Cluster Routes Action */}
          <div className="p-4 border-b border-slate-100 bg-white shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  {tableTitle}
                </h2>
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {filteredOrders.length} Parcels
                </span>
              </div>

              {/* Primary Action Button: Auto-Cluster Routes */}
              <button
                type="button"
                onClick={onRunCluster}
                disabled={isClustering}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm py-2 px-3.5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span className={isClustering ? 'animate-spin' : ''}>⚡</span>
                <span>{isClustering ? 'Clustering…' : 'Auto-Cluster Routes'}</span>
              </button>
            </div>

            {/* Subtitle & Quick Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {selectedBatch
                  ? `${selectedBatch.riderName || 'Rider'} · ${selectedBatch.totalOrders || filteredOrders.length} stops (${selectedBatch.estimatedRouteDistanceKm || 0} km route)`
                  : '5-segment NIPOST validated postcodes ready for batch dispatch'}
              </p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search order ID, customer, district, postcode…"
                className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Orders Data Table */}
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">Stop / Batch</th>
                  <th className="px-3.5 py-2.5">Order &amp; Customer</th>
                  <th className="px-3.5 py-2.5 font-mono">5-Segment Postcode</th>
                  <th className="px-3.5 py-2.5">District / LGA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      No matching orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const meta = orderBatchMeta.get(order.orderId);
                    const isSelected = selectedOrder?.orderId === order.orderId;
                    const stopNum = order.stopSequence ?? meta?.stopSequence;
                    const batchDistrictKey = order.batchKey || meta?.districtKey || selectedBatch?.districtKey;
                    const batchColor =
                      order.status === 'delivered'
                        ? '#10b981'
                        : meta?.color?.hex || selectedBatch?.color?.hex || '#4f46e5';
                    const hasAssignment = Boolean(stopNum !== undefined || meta || order.batchKey);

                    return (
                      <tr
                        key={order.orderId}
                        onClick={() => setSelectedOrder(order)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/80 border-l-4 border-indigo-600 font-medium'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Stop / Batch */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          {hasAssignment ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm"
                                style={{
                                  backgroundColor: batchColor,
                                }}
                              >
                                {order.status === 'delivered' ? '✓' : stopNum}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-800">
                                {batchDistrictKey}
                              </span>
                              {order.status === 'delivered' && (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded">
                                  Delivered
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>

                        {/* Order ID & Customer */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{order.orderId}</div>
                          <div className="text-[11px] text-slate-500">{order.customerName}</div>
                        </td>

                        {/* Postcode */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px]">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            <span>{order.formatted || order.postcode}</span>
                          </span>
                        </td>

                        {/* District / LGA */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="font-medium text-slate-800">
                            {order.names?.district || selectedBatch?.district || '—'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[120px]" title={order.address}>
                            {order.names?.area || order.names?.lga || selectedBatch?.lga || '—'}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Dispatched Batches / Rider Summary Footer */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Dispatched Batches ({batches.length})
              </span>
              {activeBatchKey && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveBatchKey(null);
                    setSelectedOrder(null);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Show All Zones
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {batches.map((batch) => {
                const isActive = activeBatchKey === batch.districtKey;
                return (
                  <button
                    key={batch.batchId}
                    type="button"
                    onClick={() => {
                      setActiveBatchKey(isActive ? null : batch.districtKey);
                      setSelectedOrder(null);
                    }}
                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {batch.district}
                      </span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: batch.color.hex }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {batch.totalOrders} stops · {batch.estimatedRouteDistanceKm} km
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* ------------------------------------------------------------- */}
        {/* Right Column (col-span-7): Leaflet.js Map Spanning Full H    */}
        {/* ------------------------------------------------------------- */}
        <div className="col-span-12 lg:col-span-7 flex flex-col h-full min-h-0 bg-slate-900 rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
          
          {/* Map Top Toolbar Overlay */}
          <div className="bg-slate-900/90 backdrop-blur px-4 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Fleet Dispatch Map · GIS Polygons
              </h3>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveBatchKey(null);
                  setSelectedOrder(null);
                }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  activeBatchKey === null
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All Zones ({orders.length})
              </button>

              {batches.map((b) => (
                <button
                  key={b.batchId}
                  type="button"
                  onClick={() => {
                    setActiveBatchKey(activeBatchKey === b.districtKey ? null : b.districtKey);
                    setSelectedOrder(null);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    activeBatchKey === b.districtKey
                      ? 'text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  style={activeBatchKey === b.districtKey ? { backgroundColor: b.color.hex } : {}}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: b.color.hex }}
                  />
                  <span>{b.district}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Leaflet Map Container */}
          <div className="flex-1 relative w-full h-full min-h-0">
            <MapContainer
              center={[9.055, 7.485]}
              zoom={13}
              scrollWheelZoom={true}
              className="h-full w-full"
              style={{ background: '#0f172a' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

              <MapController bounds={mapBounds} selectedOrder={selectedOrder} activeTab={activeTab} />

              {/* Render Delivery Zone Polygons */}
              {displayedBatches.map((batch) =>
                batch.orders.map((order) => {
                  if (!order.polygon) return null;
                  const isSelected = selectedOrder?.orderId === order.orderId;

                  const rawCoords =
                    order.polygon.geometry?.coordinates?.[0] ||
                    order.polygon.coordinates?.[0];

                  if (!rawCoords || !Array.isArray(rawCoords)) return null;

                  const latLngCoords = rawCoords.map(([lng, lat]) => [lat, lng]);

                  return (
                    <Polygon
                      key={`polygon-${order.orderId}`}
                      positions={latLngCoords}
                      pathOptions={{
                        color: batch.color.hex,
                        fillColor: batch.color.hex,
                        fillOpacity: isSelected ? 0.45 : 0.2,
                        weight: isSelected ? 3 : 1.5,
                        dashArray: isSelected ? undefined : '5, 5',
                      }}
                      eventHandlers={{
                        click: () => setSelectedOrder(order),
                      }}
                    >
                      <Popup>
                        <div className="p-1 text-slate-900 font-sans max-w-xs">
                          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200">
                            <span
                              className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: batch.color.hex }}
                            >
                              Zone Polygon · {batch.district}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-slate-500">
                              {order.formatted}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-slate-900">{order.customerName}</p>
                            <p className="text-slate-600">📍 {order.address}</p>
                            <p className="text-slate-800 font-medium">
                              📦 {order.item} (Stop #{order.stopSequence})
                            </p>
                          </div>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                })
              )}

              {/* Sequential Route Polylines */}
              {displayedBatches.map((batch) => {
                if (batch.routeCoordinates.length < 2) return null;
                return (
                  <Polyline
                    key={`route-${batch.batchId}`}
                    positions={batch.routeCoordinates}
                    pathOptions={{
                      color: batch.color.hex,
                      weight: 4,
                      opacity: 0.85,
                      dashArray: '6, 6',
                    }}
                  />
                );
              })}

              {/* Numbered Order Stop Markers */}
              {displayedBatches.map((batch) =>
                batch.orders.map((order) => {
                  const isSelected = selectedOrder?.orderId === order.orderId;
                  return (
                    <Marker
                      key={order.orderId}
                      position={[order.coordinates.lat, order.coordinates.lng]}
                      icon={createStopIcon(order.stopSequence, batch.color.hex, isSelected)}
                      eventHandlers={{
                        click: () => setSelectedOrder(order),
                      }}
                    >
                      <Popup>
                        <div className="p-1 text-slate-900 font-sans max-w-xs">
                          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200">
                            <span
                              className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: batch.color.hex }}
                            >
                              Stop #{order.stopSequence} · {batch.district}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-slate-500">
                              {order.orderId}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-slate-900">{order.customerName}</p>
                            <p className="text-slate-600">📱 {order.phone}</p>
                            <p className="text-slate-800 font-medium">
                              📦 {order.item} · <span className="font-bold text-indigo-600">₦{order.price?.toLocaleString()}</span>
                            </p>
                            <p className="text-slate-600 text-[11px] mt-1 pt-1 border-t border-slate-100">
                              📍 {order.address}
                            </p>
                            <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                                {order.formatted}
                              </span>
                              <span className="text-[10px] text-slate-500">{batch.riderName}</span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })
              )}
            </MapContainer>

            {/* Map Legend Overlay */}
            <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg p-2.5 shadow-lg max-w-xs pointer-events-auto">
              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Route &amp; Zone Key
              </span>
              <div className="space-y-1 text-[11px]">
                {batches.map((b) => (
                  <div key={b.batchId} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: b.color.hex }}
                    />
                    <span className="text-white font-medium">
                      {b.riderName}: {b.district} ({b.districtKey})
                    </span>
                    <span className="text-slate-400 text-[10px] ml-auto">
                      {b.totalOrders} stops
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// ===========================================================================
// Main Application Component (B2B SaaS Dashboard Root)
// ===========================================================================
export default function App() {
  const [orders, setOrders] = useState(INITIAL_SEED_ORDERS);
  const [batches, setBatches] = useState(() => clusterOrders(INITIAL_SEED_ORDERS));
  const [isClustering, setIsClustering] = useState(false);
  const [hasClustered, setHasClustered] = useState(true);
  const [activeBatchKey, setActiveBatchKey] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Navigation tab state: 'merchant' ("Merchant Simulator") or 'fleet' ("Fleet Dispatch Hub")
  const [activeTab, setActiveTab] = useState('fleet');

  // Live API vs Test Mode toggle state
  const [isLiveMode, setIsLiveMode] = useState(true);

  // Success toast notification
  const [toast, setToast] = useState(null);

  // Synchronize window flag for presenter console control
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__POSTBATCH_USE_LIVE_API = isLiveMode;
      window.togglePostBatchLiveApi = () => handleToggleLiveMode(!isLiveMode);
    }
  }, [isLiveMode]);

  // Handle toggling Live API Mode / Test Mode
  const handleToggleLiveMode = (nextMode) => {
    setIsLiveMode(nextMode);

    if (nextMode) {
      setToast({
        message: `Live API Enabled: Querying ${NIPOST_API_URL} with Publishable Key`,
      });
    } else {
      if (orders.length === 0) {
        setOrders(INITIAL_SEED_ORDERS);
        runClustering(INITIAL_SEED_ORDERS);
      }
      setToast({
        message: 'Test Mode Active: Using local seed orders and resilient offline database',
      });
    }
  };

  // Run clustering algorithm
  const runClustering = (ordersList) => {
    setIsClustering(true);
    setTimeout(() => {
      const clustered = clusterOrders(ordersList);
      setBatches(clustered);
      setHasClustered(true);
      setIsClustering(false);
    }, 200);
  };

  // Place Order Action (Dispatched from CheckoutView)
  const handlePlaceOrder = (newOrder) => {
    const orderWithPolygon = {
      ...newOrder,
      status: newOrder.status || 'pending',
      polygon:
        newOrder.polygon ||
        generateBoundingPolygon(
          newOrder.coordinates.lat,
          newOrder.coordinates.lng,
          newOrder.formatted,
          newOrder.names?.district || 'Delivery Zone'
        ),
    };

    const updated = [orderWithPolygon, ...orders];
    setOrders(updated);
    runClustering(updated);
    setSelectedOrder(orderWithPolygon);

    // Required toast text:
    // "Order placed! Postcode FC-02-A09-DB-09 routed to Fleet Dispatch Hub."
    setToast({
      message: `Order placed! Postcode ${orderWithPolygon.formatted} routed to Fleet Dispatch Hub.`,
      order: orderWithPolygon,
    });
  };

  // Complete Delivery Action (Dispatched from RiderView)
  const handleCompleteDelivery = (orderId) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === orderId ? { ...o, status: 'delivered', deliveredAt: new Date().toISOString() } : o
      )
    );
    setBatches((prevBatches) =>
      prevBatches.map((b) => ({
        ...b,
        orders: b.orders.map((o) =>
          o.orderId === orderId ? { ...o, status: 'delivered', deliveredAt: new Date().toISOString() } : o
        ),
      }))
    );
    setToast({
      message: `Delivery completed for Order ${orderId}! Loading next polygon in batch.`,
    });
  };

  // Reset Batch Deliveries (Allows easy presentation replay)
  const handleResetBatchDeliveries = (batchKey = 'FC-02-A09') => {
    setOrders((prev) =>
      prev.map((o) =>
        o.batchKey === batchKey || o.formatted?.includes(batchKey) || o.segments?.district === 'A09'
          ? { ...o, status: 'pending' }
          : o
      )
    );
    setBatches((prevBatches) =>
      prevBatches.map((b) => ({
        ...b,
        orders: b.orders.map((o) =>
          b.districtKey === batchKey || b.districtKey === 'FC-02-A09'
            ? { ...o, status: 'pending' }
            : o
        ),
      }))
    );
    setToast({
      message: `Batch ${batchKey} deliveries reset to pending for demonstration.`,
    });
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans antialiased text-slate-800">
      
      {/* ================================================================= */}
      {/* 1. Fixed Left Sidebar (Dark Theme: bg-slate-900)                  */}
      {/* ================================================================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
        
        {/* Sidebar Brand Header */}
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
              ⚡
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white block">
                PostBatch
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 block -mt-0.5">
                Dispatch OS
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            v2.4
          </span>
        </div>

        {/* Workspace Node Selector */}
        <div className="px-3 py-3 border-b border-slate-800/80">
          <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Active Node</span>
              <span className="text-xs font-bold text-white block truncate">Abuja Central Hub (FCT)</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Sidebar Navigation Tabs */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Platform Views
          </div>

          {/* Tab 1: Merchant Simulator (Shopping Cart Icon) */}
          <button
            type="button"
            onClick={() => setActiveTab('merchant')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'merchant'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Shopping Cart Icon */}
              <svg
                className="w-5 h-5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span>Merchant Simulator</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              activeTab === 'merchant' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-400'
            }`}>
              Store
            </span>
          </button>

          {/* Tab 2: Fleet Dispatch Hub (Map/Truck Icon) */}
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'fleet'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Map/Truck Icon */}
              <svg
                className="w-5 h-5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h2"
                />
              </svg>
              <span>Fleet Dispatch Hub</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              activeTab === 'fleet' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-400'
            }`}>
              {orders.length}
            </span>
          </button>

          {/* Tab 3: Rider Simulator (Motorcycle/Mobile Icon) */}
          <button
            type="button"
            onClick={() => setActiveTab('rider')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'rider'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Motorcycle/Mobile Icon */}
              <svg
                className="w-5 h-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M15 6h-3.5l-3 6.5h6l2-3.5h2" />
                <path d="M9 12.5L5.5 17.5" />
                <circle cx="16" cy="6" r="1" fill="currentColor" />
              </svg>
              <span>Rider Simulator</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              activeTab === 'rider' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-400'
            }`}>
              Mobile
            </span>
          </button>
        </nav>

        {/* Sidebar Efficiency Widget */}
        <div className="p-3 mx-3 mb-3 bg-slate-800/70 border border-slate-700/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>Fleet Efficiency</span>
            <span className="text-emerald-400 font-bold">{batches.metrics?.fuelSavedPercent || 32}% saved</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/60 p-2 rounded">
              <span className="text-[10px] text-slate-500 block">Parcels</span>
              <span className="font-bold text-white">{orders.length}</span>
            </div>
            <div className="bg-slate-900/60 p-2 rounded">
              <span className="text-[10px] text-slate-500 block">Riders</span>
              <span className="font-bold text-indigo-400">{batches.length} Zones</span>
            </div>
          </div>
        </div>

        {/* Sidebar Footer System Status */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px]">NIPOST Connected</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">B2B SaaS</span>
        </div>

      </aside>

      {/* ================================================================= */}
      {/* 2. Main Content Area (Light Theme: bg-slate-50)                   */}
      {/* ================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-50">
        
        {/* Clean White Navbar Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-20">
          
          {/* PostBatch Logo & Breadcrumb */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white text-xs font-black shadow-sm">
                PB
              </div>
              <span className="font-bold text-base text-slate-800 tracking-tight">
                PostBatch
              </span>
            </div>
            <span className="text-slate-300 font-light text-base">/</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                {activeTab === 'merchant'
                  ? 'Merchant Simulator'
                  : activeTab === 'rider'
                  ? 'Mobile Rider App Simulator'
                  : 'Fleet Dispatch Hub'}
              </span>
              <span className="hidden sm:inline-block text-[11px] text-slate-400">
                {activeTab === 'rider'
                  ? '· Zero-Call Geofenced Last 100m Delivery'
                  : '· NIPOST Digital Postcode Routing'}
              </span>
            </div>
          </div>

          {/* Right Header: Live API / Test Mode Toggle Switch & User Avatar */}
          <div className="flex items-center gap-4">
            
            {/* Live API / Test Mode Toggle Switch */}
            <div className="flex items-center gap-2.5 bg-slate-50 py-1.5 px-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLiveMode ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-semibold text-slate-700">
                  {isLiveMode ? 'Live API' : 'Test Mode'}
                </span>
              </div>

              {/* Toggle Switch Button */}
              <button
                type="button"
                role="switch"
                aria-checked={isLiveMode}
                onClick={() => handleToggleLiveMode(!isLiveMode)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isLiveMode ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                title={
                  isLiveMode
                    ? 'Live API Mode: querying docs.postcode.gov.ng with publishable key. Click to toggle Test Mode.'
                    : 'Test Mode: querying local mock database. Click to toggle Live API Mode.'
                }
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 ease-in-out ${
                    isLiveMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            {/* User Avatar */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
                  AJ
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
              <div className="hidden md:block leading-tight">
                <span className="text-xs font-semibold text-slate-800 block">
                  Alex Johnson
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Fleet Ops Lead
                </span>
              </div>
            </div>

          </div>

        </header>

        {/* Floating Notification Toast */}
        {toast && (
          <div className="fixed top-20 right-6 z-50">
            <div className="bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3">
              <span className="text-lg">📦</span>
              <div>
                <p className="font-semibold text-xs text-white">
                  {toast.message}
                </p>
                {toast.order && (
                  <p className="text-[11px] text-slate-400">
                    Order ID: <span className="font-mono text-indigo-300">{toast.order.orderId}</span> · District: <span className="font-mono text-indigo-300">{toast.order.segments?.district}</span>
                  </p>
                )}
              </div>
              {activeTab !== 'fleet' && toast.order && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('fleet');
                    setSelectedOrder(toast.order);
                  }}
                  className="ml-2 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  View on Map →
                </button>
              )}
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-white text-xs font-bold ml-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main Viewport Content Area */}
        <main className="flex-1 overflow-hidden relative">
          
          {/* View 1: Merchant Simulator */}
          {activeTab === 'merchant' && (
            <CheckoutView
              onPlaceOrder={handlePlaceOrder}
              isLiveMode={isLiveMode}
              onNavigateToFleet={() => setActiveTab('fleet')}
            />
          )}

          {/* View 2: Fleet Dispatch Hub */}
          {activeTab === 'fleet' && (
            <FleetDispatchHub
              orders={orders}
              incomingOrders={orders}
              batches={batches}
              hasClustered={hasClustered}
              isClustering={isClustering}
              onRunCluster={() => runClustering(orders)}
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              activeBatchKey={activeBatchKey}
              setActiveBatchKey={setActiveBatchKey}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              isLiveMode={isLiveMode}
              activeTab={activeTab}
            />
          )}

          {/* View 3: Mobile Rider App Simulator */}
          {activeTab === 'rider' && (
            <RiderView
              orders={orders}
              batches={batches}
              onCompleteDelivery={handleCompleteDelivery}
              onResetBatchDeliveries={handleResetBatchDeliveries}
              onNotify={(msg) => setToast({ message: msg })}
            />
          )}

        </main>

      </div>

    </div>
  );
}
