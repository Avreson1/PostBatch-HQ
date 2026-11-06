/**
 * Mobile Rider App Simulator (Module 3)
 * =====================================
 *
 * Simulates the on-the-ground mobile experience for delivery riders executing
 * NIPOST 5-segment prefix-clustered batch deliveries:
 *   - Smartphone viewport mockup (390px x 844px iPhone profile)
 *   - Header displaying active batch status: "Active Batch: FC-02-A09"
 *   - 60% Map Area (Leaflet.js) with green NIPOST building polygon,
 *     100m simulated GPS dot, and dashed polyline
 *   - 40% Action Drawer (Bottom sheet) with verified customer details
 *   - "Zero-Call" Action Buttons:
 *       1. "Simulate 30m Geofence Arrival" (triggers SMS notification)
 *       2. "Complete Delivery" (updates shared state & loads next polygon)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// ---------------------------------------------------------------------------
// Helpers: Building Polygon & Geodesic Offsets (~100m & ~30m)
// ---------------------------------------------------------------------------

/**
 * Returns a crisp ~25m x ~28m compound building polygon around the delivery coordinates.
 */
function getBuildingPolygon(order) {
  if (!order?.coordinates?.lat || !order?.coordinates?.lng) return [];
  const { lat, lng } = order.coordinates;
  const dLat = 0.00018; // ~20 meters
  const dLng = 0.00022; // ~24 meters
  return [
    [lat - dLat, lng - dLng],
    [lat - dLat, lng + dLng],
    [lat + dLat, lng + dLng],
    [lat + dLat, lng - dLng],
    [lat - dLat, lng - dLng],
  ];
}

/**
 * Calculate simulated rider location:
 * - 100 meters away (initial approach)
 * - 30 meters away (geofence arrival at gate)
 */
function getRiderPosition(destLat, destLng, isAtGate) {
  if (isAtGate) {
    // ~30 meters away from entrance
    return {
      lat: destLat - 0.0002,
      lng: destLng - 0.00018,
      distanceLabel: '28m (At Gate)',
    };
  }
  // ~100 meters away on approach road
  return {
    lat: destLat - 0.00075,
    lng: destLng - 0.00065,
    distanceLabel: '100m away',
  };
}

// ---------------------------------------------------------------------------
// Custom Leaflet Icons
// ---------------------------------------------------------------------------

