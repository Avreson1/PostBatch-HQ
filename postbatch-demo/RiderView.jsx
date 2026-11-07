/**
 * Rider Simulator (Module 3)
 * ==========================
 *
 *   - Rider phone runs the full page height right beside the sidebar; the map
 *     is the main surface, with a compact bottom sheet
 *   - Shortest road route from the rider to the building, with a dashed
 *     final link from the road to the building; straight line when offline
 *   - The rider dot is draggable, and tapping the map moves it there
 *   - Real geofence: distance to the building is measured live; crossing 30 m
 *     sends the "rider is at the gate" SMS automatically (once per stop)
 *   - "Ride to gate" drives the rider along the road route until the geofence fires
 *   - Control panel (beside the phone, under the top bar): rider picker,
 *     telemetry, stop manifest, SMS log
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AnimatePresence, motion, animate } from 'framer-motion';
import {
  BatteryFull,
  BellRing,
  Bike,
  Check,
  CircleCheck,
  Hand,
  LocateFixed,
  MapPin,
  MessageSquareText,
  Navigation,
  Phone,
  PhoneOff,
  Radar,
  RotateCcw,
  Route as RouteIcon,
  Signal,
} from 'lucide-react';
import { haversineDistanceKm } from 'postbatch-engine';
import { fetchRoadPath, ROUTE_MODES, COMPARE_MODE } from './src/services/routing.js';
import RouteModeSwitch from './RouteModeSwitch.jsx';

const EASE = [0.22, 1, 0.36, 1];
const GEOFENCE_M = 30;
const APPROACH_OFFSET = { lat: -0.0016, lng: -0.0013 }; // ~230 m south-west, far enough to show a road route
const GATE_STOP_M = 18; // where "Ride to gate" parks the rider

const metersBetween = (a, b) => haversineDistanceKm(a, b) * 1000;
const approachPoint = (c) => ({ lat: c.lat + APPROACH_OFFSET.lat, lng: c.lng + APPROACH_OFFSET.lng });

function getBuildingPolygon(order) {
  if (!order?.coordinates?.lat || !order?.coordinates?.lng) return [];
  const { lat, lng } = order.coordinates;
  const dLat = 0.00012; // ~13 m
  const dLng = 0.00015; // ~16 m
  return [
    [lat - dLat, lng - dLng],
    [lat - dLat, lng + dLng],
    [lat + dLat, lng + dLng],
    [lat + dLat, lng - dLng],
  ];
}

/** Point at `d` metres along a path of {lat,lng}. */
function pointAlong(path, cum, d) {
  if (d <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= d) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (d - cum[i - 1]) / seg;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t,
      };
    }
  }
  return path[path.length - 1];
}

// ---------------------------------------------------------------------------
// Leaflet icons
// ---------------------------------------------------------------------------
const bikeSvg = renderToStaticMarkup(<Bike size={14} color="#fff" strokeWidth={2.4} />);

