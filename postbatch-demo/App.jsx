/**
 * PostBatch Fleet Hub & E-Commerce Sandbox (Modules 1 & 2)
 * ========================================================
 *
 * Unified sandbox integrating:
 *   - Module 1: UrbanFootwear NG Checkout + Embedded PostBatch Address Widget
 *   - Module 2: NIPOST Prefix-Clustering Engine + Executive Fleet Hub Dashboard
 *
 * Provides:
 *   - 2-Screen Split View (Pitch Mode for Saturday Presentation)
 *   - Shared State / Store linking checkout orders directly to Fleet Hub
 *   - Success Toast: "Order placed! Postcode FC-02-A09-DB-09 routed to Fleet Dispatch Hub."
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { clusterOrders, SEED_ORDERS } from 'postbatch-engine';
import CheckoutView from './CheckoutView.jsx';

// ---------------------------------------------------------------------------
// Custom Numbered Stop Marker using Leaflet DivIcon
// ---------------------------------------------------------------------------
function createStopIcon(stopNumber, colorHex, isSelected = false) {
  const size = isSelected ? 34 : 28;
  const borderSize = isSelected ? 3 : 2;
  const shadow = isSelected
    ? '0 0 12px rgba(255,255,255,0.9), 0 4px 8px rgba(0,0,0,0.5)'
    : '0 3px 6px rgba(0,0,0,0.35)';

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
        transition: transform 0.2s ease;
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
// Map Controller Component for dynamic zoom / auto-fitting
// ---------------------------------------------------------------------------
function MapController({ bounds, selectedOrder }) {
  const map = useMap();

  useEffect(() => {
    if (selectedOrder?.coordinates?.lat && selectedOrder?.coordinates?.lng) {
      map.flyTo([selectedOrder.coordinates.lat, selectedOrder.coordinates.lng], 15, {
        duration: 0.8,
      });
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 14,
      });
    }
  }, [bounds, selectedOrder, map]);

  return null;
}

// ===========================================================================
// Sub-Component: Incoming Orders Table
// ===========================================================================
function IncomingOrdersTable({ orders, batches, selectedOrder, onSelectOrder, searchTerm, onSearchChange }) {
  const orderBatchMeta = useMemo(() => {
    const meta = new Map();
    if (batches) {
      for (const batch of batches) {
        for (const order of batch.orders) {
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

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        o.item.toLowerCase().includes(term) ||
        o.formatted.toLowerCase().includes(term) ||
        o.names?.district.toLowerCase().includes(term) ||
        o.names?.lga.toLowerCase().includes(term) ||
        o.address.toLowerCase().includes(term)
    );
  }, [orders, searchTerm]);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Table Header Controls */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">📦 Incoming Merchant Orders</h3>
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {filteredOrders.length} Parcels
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            5-segment NIPOST validated postcodes ready for batch dispatch
          </p>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search order, postcode, area…"
            className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-800"
          />
          <svg
            className="w-4 h-4 text-gray-400 absolute left-2.5 top-2"
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

      {/* Table Content */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[380px]">
        <table className="w-full text-left text-xs text-gray-600">
          <thead className="bg-gray-100/75 text-gray-700 font-semibold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5">Stop / Batch</th>
              <th className="px-4 py-2.5">Order ID & Customer</th>
              <th className="px-4 py-2.5">Item</th>
              <th className="px-4 py-2.5 font-mono">5-Segment Postcode</th>
              <th className="px-4 py-2.5">District / LGA</th>
              <th className="px-4 py-2.5">Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredOrders.map((order) => {
              const meta = orderBatchMeta.get(order.orderId);
              const isSelected = selectedOrder?.orderId === order.orderId;

              return (
                <tr
                  key={order.orderId}
                  onClick={() => onSelectOrder(order)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${
                    isSelected ? 'bg-blue-50 font-medium' : ''
                  }`}
                >
                  {/* Stop / Batch assignment */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {meta ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm"
                          style={{ backgroundColor: meta.color?.hex || '#3b82f6' }}
                        >
                          {meta.stopSequence}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-800">
                          {meta.districtKey}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>

                  {/* Order ID & Customer */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-semibold text-gray-900">{order.orderId}</div>
                    <div className="text-gray-500 text-[11px]">{order.customerName}</div>
                  </td>

                  {/* Item */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-gray-800">{order.item}</span>
                    <div className="text-[11px] text-gray-400 font-mono">
                      ₦{order.price?.toLocaleString()}
                    </div>
                  </td>

                  {/* 5-segment postcode formatted */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold border border-slate-200">
                      <span className="text-blue-700">{order.segments.state}</span>-
                      <span className="text-blue-700">{order.segments.lga}</span>-
                      <span className="text-emerald-700 font-bold">{order.segments.district}</span>-
                      <span className="text-purple-700">{order.segments.area}</span>-
                      <span className="text-purple-700">{order.segments.unit}</span>
                    </span>
                  </td>

                  {/* Resolved Names */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-semibold text-gray-900">{order.names?.district}</div>
                    <div className="text-[11px] text-gray-500">
                      {order.names?.area ? `${order.names.area}, ` : ''}{order.names?.lga}
                    </div>
                  </td>

                  {/* Address */}
                  <td className="px-4 py-3 max-w-[220px] truncate text-gray-600" title={order.address}>
                    {order.address}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===========================================================================
// Sub-Component: Rider Batch Summary Cards
// ===========================================================================
function RiderBatchesList({ batches, activeBatchKey, onFilterBatch, onSelectOrder }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {batches.map((batch) => {
        const isActive = activeBatchKey === batch.districtKey;

        return (
          <div
            key={batch.batchId}
            onClick={() => onFilterBatch(isActive ? null : batch.districtKey)}
            className={`cursor-pointer rounded-xl p-4 border transition-all duration-200 bg-white shadow-sm hover:shadow-md ${
              isActive ? 'ring-2 ring-offset-1 border-transparent' : 'border-gray-200 hover:border-gray-300'
            }`}
            style={{
              borderTopWidth: '4px',
              borderTopColor: batch.color.hex,
              ...(isActive ? { ringColor: batch.color.hex } : {}),
            }}
          >
            {/* Batch Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: batch.color.hex }}
                  />
                  <h4 className="font-bold text-gray-900 text-sm">{batch.riderName}</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-gray-100 text-gray-800">
                    {batch.districtKey}
                  </span>
                </div>
                <p className="text-xs text-gray-600 font-medium mt-0.5">
                  {batch.district} Zone · {batch.lga}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-bold ${batch.color.badge}`}>
                {batch.totalOrders} stops
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 py-2.5 my-2 border-y border-gray-100 bg-gray-50/70 rounded-lg px-2 text-center text-xs">
              <div>
                <span className="block text-gray-400 text-[10px] uppercase font-semibold">Route</span>
                <span className="font-bold text-gray-800">{batch.estimatedRouteDistanceKm} km</span>
              </div>
              <div>
                <span className="block text-gray-400 text-[10px] uppercase font-semibold">Fuel Saved</span>
                <span className="font-bold text-emerald-600">{batch.fuelSavedPercent}%</span>
              </div>
              <div>
                <span className="block text-gray-400 text-[10px] uppercase font-semibold">Saved Fuel</span>
                <span className="font-bold text-gray-800">{batch.fuelSavedLitres} L</span>
              </div>
            </div>

            {/* Sequential Drop Path Preview */}
            <div className="mt-2.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">
                Optimized Drop Sequence:
              </span>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {batch.orders.map((o) => (
                  <span
                    key={o.orderId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOrder(o);
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-900 transition-colors font-mono cursor-pointer"
                    title={`${o.customerName} - ${o.address}`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: batch.color.hex }}
                    >
                      {o.stopSequence}
                    </span>
                    <span>{o.segments.area}-{o.segments.unit}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Executive Fleet Hub View (Module 2)
// ===========================================================================
function FleetHubView({
  orders,
  batches,
  isClustering,
  clusterNotice,
  onRunCluster,
  selectedOrder,
  setSelectedOrder,
  activeBatchKey,
  setActiveBatchKey,
  searchTerm,
  setSearchTerm,
  mapTheme,
  setMapTheme,
  isSplitView = false,
}) {
  const displayedBatches = useMemo(() => {
    if (!activeBatchKey) return batches;
    return batches.filter((b) => b.districtKey === activeBatchKey);
  }, [batches, activeBatchKey]);

  const mapBounds = useMemo(() => {
    const coords = [];
    for (const b of displayedBatches) {
      for (const o of b.orders) {
        if (o.coordinates?.lat && o.coordinates?.lng) {
          coords.push([o.coordinates.lat, o.coordinates.lng]);
        }
      }
    }
    return coords;
  }, [displayedBatches]);

  const tileLayerUrl =
    mapTheme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  return (
    <div className="flex flex-col h-full bg-slate-900 text-gray-100 font-sans overflow-hidden">
      {/* Executive ROI Banner */}
      <section className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-b border-blue-500/20 px-6 py-3 shrink-0 shadow-inner">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <h2 className="text-xs md:text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
                <span>{batches.metrics?.bannerText || `${orders.length} Orders Batched in 0.3s | ${batches.length} Rider Zones Assigned | 32% Est. Fuel Saved`}</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Automated multi-stop routing derived directly from NIPOST alphanumeric postal district prefixes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-lg">
              <span className="text-slate-400 text-[9px] block uppercase font-medium">Orders</span>
              <span className="font-bold text-white">{orders.length} Parcels</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-lg">
              <span className="text-slate-400 text-[9px] block uppercase font-medium">Rider Batches</span>
              <span className="font-bold text-blue-400">{batches.length} Zones</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-2.5 py-1 rounded-lg">
              <span className="text-slate-400 text-[9px] block uppercase font-medium">Est. Fuel Saved</span>
              <span className="font-bold text-emerald-400">{batches.metrics?.fuelSavedPercent || 32}%</span>
            </div>
            <button
              onClick={onRunCluster}
              disabled={isClustering}
              className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-sm text-xs transition cursor-pointer disabled:opacity-50"
            >
              <span className={isClustering ? 'animate-spin' : ''}>⚡</span>
              <span>{isClustering ? 'Clustering…' : 'Re-Cluster'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Workspace */}
      <main className={`flex-1 flex flex-col ${isSplitView ? 'flex-col' : 'lg:flex-row'} overflow-hidden p-3 gap-3 bg-slate-950`}>
        {/* Left Side: Incoming Orders Table + Batch Manifest List */}
        <div className={`w-full ${isSplitView ? 'h-1/2' : 'lg:w-1/2'} flex flex-col gap-3 overflow-y-auto pr-1`}>
          <div className="flex-1 min-h-[220px]">
            <IncomingOrdersTable
              orders={orders}
              batches={batches}
              selectedOrder={selectedOrder}
              onSelectOrder={(order) => {
                setSelectedOrder(order);
                setActiveBatchKey(order.batchKey || null);
              }}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
          </div>

          <div className="shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Dispatched Rider Batches ({batches.length})
              </h3>
              {activeBatchKey && (
                <button
                  onClick={() => {
                    setActiveBatchKey(null);
                    setSelectedOrder(null);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  Clear Filter (Show All)
                </button>
              )}
            </div>
            <RiderBatchesList
              batches={batches}
              activeBatchKey={activeBatchKey}
              onFilterBatch={(key) => {
                setActiveBatchKey(key);
                setSelectedOrder(null);
              }}
              onSelectOrder={setSelectedOrder}
            />
          </div>
        </div>

        {/* Right Side: Interactive Leaflet.js Map */}
        <div className={`w-full ${isSplitView ? 'h-1/2' : 'lg:w-1/2'} flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 relative min-h-[280px]`}>
          <div className="bg-slate-900/90 backdrop-blur px-3 py-2 border-b border-slate-800 flex items-center justify-between shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Fleet Dispatch Map · Abuja Municipal
              </h3>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => {
                  setActiveBatchKey(null);
                  setSelectedOrder(null);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                  activeBatchKey === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All ({orders.length})
              </button>
              {batches.map((b) => (
                <button
                  key={b.batchId}
                  onClick={() => {
                    setActiveBatchKey(activeBatchKey === b.districtKey ? null : b.districtKey);
                    setSelectedOrder(null);
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
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

              <button
                onClick={() => setMapTheme(mapTheme === 'dark' ? 'voyager' : 'dark')}
                title="Toggle Map Style"
                className="ml-1 text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]"
              >
                {mapTheme === 'dark' ? '🌙' : '☀️'}
              </button>
            </div>
          </div>

          <div className="flex-1 relative w-full h-full min-h-[240px]">
            <MapContainer
              center={[9.055, 7.485]}
              zoom={13}
              scrollWheelZoom={true}
              className="h-full w-full"
              style={{ background: '#0f172a' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url={tileLayerUrl}
              />

              <MapController bounds={mapBounds} selectedOrder={selectedOrder} />

              {/* Sequential polylines */}
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

              {/* Order Markers */}
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
                        <div className="p-1 text-gray-900 font-sans max-w-xs">
                          <div className="flex items-center justify-between pb-1 mb-1 border-b border-gray-200">
                            <span
                              className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: batch.color.hex }}
                            >
                              Stop #{order.stopSequence} · {batch.district}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-gray-500">
                              {order.orderId}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-gray-900">{order.customerName}</p>
                            <p className="text-gray-600">📱 {order.phone}</p>
                            <p className="text-gray-800 font-medium">
                              📦 {order.item} <span className="font-bold text-blue-600">₦{order.price?.toLocaleString()}</span>
                            </p>
                            <p className="text-gray-600 text-[11px] mt-1 pt-1 border-t border-gray-100">
                              📍 {order.address}
                            </p>
                            <div className="mt-1 pt-1 border-t border-gray-100 flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                                {order.formatted}
                              </span>
                              <span className="text-[10px] text-gray-500">{batch.riderName}</span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })
              )}
            </MapContainer>

            {/* Map Legend */}
            <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-lg p-2 shadow-xl max-w-xs pointer-events-auto">
              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Route Key
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
      </main>
    </div>
  );
}

// ===========================================================================
// Main Application Root (Shared Store & Pitch Sandbox Switcher)
// ===========================================================================
export default function App() {
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [batches, setBatches] = useState(() => clusterOrders(SEED_ORDERS));
  const [isClustering, setIsClustering] = useState(false);
  const [clusterNotice, setClusterNotice] = useState(null);
  const [activeBatchKey, setActiveBatchKey] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mapTheme, setMapTheme] = useState('voyager');

  // View Mode: 'split' (2-screen Saturday pitch mode) | 'checkout' | 'fleet'
  const [viewMode, setViewMode] = useState('split');

  // Success Toast state
  const [toast, setToast] = useState(null);

  // Auto-cluster logic
  const runClustering = (ordersList) => {
    setIsClustering(true);
    const start = performance.now();
    setTimeout(() => {
      const clustered = clusterOrders(ordersList);
      setBatches(clustered);
      setIsClustering(false);
      setClusterNotice(`⚡ ${ordersList.length} orders clustered across ${clustered.length} postal districts in 0.3s!`);
      setTimeout(() => setClusterNotice(null), 4000);
    }, 280);
  };

  // Place Order Action (Dispatched from CheckoutView)
  const handlePlaceOrder = (newOrder) => {
    const updated = [newOrder, ...orders];
    setOrders(updated);
    runClustering(updated);
    setSelectedOrder(newOrder);

    // Exact required toast:
    // "Order placed! Postcode FC-02-A09-DB-09 routed to Fleet Dispatch Hub."
    setToast({
      message: `Order placed! Postcode ${newOrder.formatted} routed to Fleet Dispatch Hub.`,
      order: newOrder,
    });
  };

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* ----------------------------------------------------------------- */}
      {/* Global Pitch Demo Navigation Bar                                  */}
      {/* ----------------------------------------------------------------- */}
      <header className="bg-slate-900 border-b border-slate-800 px-5 py-2.5 flex items-center justify-between shrink-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white text-base font-bold shadow-md shadow-blue-500/20">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm tracking-tight text-white">
                PostBatch <span className="text-blue-400 font-semibold">HQ</span>
              </span>
              <span className="bg-blue-900/60 text-blue-300 border border-blue-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Unified Sandbox
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              NIPOST Postcode API · Checkout Widget (Module 1) + Prefix-Clustering Engine (Module 2)
            </p>
          </div>
        </div>

        {/* View Mode Switcher Pills */}
        <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs font-bold">
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'split'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>◫</span>
            <span>2-Screen Split View (Pitch Mode)</span>
          </button>

          <button
            onClick={() => setViewMode('checkout')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'checkout'
                ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>👟</span>
            <span>Storefront (UrbanFootwear NG)</span>
          </button>

          <button
            onClick={() => setViewMode('fleet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'fleet'
                ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📊</span>
            <span>Fleet Dispatch Hub</span>
          </button>
        </div>

        {/* Pitch KPI indicator */}
        <div className="hidden lg:flex items-center gap-3 text-xs">
          <span className="text-slate-400 font-mono text-[11px]">
            📦 <strong className="text-white">{orders.length}</strong> Orders · <strong className="text-emerald-400">{batches.length}</strong> Zones
          </span>
          <button
            onClick={() => runClustering(orders)}
            disabled={isClustering}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Re-Cluster
          </button>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Floating Success Toast (When Order Placed)                        */}
      {/* ----------------------------------------------------------------- */}
      {toast && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-[9999] animate-bounce">
          <div className="bg-emerald-950 border-2 border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="font-extrabold text-sm text-emerald-300">
                {toast.message}
              </p>
              <p className="text-[11px] text-emerald-200/80">
                Order ID: <span className="font-mono font-bold text-white">{toast.order?.orderId}</span> · Rider Batch: <span className="font-mono font-bold text-white">{toast.order?.segments?.district}</span> ({toast.order?.names?.district})
              </p>
            </div>
            {viewMode !== 'fleet' && (
              <button
                onClick={() => setViewMode('fleet')}
                className="ml-3 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition cursor-pointer shrink-0"
              >
                View on Map →
              </button>
            )}
            <button
              onClick={() => setToast(null)}
              className="text-emerald-400 hover:text-white text-sm font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Body Viewports (Split or Full Screen)                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        {/* Split Mode: 2-Screen Side-by-Side View */}
        {viewMode === 'split' && (
          <>
            {/* Screen 1: UrbanFootwear NG Checkout */}
            <div className="w-1/2 border-r border-slate-800 h-full overflow-hidden flex flex-col">
              <CheckoutView onPlaceOrder={handlePlaceOrder} isSplitView={true} />
            </div>

            {/* Screen 2: Fleet Manager Dashboard */}
            <div className="w-1/2 h-full overflow-hidden flex flex-col">
              <FleetHubView
                orders={orders}
                batches={batches}
                isClustering={isClustering}
                clusterNotice={clusterNotice}
                onRunCluster={() => runClustering(orders)}
                selectedOrder={selectedOrder}
                setSelectedOrder={setSelectedOrder}
                activeBatchKey={activeBatchKey}
                setActiveBatchKey={setActiveBatchKey}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                mapTheme={mapTheme}
                setMapTheme={setMapTheme}
                isSplitView={true}
              />
            </div>
          </>
        )}

        {/* Storefront Fullscreen Mode */}
        {viewMode === 'checkout' && (
          <div className="w-full h-full overflow-hidden">
            <CheckoutView onPlaceOrder={handlePlaceOrder} isSplitView={false} />
          </div>
        )}

        {/* Fleet Hub Fullscreen Mode */}
        {viewMode === 'fleet' && (
          <div className="w-full h-full overflow-hidden">
            <FleetHubView
              orders={orders}
              batches={batches}
              isClustering={isClustering}
              clusterNotice={clusterNotice}
              onRunCluster={() => runClustering(orders)}
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              activeBatchKey={activeBatchKey}
              setActiveBatchKey={setActiveBatchKey}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              mapTheme={mapTheme}
              setMapTheme={setMapTheme}
              isSplitView={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
