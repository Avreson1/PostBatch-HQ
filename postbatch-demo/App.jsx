/**
 * PostBatch Pitch Demo — App.jsx
 * ================================
 *
 * Two-screen split view for the Saturday pitch:
 *   Screen 1 (Left):  Dummy E-Commerce Checkout with embedded PostBatch Widget
 *   Screen 2 (Right): Fleet Manager Dashboard with Leaflet.js polygon clusters
 *
 * This app uses mock JSON data from /mock/postcodes.json as the default
 * data source, with an optional toggle to hit the live NIPOST staging API.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, Popup } from 'react-leaflet';

// ---------------------------------------------------------------------------
// Mock data import (fallback when NIPOST staging is down)
// ---------------------------------------------------------------------------
import mockData from './mock/postcodes.json';

// ---------------------------------------------------------------------------
// Zone colour palette — each district prefix gets a unique colour
// ---------------------------------------------------------------------------
const ZONE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

function getZoneColor(index) {
  return ZONE_COLORS[index % ZONE_COLORS.length];
}

// ---------------------------------------------------------------------------
// Prefix clustering (mirrors postbatch-engine/cluster.js)
// ---------------------------------------------------------------------------
function clusterByPrefix(postcodes) {
  const clusters = {};
  for (const item of postcodes) {
    const prefix = item.postcode.split('-').slice(0, 2).join('-');
    if (!clusters[prefix]) clusters[prefix] = [];
    clusters[prefix].push(item);
  }
  return clusters;
}

// ===========================================================================
// Screen 1 — Dummy E-Commerce Checkout
// ===========================================================================
function CheckoutScreen({ onAddToDispatch, cart }) {
  const [postcode, setPostcode] = useState('');
  const [product] = useState({
    name: 'Premium Wireless Earbuds',
    price: '₦ 24,500',
    image: 'https://placehold.co/120x120/e2e8f0/334155?text=📦',
  });
  const [suggestions, setSuggestions] = useState([]);
  const [verified, setVerified] = useState(null);

  // Auto-suggest from mock data
  const handleInputChange = (value) => {
    setPostcode(value);
    setVerified(null);
    if (value.length >= 2) {
      const matches = mockData.postcodes.filter((p) =>
        p.postcode.toUpperCase().startsWith(value.toUpperCase())
      );
      setSuggestions(matches.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  };

  const handleVerify = (item) => {
    setPostcode(item.postcode);
    setVerified(item);
    setSuggestions([]);
  };

  const handlePlaceOrder = () => {
    if (!verified) return;
    onAddToDispatch(verified);
    setPostcode('');
    setVerified(null);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="bg-postbatch-900 text-white px-6 py-4">
        <h2 className="text-lg font-bold">🛒 ShopNaija Checkout</h2>
        <p className="text-sm text-blue-200">Demo merchant using PostBatch Widget</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Product Card */}
        <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl">
          <img src={product.image} alt="Product" className="w-20 h-20 rounded-lg" />
          <div>
            <p className="font-semibold">{product.name}</p>
            <p className="text-postbatch-600 font-bold text-lg">{product.price}</p>
          </div>
        </div>

        {/* PostBatch Widget (simulated) */}
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-postbatch-600 text-white text-xs font-bold px-2 py-1 rounded">PostBatch</span>
            <span className="text-sm text-gray-600">Delivery Postcode (NIPOST)</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={postcode}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="e.g. LA-101-2001"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-postbatch-500"
            />
            <button
              onClick={() => {
                const match = mockData.postcodes.find(
                  (p) => p.postcode.toUpperCase() === postcode.toUpperCase()
                );
                if (match) handleVerify(match);
              }}
              className="bg-postbatch-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-postbatch-700 transition"
            >
              Verify
            </button>
          </div>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <ul className="mt-2 border border-gray-200 rounded-lg bg-white max-h-40 overflow-y-auto">
              {suggestions.map((s) => (
                <li
                  key={s.postcode}
                  onClick={() => handleVerify(s)}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                >
                  <span className="font-mono font-semibold">{s.postcode}</span>
                  <span className="text-gray-500 ml-2">— {s.area}, {s.state}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Verified badge */}
          {verified && (
            <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
              <span>✓</span>
              <span>
                <strong>{verified.postcode}</strong> — {verified.area}, {verified.lga}, {verified.state}
              </span>
            </div>
          )}
        </div>

        {/* Place Order button */}
        <button
          disabled={!verified}
          onClick={handlePlaceOrder}
          className={`w-full py-3 rounded-xl font-bold text-white transition ${
            verified
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {verified ? '✓ Place Order & Send to Dispatch' : 'Verify postcode to continue'}
        </button>

        {/* Order queue */}
        {cart.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
              Orders in dispatch queue ({cart.length})
            </p>
            <div className="space-y-1">
              {cart.map((item, i) => (
                <div key={i} className="text-sm font-mono bg-gray-100 px-3 py-1 rounded">
                  {item.postcode} — {item.area}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Screen 2 — Fleet Manager Dashboard
// ===========================================================================
function DashboardScreen({ cart }) {
  const clusters = clusterByPrefix(cart);
  const zoneEntries = Object.entries(clusters);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">📊 Fleet Dashboard</h2>
          <p className="text-sm text-gray-400">PostBatch Dispatch Manager</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="bg-green-600 px-3 py-1 rounded-full font-semibold">
            {cart.length} parcels
          </span>
          <span className="bg-purple-600 px-3 py-1 rounded-full font-semibold">
            {zoneEntries.length} zones
          </span>
        </div>
      </div>

      {/* Map + Zone List */}
      <div className="flex-1 flex">
        {/* Leaflet Map */}
        <div className="flex-1 relative">
          {cart.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-4xl mb-2">🗺️</p>
                <p>Place orders on the left to see clusters appear here</p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={[cart[0]?.lat || 6.5, cart[0]?.lng || 3.38]}
              zoom={6}
              className="h-full w-full"
              style={{ background: '#1a1a2e' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {zoneEntries.map(([prefix, items], zoneIdx) =>
                items.map((item) => (
                  <GeoJSON
                    key={item.postcode}
                    data={item.polygon}
                    style={{
                      color: getZoneColor(zoneIdx),
                      weight: 2,
                      fillOpacity: 0.35,
                    }}
                  >
                    <Popup>
                      <div className="text-gray-900">
                        <strong>{item.postcode}</strong>
                        <br />
                        {item.area}, {item.lga}
                        <br />
                        <span className="text-xs text-gray-500">Zone: {prefix}</span>
                      </div>
                    </Popup>
                  </GeoJSON>
                ))
              )}
            </MapContainer>
          )}
        </div>

        {/* Zone Sidebar */}
        <div className="w-72 bg-gray-800 border-l border-gray-700 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-xs text-gray-400 uppercase font-semibold">Dispatch Zones</p>
          </div>
          {zoneEntries.length === 0 ? (
            <p className="text-sm text-gray-500 p-4">No zones yet.</p>
          ) : (
            zoneEntries.map(([prefix, items], idx) => (
              <div key={prefix} className="border-b border-gray-700 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ backgroundColor: getZoneColor(idx) }}
                  />
                  <span className="font-mono font-bold text-sm">{prefix}</span>
                  <span className="ml-auto bg-gray-700 text-xs px-2 py-0.5 rounded-full">
                    {items.length} parcel{items.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-1 mt-2">
                  {items.map((item) => (
                    <div key={item.postcode} className="text-xs text-gray-400 font-mono">
                      {item.postcode} — {item.area}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// App Root — Split View
// ===========================================================================
export default function App() {
  const [cart, setCart] = useState([]);

  const handleAddToDispatch = useCallback((item) => {
    setCart((prev) => [...prev, item]);
  }, []);

  return (
    <div className="flex h-screen w-screen">
      {/* Left: Checkout */}
      <div className="w-1/2 border-r border-gray-300">
        <CheckoutScreen onAddToDispatch={handleAddToDispatch} cart={cart} />
      </div>
      {/* Right: Dashboard */}
      <div className="w-1/2">
        <DashboardScreen cart={cart} />
      </div>
    </div>
  );
}