function createRiderIcon(isAtGate) {
  const color = isAtGate ? '#059669' : '#4338ca';
  const ring = isAtGate ? 'rgba(5,150,105,.3)' : 'rgba(67,56,202,.28)';
  return L.divIcon({
    className: 'rider-gps-marker',
    html: `
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:grab;">
        <div style="position:absolute;inset:0;border-radius:9999px;background:${ring};animation:pb-ping 1.6s cubic-bezier(0,0,.2,1) infinite;"></div>
        <div style="position:relative;width:28px;height:28px;border-radius:9999px;background:${color};border:2.5px solid #fff;
          box-shadow:0 4px 12px rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;">
          ${bikeSvg}
        </div>
      </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function createBuildingPinIcon(stopNumber) {
  return L.divIcon({
    className: 'building-pin-marker',
    html: `
      <div style="background:#0f172a;color:#fff;min-width:24px;height:22px;padding:0 6px;border-radius:3px;border:2px solid #fff;
        box-shadow:0 3px 8px rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;
        font-family:'JetBrains Mono Variable',ui-monospace,monospace;font-size:11px;font-weight:700;">
        ${stopNumber}
      </div>`,
    iconSize: [24, 22],
    iconAnchor: [12, 11],
  });
}

// ---------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------
function FitOnStopChange({ stopId, target, rider, route }) {
  const map = useMap();
  const riderRef = useRef(rider);
  riderRef.current = rider;
  const fittedFor = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [map]);

  // Fit ONCE per stop: as soon as its road route arrives (or after a short
  // wait if routing is slow/offline) — never twice, never while moving.
  useEffect(() => {
    if (!target || fittedFor.current === stopId) return;
    const fit = (points) => {
      fittedFor.current = stopId;
      map.flyToBounds(L.latLngBounds(points), {
        paddingTopLeft: [40, 60],
        paddingBottomRight: [40, 50],
        maxZoom: 18,
        duration: 0.6,
      });
    };
    const r = riderRef.current;
    if (route?.length) {
      fit([...route, [target.lat, target.lng], [r.lat, r.lng]]);
      return;
    }
    const t = setTimeout(() => {
      if (fittedFor.current !== stopId) fit([[target.lat, target.lng], [riderRef.current.lat, riderRef.current.lng]]);
    }, 900);
    return () => clearTimeout(t);
  }, [stopId, route, map]);

  return null;
}

function RecenterButton({ target, rider }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={() =>
        map.flyToBounds(L.latLngBounds([[target.lat, target.lng], [rider.lat, rider.lng]]), {
          padding: [60, 60],
          maxZoom: 18,
          duration: 0.6,
        })
      }
      className="absolute bottom-3 right-3 z-[400] w-9 h-9 bg-white text-slate-800 rounded-md shadow-float flex items-center justify-center cursor-pointer hover:text-indigo-700"
      title="Recenter"
    >
      <LocateFixed size={16} />
    </button>
  );
}

/** Stable function identity that always calls the latest closure. */
function useCallbackRef(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return React.useCallback((...args) => ref.current(...args), []);
}

// ===========================================================================
// RiderView
// ===========================================================================
export default function RiderView({
  orders = [],
  batches = [],
  topBar = null,
  routeMode = 'shortest',
  onRouteModeChange,
  onCompleteDelivery,
  onResetBatchDeliveries,
  onNotify,
}) {
  // One rider for the demo: Rider A on the Wuse batch
  const [batchKey] = useState(
    () => batches.find((b) => b.districtKey === 'FC-02-A09')?.districtKey || batches[0]?.districtKey
  );
  const batch = batches.find((b) => b.districtKey === batchKey) || batches[0];
  const batchOrders = batch?.orders || [];

  const [stopIndex, setStopIndex] = useState(0);
  const currentOrder = batchOrders[stopIndex] || batchOrders[0] || null;
  const target = currentOrder?.coordinates;

  const [riderPos, setRiderPos] = useState(() => (target ? approachPoint(target) : { lat: 9.0685, lng: 7.466 }));
  const [isRiding, setIsRiding] = useState(false);
  const isRidingRef = useRef(false);
  isRidingRef.current = isRiding;
  const [roadPath, setRoadPath] = useState(null); // { coords: [[lat,lng]], km } or null
  const [routeLoading, setRouteLoading] = useState(false);
  const [comparePath, setComparePath] = useState(null); // other mode, drawn muted
  const routeModeRef = useRef(routeMode);
  routeModeRef.current = routeMode;
  const [smsSentFor, setSmsSentFor] = useState(() => new Set());
  const [smsLog, setSmsLog] = useState([]);
  const [pushBanner, setPushBanner] = useState(null);
  const rideRef = useRef(null);
  const routeReq = useRef(0);
  const riderMarkerRef = useRef(null);
  const lastCommit = useRef(0);

  // Commit rider position to React at most ~10x/s (the marker itself moves every frame)
  const commitRiderPos = (p, force = false) => {
    const now = performance.now();
    if (force || now - lastCommit.current > 100) {
      lastCommit.current = now;
      setRiderPos(p);
    }
  };

  const distanceM = target ? Math.round(metersBetween(riderPos, target)) : null;
  const isAtGate = distanceM !== null && distanceM <= GEOFENCE_M;
  const smsSent = currentOrder ? smsSentFor.has(currentOrder.orderId) : false;

  const deliveredCount = batchOrders.filter((o) => o.status === 'delivered').length;
  const allDelivered = batchOrders.length > 0 && deliveredCount === batchOrders.length;

  // ---- road route from rider to building ---------------------------------
  const requestRoute = async (from) => {
    if (!target) return;
    const id = ++routeReq.current;
    setRouteLoading(true);
    const forStop = currentOrder?.orderId;
    const mode = routeModeRef.current;
    const [path, other] = await Promise.all([
      fetchRoadPath([from, target], mode),
      fetchRoadPath([from, target], COMPARE_MODE[mode]),
    ]);
    if (id !== routeReq.current) return;
    setRoadPath(path ? { ...path, forStop } : null);
    setComparePath(other ? { ...other, forStop } : null);
    setRouteLoading(false);
  };

  // Re-route from where the rider is when the mode changes
  const riderPosRef = useRef(riderPos);
  riderPosRef.current = riderPos;
  useEffect(() => {
    if (!isRidingRef.current) requestRoute(riderPosRef.current);
  }, [routeMode]);

  // Jump to first pending stop when the batch changes
  useEffect(() => {
    const firstPending = batchOrders.findIndex((o) => o.status !== 'delivered');
    setStopIndex(firstPending === -1 ? 0 : firstPending);
  }, [batchKey]);

  // New stop → rider starts on the approach road
  useEffect(() => {
    rideRef.current?.stop();
    setIsRiding(false);
    if (!target) return;
    const start = approachPoint(target);
    setRiderPos(start);
    setRoadPath(null);
    requestRoute(start);
  }, [currentOrder?.orderId]);

  useEffect(() => () => rideRef.current?.stop(), []);

  // Geofence: crossing 30 m sends the SMS automatically, once per stop
  const smsSentRef = useRef(new Set()); // synchronous guard: one SMS per stop, even if the road re-enters the fence
  useEffect(() => {
    if (!currentOrder || !isAtGate || currentOrder.status === 'delivered') return;
    if (smsSentRef.current.has(currentOrder.orderId)) return;
    smsSentRef.current.add(currentOrder.orderId);
    const message = `Your PostBatch rider is at the gate of ${currentOrder.address.split(',')[0]}.`;
    setSmsSentFor(new Set(smsSentRef.current));
    setSmsLog((prev) =>
      [{ id: `${currentOrder.orderId}-${Date.now()}`, to: currentOrder.customerName, phone: currentOrder.phone, message, at: new Date() }, ...prev].slice(0, 8)
    );
    setPushBanner({ id: Date.now(), message: `SMS sent to ${currentOrder.customerName}`, sub: message });
    onNotify?.(`Geofence crossed at ${distanceM} m. SMS sent to ${currentOrder.customerName}.`, 'sms');
  }, [isAtGate, currentOrder?.orderId]);

  useEffect(() => {
    if (!pushBanner) return;
    const t = setTimeout(() => setPushBanner(null), 4000);
    return () => clearTimeout(t);
  }, [pushBanner]);

  // Drive along the road route; stop once inside GATE_STOP_M of the building
  const rideToGate = () => {
    if (!target || isRiding) return;
    const path = [
      riderPos,
      ...(roadPath?.coords || []).map(([lat, lng]) => ({ lat, lng })),
      target,
    ];
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metersBetween(path[i - 1], path[i]));
    const total = cum[cum.length - 1];
    if (total < 1 || metersBetween(riderPos, target) <= GATE_STOP_M) return;

    setIsRiding(true);
    const controls = animate(0, total, {
      duration: Math.min(6, Math.max(2, total / 70)),
      ease: [0.45, 0, 0.25, 1],
      onUpdate: (d) => {
        const p = pointAlong(path, cum, d);
        riderMarkerRef.current?.setLatLng([p.lat, p.lng]);
        const inside = metersBetween(p, target) <= GEOFENCE_M;
        commitRiderPos(p, inside);
        if (metersBetween(p, target) <= GATE_STOP_M) {
          controls.stop();
          commitRiderPos(p, true);
          setIsRiding(false);
          requestRoute(p);
        }
      },
      onComplete: () => setIsRiding(false),
    });
    rideRef.current = controls;
  };

  const completeDelivery = () => {
    if (!currentOrder) return;
    onCompleteDelivery?.(currentOrder.orderId);
    const later = batchOrders.findIndex((o, i) => i > stopIndex && o.status !== 'delivered');
    const any = later !== -1 ? later : batchOrders.findIndex((o, i) => i !== stopIndex && o.status !== 'delivered');
    if (any !== -1) setStopIndex(any);
  };

  const resetBatch = useCallbackRef(() => {
    rideRef.current?.stop();
    setIsRiding(false);
    onResetBatchDeliveries?.(batch.districtKey);
    smsSentRef.current = new Set();
    setSmsSentFor(new Set());
    setSmsLog([]);
    setPushBanner(null);
    setStopIndex(0);
    if (batchOrders[0]?.coordinates) {
      const start = approachPoint(batchOrders[0].coordinates);
      setRiderPos(start);
      requestRoute(start);
    }
  });

  const requestRouteRef = useRef(requestRoute);
  requestRouteRef.current = requestRoute;
  const riderDragHandlers = useMemo(
    () => ({
      dragstart: () => {
        rideRef.current?.stop();
        setRoadPath(null);
        setComparePath(null);
      },
      drag: (e) => {
        const ll = e.target.getLatLng();
        commitRiderPos({ lat: ll.lat, lng: ll.lng });
      },
      dragend: (e) => {
        const ll = e.target.getLatLng();
        const p = { lat: ll.lat, lng: ll.lng };
        commitRiderPos(p, true);
        requestRouteRef.current(p);
      },
    }),
    []
  );

  const buildingPolygon = useMemo(() => getBuildingPolygon(currentOrder), [currentOrder?.orderId]);
  const riderIcon = useMemo(() => createRiderIcon(isAtGate), [isAtGate]);
  const pinIcon = useMemo(() => createBuildingPinIcon(stopIndex + 1), [stopIndex]);

  // Remaining road path: trim the part already ridden (closest vertex onward)
  const remainingRoad = useMemo(() => {
    if (!roadPath?.coords?.length) return null;
    const coords = roadPath.coords;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = metersBetween(riderPos, { lat: coords[i][0], lng: coords[i][1] });
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return [[riderPos.lat, riderPos.lng], ...coords.slice(best)];
  }, [roadPath, riderPos]);

  const roadEnd = remainingRoad ? remainingRoad[remainingRoad.length - 1] : [riderPos.lat, riderPos.lng];
  const roadM = roadPath ? Math.round(roadPath.km * 1000) : null;
  const modeLabel = ROUTE_MODES.find((m) => m.id === routeMode)?.label || 'Shortest';
  const compareLabel = ROUTE_MODES.find((m) => m.id === COMPARE_MODE[routeMode])?.label || '';
  const roadKmLabel = isAtGate
    ? 'Arrived'
    : roadPath
    ? `${roadM} m · ${modeLabel.toLowerCase()}`
    : routeLoading
    ? 'Routing…'
    : 'Straight line';

  if (!batch) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-500">No rider batches yet. Run Auto-Cluster first.</div>;
  }

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* =============================================================== */}
      {/* Rider phone — full page height, beside the sidebar              */}
      {/* =============================================================== */}
      <div className="w-[400px] max-w-[46vw] h-full shrink-0 bg-white flex flex-col relative shadow-[1px_0_0_rgba(15,23,42,0.12),8px_0_30px_rgba(15,23,42,0.08)] z-10">
        {/* Status bar + app header */}
        <div className="bg-slate-950 text-white shrink-0">
          <div className="h-6 px-4 flex items-center justify-between text-[10px] text-slate-400">
            <span className="font-mono">9:41</span>
            <div className="flex items-center gap-1.5">
              <Signal size={11} />
              <span className="font-semibold">5G</span>
              <BatteryFull size={13} />
            </div>
          </div>

          <div className="px-4 pb-2.5 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: batch.color.hex }} />
                <span className="text-sm font-semibold font-mono tracking-tight">{batch.districtKey}</span>
                <span className="text-[11px] text-slate-400 truncate">{batch.riderName} · {batch.district}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-300">
                  <span className="font-mono text-white">{stopIndex + 1}</span>/{batchOrders.length}
                </span>
                <button
                  type="button"
                  onClick={resetBatch}
                  disabled={deliveredCount === 0 && smsSentFor.size === 0}
                  title="Reset stops"
                  className="w-6 h-6 rounded-sm flex items-center justify-center text-slate-300 bg-white/10 hover:bg-white/20 hover:text-white cursor-pointer disabled:opacity-30 disabled:cursor-default transition-colors"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>

            <StopChips orders={batchOrders} stopIndex={stopIndex} onSelect={setStopIndex} />
          </div>

          {/* Progress */}
          <div className="h-[3px] bg-white/10">
            <motion.div
              className="h-full bg-emerald-400"
              initial={false}
              animate={{ width: `${(deliveredCount / Math.max(1, batchOrders.length)) * 100}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
        </div>

        {/* Map — the main surface */}
        <div className="flex-1 min-h-0 w-full relative bg-slate-900">
          {/* Push banner */}
          <AnimatePresence>
            {pushBanner && (
              <motion.div
                key={pushBanner.id}
                initial={{ opacity: 0, y: -20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.98 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="absolute top-2 left-2 right-2 z-[500] bg-slate-950 text-white p-2.5 rounded-md shadow-float"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <MessageSquareText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>SMS gateway</span>
                      <span className="text-emerald-400">now</span>
                    </div>
                    <p className="text-xs font-medium text-white">{pushBanner.message}</p>
                    <p className="text-[11px] text-slate-300 leading-snug truncate">{pushBanner.sub}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {target ? (
            <MapContainer center={[target.lat, target.lng]} zoom={17} zoomControl={false} className="h-full w-full" style={{ background: '#0f172a' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <FitOnStopChange stopId={currentOrder.orderId} target={target} rider={riderPos} route={roadPath?.forStop === currentOrder.orderId ? roadPath.coords : null} />
              <RecenterButton target={target} rider={riderPos} />

              <Circle
                center={[target.lat, target.lng]}
                radius={GEOFENCE_M}
                pathOptions={{
                  color: isAtGate ? '#059669' : '#4338ca',
                  weight: 2,
                  dashArray: '4, 5',
                  fillColor: isAtGate ? '#10b981' : '#6366f1',
                  fillOpacity: isAtGate ? 0.18 : 0.1,
                }}
              />

              {buildingPolygon.length > 0 && (
                <Polygon positions={buildingPolygon} pathOptions={{ color: '#047857', fillColor: '#10b981', fillOpacity: 0.55, weight: 2 }} />
              )}

              {/* Comparison mode: muted dotted line */}
              {comparePath?.forStop === currentOrder.orderId && !isAtGate && (
                <Polyline
                  positions={[[riderPos.lat, riderPos.lng], ...comparePath.coords]}
                  pathOptions={{ color: '#475569', weight: 3.5, opacity: 0.8, dashArray: '1, 7', lineCap: 'round' }}
                />
              )}

              {/* Road route (casing + line), then dashed link road → building */}
              {remainingRoad ? (
                <>
                  <Polyline positions={remainingRoad} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.95 }} />
                  <Polyline positions={remainingRoad} pathOptions={{ color: isAtGate ? '#059669' : '#4338ca', weight: 4.5, opacity: 1 }} />
                  <Polyline
                    positions={[roadEnd, [target.lat, target.lng]]}
                    pathOptions={{ color: '#0f172a', weight: 2, dashArray: '3, 5', opacity: 0.8 }}
                  />
                </>
              ) : (
                <Polyline
                  positions={[[riderPos.lat, riderPos.lng], [target.lat, target.lng]]}
                  pathOptions={{ color: isAtGate ? '#059669' : '#4338ca', dashArray: '5, 7', weight: 3, opacity: 0.95 }}
                />
              )}

              <Marker position={[target.lat, target.lng]} icon={pinIcon} interactive={false} />

              <Marker
                ref={riderMarkerRef}
                position={[riderPos.lat, riderPos.lng]}
                icon={riderIcon}
                draggable={!isRiding}
                eventHandlers={riderDragHandlers}
              />
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">No active stop</div>
          )}

          {/* Distance chip */}
          <div
            className={`absolute top-3 left-3 z-[400] h-8 pl-2 pr-2.5 rounded-md shadow-float flex items-center gap-2 text-xs transition-colors duration-300 ${
              isAtGate ? 'bg-emerald-600 text-white' : 'bg-white text-slate-900'
            }`}
          >
            <Radar size={14} className={isAtGate ? 'text-white' : 'text-indigo-700'} />
            <span className="font-mono font-semibold">{distanceM ?? '—'} m</span>
            <span className={isAtGate ? 'text-emerald-100' : 'text-slate-500'}>{isAtGate ? 'inside geofence' : 'to gate'}</span>
          </div>

          {/* Road distance chip */}
          <div className="absolute top-3 right-3 z-[400] h-8 px-2.5 rounded-md shadow-float bg-slate-950 text-white flex items-center gap-1.5 text-[11px]">
            <RouteIcon size={12} className={roadPath ? 'text-emerald-400' : 'text-amber-400'} />
            <span className="font-mono">{roadKmLabel}</span>
          </div>

          <AnimatePresence>
            {!isAtGate && !isRiding && !allDelivered && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-3 left-3 z-[400] bg-slate-950 text-white text-[11px] px-2.5 h-7 rounded-md shadow-float flex items-center gap-1.5 whitespace-nowrap pointer-events-none"
              >
                <Hand size={12} /> Drag the rider to move it
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Compact bottom sheet */}
        <div className="shrink-0 bg-white px-4 pt-3 pb-4 shadow-[0_-1px_0_rgba(15,23,42,0.1)] relative z-[450]">
          <AnimatePresence mode="wait" initial={false}>
            {allDelivered ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex items-center gap-3"
              >
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center shrink-0"
                >
                  <CircleCheck size={20} />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">Batch delivered</h3>
                  <p className="text-[11px] text-slate-600">{batchOrders.length} parcels · {smsSentFor.size} SMS · 0 calls</p>
                </div>
                <button
                  type="button"
                  onClick={resetBatch}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-sm bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium cursor-pointer shrink-0"
                >
                  <RotateCcw size={13} /> Restart
                </button>
              </motion.div>
            ) : currentOrder ? (
              <motion.div
                key={currentOrder.orderId}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-slate-900 truncate">{currentOrder.customerName}</span>
                    {currentOrder.status === 'delivered' ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0">Delivered</span>
                    ) : smsSent ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0 flex items-center gap-1">
                        <MessageSquareText size={10} /> Alerted
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0">En route</span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] font-medium text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded-sm shrink-0">
                    {currentOrder.formatted}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 min-w-0">
                  <MapPin size={12} className="text-slate-500 shrink-0" />
                  <span className="truncate">{currentOrder.address}</span>
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={rideToGate}
                    disabled={isAtGate || isRiding}
                    className={`h-10 px-2 min-w-0 whitespace-nowrap rounded-sm font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isAtGate ? 'bg-emerald-100 text-emerald-800 cursor-default' : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-80'
                    }`}
                  >
                    {isAtGate ? <BellRing size={14} className="shrink-0" /> : <Navigation size={14} className="shrink-0" />}
                    <span className="truncate">{isAtGate ? 'At the gate' : isRiding ? 'Riding…' : 'Ride to gate'}</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={completeDelivery}
                    disabled={currentOrder.status === 'delivered'}
                    className={`h-10 px-2 min-w-0 whitespace-nowrap rounded-sm font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                      isAtGate ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                    }`}
                  >
                    <Check size={14} strokeWidth={2.5} className="shrink-0" />
                    <span className="truncate">Complete delivery</span>
                  </motion.button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* =============================================================== */}
      {/* Control panel: top bar + rider tools                            */}
      {/* =============================================================== */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        {topBar}

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Telemetry */}
          <section className="bg-white rounded-md shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Live telemetry</h2>
                <span className="flex items-center gap-1.5 text-[11px] text-slate-600 mt-1 truncate">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: batch.color.hex }} />
                  {batch.riderName} · {batch.district} · <span className="font-mono">{batch.estimatedRouteDistanceKm} km route</span>
                </span>
              </div>
              <RouteModeSwitch value={routeMode} onChange={onRouteModeChange} className="shrink-0" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Metric label="To gate" value={distanceM !== null ? `${distanceM} m` : '—'} tone={isAtGate ? 'good' : 'default'} />
              <Metric
                label={`${modeLabel} route`}
                value={isAtGate ? 'Arrived' : roadM !== null ? `${roadM} m` : '—'}
                sub={
                  isAtGate
                    ? undefined
                    : roadPath
                    ? `${Math.max(1, Math.round(roadPath.minutes))} min${
                        comparePath ? ` · ${compareLabel} ${Math.round(comparePath.km * 1000)} m` : ''
                      }`
                    : routeLoading
                    ? 'routing…'
                    : 'offline estimate'
                }
              />
              <Metric label="Geofence" value={isAtGate ? 'Inside' : 'Outside'} sub={`${GEOFENCE_M} m radius`} tone={isAtGate ? 'good' : 'default'} />
              <Metric label="Calls" value="0" sub={`${smsSentFor.size} SMS sent`} />
            </div>
            <p className="text-[11px] text-slate-600 mt-3 leading-relaxed flex items-start gap-1.5">
              <Bike size={12} className="mt-0.5 shrink-0 text-slate-500" />
              Drag the rider to move it. The solid line is the {modeLabel.toLowerCase()} road route, the dotted one is {compareLabel.toLowerCase()} for comparison, and crossing {GEOFENCE_M} m sends the SMS by itself.
            </p>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <StopManifest
              orders={batchOrders}
              stopIndex={stopIndex}
              onSelect={setStopIndex}
              onReset={resetBatch}
              canReset={deliveredCount > 0 || smsSentFor.size > 0}
            />
            <SmsLogPanel log={smsLog} />
          </div>
        </div>
      </div>
    </div>
  );
}

const StopManifest = React.memo(function StopManifest({ orders, stopIndex, onSelect, onReset, canReset }) {
  const done = orders.filter((o) => o.status === 'delivered').length;
  return (
    <section className="bg-white rounded-md shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Stop manifest <span className="font-mono normal-case tracking-normal text-slate-400">· {done}/{orders.length} delivered</span>
        </h2>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-sm bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-default transition-colors"
        >
          <RotateCcw size={12} /> Reset stops
        </button>
      </div>
      <ol className="space-y-0.5">
        {orders.map((o, idx) => {
          const sel = idx === stopIndex;
          const done = o.status === 'delivered';
          return (
            <li key={o.orderId}>
              <button
                type="button"
                onClick={() => onSelect(idx)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-sm text-left cursor-pointer transition-colors ${sel ? 'bg-indigo-100' : 'hover:bg-slate-100'}`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold shrink-0 ${
                    done ? 'bg-emerald-600 text-white' : sel ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {done ? <Check size={11} strokeWidth={3} /> : idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-slate-900 block truncate">{o.customerName}</span>
                  <span className="text-[11px] text-slate-600 block truncate">{o.address}</span>
                </span>
                <span className="font-mono text-[10px] text-slate-600 shrink-0 hidden 2xl:inline">{o.formatted}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

const SmsLogPanel = React.memo(function SmsLogPanel({ log }) {
  return (
    <section className="bg-white rounded-md shadow-card p-4">
      <SectionTitle>SMS log</SectionTitle>
      {log.length === 0 ? (
        <p className="text-[11px] text-slate-500 py-2">No alerts yet. Move the rider inside the geofence.</p>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {log.map((s) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex items-start gap-2.5 bg-slate-100 rounded-sm p-2.5"
              >
                <MessageSquareText size={14} className="text-emerald-700 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-slate-900 truncate">
                      {s.to} <span className="font-mono text-slate-500 font-normal"><Phone size={10} className="inline -mt-0.5" /> {s.phone}</span>
                    </span>
                    <span className="text-slate-500 font-mono text-[10px] shrink-0">
                      {s.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">{s.message}</p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
});

const StopChips = React.memo(function StopChips({ orders, stopIndex, onSelect }) {
  return (
            <div className="flex items-center gap-1 mt-2 overflow-x-auto no-scrollbar">
              {orders.map((order, idx) => {
                const isSel = idx === stopIndex;
                const done = order.status === 'delivered';
                return (
                  <button
                    key={order.orderId}
                    type="button"
                    onClick={() => onSelect(idx)}
                    className={`relative px-1.5 h-[22px] rounded-sm text-[10px] font-mono font-medium shrink-0 cursor-pointer flex items-center gap-1 transition-colors ${
                      isSel ? 'text-white' : done ? 'text-emerald-300 bg-emerald-500/15' : 'text-slate-300 bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    {isSel && (
                      <motion.span layoutId="rider-stop" className="absolute inset-0 rounded-sm bg-indigo-600" transition={{ duration: 0.3, ease: EASE }} />
                    )}
                    <span className="relative flex items-center gap-1">
                      {done ? <Check size={10} strokeWidth={3} /> : idx + 1}
                      <span>{order.segments?.area}-{order.segments?.unit}</span>
                    </span>
                  </button>
                );
              })}
            </div>
  );
});

function SectionTitle({ children }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">{children}</h2>;
}

function Metric({ label, value, sub, tone = 'default' }) {
  return (
    <div className={`rounded-sm px-2.5 py-2 min-w-0 transition-colors duration-300 ${tone === 'good' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
      <div className="text-[10px] text-slate-600 truncate">{label}</div>
      <div className={`text-sm font-semibold font-mono truncate ${tone === 'good' ? 'text-emerald-800' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 truncate">{sub}</div>}
    </div>
  );
}
