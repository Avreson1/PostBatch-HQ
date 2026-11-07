/**
 * PostBatch Dispatch OS — demo shell
 * ==================================
 *
 *   - Collapsible dark sidebar (icons-only when collapsed)
 *   - Top bar with Live API / Test Mode toggle
 *   - Three views: Merchant Simulator, Fleet Dispatch Hub, Rider Simulator
 *   - Framer Motion for view transitions, toasts and sidebar collapse
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bike,
  Check,
  CircleCheck,
  Gauge,
  Layers,
  Loader2,
  MapPin,
  MessageSquareText,
  Package,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Route,
  Search,
  ShoppingBag,
  Warehouse,
  X,
  Zap,
} from 'lucide-react';
import { clusterOrders, SEED_ORDERS, DISPATCH_HUB } from 'postbatch-engine';
import CheckoutView from './CheckoutView.jsx';
import RiderView from './RiderView.jsx';
import RouteModeSwitch from './RouteModeSwitch.jsx';
import { NIPOST_API_URL, generateBoundingPolygon } from './src/services/nipostApi.js';
import { fetchRoadDistanceFn, fetchRoadPath, ROUTE_MODES, COMPARE_MODE } from './src/services/routing.js';

const EASE = [0.22, 1, 0.36, 1];

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
// Leaflet icons
// ---------------------------------------------------------------------------
function createStopIcon(stopNumber, colorHex, isSelected = false) {
  const size = isSelected ? 30 : 24;
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background:${colorHex};color:#fff;width:${size}px;height:${size}px;border-radius:9999px;
        display:flex;align-items:center;justify-content:center;
        font-family:'JetBrains Mono Variable',ui-monospace,monospace;font-weight:700;font-size:${isSelected ? 13 : 11}px;
        border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,${isSelected ? 0.45 : 0.3});
        transition:all .2s ease;">
        ${stopNumber}
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

const hubIconHtml = renderToStaticMarkup(<Warehouse size={15} color="#fff" strokeWidth={2.2} />);
const HUB_ICON = L.divIcon({
  className: 'hub-marker',
  html: `
    <div style="width:30px;height:30px;border-radius:4px;background:#0f172a;border:2px solid #fff;
      box-shadow:0 3px 10px rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;">
      ${hubIconHtml}
    </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -18],
});

// ---------------------------------------------------------------------------
// Map viewport controller
// ---------------------------------------------------------------------------
function MapController({ bounds, selectedOrder, sidebarCollapsed }) {
  const map = useMap();

  // Re-measure after mount and whenever the sidebar animates width
  useEffect(() => {
    const timers = [60, 320].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => timers.forEach(clearTimeout);
  }, [map, sidebarCollapsed]);

  useEffect(() => {
    if (selectedOrder?.coordinates?.lat && selectedOrder?.coordinates?.lng) {
      map.flyTo([selectedOrder.coordinates.lat, selectedOrder.coordinates.lng], 15, { duration: 0.6 });
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [bounds, selectedOrder, map]);

  return null;
}

// ===========================================================================
// Fleet Dispatch Hub
// ===========================================================================
function FleetDispatchHub({
  orders,
  batches,
  isClustering,
  onRunCluster,
  selectedOrder,
  setSelectedOrder,
  activeBatchKey,
  setActiveBatchKey,
  searchTerm,
  setSearchTerm,
  sidebarCollapsed,
  roadPaths = {},
  comparePaths = {},
  routeMode = 'shortest',
  onRouteModeChange,
}) {
  const metrics = batches.metrics || {};
  const isRoad = metrics.distanceSource === 'road';
  const matches = (store, b) => {
    const p = store[b.batchId];
    return p && p.signature === b.routeCoordinates.join(';') ? p : null;
  };
  const pathFor = (b) => matches(roadPaths, b)?.coords || null;
  const comparePathFor = (b) => matches(comparePaths, b)?.coords || null;
  const modeLabel = ROUTE_MODES.find((m) => m.id === routeMode)?.label || 'Shortest';
  const compareLabel = ROUTE_MODES.find((m) => m.id === COMPARE_MODE[routeMode])?.label;
  // Drawn km/min for the selected mode, and the comparison
  const drawnTotals = (store) => {
    const ps = batches.map((b) => matches(store, b)).filter(Boolean);
    return ps.length === batches.length && ps.length
      ? { km: ps.reduce((s, p) => s + p.km, 0), min: ps.reduce((s, p) => s + p.minutes, 0) }
      : null;
  };
  const chosenTotals = drawnTotals(roadPaths);
  const compareTotals = drawnTotals(comparePaths);

  const displayedBatches = useMemo(() => {
    if (!activeBatchKey) return batches;
    return batches.filter((b) => b.districtKey === activeBatchKey);
  }, [batches, activeBatchKey]);

  const mapBounds = useMemo(() => {
    const coords = [[DISPATCH_HUB.coordinates.lat, DISPATCH_HUB.coordinates.lng]];
    for (const b of displayedBatches) {
      for (const o of b.orders) {
        if (o.coordinates?.lat && o.coordinates?.lng) coords.push([o.coordinates.lat, o.coordinates.lng]);
      }
    }
    return coords;
  }, [displayedBatches]);

  const orderBatchMeta = useMemo(() => {
    const meta = new Map();
    for (const batch of batches) {
      for (const order of batch.orders) {
        meta.set(order.orderId, {
          districtKey: batch.districtKey,
          riderName: batch.riderName,
          color: batch.color,
          stopSequence: order.stopSequence,
        });
      }
    }
    return meta;
  }, [batches]);

  // Live order status lives in `orders`; route order lives in `batches`.
  const statusById = useMemo(() => new Map(orders.map((o) => [o.orderId, o.status])), [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (activeBatchKey) list = list.filter((o) => orderBatchMeta.get(o.orderId)?.districtKey === activeBatchKey);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderId.toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term) ||
          o.item.toLowerCase().includes(term) ||
          o.formatted.toLowerCase().includes(term) ||
          o.names?.district?.toLowerCase().includes(term) ||
          o.names?.lga?.toLowerCase().includes(term) ||
          o.address?.toLowerCase().includes(term)
      );
    }
    // Show in route order: batch, then stop number
    const batchIdx = new Map(batches.map((b, i) => [b.districtKey, i]));
    return [...list].sort((a, b) => {
      const ma = orderBatchMeta.get(a.orderId);
      const mb = orderBatchMeta.get(b.orderId);
      if (!ma || !mb) return ma ? -1 : mb ? 1 : 0;
      const d = batchIdx.get(ma.districtKey) - batchIdx.get(mb.districtKey);
      return d !== 0 ? d : ma.stopSequence - mb.stopSequence;
    });
  }, [orders, batches, activeBatchKey, searchTerm, orderBatchMeta]);

  return (
    <div className="h-full p-5 overflow-hidden">
      <div className="grid grid-cols-12 gap-5 h-full">
        {/* -------------------------------------------------------------- */}
        {/* Orders panel                                                   */}
        {/* -------------------------------------------------------------- */}
        <div className="col-span-12 lg:col-span-5 flex flex-col h-full min-h-0 bg-white rounded-lg shadow-card overflow-hidden">
          <div className="p-4 shrink-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900 tracking-tight">Incoming Orders</h2>
                <span className="bg-indigo-50 text-indigo-700 text-[11px] font-semibold px-1.5 py-0.5 rounded">
                  {filteredOrders.length}
                </span>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onRunCluster}
                disabled={isClustering}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[13px] h-8 px-3 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {isClustering ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                <span>{isClustering ? 'Clustering…' : 'Auto-Cluster'}</span>
              </motion.button>
            </div>

            <div className="relative">
              <Search size={14} className="text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search order, customer, district, postcode…"
                className="w-full pl-8 pr-3 h-8 text-xs text-slate-800 bg-slate-100/80 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:bg-white transition-colors"
              />
            </div>

            {/* Measured route savings */}
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label={isRoad ? 'Road distance' : 'Est. distance'}
                value={`${metrics.totalRouteDistanceKm ?? 0} km`}
                hint={`vs ${metrics.totalUnclusteredDistanceKm ?? 0} km manual`}
              />
              <Stat
                label="Distance saved"
                value={`${metrics.fuelSavedPercent ?? 0}%`}
                hint={`${metrics.totalDistanceSavedKm ?? 0} km · ${metrics.totalFuelSavedLitres ?? 0} L fuel`}
                accent
              />
              <Stat label="Batched in" value={`${metrics.executionTimeMs ?? 0} ms`} hint={`${batches.length} rider zones`} />
            </div>
          </div>

          {/* Orders table */}
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full table-fixed text-left text-xs text-slate-600">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[28%]" />
                <col className="w-[27%]" />
                <col className="w-[21%]" />
              </colgroup>
              <thead className="bg-slate-100 text-slate-500 font-medium uppercase tracking-wider text-[10px] sticky top-0 z-10">
                <tr>
                  <th className="pl-4 pr-2 py-2 font-medium truncate">Stop</th>
                  <th className="px-2 py-2 font-medium truncate">Order</th>
                  <th className="px-2 py-2 font-medium truncate">Postcode</th>
                  <th className="px-2 pr-4 py-2 font-medium truncate">District</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                      No matching orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const meta = orderBatchMeta.get(order.orderId);
                    const isSelected = selectedOrder?.orderId === order.orderId;
                    const delivered = statusById.get(order.orderId) === 'delivered';

                    return (
                      <motion.tr
                        layout="position"
                        key={order.orderId}
                        onClick={() => setSelectedOrder(order)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-100/70' : 'hover:bg-slate-100'
                        }`}
                      >
                        <td className="pl-4 pr-2 py-2.5 relative">
                          {isSelected && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-600" />}
                          {meta ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-5 h-5 rounded-full text-white text-[10px] font-mono font-semibold flex items-center justify-center shrink-0"
                                style={{ backgroundColor: delivered ? '#10b981' : meta.color?.hex || '#4f46e5' }}
                              >
                                {delivered ? <Check size={11} strokeWidth={3} /> : meta.stopSequence}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500 truncate">{meta.riderName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium text-slate-900 truncate">{order.orderId}</div>
                          <div className="text-[11px] text-slate-500 truncate" title={order.customerName}>{order.customerName}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="inline-block max-w-full truncate align-middle font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700" title={order.formatted}>
                            {order.formatted}
                          </span>
                        </td>
                        <td className="px-2 pr-4 py-2.5">
                          <div className="font-medium text-slate-800 truncate">{order.names?.district}</div>
                          <div className="text-[11px] text-slate-500 truncate" title={order.address}>
                            {order.names?.area || order.names?.lga}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Rider batches */}
          <div className="p-3 bg-slate-100 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Rider Batches · {batches.length}
              </span>
              <AnimatePresence>
                {activeBatchKey && (
                  <motion.button
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    type="button"
                    onClick={() => {
                      setActiveBatchKey(null);
                      setSelectedOrder(null);
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    Show all zones
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {batches.map((batch) => {
                const isActive = activeBatchKey === batch.districtKey;
                return (
                  <motion.button
                    key={batch.batchId}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setActiveBatchKey(isActive ? null : batch.districtKey);
                      setSelectedOrder(null);
                    }}
                    className={`p-2.5 min-w-0 rounded-md text-left transition-all cursor-pointer ${
                      isActive ? 'bg-white shadow-card ring-2 ring-indigo-600' : 'bg-white shadow-sm hover:shadow-card'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: batch.color.hex }} />
                      <span className="text-xs font-semibold text-slate-800 truncate">{batch.district}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      {batch.totalOrders} stops · {batch.estimatedRouteDistanceKm} km
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Map panel                                                      */}
        {/* -------------------------------------------------------------- */}
        <div className="col-span-12 lg:col-span-7 flex flex-col h-full min-h-0 bg-slate-900 rounded-lg shadow-card overflow-hidden relative">
          <div className="bg-slate-950 px-4 h-11 flex items-center justify-between gap-3 shrink-0 z-10">
            <div className="flex items-center gap-2 shrink-0">
              <Layers size={14} className="text-slate-400" />
              <h3 className="text-xs font-medium text-white tracking-wide">Dispatch Map</h3>
            </div>

            <div className="flex items-center gap-1 text-xs overflow-x-auto no-scrollbar">
              <ZonePill active={activeBatchKey === null} onClick={() => { setActiveBatchKey(null); setSelectedOrder(null); }}>
                All · {orders.length}
              </ZonePill>
              {batches.map((b) => (
                <ZonePill
                  key={b.batchId}
                  active={activeBatchKey === b.districtKey}
                  color={b.color.hex}
                  onClick={() => {
                    setActiveBatchKey(activeBatchKey === b.districtKey ? null : b.districtKey);
                    setSelectedOrder(null);
                  }}
                >
                  {b.district}
                </ZonePill>
              ))}
            </div>
          </div>

          <div className="flex-1 relative w-full h-full min-h-0">
            <MapContainer
              center={[9.055, 7.485]}
              zoom={13}
              scrollWheelZoom
              className="h-full w-full"
              style={{ background: '#0f172a' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

              <MapController bounds={mapBounds} selectedOrder={selectedOrder} sidebarCollapsed={sidebarCollapsed} />

              {/* Building polygons */}
              {displayedBatches.map((batch) =>
                batch.orders.map((order) => {
                  if (!order.polygon) return null;
                  const isSelected = selectedOrder?.orderId === order.orderId;
                  const rawCoords = order.polygon.geometry?.coordinates?.[0] || order.polygon.coordinates?.[0];
                  if (!rawCoords || !Array.isArray(rawCoords)) return null;
                  const latLngCoords = rawCoords.map(([lng, lat]) => [lat, lng]);

                  return (
                    <Polygon
                      key={`polygon-${order.orderId}`}
                      positions={latLngCoords}
                      pathOptions={{
                        color: batch.color.hex,
                        fillColor: batch.color.hex,
                        fillOpacity: isSelected ? 0.45 : 0.18,
                        weight: isSelected ? 2.5 : 1.25,
                        dashArray: isSelected ? undefined : '4, 4',
                      }}
                      eventHandlers={{ click: () => setSelectedOrder(order) }}
                    />
                  );
                })
              )}

              {/* Comparison mode: muted dotted line underneath */}
              {displayedBatches.map((batch) =>
                comparePathFor(batch) ? (
                  <Polyline
                    key={`compare-${batch.batchId}`}
                    positions={comparePathFor(batch)}
                    pathOptions={{ color: '#475569', weight: 3, opacity: 0.75, dashArray: '1, 7', lineCap: 'round' }}
                  />
                ) : null
              )}

              {/* Routes: hub → stops → hub */}
              {displayedBatches.map((batch) =>
                batch.routeCoordinates.length < 2 ? null : pathFor(batch) ? (
                  <React.Fragment key={`route-${batch.batchId}`}>
                    {/* casing so the route reads over busy road tiles */}
                    <Polyline positions={pathFor(batch)} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.9 }} />
                    <Polyline positions={pathFor(batch)} pathOptions={{ color: batch.color.hex, weight: 4, opacity: 1 }} />
                  </React.Fragment>
                ) : (
                  <Polyline
                    key={`route-${batch.batchId}`}
                    positions={batch.routeCoordinates}
                    pathOptions={{ color: batch.color.hex, weight: 3, opacity: 0.85, dashArray: '6, 6' }}
                  />
                )
              )}

              {/* Hub */}
              <Marker position={[DISPATCH_HUB.coordinates.lat, DISPATCH_HUB.coordinates.lng]} icon={HUB_ICON}>
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold text-slate-900">{DISPATCH_HUB.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{DISPATCH_HUB.formatted}</p>
                    <p className="text-[11px] text-slate-500 mt-1">Every route starts and ends here.</p>
                  </div>
                </Popup>
              </Marker>

              {/* Stop markers */}
              {displayedBatches.map((batch) =>
                batch.orders.map((order) => {
                  const isSelected = selectedOrder?.orderId === order.orderId;
                  return (
                    <Marker
                      key={order.orderId}
                      position={[order.coordinates.lat, order.coordinates.lng]}
                      icon={createStopIcon(order.stopSequence, batch.color.hex, isSelected)}
                      eventHandlers={{ click: () => setSelectedOrder(order) }}
                    >
                      <Popup>
                        <div className="text-slate-900 font-sans w-56">
                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                            <span
                              className="text-white text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: batch.color.hex }}
                            >
                              Stop {order.stopSequence} · {batch.district}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">{order.orderId}</span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold text-slate-900">{order.customerName}</p>
                            <IconLine icon={Phone}>{order.phone}</IconLine>
                            <IconLine icon={Package}>
                              {order.item} · <span className="font-semibold text-indigo-600">₦{order.price?.toLocaleString()}</span>
                            </IconLine>
                            <IconLine icon={MapPin}>{order.address}</IconLine>
                            <div className="pt-1 flex items-center justify-between">
                              <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
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

            {/* Route mode */}
            <RouteModeSwitch value={routeMode} onChange={onRouteModeChange} className="absolute top-3 right-3 z-[400]" />

            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur rounded-md p-2.5 shadow-float">
              <span className="text-[9px] uppercase font-medium text-slate-500 tracking-wider block mb-1.5">Routes</span>
              <div className="space-y-1 text-[11px]">
                {batches.map((b) => (
                  <div key={b.batchId} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color.hex }} />
                    <span className="text-white">{b.riderName} · {b.district}</span>
                    <span className="text-slate-400 font-mono text-[10px] ml-auto pl-3">
                      {(matches(roadPaths, b)?.km ?? b.estimatedRouteDistanceKm).toFixed(1)} km
                      {matches(roadPaths, b) && ` · ${Math.round(matches(roadPaths, b).minutes)} min`}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1 text-slate-400">
                  <Warehouse size={11} />
                  <span>Hub · start &amp; return</span>
                </div>
                {isRoad ? (
                  <>
                    <div className="flex items-center gap-2 pt-1 border-t border-white/10 mt-1">
                      <span className="w-4 h-[3px] rounded-full bg-white shrink-0" />
                      <span className="text-white">{modeLabel}</span>
                      {chosenTotals && (
                        <span className="text-slate-300 font-mono text-[10px] ml-auto pl-3">
                          {chosenTotals.km.toFixed(1)} km · {Math.round(chosenTotals.min)} min
                        </span>
                      )}
                    </div>
                    {compareLabel && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="w-4 border-t-2 border-dotted border-slate-400 shrink-0" />
                        <span>{compareLabel} (compare)</span>
                        {compareTotals && (
                          <span className="font-mono text-[10px] ml-auto pl-3">
                            {compareTotals.km.toFixed(1)} km · {Math.round(compareTotals.min)} min
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[10px] text-amber-400">
                    <Route size={11} />
                    <span>Offline · straight-line estimate</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }) {
  return (
    <div className={`rounded-md px-2.5 py-2 min-w-0 ${accent ? 'bg-emerald-100' : 'bg-slate-100'}`}>
      <div className="text-[10px] text-slate-500 truncate">{label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className={`text-sm font-semibold font-mono truncate ${accent ? 'text-emerald-800' : 'text-slate-900'}`}
      >
        {value}
      </motion.div>
      <div className="text-[10px] text-slate-500 truncate">{hint}</div>
    </div>
  );
}

function ZonePill({ active, color, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 h-7 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
        active ? 'text-white' : 'text-slate-500 hover:text-white'
      }`}
    >
      {active && (
        <motion.span
          layoutId="zone-pill"
          className="absolute inset-0 rounded"
          style={{ backgroundColor: color || '#4f46e5' }}
          transition={{ duration: 0.3, ease: EASE }}
        />
      )}
      {color && <span className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? '#fff' : color }} />}
      <span className="relative">{children}</span>
    </button>
  );
}

function IconLine({ icon: Icon, children }) {
  return (
    <p className="flex items-start gap-1.5 text-slate-600">
      <Icon size={12} className="mt-0.5 shrink-0 text-slate-400" />
      <span>{children}</span>
    </p>
  );
}

// ===========================================================================
// Sidebar
// ===========================================================================
const NAV_ITEMS = [
  { id: 'merchant', label: 'Merchant Simulator', icon: ShoppingBag },
  { id: 'fleet', label: 'Fleet Dispatch Hub', icon: Route },
  { id: 'rider', label: 'Rider Simulator', icon: Bike },
];

function Sidebar({ activeTab, setActiveTab, collapsed, setCollapsed, orders, batches }) {
  const metrics = batches.metrics || {};
  const delivered = orders.filter((o) => o.status === 'delivered').length;

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 236 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="bg-slate-950 text-slate-300 flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Brand */}
      <div className={`h-14 flex items-center shrink-0 ${collapsed ? 'justify-center' : 'px-4 justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-indigo-600 flex items-center justify-center text-white shrink-0">
            <PackageCheck size={17} strokeWidth={2.2} />
          </div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.2 }}
                className="leading-tight whitespace-nowrap"
              >
                <span className="font-semibold text-[15px] tracking-tight text-white block">PostBatch</span>
                <span className="text-[10px] font-medium tracking-wider text-slate-500 block">Dispatch OS</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Hub */}
      <div className={`px-3 pb-2 shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
        <div
          className={`flex items-center gap-2.5 rounded-md text-slate-400 ${collapsed ? 'w-10 h-10 justify-center' : 'px-2.5 py-2'}`}
          title={collapsed ? 'Abuja Central Hub (FCT)' : undefined}
        >
          <span className="relative flex shrink-0">
            <Warehouse size={16} />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </span>
          {!collapsed && (
            <div className="min-w-0 whitespace-nowrap">
              <span className="text-[10px] text-slate-500 block leading-tight">Active hub</span>
              <span className="text-xs font-medium text-slate-200 block truncate">Abuja Central (FCT)</span>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto no-scrollbar">
        {!collapsed && (
          <div className="px-2.5 pb-2 text-[10px] font-medium uppercase tracking-wider text-slate-600 whitespace-nowrap">
            Views
          </div>
        )}
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              title={collapsed ? label : undefined}
              className={`relative w-full flex items-center gap-3 h-9 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
                collapsed ? 'justify-center' : 'px-2.5'
              } ${isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-md bg-indigo-600"
                  transition={{ duration: 0.3, ease: EASE }}
                />
              )}
              <Icon size={17} className="relative shrink-0" />
              {!collapsed && <span className="relative whitespace-nowrap">{label}</span>}
              {!collapsed && id === 'fleet' && (
                <span className={`relative ml-auto text-[10px] font-mono ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {orders.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Fleet summary — plain stats, no box */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-5 pb-4 space-y-3 whitespace-nowrap"
          >
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">Distance saved</span>
                <span className="text-lg font-semibold text-emerald-400 font-mono">{metrics.fuelSavedPercent ?? 0}%</span>
              </div>
              <div className="h-[3px] bg-white/5 rounded-full overflow-hidden mt-1">
                <motion.div
                  className="h-full bg-emerald-400 rounded-full"
                  initial={false}
                  animate={{ width: `${Math.min(100, metrics.fuelSavedPercent ?? 0)}%` }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
              </div>
              <span className="text-[10px] text-slate-600 block mt-1">vs. manual dispatch, same riders</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span><span className="text-white font-mono">{orders.length}</span> <span className="text-slate-500">parcels</span></span>
              <span><span className="text-white font-mono">{batches.length}</span> <span className="text-slate-500">zones</span></span>
              <span><span className="text-white font-mono">{delivered}</span> <span className="text-slate-500">done</span></span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className={`h-12 flex items-center shrink-0 ${collapsed ? 'justify-center' : 'px-4 justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            NIPOST connected
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </motion.aside>
  );
}

// ===========================================================================
// Toast
// ===========================================================================
const TOAST_ICONS = {
  order: PackageCheck,
  sms: MessageSquareText,
  success: CircleCheck,
  info: Gauge,
};

function Toast({ toast, onClose, onViewOnMap }) {
  return (
    <div className="fixed top-[68px] right-5 z-[1000] pointer-events-none">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="pointer-events-auto bg-slate-900 text-white pl-3 pr-2 py-2.5 rounded-lg shadow-float flex items-center gap-3 max-w-md"
          >
            {(() => {
              const Icon = TOAST_ICONS[toast.kind] || TOAST_ICONS.info;
              return (
                <span className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center shrink-0">
                  <Icon size={15} className={toast.kind === 'sms' || toast.kind === 'success' ? 'text-emerald-400' : 'text-indigo-300'} />
                </span>
              );
            })()}
            <div className="min-w-0">
              <p className="text-xs font-medium text-white leading-snug">{toast.message}</p>
              {toast.order && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono text-indigo-300">{toast.order.orderId}</span> · District{' '}
                  <span className="font-mono text-indigo-300">{toast.order.segments?.district}</span>
                </p>
              )}
            </div>
            {onViewOnMap && (
              <button
                type="button"
                onClick={onViewOnMap}
                className="ml-1 px-2.5 h-7 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              >
                View on map <ArrowRight size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-white rounded-md cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===========================================================================
// App root
// ===========================================================================
const VIEW_META = {
  merchant: { title: 'Merchant Simulator', subtitle: 'Checkout widget on a sample store' },
  fleet: { title: 'Fleet Dispatch Hub', subtitle: 'NIPOST postcode prefix clustering' },
  rider: { title: 'Rider Simulator', subtitle: 'Zero-call geofenced delivery' },
};

export default function App() {
  const [orders, setOrders] = useState(INITIAL_SEED_ORDERS);
  const [batches, setBatches] = useState(() => clusterOrders(INITIAL_SEED_ORDERS));
  const [isClustering, setIsClustering] = useState(false);
  const [activeBatchKey, setActiveBatchKey] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('fleet');
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToastState] = useState(null);

  const setToast = (t) => setToastState(t ? { id: Date.now() + Math.random(), kind: 'info', ...t } : null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__POSTBATCH_USE_LIVE_API = isLiveMode;
      window.togglePostBatchLiveApi = () => handleToggleLiveMode(!isLiveMode);
    }
  }, [isLiveMode]);

  const handleToggleLiveMode = (nextMode) => {
    setIsLiveMode(nextMode);
    if (nextMode) {
      setToast({ message: `Live API enabled: querying ${NIPOST_API_URL}` });
    } else {
      if (orders.length === 0) {
        setOrders(INITIAL_SEED_ORDERS);
        runClustering(INITIAL_SEED_ORDERS);
      }
      setToast({ message: 'Test mode: using local seed orders and offline database' });
    }
  };

  // Road routing: shortest-road distance table for clustering + road geometry per batch.
  // Falls back to straight-line estimates when offline.
  const [roadPaths, setRoadPaths] = useState({});
  const [comparePaths, setComparePaths] = useState({});
  const [routeMode, setRouteMode] = useState('shortest');
  const routeModeRef = useRef(routeMode);
  routeModeRef.current = routeMode;
  const clusterRunRef = useRef(0);

  const runClustering = async (ordersList, { animate = true, mode = routeModeRef.current } = {}) => {
    const run = ++clusterRunRef.current;
    if (animate) setIsClustering(true);

    const hub = DISPATCH_HUB.coordinates;
    const [{ distanceKm, source }] = await Promise.all([
      fetchRoadDistanceFn([hub, ...ordersList.map((o) => o.coordinates)], mode),
      new Promise((r) => setTimeout(r, animate ? 350 : 0)),
    ]);
    if (run !== clusterRunRef.current) return;

    const clustered = clusterOrders(ordersList, { distanceKm, distanceSource: source });
    setBatches(clustered);
    setIsClustering(false);

    // Chosen-mode road lines, plus the comparison mode as a muted line
    const stops = (b) => b.routeCoordinates.map(([lat, lng]) => ({ lat, lng }));
    const toMap = (paths) => {
      const out = {};
      clustered.forEach((b, i) => {
        if (paths[i]) out[b.batchId] = { ...paths[i], signature: b.routeCoordinates.join(';') };
      });
      return out;
    };
    const paths = await Promise.all(clustered.map((b) => fetchRoadPath(stops(b), mode)));
    if (run !== clusterRunRef.current) return;
    setRoadPaths(toMap(paths));
    setComparePaths({});
    const other = await Promise.all(clustered.map((b) => fetchRoadPath(stops(b), COMPARE_MODE[mode])));
    if (run !== clusterRunRef.current) return;
    setComparePaths(toMap(other));
  };

  const changeRouteMode = (mode) => {
    if (mode === routeMode) return;
    setRouteMode(mode);
    runClustering(orders, { mode });
  };

  // Upgrade the initial estimate to real road routes on load
  useEffect(() => {
    runClustering(INITIAL_SEED_ORDERS, { animate: false });
  }, []);

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
    setToast({
      kind: 'order',
      message: `Order placed. Postcode ${orderWithPolygon.formatted} routed to the dispatch hub.`,
      order: orderWithPolygon,
    });
  };

  const markStatus = (predicate, status) => {
    const patch = (o) => (predicate(o) ? { ...o, status, deliveredAt: status === 'delivered' ? new Date().toISOString() : undefined } : o);
    setOrders((prev) => prev.map(patch));
    setBatches((prev) => {
      const next = prev.map((b) => ({ ...b, orders: b.orders.map(patch) }));
      next.metrics = prev.metrics;
      next.batches = next;
      return next;
    });
  };

  const handleCompleteDelivery = (orderId) => {
    markStatus((o) => o.orderId === orderId, 'delivered');
    setToast({ kind: 'success', message: `Delivery completed for ${orderId}. Loading next stop.` });
  };

  const handleResetBatchDeliveries = (batchKey) => {
    const keys = new Set(batches.find((b) => b.districtKey === batchKey)?.orders.map((o) => o.orderId) || []);
    markStatus((o) => keys.has(o.orderId), 'pending');
    setToast({ message: `Batch ${batchKey} reset to pending.` });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToastState(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const meta = VIEW_META[activeTab];

  const topBar = (
    <header className="h-14 bg-white px-5 flex items-center justify-between shrink-0 z-20 shadow-[0_1px_0_rgba(15,23,42,0.08)]">
      <div className="flex items-baseline gap-2 min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="flex items-baseline gap-2 min-w-0"
          >
            <span className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-nowrap">{meta.title}</span>
            <span className="hidden md:inline text-xs text-slate-500 truncate">{meta.subtitle}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 bg-slate-100 h-8 px-2.5 rounded-md">
          <span className={`w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          <span className="text-xs font-medium text-slate-700 w-14">{isLiveMode ? 'Live API' : 'Test mode'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isLiveMode}
            onClick={() => handleToggleLiveMode(!isLiveMode)}
            className={`relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full p-[2px] transition-colors duration-200 ${
              isLiveMode ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
            }`}
            title={isLiveMode ? 'Live API: querying the NIPOST API. Click for test mode.' : 'Test mode: local mock database. Click for live API.'}
          >
            <motion.span layout transition={{ duration: 0.2, ease: EASE }} className="h-[14px] w-[14px] rounded-full bg-white shadow-sm" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-semibold text-indigo-700">
            AJ
          </div>
          <div className="hidden md:block leading-tight">
            <span className="text-xs font-medium text-slate-800 block">Alex Johnson</span>
            <span className="text-[10px] text-slate-500 block">Fleet Ops Lead</span>
          </div>
        </div>
      </div>
    </header>
  );

  const fade = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.25, ease: EASE },
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-200/70 font-sans antialiased text-slate-800">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        orders={orders}
        batches={batches}
      />

      <Toast
        toast={toast}
        onClose={() => setToastState(null)}
        onViewOnMap={
          activeTab !== 'fleet' && toast?.order
            ? () => {
                setActiveTab('fleet');
                setSelectedOrder(toast.order);
              }
            : null
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'rider' ? (
          // Rider: phone runs the full page height beside the sidebar;
          // the top bar only spans the rider control panel.
          <motion.div key="rider-layout" {...fade} className="flex-1 min-w-0 h-full">
            <RiderView
              orders={orders}
              batches={batches}
              topBar={topBar}
              routeMode={routeMode}
              onRouteModeChange={changeRouteMode}
              onCompleteDelivery={handleCompleteDelivery}
              onResetBatchDeliveries={handleResetBatchDeliveries}
              onNotify={(msg, kind = 'info') => setToast({ message: msg, kind })}
            />
          </motion.div>
        ) : (
          <motion.div key="default-layout" {...fade} className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            {topBar}
            <main className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={activeTab} {...fade} className="h-full">
                  {activeTab === 'merchant' && (
                    <CheckoutView
                      onPlaceOrder={handlePlaceOrder}
                      isLiveMode={isLiveMode}
                      onNavigateToFleet={() => setActiveTab('fleet')}
                    />
                  )}

                  {activeTab === 'fleet' && (
                    <FleetDispatchHub
                      orders={orders}
                      batches={batches}
                      isClustering={isClustering}
                      onRunCluster={() => runClustering(orders)}
                      selectedOrder={selectedOrder}
                      setSelectedOrder={setSelectedOrder}
                      activeBatchKey={activeBatchKey}
                      setActiveBatchKey={setActiveBatchKey}
                      searchTerm={searchTerm}
                      setSearchTerm={setSearchTerm}
                      sidebarCollapsed={sidebarCollapsed}
                      roadPaths={roadPaths}
                      comparePaths={comparePaths}
                      routeMode={routeMode}
                      onRouteModeChange={changeRouteMode}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
