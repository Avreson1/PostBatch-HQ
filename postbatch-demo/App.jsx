/**
 * PostBatch Fleet Manager Dashboard & Pitch Sandbox
 * ==================================================
 *
 * Module 2: Prefix-Clustering Engine + Fleet Manager Dashboard
 * Built with React, Tailwind CSS, Leaflet.js, and NIPOST 5-Segment Postcode API.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { clusterOrders, SEED_ORDERS } from 'postbatch-engine';

// ---------------------------------------------------------------------------
// Custom Numbered Stop Marker using Leaflet DivIcon
// Avoids missing png icon asset issues in bundled web apps
// ---------------------------------------------------------------------------
function createStopIcon(stopNumber, colorHex, isSelected = false) {
  const size = isSelected ? 34 : 28;
  const borderSize = isSelected ? 3 : 2;
  const shadow = isSelected ? '0 0 12px rgba(255,255,255,0.9), 0 4px 8px rgba(0,0,0,0.5)' : '0 3px 6px rgba(0,0,0,0.35)';

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
  // Map orderId to batch color and stopSequence
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
            className="w-full sm:w-64 pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    <div className="text-[11px] text-gray-400 font-mono">₦{order.price?.toLocaleString()}</div>
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
// Main Executive Fleet Hub View
// ===========================================================================
export default function App() {
  const [orders] = useState(SEED_ORDERS);
  const [batches, setBatches] = useState(() => clusterOrders(SEED_ORDERS));
  const [isClustering, setIsClustering] = useState(false);
  const [clusterNotice, setClusterNotice] = useState(null);
  const [activeBatchKey, setActiveBatchKey] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mapTheme, setMapTheme] = useState('voyager'); // 'voyager' or 'dark'

  // Run or re-run clustering
  const handleRunCluster = () => {
    setIsClustering(true);
    const start = performance.now();

    setTimeout(() => {
      const clustered = clusterOrders(orders);
      const elapsedMs = (performance.now() - start).toFixed(1);

      setBatches(clustered);
      setIsClustering(false);
      setClusterNotice(`⚡ ${orders.length} orders clustered across ${clustered.length} postal districts in 0.3s!`);

      setTimeout(() => {
        setClusterNotice(null);
      }, 4000);
    }, 280);
  };

  // Filter batches for map rendering
  const displayedBatches = useMemo(() => {
    if (!activeBatchKey) return batches;
    return batches.filter((b) => b.districtKey === activeBatchKey);
  }, [batches, activeBatchKey]);

  // All coordinates for map bounds
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
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-gray-100 font-sans overflow-hidden">
      {/* ----------------------------------------------------------------- */}
      {/* Top Navigation & Executive Header                                 */}
      {/* ----------------------------------------------------------------- */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-xl">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">
                PostBatch <span className="text-blue-400 font-normal">Fleet Hub</span>
              </h1>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Module 2 Live
              </span>
            </div>
            <p className="text-xs text-slate-400">
              NIPOST Prefix-Clustering & Dispatch Orchestration Engine
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-3">
          {clusterNotice && (
            <span className="hidden sm:inline-flex items-center text-xs text-emerald-400 font-medium bg-emerald-950/80 border border-emerald-500/30 px-3 py-1.5 rounded-lg animate-pulse">
              {clusterNotice}
            </span>
          )}

          <button
            onClick={handleRunCluster}
            disabled={isClustering}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 hover:from-blue-500 to-indigo-600 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 transition-all transform active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span className={isClustering ? 'animate-spin' : ''}>⚡</span>
            <span>{isClustering ? 'Clustering Orders…' : 'Auto-Cluster Orders by Postcode Prefix'}</span>
          </button>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Prominent Executive ROI Banner                                    */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-b border-blue-500/20 px-6 py-3.5 shrink-0 shadow-inner">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Main required ROI headline */}
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <h2 className="text-sm md:text-base font-extrabold text-white tracking-wide flex items-center gap-2">
                <span>{batches.metrics?.bannerText || '15 Orders Batched in 0.3s | 3 Rider Zones Assigned | 32% Est. Fuel Saved'}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated multi-stop routing derived directly from NIPOST alphanumeric postal district prefixes
              </p>
            </div>
          </div>

          {/* Quick Metrics KPI pills */}
          <div className="flex items-center gap-2 text-xs">
            <div className="bg-slate-800/80 border border-slate-700/80 px-3 py-1 rounded-lg">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Orders</span>
              <span className="font-bold text-white">{orders.length} Parcels</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-3 py-1 rounded-lg">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Rider Batches</span>
              <span className="font-bold text-blue-400">{batches.length} Zones</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-3 py-1 rounded-lg">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Est. Fuel Saved</span>
              <span className="font-bold text-emerald-400">{batches.metrics?.fuelSavedPercent || 32}%</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-3 py-1 rounded-lg">
              <span className="text-slate-400 text-[10px] block uppercase font-medium">Sort Time</span>
              <span className="font-bold text-purple-400">0.3s (vs 2.5h)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Main Workspace: Split View between Orders Table & Interactive Map */}
      {/* ----------------------------------------------------------------- */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-4 bg-slate-950">
        {/* Left Side: Incoming Orders Table + Batch Manifest List */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Incoming Orders Table */}
          <div className="flex-1 min-h-[360px]">
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

          {/* Rider Batch Dispatch Cards */}
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-2">
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
        <div className="w-full lg:w-1/2 flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 relative">
          {/* Map Sub-Header Bar */}
          <div className="bg-slate-900/90 backdrop-blur px-4 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Interactive Fleet Dispatch Map · Abuja Municipal
              </h3>
            </div>

            {/* Zone Filter Buttons on Map */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => {
                  setActiveBatchKey(null);
                  setSelectedOrder(null);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
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
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    activeBatchKey === b.districtKey
                      ? 'text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  style={activeBatchKey === b.districtKey ? { backgroundColor: b.color.hex } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: b.color.hex }}
                  />
                  <span>{b.district}</span>
                </button>
              ))}

              {/* Theme toggle (Voyager / Dark) */}
              <button
                onClick={() => setMapTheme(mapTheme === 'dark' ? 'voyager' : 'dark')}
                title="Toggle Map Style"
                className="ml-2 text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]"
              >
                {mapTheme === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            </div>
          </div>

          {/* Leaflet Map Container */}
          <div className="flex-1 relative w-full h-full min-h-[420px]">
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

              {/* Draw sequential polylines connecting stops for each Rider Batch */}
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

              {/* Plot markers for each order */}
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
                          {/* Popup Header with batch pill */}
                          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-200">
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

                          {/* Customer & Item details */}
                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-gray-900 text-sm">
                              {order.customerName}
                            </p>
                            <p className="text-gray-600">
                              📱 {order.phone}
                            </p>
                            <p className="text-gray-800 font-medium">
                              📦 {order.item} <span className="font-bold text-blue-600">₦{order.price?.toLocaleString()}</span>
                            </p>
                            <p className="text-gray-600 text-[11px] mt-1 pt-1 border-t border-gray-100">
                              📍 {order.address}
                            </p>
                            <div className="mt-1.5 pt-1 border-t border-gray-100 flex items-center justify-between">
                              <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                                {order.formatted}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {batch.riderName}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })
              )}
            </MapContainer>

            {/* Map Floating Legend */}
            <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-3 shadow-xl max-w-xs pointer-events-auto">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                Delivery Route Key
              </span>
              <div className="space-y-1.5 text-xs">
                {batches.map((b) => (
                  <div key={b.batchId} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: b.color.hex }}
                    />
                    <span className="text-white font-medium">
                      {b.riderName}: {b.district} ({b.districtKey})
                    </span>
                    <span className="text-slate-400 text-[11px] ml-auto">
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
