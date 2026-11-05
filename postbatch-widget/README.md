# PostBatch Widget — Developer Documentation

> **Embed a 5-Segment NIPOST Digital Postcode verification field in your Nigerian e-commerce checkout in under 5 minutes.**

The PostBatch Widget is a lightweight, zero-dependency SDK that renders an intelligent postcode input inside a container on your checkout page. It automatically formats the official 11-character NIPOST code (`AA-99-H77-BB-55`), offers single-click GPS postcode detection, auto-resolves administrative names (State, LGA, District, Area), dynamically computes zone-based delivery pricing, and falls back to an offline sandbox mode with quick presets if the staging API is unavailable.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [NIPOST 5-Segment Hierarchy](#nipost-5-segment-hierarchy)
3. [Widget Features](#widget-features)
4. [Initialisation Options](#initialisation-options)
5. [The Verified Payload](#the-verified-payload)
6. [Dynamic Zone Shipping Pricing](#dynamic-zone-shipping-pricing)
7. [Offline Sandbox Mode & Presets](#offline-sandbox-mode--presets)
8. [GPS Postcode Detection](#gps-postcode-detection)
9. [Framework Integration (React, Vanilla JS, Next.js)](#framework-integration)
10. [FAQ](#faq)

---

## Quick Start

### 1. Vanilla HTML / Script Tag

```html
<!-- Mount point for the widget -->
<div id="postbatch-root"></div>

<!-- Load widget SDK -->
<script src="https://cdn.postbatch.io/widget/v2.js"></script>

<script>
  PostBatch.init({
    publishableKey: 'pb_live_merchant_key_xxxxxxxx',
    container: '#postbatch-root',
    onVerified: function (payload) {
      console.log('Verified 5-segment code:', payload.formatted);
      console.log('District (Rider Zone):', payload.names.district);
      console.log('Calculated Shipping Fee:', payload.shippingFee);

      // Attach to checkout order form
      document.getElementById('hidden-postcode').value = payload.postcode;
      document.getElementById('shipping-fee').textContent = '₦' + payload.shippingFee.toLocaleString();
    }
  });
</script>
```

---

## NIPOST 5-Segment Hierarchy

Nigeria's National Digital Postcode API (`docs.postcode.gov.ng`) structures 11-character postcodes as:

```
Format:  AA-99-H77-BB-55  (11 characters)

  • segments.state    (2 Alpha)        → State (e.g., "FC" = Abuja, "LA" = Lagos)
  • segments.lga      (2 Numeric)      → Local Government Area (e.g., "02" = Abuja Municipal)
  • segments.district (3 Alphanumeric) → Postal District / Rider Zone (e.g., "A09" = Wuse)
  • segments.area     (2 Alpha)        → Neighborhood / Street Cluster (e.g., "DB" = Zone 4)
  • segments.unit     (2 Numeric)      → Specific Building / Compound (e.g., "09")
```

---

## Widget Features

1. **Automatic Input Formatting Mask**:
   Users can type or paste unformatted or formatted strings (e.g. `fc02a09db09`). The widget automatically capitalizes, strips invalid characters, and formats as `FC-02-A09-DB-09`.

2. **Single-Click "Detect My Postcode via GPS"**:
   Uses the HTML5 Geolocation API with coordinate reverse-geocoding to resolve the buyer's exact NIPOST delivery zone in milliseconds.

3. **Instant Administrative Hierarchy Resolution**:
   As soon as 11 characters are entered or GPS is triggered, the widget resolves and presents:
   - 🏛️ **State**: Federal Capital Territory (`FC`)
   - 🏢 **LGA**: Abuja Municipal (`02`)
   - 📍 **District**: Wuse (`A09`) — *Rider Dispatch Zone*
   - 🏘️ **Area**: Zone 4 (`DB`) — *Neighborhood Cluster*

4. **Dynamic Zone-Based Shipping Price Engine**:
   Calculates delivery fee relative to the merchant origin hub:
   - **Same District** (e.g., `A09` → `A09`): **₦1,000**
   - **Different District in same LGA** (e.g., `A09` → `B01` Garki): **₦1,500**
   - **Across LGAs / Inter-State**: **₦2,500**

5. **Offline Sandbox Fallback Switch**:
   Includes a sandbox toggle that exposes 4 preset postcodes across all three pricing tiers for offline demonstrations, testing, or API outages.

---

## Initialisation Options

```js
PostBatch.init({
  publishableKey: 'pb_test_sandbox_123',
  container: '#postbatch-root',
  sandboxMode: true,
  initialPostcode: 'FC-02-A09-DB-09',
  originHub: {
    state: 'FC',
    lga: '02',
    district: 'A09',
  },
  onVerified: function (payload) { /* ... */ },
  onError: function (err) { /* ... */ },
});
```

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `publishableKey` | `string` | **Yes** | `'pb_test_sandbox'` | Merchant's publishable API key |
| `container` | `string \| HTMLElement` | **Yes** | — | Target DOM container |
| `onVerified` | `function` | **Yes** | — | Callback fired with verified payload |
| `onError` | `function` | No | `console.error` | Callback fired on verification failure |
| `sandboxMode` | `boolean` | No | `true` | Enables offline sandbox preset dropdown |
| `initialPostcode` | `string` | No | `'FC-02-A09-DB-09'` | Pre-filled postcode value |
| `originHub` | `object` | No | Wuse Hub (`FC-02-A09`) | Base warehouse location for shipping fee calculation |

---

## The Verified Payload

Conforms strictly to the `AI-CONTEXT.md` standard schema:

```json
{
  "postcode": "FC02A09DB09",
  "formatted": "FC-02-A09-DB-09",
  "shippingFee": 1000,
  "shippingLabel": "Local Zone (Same District)",
  "zoneType": "same_district",
  "segments": {
    "state": "FC",
    "lga": "02",
    "district": "A09",
    "area": "DB",
    "unit": "09"
  },
  "names": {
    "state": "Federal Capital Territory",
    "lga": "Abuja Municipal",
    "district": "Wuse",
    "area": "Zone 4",
    "unit": "Compound / Building 09"
  },
  "address": "12 Marina Road, Wuse Zone 4, Abuja",
  "coordinates": {
    "lat": 9.0622,
    "lng": 7.4721
  },
  "confidence": 0.99,
  "verified": true
}
```

---

## Dynamic Zone Shipping Pricing

The widget computes shipping automatically using the destination segments relative to the merchant origin hub:

| Scenario | Rule | Price | Example |
|---|---|---|---|
| **Same District** | `state === origin.state && lga === origin.lga && district === origin.district` | **₦1,000** | Wuse (`A09`) → Wuse (`A09`) |
| **Intra-LGA** | `state === origin.state && lga === origin.lga && district !== origin.district` | **₦1,500** | Wuse (`A09`) → Garki (`B01`) |
| **Across LGAs** | `state !== origin.state \|\| lga !== origin.lga` | **₦2,500** | Abuja Municipal (`02`) → Bwari (`01`) |

---

## Offline Sandbox Mode & Presets

When the **Sandbox Fallback** toggle is enabled, merchants or demo presenters can select from 4 quick presets:

1. `FC-02-A09-DB-09` — Wuse Zone 4 (Same District · ₦1,000)
2. `FC-02-A09-AA-03` — Wuse Zone 1 (Same District · ₦1,000)
3. `FC-02-B01-AC-10` — Garki Area 1 (Diff District, Same LGA · ₦1,500)
4. `FC-01-K02-AA-01` — Bwari Central (Across LGAs · ₦2,500)

Selecting any preset instantly auto-populates the input, resolves administrative names, calculates the shipping rate, and triggers the `onVerified` callback.

---

## Framework Integration

### React Wrapper

```jsx
import React from 'react';
import { PostBatchWidget, PRESET_POSTCODES } from 'postbatch-widget';

export function ShippingPostcodeField({ onVerified }) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const widget = new PostBatchWidget({
      container: containerRef.current,
      publishableKey: 'pb_live_xxxx',
      onVerified: (payload) => onVerified(payload),
    });
  }, [onVerified]);

  return <div ref={containerRef} />;
}
```

---

*Maintained by PostBatch Technologies Ltd. Conforming to NIPOST Digital Postcode Specification 2026.*