function createRiderIcon(isAtGate) {
  const color = isAtGate ? '#10b981' : '#3b82f6';
  const pulseColor = isAtGate ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.35)';
  const label = isAtGate ? 'Gate Arrival (30m)' : 'Rider GPS (100m)';

  return L.divIcon({
    className: 'rider-gps-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;">
        <div style="position: absolute; width: 40px; height: 40px; border-radius: 9999px; background: ${pulseColor}; animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 26px; height: 26px; border-radius: 9999px; background: ${color}; border: 3px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 13px;">
          🛵
        </div>
        <div style="position: absolute; top: 38px; background: rgba(15, 23, 42, 0.92); color: #ffffff; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap; pointer-events: none; border: 1px solid rgba(255,255,255,0.15);">
          ${label}
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createBuildingPinIcon(stopNumber) {
  return L.divIcon({
    className: 'building-pin-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="background: #059669; color: #ffffff; width: 28px; height: 28px; border-radius: 8px; border: 2px solid #ffffff; box-shadow: 0 3px 8px rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: ui-monospace, monospace; font-size: 11px; font-weight: 800;">
          <span>#${stopNumber}</span>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ---------------------------------------------------------------------------
// Leaflet Map Viewport Synchronizer
// ---------------------------------------------------------------------------
function RiderMapController({ targetCoords, riderCoords }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (targetCoords && riderCoords) {
      const bounds = L.latLngBounds([
        [targetCoords.lat, targetCoords.lng],
        [riderCoords.lat, riderCoords.lng],
      ]);
      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 18,
        animate: true,
        duration: 0.8,
      });
    }
  }, [targetCoords?.lat, targetCoords?.lng, riderCoords?.lat, riderCoords?.lng, map]);

  return null;
}

// ===========================================================================
// Main RiderView Component
// ===========================================================================
export default function RiderView({
  orders = [],
  batches = [],
  onCompleteDelivery,
  onResetBatchDeliveries,
  onNotify,
}) {
  // Target batch: default to 'FC-02-A09' (Wuse District)
  const targetBatchKey = 'FC-02-A09';

  // Find all orders belonging to target batch
  const batchOrders = useMemo(() => {
    const fromBatch = batches.find((b) => b.districtKey === targetBatchKey)?.orders;
    if (fromBatch && fromBatch.length > 0) return fromBatch;

    // Fallback: filter directly from orders
    return orders.filter(
      (o) =>
        o.batchKey === targetBatchKey ||
        o.formatted?.startsWith(targetBatchKey) ||
        o.segments?.district === 'A09'
    );
  }, [batches, orders]);

  // Selected stop index inside the active batch
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);

  // Geofence status: whether the 30m geofence trigger has been activated
  const [isAtGate, setIsAtGate] = useState(false);

  // In-app mobile push notification banner state
  const [mobilePushBanner, setMobilePushBanner] = useState(null);

  // Compute active order
  const currentOrder = useMemo(() => {
    if (!batchOrders || batchOrders.length === 0) return null;
    // Prefer selected index if valid
    if (selectedOrderIndex >= 0 && selectedOrderIndex < batchOrders.length) {
      return batchOrders[selectedOrderIndex];
    }
    return batchOrders[0];
  }, [batchOrders, selectedOrderIndex]);

  // Auto-select first pending order on batch load or completion
  useEffect(() => {
    const firstPendingIdx = batchOrders.findIndex((o) => o.status !== 'delivered');
    if (firstPendingIdx !== -1 && firstPendingIdx !== selectedOrderIndex) {
      // Keep current if user manually chose, otherwise align with first pending
      setSelectedOrderIndex(firstPendingIdx);
    }
  }, [batchOrders]);

  // Reset geofence status when changing orders
  useEffect(() => {
    setIsAtGate(false);
  }, [currentOrder?.orderId]);

  // Calculate building polygon
  const buildingPolygon = useMemo(() => {
    if (!currentOrder) return [];
    return getBuildingPolygon(currentOrder);
  }, [currentOrder]);

  // Calculate rider GPS position
  const riderPos = useMemo(() => {
    if (!currentOrder?.coordinates) return { lat: 9.0685, lng: 7.466, distanceLabel: '100m away' };
    return getRiderPosition(currentOrder.coordinates.lat, currentOrder.coordinates.lng, isAtGate);
  }, [currentOrder, isAtGate]);

  // Check if all orders in batch are delivered
  const allDelivered = useMemo(() => {
    return batchOrders.length > 0 && batchOrders.every((o) => o.status === 'delivered');
  }, [batchOrders]);

  // Total delivered in batch
  const deliveredCount = useMemo(() => {
    return batchOrders.filter((o) => o.status === 'delivered').length;
  }, [batchOrders]);

  // ---------------------------------------------------------------------------
  // Action 1: "Simulate 30m Geofence Arrival"
  // ---------------------------------------------------------------------------
  const handleSimulateGeofence = () => {
    setIsAtGate(true);

    const message = 'SMS Sent to Customer: Your rider is at the gate!';

    // 1. In-app mobile push banner inside phone screen
    setMobilePushBanner(message);
    setTimeout(() => {
      setMobilePushBanner(null);
    }, 4500);

    // 2. Trigger parent dashboard toast notification
    if (onNotify) {
      onNotify(message);
    }
  };

  // ---------------------------------------------------------------------------
  // Action 2: "Complete Delivery"
  // ---------------------------------------------------------------------------
  const handleCompleteDelivery = () => {
    if (!currentOrder) return;

    const completedOrderId = currentOrder.orderId;
    const completedCustomer = currentOrder.customerName;

    // Call shared state updater
    if (onCompleteDelivery) {
      onCompleteDelivery(completedOrderId);
    }

    // Advance to next order in batch
    const nextIdx = batchOrders.findIndex(
      (o, idx) => idx > selectedOrderIndex && o.status !== 'delivered'
    );
    if (nextIdx !== -1) {
      setSelectedOrderIndex(nextIdx);
    } else {
      const anyPendingIdx = batchOrders.findIndex(
        (o) => o.orderId !== completedOrderId && o.status !== 'delivered'
      );
      if (anyPendingIdx !== -1) {
        setSelectedOrderIndex(anyPendingIdx);
      }
    }

    setIsAtGate(false);

    if (onNotify) {
      onNotify(`Delivered to ${completedCustomer} (${completedOrderId}). Loading next stop...`);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-100/70 select-none">
      {/* ================================================================= */}
      {/* Smartphone Container: iPhone 14/15/16 Form Factor (390px x 844px)   */}
      {/* ================================================================= */}
      <div className="w-[390px] h-[844px] max-h-[calc(100vh-5.5rem)] rounded-[3rem] border-8 border-slate-800 bg-white shadow-2xl overflow-hidden relative flex flex-col shrink-0">
        {/* Top Hardware Dynamic Island */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-900 rounded-full z-50 flex items-center justify-between px-3 pointer-events-none shadow-sm">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-indigo-900/60" />
          </div>
          <div className="w-2 h-2 rounded-full bg-slate-950 border border-slate-800" />
        </div>

        {/* Mobile Status Bar (9:41, 5G, Battery) */}
        <div className="h-9 bg-slate-900 text-white px-7 flex items-center justify-between text-[11px] font-semibold shrink-0 z-40 pt-1">
          <span>9:41</span>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="font-bold">5G</span>
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 22l7.03-4.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9z" />
            </svg>
            <div className="w-5 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
              <div className="h-full w-full bg-white rounded-2xs" />
            </div>
          </div>
        </div>

        {/* In-App Mobile Push Notification Banner (SMS Alert) */}
        {mobilePushBanner && (
          <div className="absolute top-11 left-3 right-3 z-50 bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm shrink-0">
                💬
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                  <span>PostBatch SMS Gateway</span>
                  <span className="text-emerald-400 font-semibold">Just now</span>
                </div>
                <p className="text-xs font-bold text-white mt-0.5 leading-snug">
                  {mobilePushBanner}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* App Header: Simulated Rider Status ("Active Batch: FC-02-A09")*/}
        {/* ------------------------------------------------------------- */}
        <header className="bg-slate-900 text-white px-4 py-2.5 border-b border-slate-800 shrink-0 z-30 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div>
                <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider block leading-none">
                  Simulated Rider Status
                </span>
                <h1 className="text-xs font-extrabold text-white tracking-tight mt-0.5">
                  Active Batch: {targetBatchKey}
                </h1>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] bg-indigo-600/90 text-white font-bold px-2 py-0.5 rounded-full border border-indigo-400/30">
                Stop {selectedOrderIndex + 1} of {batchOrders.length}
              </span>
              <span className="text-[9px] text-slate-400 block mt-0.5">
                {deliveredCount}/{batchOrders.length} Completed
              </span>
            </div>
          </div>

          {/* Quick Stop Switcher Pills */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-0.5 no-scrollbar">
            {batchOrders.map((order, idx) => {
              const isSelected = idx === selectedOrderIndex;
              const isDelivered = order.status === 'delivered';
              return (
                <button
                  key={order.orderId}
                  type="button"
                  onClick={() => {
                    setSelectedOrderIndex(idx);
                    setIsAtGate(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isDelivered
                      ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white'
                  }`}
                  title={`${order.customerName} (${order.formatted})`}
                >
                  <span>{isDelivered ? '✓' : `#${idx + 1}`}</span>
                  <span>{order.segments?.area}-{order.segments?.unit}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* ------------------------------------------------------------- */}
        {/* Map Area (Top 60% of Phone Screen)                            */}
        {/* ------------------------------------------------------------- */}
        <div className="h-[60%] w-full relative shrink-0 bg-slate-900 overflow-hidden">
          {currentOrder && currentOrder.coordinates ? (
            <MapContainer
              center={[currentOrder.coordinates.lat, currentOrder.coordinates.lng]}
              zoom={17}
              zoomControl={false}
              className="h-full w-full"
              style={{ background: '#0f172a' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />

              <RiderMapController
                targetCoords={currentOrder.coordinates}
                riderCoords={riderPos}
              />

              {/* Exact NIPOST Building Polygon (Green) */}
              {buildingPolygon.length > 0 && (
                <Polygon
                  positions={buildingPolygon}
                  pathOptions={{
                    color: '#059669', // Emerald green border
                    fillColor: '#10b981', // Vivid green fill
                    fillOpacity: 0.45,
                    weight: 3,
                  }}
                >
                  <Popup>
                    <div className="p-1 font-sans text-xs">
                      <div className="font-bold text-emerald-700">🏢 NIPOST Building Polygon</div>
                      <div className="font-mono text-[11px] font-semibold text-slate-800">
                        {currentOrder.formatted}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{currentOrder.address}</div>
                    </div>
                  </Popup>
                </Polygon>
              )}

              {/* Building Target Pin */}
              <Marker
                position={[currentOrder.coordinates.lat, currentOrder.coordinates.lng]}
                icon={createBuildingPinIcon(selectedOrderIndex + 1)}
              >
                <Popup>
                  <div className="p-1 text-xs">
                    <span className="font-bold text-emerald-700">Drop-off Target</span>
                    <p className="font-mono text-[11px]">{currentOrder.formatted}</p>
                  </div>
                </Popup>
              </Marker>

              {/* Dashed Polyline Between Rider and Building Polygon */}
              <Polyline
                positions={[
                  [riderPos.lat, riderPos.lng],
                  [currentOrder.coordinates.lat, currentOrder.coordinates.lng],
                ]}
                pathOptions={{
                  color: isAtGate ? '#10b981' : '#6366f1',
                  dashArray: '6, 8',
                  weight: 3,
                  opacity: 0.9,
                }}
              />

              {/* Simulated GPS Dot for Rider (100m away / 30m at gate) */}
              <Marker
                position={[riderPos.lat, riderPos.lng]}
                icon={createRiderIcon(isAtGate)}
              >
                <Popup>
                  <div className="p-1 text-xs">
                    <span className="font-bold text-blue-700">Rider GPS Dot</span>
                    <p className="text-[11px] text-slate-600">{riderPos.distanceLabel}</p>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              No active stop loaded
            </div>
          )}

          {/* Floating Live Telemetry Badge on Map */}
          <div className="absolute top-2.5 right-2.5 z-[400] bg-slate-900/90 text-white backdrop-blur px-2.5 py-1 rounded-lg border border-slate-700/80 shadow-md flex items-center gap-1.5 text-[10px] font-bold">
            <span
              className={`w-2 h-2 rounded-full ${
                isAtGate ? 'bg-emerald-400 animate-ping' : 'bg-blue-400 animate-pulse'
              }`}
            />
            <span>{isAtGate ? '30m Geofence: At Gate' : 'GPS Range: 100m'}</span>
          </div>

          {/* Map Compass / Orientation Indicator */}
          <div className="absolute top-2.5 left-2.5 z-[400] bg-slate-900/90 text-white backdrop-blur w-7 h-7 rounded-lg border border-slate-700/80 shadow-md flex items-center justify-center text-xs font-black">
            🧭
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Action Drawer: Bottom Sheet (Bottom 40% of Phone Screen)      */}
        {/* ------------------------------------------------------------- */}
        <div className="h-[40%] w-full bg-white border-t border-slate-200 flex flex-col shrink-0 relative shadow-[0_-8px_25px_rgba(0,0,0,0.08)] z-30 overflow-hidden">
          {/* Bottom Sheet Drag Indicator */}
          <div className="pt-2 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Content Scroll Container */}
          <div className="flex-1 overflow-y-auto px-4 py-1.5 space-y-2.5 min-h-0">
            {allDelivered ? (
              // All Orders Delivered Celebration Card
              <div className="text-center py-4 space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-sm">
                  ✓
                </div>
                <h3 className="text-sm font-extrabold text-slate-800">
                  Batch {targetBatchKey} Fully Delivered!
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  All {batchOrders.length} parcels delivered successfully with zero phone calls using
                  NIPOST 5-segment prefix routing.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onResetBatchDeliveries) {
                      onResetBatchDeliveries(targetBatchKey);
                    }
                    setSelectedOrderIndex(0);
                    setIsAtGate(false);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  <span>↺</span>
                  <span>Restart Batch Deliveries</span>
                </button>
              </div>
            ) : currentOrder ? (
              <>
                {/* Customer Identity & Verified Address Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-slate-800 truncate">
                        {currentOrder.customerName}
                      </span>
                      {currentOrder.status === 'delivered' ? (
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                          Delivered
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                          Pending Drop
                        </span>
                      )}
                    </div>
                    {/* Customer Phone Number */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <a
                        href={`tel:${currentOrder.phone}`}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-mono"
                      >
                        <span>📞</span>
                        <span>{currentOrder.phone}</span>
                      </a>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] text-slate-500 font-medium truncate">
                        {currentOrder.item}
                      </span>
                    </div>
                  </div>

                  {/* 5-Segment Postcode Badge */}
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      {currentOrder.formatted}
                    </div>
                    <span className="text-[9px] text-slate-400 block mt-0.5">
                      Unit: {currentOrder.segments?.unit || 'Compound'}
                    </span>
                  </div>
                </div>

                {/* Verified Physical Address */}
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                  <div className="flex items-start gap-1.5 text-slate-700">
                    <span className="text-slate-400 mt-0.5 text-xs">📍</span>
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800 block text-[11px] leading-tight">
                        {currentOrder.address}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {currentOrder.names?.district}, {currentOrder.names?.lga} (Zone {currentOrder.segments?.area})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Geofence Status Ribbon */}
                <div
                  className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center justify-between transition-colors ${
                    isAtGate
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-indigo-50 text-indigo-800 border border-indigo-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isAtGate ? 'bg-emerald-500 animate-ping' : 'bg-indigo-500 animate-pulse'
                      }`}
                    />
                    <span className="font-semibold truncate">
                      {isAtGate
                        ? '30m Geofence Triggered: Customer Alerted via SMS'
                        : 'En Route to Building Entrance (100m away)'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-[10px] shrink-0 ml-1">
                    {isAtGate ? 'AT GATE' : 'APPROACHING'}
                  </span>
                </div>

                {/* ----------------------------------------------------------- */}
                {/* "Zero-Call" Action Buttons                                 */}
                {/* ----------------------------------------------------------- */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* Button 1: Simulate 30m Geofence Arrival */}
                  <button
                    type="button"
                    onClick={handleSimulateGeofence}
                    disabled={isAtGate}
                    className={`py-2 px-2 rounded-xl font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isAtGate
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 opacity-90 cursor-default'
                        : 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white shadow-amber-200'
                    }`}
                  >
                    <span>{isAtGate ? '✓' : '🔔'}</span>
                    <span className="truncate">
                      {isAtGate ? '30m Geofence Active' : 'Simulate 30m Geofence Arrival'}
                    </span>
                  </button>

                  {/* Button 2: Complete Delivery */}
                  <button
                    type="button"
                    onClick={handleCompleteDelivery}
                    className="py-2 px-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-sm shadow-emerald-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>✓</span>
                    <span className="truncate">Complete Delivery</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {/* Smartphone Bottom Home Bar */}
          <div className="h-4 bg-white shrink-0 flex items-center justify-center pb-1">
            <div className="w-32 h-1 bg-slate-300 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
