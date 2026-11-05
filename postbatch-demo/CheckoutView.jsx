/**
 * UrbanFootwear NG — Storefront Checkout View (Module 1)
 * ========================================================
 *
 * Simulates a modern Nigerian e-commerce checkout ("UrbanFootwear NG")
 * embedding the PostBatch NIPOST Postcode Address Widget.
 *
 * Conforms to AI-CONTEXT.md standard order payload shape:
 *   - Auto-formatting 11-char postcode (AA-99-H77-BB-55)
 *   - Detect Postcode via GPS button
 *   - Auto-resolves official names: State, LGA, District, Area
 *   - Dynamic shipping calculation (₦1,000 / ₦1,500 / ₦2,500)
 *   - Offline / Sandbox Fallback toggle with 4 preset postcodes
 *   - Dispatches order to the Fleet Hub orders list with success toast
 */

import React, { useState, useEffect, useId } from 'react';
import {
  formatPostcode,
  parse5SegmentPostcode,
  resolvePostcodeNames,
  calculateShippingFee,
  buildVerifiedPayload,
  PRESET_POSTCODES,
  DEFAULT_ORIGIN_HUB,
} from 'postbatch-widget';

export default function CheckoutView({ onPlaceOrder, isSplitView = false }) {
  // Customer details state
  const [customerName, setCustomerName] = useState('Amina Bello');
  const [phone, setPhone] = useState('08031234567');
  const [streetAddress, setStreetAddress] = useState('12 Marina Road, Wuse Zone 4, Abuja');

  // Widget state
  const [rawInput, setRawInput] = useState('FC-02-A09-DB-09');
  const [isSandbox, setIsSandbox] = useState(true);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [verifiedPayload, setVerifiedPayload] = useState(() => {
    const parsed = parse5SegmentPostcode('FC-02-A09-DB-09');
    return buildVerifiedPayload(parsed, DEFAULT_ORIGIN_HUB, '12 Marina Road, Wuse Zone 4, Abuja');
  });

  const itemPrice = 28000;
  const shippingFee = verifiedPayload?.shippingFee || 1000;
  const totalAmount = itemPrice + shippingFee;

  // Handle typed postcode input with automatic masking
  const handlePostcodeChange = (value) => {
    const formatted = formatPostcode(value);
    setRawInput(formatted);

    const parsed = parse5SegmentPostcode(formatted);
    if (parsed) {
      const payload = buildVerifiedPayload(parsed, DEFAULT_ORIGIN_HUB, streetAddress);
      setVerifiedPayload(payload);
    } else {
      setVerifiedPayload(null);
    }
  };

  // Handle preset dropdown selection
  const handleSelectPreset = (e) => {
    const code = e.target.value;
    if (!code) return;
    const preset = PRESET_POSTCODES.find((p) => p.formatted === code);
    if (preset) {
      setRawInput(preset.formatted);
      if (preset.address) setStreetAddress(preset.address);
      const parsed = parse5SegmentPostcode(preset.formatted);
      const payload = buildVerifiedPayload(parsed, DEFAULT_ORIGIN_HUB, preset.address);
      setVerifiedPayload(payload);
    }
  };

  // Handle GPS detection
  const handleDetectGPS = () => {
    setIsGpsLoading(true);

    const resolveWithCode = (code, address) => {
      setTimeout(() => {
        setIsGpsLoading(false);
        setRawInput(code);
        if (address) setStreetAddress(address);
        const parsed = parse5SegmentPostcode(code);
        const payload = buildVerifiedPayload(parsed, DEFAULT_ORIGIN_HUB, address);
        setVerifiedPayload(payload);
      }, 500);
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => resolveWithCode('FC-02-A09-DB-09', '12 Marina Road, Wuse Zone 4, Abuja'),
        () => resolveWithCode('FC-02-A09-DB-09', '12 Marina Road, Wuse Zone 4, Abuja'),
        { timeout: 3000 }
      );
    } else {
      resolveWithCode('FC-02-A09-DB-09', '12 Marina Road, Wuse Zone 4, Abuja');
    }
  };

  // Submit order to shared Fleet Hub store
  const handleSubmitOrder = (e) => {
    e.preventDefault();
    if (!verifiedPayload) return;

    // Conforms strictly to AI-CONTEXT.md standard schema
    const newOrder = {
      orderId: `ORD-${Math.floor(1085 + Math.random() * 8900)}`,
      customerName: customerName.trim() || 'Amina Bello',
      phone: phone.trim() || '08031234567',
      item: 'Sneakers (Size 42)',
      price: itemPrice,
      shippingFee: verifiedPayload.shippingFee,
      postcode: verifiedPayload.postcode,
      formatted: verifiedPayload.formatted,
      segments: verifiedPayload.segments,
      names: verifiedPayload.names,
      address: streetAddress.trim() || verifiedPayload.address,
      coordinates: verifiedPayload.coordinates,
    };

    onPlaceOrder(newOrder);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* ----------------------------------------------------------------- */}
      {/* Merchant Branding Bar (UrbanFootwear NG)                          */}
      {/* ----------------------------------------------------------------- */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white text-xl shadow-md shadow-orange-500/20">
              👟
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-slate-900">
                  UrbanFootwear <span className="text-orange-600">NG</span>
                </h1>
                <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Merchant Checkout
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Official Nigerian Streetwear · Verified NIPOST Last-Mile Delivery
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs font-semibold text-slate-600">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span>🔒</span> SSL Secure Checkout
            </span>
            <span className="flex items-center gap-1.5 text-blue-600">
              <span>⚡</span> Fast Dispatch
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">1. Shopping Bag</span>
          <span className="text-slate-300">›</span>
          <span className="text-orange-600 font-bold flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-orange-600 text-white text-[10px] flex items-center justify-center font-bold">
              2
            </span>
            Shipping & Postcode Verification
          </span>
          <span className="text-slate-300">›</span>
          <span className="text-slate-400 font-medium">3. Payment & Confirmation</span>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Checkout Content Layout                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className={`p-4 md:p-6 ${isSplitView ? 'max-w-full' : 'max-w-5xl mx-auto'} w-full flex-1`}>
        <div className={`grid grid-cols-1 ${isSplitView ? 'xl:grid-cols-12' : 'lg:grid-cols-12'} gap-6`}>
          {/* Left Column: Customer & Address Form with PostBatch Widget */}
          <div className={`${isSplitView ? 'xl:col-span-7' : 'lg:col-span-7'} space-y-5`}>
            {/* Customer Details Card */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <span>👤</span> Customer & Delivery Contact
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Amina Bello"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Phone Number (WhatsApp)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08031234567"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1 text-xs">
                  Street Address & Nearest Landmark
                </label>
                <input
                  type="text"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="e.g. 12 Marina Road, Off Kashim Ibrahim Way"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-xs"
                />
              </div>
            </div>

            {/* PostBatch Embedded Address Widget */}
            <div className="bg-white rounded-xl p-5 border-2 border-blue-500/30 shadow-md relative overflow-hidden">
              {/* Highlight ribbon */}
              <div className="absolute top-0 right-0 bg-gradient-to-l from-blue-600 to-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider shadow">
                PostBatch SDK v0.2
              </div>

              {/* Widget Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded shadow-sm">
                      NIPOST
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">
                      Digital Postcode Verification
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Official 5-segment resolution for automated dispatch clustering
                  </p>
                </div>

                {/* Sandbox Fallback Toggle */}
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer pt-6">
                  <input
                    type="checkbox"
                    checked={isSandbox}
                    onChange={(e) => setIsSandbox(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Sandbox Fallback</span>
                </label>
              </div>

              {/* Postcode Input Field with Automatic 11-char Masking */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    11-Character NIPOST Postcode:
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {rawInput.replace(/[^A-Z0-9]/gi, '').length}/11 characters
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={rawInput}
                    onChange={(e) => handlePostcodeChange(e.target.value)}
                    placeholder="AA-99-H77-BB-55"
                    maxLength={15}
                    className={`w-full px-4 py-3 font-mono text-base font-extrabold tracking-widest rounded-lg border-2 transition-all outline-none uppercase ${
                      verifiedPayload
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-sm'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:bg-white'
                    }`}
                  />
                  {verifiedPayload && (
                    <span className="absolute right-3 top-3 text-emerald-600 font-bold text-lg">
                      ✓
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  Format: <span className="font-mono font-bold text-blue-700">State</span>-
                  <span className="font-mono font-bold text-blue-700">LGA</span>-
                  <span className="font-mono font-bold text-emerald-700">District</span>-
                  <span className="font-mono font-bold text-purple-700">Area</span>-
                  <span className="font-mono font-bold text-purple-700">Unit</span> (e.g. FC-02-A09-DB-09)
                </p>
              </div>

              {/* Action Buttons: GPS Detection */}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  disabled={isGpsLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  <span className={isGpsLoading ? 'animate-spin' : ''}>
                    {isGpsLoading ? '⏳' : '🎯'}
                  </span>
                  <span>
                    {isGpsLoading ? 'Detecting via GPS Location…' : 'Detect My Postcode via GPS'}
                  </span>
                </button>
              </div>

              {/* Offline / Sandbox Preset Dropdown */}
              {isSandbox && (
                <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                      <span>⚡</span> Sandbox Quick Presets (Offline Fallback):
                    </span>
                    <span className="text-[10px] text-amber-700 font-medium">Instant Verification</span>
                  </div>
                  <select
                    onChange={handleSelectPreset}
                    value={rawInput}
                    className="w-full text-xs font-medium text-slate-800 bg-white border border-amber-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="" disabled>Choose a preset postcode…</option>
                    {PRESET_POSTCODES.map((p) => (
                      <option key={p.postcode} value={p.formatted}>
                        {p.formatted} — {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Auto-Resolved Official Administrative Names */}
              {verifiedPayload && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="text-emerald-600">✓</span> Verified Administrative Hierarchy
                    </span>
                    <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {verifiedPayload.formatted}
                    </span>
                  </div>

                  {/* 4-Segment Grid: State, LGA, District, Area */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">
                        State
                      </span>
                      <span className="font-bold text-slate-900 block truncate" title={verifiedPayload.names.state}>
                        🏛️ {verifiedPayload.names.state}
                      </span>
                      <span className="text-[10px] font-mono text-blue-600">
                        Code: {verifiedPayload.segments.state}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">
                        LGA
                      </span>
                      <span className="font-bold text-slate-900 block truncate" title={verifiedPayload.names.lga}>
                        🏢 {verifiedPayload.names.lga}
                      </span>
                      <span className="text-[10px] font-mono text-blue-600">
                        Code: {verifiedPayload.segments.lga}
                      </span>
                    </div>

                    <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                      <span className="text-[10px] font-bold text-emerald-700 block uppercase">
                        District (Zone)
                      </span>
                      <span className="font-bold text-emerald-950 block truncate" title={verifiedPayload.names.district}>
                        📍 {verifiedPayload.names.district}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-700 font-bold">
                        Rider: {verifiedPayload.segments.district}
                      </span>
                    </div>

                    <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-lg">
                      <span className="text-[10px] font-bold text-purple-700 block uppercase">
                        Area / Drop
                      </span>
                      <span className="font-bold text-purple-950 block truncate" title={verifiedPayload.names.area}>
                        🏘️ {verifiedPayload.names.area}
                      </span>
                      <span className="text-[10px] font-mono text-purple-700">
                        Drop: {verifiedPayload.segments.area}-{verifiedPayload.segments.unit}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Zone Shipping Price Banner */}
                  <div
                    className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                      verifiedPayload.zoneType === 'same_district'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : verifiedPayload.zoneType === 'same_lga'
                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                        : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚚</span>
                      <div>
                        <div className="font-bold">{verifiedPayload.shippingLabel}</div>
                        <div className="text-[10px] opacity-75">
                          {verifiedPayload.zoneType === 'same_district' && 'Origin & Destination in same Wuse District (A09)'}
                          {verifiedPayload.zoneType === 'same_lga' && 'Intra-LGA transit within Abuja Municipal'}
                          {verifiedPayload.zoneType === 'across_lgas' && 'Cross-LGA / Regional transit route'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold font-mono">
                        ₦{verifiedPayload.shippingFee.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Order Summary & Dispatch Action */}
          <div className={`${isSplitView ? 'xl:col-span-5' : 'lg:col-span-5'} space-y-5`}>
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <span>🛍️</span> Order Summary
              </h2>

              {/* Product Item Preview */}
              <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="w-16 h-16 rounded-lg bg-gradient-to-tr from-slate-900 via-slate-800 to-orange-900 flex items-center justify-center text-3xl shadow shrink-0">
                  👟
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm truncate">
                        Sneakers (Size 42)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Urban Pulse Runner Pro · Size 42
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 text-sm font-mono shrink-0 ml-2">
                      ₦{itemPrice.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded">
                      Qty: 1
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      ✓ In Stock (Abuja Hub)
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="space-y-2.5 pt-2 text-xs border-t border-slate-100">
                <div className="flex justify-between text-slate-600">
                  <span>Item Subtotal</span>
                  <span className="font-mono font-semibold text-slate-800">
                    ₦{itemPrice.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span>NIPOST Dynamic Shipping</span>
                    {verifiedPayload && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold">
                        {verifiedPayload.segments.district} Zone
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-semibold text-slate-800">
                    ₦{shippingFee.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Packaging & Handling</span>
                  <span className="font-mono font-semibold text-emerald-600">
                    ₦0 (Complimentary)
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <div>
                    <span className="text-sm font-black text-slate-900 block">Total Due</span>
                    <span className="text-[11px] text-slate-400">Includes VAT & Verified Postcode Routing</span>
                  </div>
                  <span className="text-xl font-black text-slate-900 font-mono text-orange-600">
                    ₦{totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Big CTA: Place Order & Dispatch */}
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={!verifiedPayload}
                className={`w-full py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                  verifiedPayload
                    ? 'bg-gradient-to-r from-orange-600 hover:from-orange-500 to-amber-600 hover:to-amber-500 text-white shadow-orange-500/25 transform active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                <span>📦</span>
                <span>
                  {verifiedPayload
                    ? `Place Order & Dispatch (₦${totalAmount.toLocaleString()})`
                    : 'Verify Postcode to Complete Order'}
                </span>
              </button>

              <div className="text-center">
                <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                  <span>⚡</span> Orders are auto-clustered into fleet batches every 300ms
                </p>
              </div>
            </div>

            {/* Merchant Guarantee Card */}
            <div className="bg-slate-100/80 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <span>🛡️</span> The PostBatch Logistics Advantage:
              </div>
              <ul className="space-y-1 text-[11px] text-slate-500 list-disc list-inside">
                <li>No ambiguous "Behind Zenith Bank" free-text delivery delays</li>
                <li>Instant NIPOST alphanumeric prefix routing to dispatch cages</li>
                <li>Accurate GPS drop point for multi-stop rider navigation</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
