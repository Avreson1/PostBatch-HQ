# PostBatch Widget — Developer Documentation

> **Embed a NIPOST postcode verification field in your checkout in under 5 minutes.**

The PostBatch Widget is a lightweight (~8 KB gzipped), zero-dependency JavaScript snippet that renders a fully styled postcode input inside a **Shadow DOM** container on your checkout page. It auto-suggests postcodes, verifies them against the NIPOST Digital Postcode API, and returns a rich payload — including the delivery polygon as GeoJSON — to your application via a callback.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation Methods](#installation-methods)
3. [Initialisation Options](#initialisation-options)
4. [The Verified Payload](#the-verified-payload)
5. [Handling the Callback](#handling-the-callback)
6. [Publishable API Key](#publishable-api-key)
7. [Styling & Customisation](#styling--customisation)
8. [Error Handling](#error-handling)
9. [Security Model](#security-model)
10. [Framework Recipes](#framework-recipes)
11. [FAQ](#faq)

---

## Quick Start

Drop two snippets into your HTML checkout page:

```html
<!-- 1. Mount point — place this wherever you want the postcode field -->
<div id="postbatch-root"></div>

<!-- 2. Widget script — load from the PostBatch CDN -->
<script src="https://cdn.postbatch.io/widget/v1.js"></script>

<script>
  // 3. Initialise with your Publishable API key
  PostBatch.init({
    publishableKey: 'pb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    container: '#postbatch-root',
    onVerified: function (payload) {
      // The buyer's postcode has been verified ✓
      console.log('Postcode:', payload.postcode);
      console.log('Area:', payload.area);
      console.log('Polygon:', payload.polygon);

      // Send the verified postcode to your backend with the order
      document.getElementById('hidden-postcode').value = payload.postcode;
    }
  });
</script>
```

That's it. The widget renders, the buyer types their postcode, and you receive a verified NIPOST payload.

---

## Installation Methods

### CDN (Recommended for most merchants)

```html
<script src="https://cdn.postbatch.io/widget/v1.js"></script>
```

The script exposes a global `window.PostBatch` object.

### NPM (For JS-framework projects)

```bash
npm install postbatch-widget
```

```js
import PostBatch from 'postbatch-widget';

PostBatch.init({ /* options */ });
```

### Self-Hosted

Download `index.js` from this directory and serve it from your own origin. Useful if your CSP policy restricts third-party scripts.

---

## Initialisation Options

Pass a configuration object to `PostBatch.init(options)`:

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `publishableKey` | `string` | **Yes** | — | Your Publishable API key (`pb_live_*` or `pb_test_*`). |
| `container` | `string` | **Yes** | — | A CSS selector for the HTML element that will host the widget. |
| `onVerified` | `function` | **Yes** | — | Callback invoked with the verified NIPOST payload object. |
| `onError` | `function` | No | `console.error` | Callback invoked when verification fails. Receives an `Error` object. |
| `placeholder` | `string` | No | `"e.g. LA-101-2001"` | Placeholder text shown in the postcode input field. |

### Example — Full Options

```js
PostBatch.init({
  publishableKey: 'pb_test_sandbox_key_1234',
  container: '#postbatch-root',
  placeholder: 'Enter your delivery postcode',
  onVerified: function (payload) {
    submitOrderWithPostcode(payload);
  },
  onError: function (err) {
    showToast('Postcode verification failed: ' + err.message);
  }
});
```

---

## The Verified Payload

When the buyer's postcode is successfully verified, the `onVerified` callback receives a payload object with the following shape:

```json
{
  "postcode": "LA-101-2001",
  "state": "Lagos",
  "lga": "Lagos Mainland",
  "area": "Ebute Metta",
  "polygon": {
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [3.3792, 6.4831],
          [3.3801, 6.4840],
          [3.3815, 6.4828],
          [3.3792, 6.4831]
        ]
      ]
    },
    "properties": {
      "postcode": "LA-101-2001",
      "zone": "Lagos-Mainland-Z1"
    }
  },
  "confidence": 0.98,
  "verified": true
}
```

### Payload Fields

| Field | Type | Description |
|---|---|---|
| `postcode` | `string` | The canonical NIPOST postcode (uppercased, hyphenated). |
| `state` | `string` | The Nigerian state the postcode belongs to. |
| `lga` | `string` | Local Government Area. |
| `area` | `string` | Human-readable neighbourhood / area name. |
| `polygon` | `GeoJSON Feature` | The delivery polygon boundary. Pass this to Leaflet or Mapbox to render the zone on a map. |
| `confidence` | `number` | Verification confidence score (0–1). Values above `0.90` are considered high-confidence. |
| `verified` | `boolean` | Always `true` when this callback fires. If verification fails, `onError` is invoked instead. |

---

## Handling the Callback

### Pattern 1 — Attach to a Hidden Form Field

The simplest integration. Append the verified postcode to your existing checkout `<form>`:

```html
<form id="checkout-form" action="/api/orders" method="POST">
  <!-- your existing fields -->
  <input type="hidden" name="postcode" id="hidden-postcode" />
  <input type="hidden" name="polygon" id="hidden-polygon" />
  <div id="postbatch-root"></div>
  <button type="submit">Place Order</button>
</form>

<script src="https://cdn.postbatch.io/widget/v1.js"></script>
<script>
  PostBatch.init({
    publishableKey: 'pb_live_xxxxxxxx',
    container: '#postbatch-root',
    onVerified: function (payload) {
      document.getElementById('hidden-postcode').value = payload.postcode;
      document.getElementById('hidden-polygon').value = JSON.stringify(payload.polygon);
    }
  });
</script>
```

### Pattern 2 — Forward to Your Backend via Fetch

```js
PostBatch.init({
  publishableKey: 'pb_live_xxxxxxxx',
  container: '#postbatch-root',
  onVerified: async function (payload) {
    await fetch('/api/orders/set-postcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: window.__ORDER_ID__,
        postcode: payload.postcode,
        polygon: payload.polygon
      })
    });
  }
});
```

### Pattern 3 — Emit a Custom DOM Event

Useful when your checkout is managed by a separate framework:

```js
PostBatch.init({
  publishableKey: 'pb_live_xxxxxxxx',
  container: '#postbatch-root',
  onVerified: function (payload) {
    window.dispatchEvent(new CustomEvent('postbatch:verified', { detail: payload }));
  }
});

// Somewhere else in your app…
window.addEventListener('postbatch:verified', (e) => {
  console.log('Received verified postcode:', e.detail.postcode);
});
```

---

## Publishable API Key

Your **Publishable Key** is safe to expose in client-side code. It can only:

- Look up postcodes
- Verify postcodes
- Retrieve polygon boundaries

It **cannot** create or delete resources, access billing, or read other merchants' data.

### How to Get Your Key

1. Sign up at [dashboard.postbatch.io](https://dashboard.postbatch.io).
2. Navigate to **Settings → API Keys**.
3. Copy the key that starts with `pb_live_` (production) or `pb_test_` (sandbox).

### Sandbox vs. Production

| Key Prefix | Environment | Notes |
|---|---|---|
| `pb_test_*` | Sandbox | Returns mock postcodes. No rate limits. Use during development. |
| `pb_live_*` | Production | Hits the live NIPOST API. Standard rate limits apply. |

> **⚠️ Never expose your Secret Key** (`pb_secret_*`) in frontend code. The Secret Key is for server-side Engine operations only.

---

## Styling & Customisation

The widget renders inside a **Shadow DOM**, so your page styles won't leak in and the widget styles won't leak out. This guarantees a consistent look across all merchant sites.

If you need to adjust the outer container, style the mount-point element:

```css
#postbatch-root {
  max-width: 480px;
  margin: 24px auto;
}
```

> **Custom theming** (brand colours, border radius, fonts) is on the roadmap for Widget v2. Contact us if you need it sooner.

---

## Error Handling

The `onError` callback receives a standard `Error` object:

```js
PostBatch.init({
  // …
  onError: function (err) {
    console.error('PostBatch error:', err.message);

    // Common error messages:
    // • "Invalid postcode format"
    // • "Postcode not found"
    // • "Verification failed (429)" — rate limited
    // • "Network error"
  }
});
```

### Common Errors & Remedies

| Error | Cause | Fix |
|---|---|---|
| `Invalid postcode format` | Buyer entered a string that doesn't match the NIPOST pattern. | The widget already validates format; ensure you're not pre-filling an invalid value. |
| `Postcode not found` | The postcode is syntactically valid but doesn't exist in the NIPOST database. | Ask the buyer to double-check. |
| `Verification failed (401)` | Invalid or expired API key. | Rotate your key at dashboard.postbatch.io. |
| `Verification failed (429)` | Rate limit exceeded. | Upgrade your plan or add backoff logic. |
| `Network error` | Buyer is offline or the NIPOST API is unreachable. | Show a fallback manual-entry form. |

---

## Security Model

- The widget only communicates with `api.nipost.gov.ng` and `api.postbatch.io`.
- All requests are sent over HTTPS.
- The Publishable Key is domain-restricted — you can lock it to specific origins in the dashboard.
- Shadow DOM prevents XSS injection into (or from) the widget.
- No cookies are set. No tracking pixels. No third-party analytics.

---

## Framework Recipes

### React

```jsx
import { useEffect, useRef } from 'react';

export function PostBatchField({ onVerified }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && window.PostBatch) {
      window.PostBatch.init({
        publishableKey: process.env.REACT_APP_POSTBATCH_KEY,
        container: ref.current,
        onVerified,
      });
    }
  }, [onVerified]);

  return <div ref={ref} />;
}
```

### Vue 3

```vue
<template>
  <div ref="pbRoot" />
</template>

<script setup>
import { onMounted, ref } from 'vue';

const pbRoot = ref(null);
const props = defineProps({ onVerified: Function });

onMounted(() => {
  window.PostBatch.init({
    publishableKey: import.meta.env.VITE_POSTBATCH_KEY,
    container: pbRoot.value,
    onVerified: props.onVerified,
  });
});
</script>
```

### Next.js (App Router)

```jsx
'use client';
import Script from 'next/script';
import { useRef } from 'react';

export default function Checkout() {
  const ref = useRef(null);

  return (
    <>
      <div ref={ref} />
      <Script
        src="https://cdn.postbatch.io/widget/v1.js"
        onReady={() => {
          window.PostBatch.init({
            publishableKey: process.env.NEXT_PUBLIC_POSTBATCH_KEY,
            container: ref.current,
            onVerified: (p) => console.log(p),
          });
        }}
      />
    </>
  );
}
```

---

## FAQ

**Q: Does the widget work on mobile?**
A: Yes. The input is responsive and mobile-optimised. It uses `autocomplete="postal-code"` for native keyboard hints.

**Q: What happens if the NIPOST API is down?**
A: The `onError` callback fires with a `Network error`. We recommend showing a manual address fallback form in that case.

**Q: Can I use the widget without the PostBatch Engine?**
A: Absolutely. The widget is standalone. You can use the verified postcode however you like — store it in your database, show it on a map, or pass it to your own routing logic.

**Q: Is there a React component version?**
A: Not yet as a published package, but see the [Framework Recipes](#framework-recipes) section for a drop-in React wrapper.

---

*Need help? Reach out to **support@postbatch.io** or open an issue in this repo.*
