/**
 * Merchant Simulator — E-Commerce Checkout View (Module 1)
 * =========================================================
 *
 * Simulates a modern Shopify / WooCommerce checkout card ("UrbanFootwear NG")
 * embedding the PostBatch NIPOST Postcode Address Widget.
 *
 * Conforms to executive boardroom standards:
 *   - Centered clean, white, softly shadowed card (max-w-lg)
 *   - Clean typography (text-slate-800 for headers, text-slate-500 for labels)
 *   - Premium NIPOST Postcode form field (focus:ring-indigo-500)
 *   - Instant transitions and responsive feedback
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  CircleCheck,
  Footprints,
  Loader2,
  LocateFixed,
  PackageCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import {
  formatPostcode,
  parse5SegmentPostcode,
  PRESET_POSTCODES,
  DEFAULT_ORIGIN_HUB,
} from 'postbatch-widget';
import {
  verifyPostcode,
  detectPostcodeViaGPS,
  lookupPostcodeOffline,
} from './src/services/nipostApi.js';

// Comprehensive presets for presentation
const ALL_PRESETS = [
  ...PRESET_POSTCODES,
  {
    label: 'Ebute Metta, Lagos Mainland (₦2,500)',
    postcode: 'LA1012001',
    formatted: 'LA-101-2001',
    address: '15 Herbert Macaulay Way, Ebute Metta, Lagos',
  },
  {
    label: 'GRA Ikeja, Lagos (₦2,500)',
    postcode: 'LA2001001',
    formatted: 'LA-200-1001',
    address: '22 Isaac John Street, GRA Ikeja, Lagos',
  },
  {
    label: 'Sabon Gari, Kano (₦2,500)',
    postcode: 'KN1005001',
    formatted: 'KN-100-5001',
    address: '10 France Road, Sabon Gari, Kano',
  },
];

export default function CheckoutView({
  onPlaceOrder,
  isLiveMode = true,
  onNavigateToFleet,
}) {
  // Customer details state
  const [customerName, setCustomerName] = useState('Amina Bello');
  const [phone, setPhone] = useState('08031234567');
  const [streetAddress, setStreetAddress] = useState('12 Marina Road, Wuse Zone 4, Abuja');

  // Widget state
  const [rawInput, setRawInput] = useState('FC-02-A09-DB-09');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [verificationMeta, setVerificationMeta] = useState({
    source: 'Initial Local Seed',
    isLive: false,
    fallbackTriggered: false,
  });

  // Verified payload conforming strictly to PostBatchOrder schema
  const [verifiedPayload, setVerifiedPayload] = useState(() => {
    return lookupPostcodeOffline('FC-02-A09-DB-09', {
      streetAddress: '12 Marina Road, Wuse Zone 4, Abuja',
    });
  });

  const itemPrice = 28000;
  const shippingFee = verifiedPayload?.shippingFee || 1000;
  const totalAmount = itemPrice + shippingFee;

  const debounceRef = useRef(null);

  // Trigger verification when input reaches 11 chars or matches valid pattern
  const triggerVerification = async (codeInput, addressOverride = streetAddress) => {
    const clean = codeInput.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length < 5) {
      setVerifiedPayload(null);
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifyPostcode({
        code: codeInput,
        isLiveMode,
        streetAddress: addressOverride,
        customerName,
        phone,
      });

      if (result.success && result.payload) {
        setVerifiedPayload(result.payload);
        setVerificationMeta({
          source: result.source,
          isLive: result.isLive,
          fallbackTriggered: result.fallbackTriggered,
          fallbackReason: result.fallbackReason,
          nipost: result.nipost,
        });
      } else {
        const offline = lookupPostcodeOffline(codeInput, {
          streetAddress: addressOverride,
          customerName,
          phone,
        });
        setVerifiedPayload(offline);
        setVerificationMeta({
          source: 'Offline Fallback (Seed)',
          isLive: false,
          fallbackTriggered: isLiveMode,
          fallbackReason: result.error,
        });
      }
    } catch (err) {
      const offline = lookupPostcodeOffline(codeInput, {
        streetAddress: addressOverride,
        customerName,
        phone,
      });
      setVerifiedPayload(offline);
      setVerificationMeta({
        source: 'Offline Fallback (Network error)',
        isLive: false,
        fallbackTriggered: true,
        fallbackReason: err.message,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle typed postcode input with automatic masking
  const handlePostcodeChange = (value) => {
    const formatted = formatPostcode(value);
    setRawInput(formatted);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const clean = formatted.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 7) {
      debounceRef.current = setTimeout(() => {
        triggerVerification(formatted);
      }, 300);
    } else {
      setVerifiedPayload(null);
    }
  };

  // Handle preset dropdown selection
  const handleSelectPreset = (e) => {
    const code = e.target.value;
    if (!code) return;
    const preset = ALL_PRESETS.find((p) => p.formatted === code || p.postcode === code);
    if (preset) {
      setRawInput(preset.formatted);
      const newAddress = preset.address || streetAddress;
      if (preset.address) setStreetAddress(preset.address);
      triggerVerification(preset.formatted, newAddress);
    }
  };

  // Handle GPS detection
  const handleDetectGPS = () => {
    setIsGpsLoading(true);

    const executeGpsDetection = async (lat, lng) => {
      try {
        const result = await detectPostcodeViaGPS({
          lat,
          lng,
          isLiveMode,
          streetAddress,
        });

        if (result?.payload) {
          setRawInput(result.payload.formatted);
          if (result.payload.address) {
            setStreetAddress(result.payload.address);
          }
          setVerifiedPayload(result.payload);
          setVerificationMeta({
            source: result.source,
            isLive: result.isLive,
            fallbackTriggered: result.fallbackTriggered,
            fallbackReason: result.fallbackReason,
            nipost: result.nipost,
          });
        }
      } catch (err) {
        console.warn('GPS detection error:', err);
        const fallback = lookupPostcodeOffline('FC-02-A09-DB-09', {
          streetAddress: '12 Marina Road, Wuse Zone 4, Abuja',
        });
        setRawInput('FC-02-A09-DB-09');
        setStreetAddress('12 Marina Road, Wuse Zone 4, Abuja');
        setVerifiedPayload(fallback);
      } finally {
        setIsGpsLoading(false);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          executeGpsDetection(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          executeGpsDetection(9.0622, 7.4721);
        },
        { timeout: 3000 }
      );
    } else {
      executeGpsDetection(9.0622, 7.4721);
    }
  };

  // Re-verify if live mode toggle changes
  useEffect(() => {
    if (rawInput) {
      triggerVerification(rawInput);
    }
  }, [isLiveMode]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Submit order to shared Fleet Hub store
  const handleSubmitOrder = (e) => {
    e.preventDefault();
    if (!verifiedPayload) return;

    const newOrder = {
      orderId: verifiedPayload.orderId || `ORD-${Math.floor(1085 + Math.random() * 8900)}`,
      customerName: customerName.trim() || 'Amina Bello',
      phone: phone.trim() || '08031234567',
      item: 'Sneakers (Size 42)',
      price: itemPrice,
      shippingFee: verifiedPayload.shippingFee,
      shippingLabel: verifiedPayload.shippingLabel,
      zoneType: verifiedPayload.zoneType,
      postcode: verifiedPayload.postcode,
      formatted: verifiedPayload.formatted,
      segments: verifiedPayload.segments,
      names: verifiedPayload.names,
      address: streetAddress.trim() || verifiedPayload.address,
      coordinates: verifiedPayload.coordinates,
      polygon: verifiedPayload.polygon,
      apiSource: verifiedPayload.apiSource || (isLiveMode ? 'live_nipost_staging' : 'offline_fallback'),
    };

    onPlaceOrder(newOrder);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-100 py-8 px-4 flex items-center justify-center">
      {/* Centered Shopify / WooCommerce Checkout Card */}
      <div className="w-full max-w-lg bg-white rounded-lg shadow-card p-6 sm:p-7 space-y-6 my-auto">
        
        {/* Merchant Header / Stepper */}
        <div className="pb-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-slate-900 flex items-center justify-center text-white">
                <ShoppingBag size={16} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 tracking-tight leading-tight">
                  UrbanFootwear NG
                </h1>
                <p className="text-xs text-slate-500">
                  Shopify &amp; WooCommerce Merchant Simulator
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Checkout Mode
            </span>
          </div>

          {/* Checkout Steps */}
          <div className="flex items-center gap-2 pt-2 text-xs font-medium">
            <span className="text-slate-400">1. Cart</span>
            <span className="text-slate-300">/</span>
            <span className="text-indigo-600 font-semibold flex items-center gap-1">
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-semibold">
                2
              </span>
              Shipping &amp; Address
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-400">3. Payment</span>
          </div>
        </div>

        {/* Customer Information Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Customer Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Amina Bello"
                className="w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 08031234567"
                className="w-full px-3 py-2 text-sm font-mono text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Street Address &amp; Nearest Landmark
            </label>
            <input
              type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              placeholder="e.g. 12 Marina Road, Wuse Zone 4, Abuja"
              className="w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* NIPOST Digital Postcode Field (Premium Form Field) */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-semibold text-slate-800">
                NIPOST Digital Postcode
              </label>
              <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
                SDK v0.3
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {rawInput.replace(/[^A-Z0-9]/gi, '').length}/11 chars
            </span>
          </div>

          {/* Premium Input Container */}
          <div className="relative">
            <input
              type="text"
              value={rawInput}
              onChange={(e) => handlePostcodeChange(e.target.value)}
              placeholder="AA-99-H77-BB-55"
              maxLength={15}
              className={`w-full px-4 py-2.5 font-mono text-base font-semibold tracking-wider rounded-lg border shadow-sm transition-colors outline-none uppercase ${
                verifiedPayload
                  ? 'border-indigo-500 bg-indigo-50/20 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                  : 'border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {isVerifying ? (
                <Loader2 size={16} className="text-indigo-600 animate-spin" />
              ) : verifiedPayload ? (
                <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-emerald-600 flex">
                  <CircleCheck size={18} />
                </motion.span>
              ) : null}
            </div>
          </div>

          {/* Quick Helper & Preset Actions */}
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Format: State-LGA-District-Area-Unit</span>
              {isLiveMode ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live NIPOST API
                </span>
              ) : (
                <span className="text-slate-500 font-medium">Test Mode (Offline)</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDetectGPS}
                disabled={isGpsLoading}
                className="flex-1 min-w-0 whitespace-nowrap h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isGpsLoading ? <Loader2 size={14} className="animate-spin shrink-0" /> : <LocateFixed size={14} className="shrink-0" />}
                <span className="truncate">{isGpsLoading ? 'Resolving GPS…' : 'Detect Postcode via GPS'}</span>
              </button>

              {/* Demo Preset Selector */}
              <div className="flex-1 min-w-0">
                <select
                  onChange={handleSelectPreset}
                  value={rawInput}
                  className="w-full h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="" disabled>Demo presets…</option>
                  {ALL_PRESETS.map((p) => (
                    <option key={p.postcode} value={p.formatted}>
                      {p.formatted} — {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Auto-Resolved Administrative Hierarchy */}
          <AnimatePresence initial={false}>
          {verifiedPayload && (
            <motion.div
              key="hierarchy"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
            <div className="mt-3 p-3 bg-slate-100 rounded-md space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <BadgeCheck size={14} className="text-emerald-600" /> Verified postal hierarchy
                </span>
                <span className="font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {verifiedPayload.formatted}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-white rounded">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">State</span>
                  <span className="font-semibold text-slate-800 block truncate" title={verifiedPayload.names.state}>
                    {verifiedPayload.names.state}
                  </span>
                </div>
                <div className="p-2 bg-white rounded">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">LGA</span>
                  <span className="font-semibold text-slate-800 block truncate" title={verifiedPayload.names.lga}>
                    {verifiedPayload.names.lga}
                  </span>
                </div>
                <div className="p-2 bg-indigo-50 rounded">
                  <span className="text-[10px] uppercase font-semibold text-indigo-700 block">District</span>
                  <span className="font-semibold text-indigo-900 block truncate" title={verifiedPayload.names.district}>
                    {verifiedPayload.names.district}
                  </span>
                </div>
                <div className="p-2 bg-white rounded">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">Area / Drop</span>
                  <span className="font-semibold text-slate-800 block truncate" title={verifiedPayload.names.area}>
                    {verifiedPayload.names.area}
                  </span>
                </div>
              </div>

              {/* Dynamic Shipping Badge */}
              <div className="flex items-center justify-between p-2 rounded bg-indigo-50 text-xs">
                <div className="flex items-center gap-1.5 text-indigo-900 font-medium">
                  <Truck size={14} />
                  <span>{verifiedPayload.shippingLabel}</span>
                </div>
                <span className="font-mono font-semibold text-indigo-900">
                  ₦{verifiedPayload.shippingFee.toLocaleString()}
                </span>
              </div>
            </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Order Summary & Pricing Breakdown */}
        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold text-slate-800">
            Order Summary
          </h2>

          <div className="flex items-center justify-between p-3 bg-slate-100 rounded-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-slate-900 flex items-center justify-center text-white">
                <Footprints size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  Sneakers (Size 42)
                </p>
                <p className="text-[11px] text-slate-500">
                  Qty: 1 · In Stock (Abuja Hub)
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-800">
              ₦{itemPrice.toLocaleString()}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 pt-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono font-semibold text-slate-800">
                ₦{itemPrice.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>NIPOST Zone Shipping</span>
              <span className="font-mono font-semibold text-slate-800">
                ₦{shippingFee.toLocaleString()}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline text-sm">
              <span className="font-semibold text-slate-800">Total</span>
              <span className="font-mono font-semibold text-indigo-600 text-base">
                ₦{totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Complete Order Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={!verifiedPayload || isVerifying}
            className={`w-full min-w-0 whitespace-nowrap h-10 px-4 rounded-md font-medium text-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer ${
              verifiedPayload && !isVerifying
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {isVerifying ? <Loader2 size={15} className="animate-spin shrink-0" /> : <PackageCheck size={15} className="shrink-0" />}
            <span className="truncate">
              {isVerifying
                ? 'Verifying Postcode…'
                : verifiedPayload
                ? `Place Order & Dispatch (₦${totalAmount.toLocaleString()})`
                : 'Enter Valid Postcode to Continue'}
            </span>
          </button>
          <p className="text-[11px] text-slate-500 text-center mt-2">
            Order routes directly into the PostBatch Fleet Dispatch Hub
          </p>
        </div>

      </div>
    </div>
  );
}
