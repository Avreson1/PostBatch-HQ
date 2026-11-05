# PostBatch Pitch Demo — Saturday Setup Guide

> **Audience:** PostBatch team members presenting the live demo.
> **Goal:** A flawless 2-screen split-view demonstration showing the end-to-end flow from checkout to fleet dashboard.

---

## Table of Contents

1. [What the Demo Shows](#what-the-demo-shows)
2. [Pre-Pitch Checklist](#pre-pitch-checklist)
3. [Running the Demo Locally](#running-the-demo-locally)
4. [Fallback: Offline Mode with Mock Data](#fallback-offline-mode-with-mock-data)
5. [Demo Script (What to Click & Say)](#demo-script-what-to-click--say)
6. [Troubleshooting](#troubleshooting)
7. [NIPOST Staging Environment Notes](#nipost-staging-environment-notes)

---

## What the Demo Shows

The demo is a **single browser window split into two panes**:

| Pane | Title | Purpose |
|---|---|---|
| **Left** | 🛒 ShopNaija Checkout | A dummy e-commerce checkout page with the PostBatch Widget embedded. The presenter types a postcode, verifies it, and "places an order." |
| **Right** | 📊 Fleet Dashboard | A Leaflet.js map that visualises clustered delivery polygons in real time. As orders are placed on the left, coloured zones appear on the right. |

```
┌─────────────────────────┬─────────────────────────┐
│                         │                         │
│   🛒 E-Commerce         │   📊 Fleet Dashboard     │
│   Checkout              │                         │
│                         │   ┌─────────────────┐   │
│   ┌───────────────┐     │   │   Leaflet Map    │   │
│   │ Product Card  │     │   │   (dark tiles)   │   │
│   └───────────────┘     │   │                 │   │
│                         │   │  ◼ LA-101 (blue) │   │
│   ┌───────────────┐     │   │  ◼ LA-200 (red)  │   │
│   │ PostBatch     │     │   │  ◼ KN-100 (green)│   │
│   │ Widget        │     │   │                 │   │
│   │ [LA-101-2001] │     │   └─────────────────┘   │
│   │ [Verify ✓]    │     │                         │
│   └───────────────┘     │   Zone Sidebar:          │
│                         │   • LA-101  3 parcels    │
│   [Place Order]         │   • LA-200  2 parcels    │
│                         │   • KN-100  1 parcel     │
└─────────────────────────┴─────────────────────────┘
```

---

## Pre-Pitch Checklist

Complete these steps **the night before** the pitch:

- [ ] **Laptop charged** and charger packed.
- [ ] **Node.js v18+** installed (`node -v` to verify).
- [ ] **npm v9+** installed (`npm -v` to verify).
- [ ] `postbatch-hq` repository cloned and dependencies installed (see below).
- [ ] Demo runs cleanly at `http://localhost:3000`.
- [ ] **Offline tested** — disconnect Wi-Fi and confirm the demo works with mock data.
- [ ] **Browser:** Chrome or Edge (Firefox has Leaflet tile-rendering quirks).
- [ ] **Screen resolution:** Set to 1920×1080 or higher. Use browser zoom (Ctrl +/-) to adjust.
- [ ] **Browser bookmarks bar** hidden (Ctrl+Shift+B) for a clean presentation look.
- [ ] **HDMI / USB-C adapter** tested with the projector.
- [ ] **Phone on silent.**

---

## Running the Demo Locally

### Step 1: Install Dependencies

From the monorepo root:

```bash
cd postbatch-hq
npm install
```

This installs dependencies for all three workspaces.

### Step 2: Start the Dev Server

```bash
npm run demo
```

This runs `vite` inside `postbatch-demo/` and opens `http://localhost:3000` in your default browser.

### Step 3: Verify It Works

1. On the **left pane**, type `LA-101` in the postcode field.
2. You should see auto-suggestions from the mock data.
3. Click a suggestion → the postcode is "verified" → a green badge appears.
4. Click **"Place Order & Send to Dispatch"**.
5. On the **right pane**, a blue polygon should appear on the Lagos area of the Leaflet map.
6. Repeat with `KN-100-5001` → a green polygon should appear in the Kano area.
7. The zone sidebar should list both zones with parcel counts.

✅ If all of the above works, you're ready.

---

## Fallback: Offline Mode with Mock Data

> ⚠️ **The NIPOST staging API is unreliable.** It has dropped during business hours multiple times. **Always assume it will be down during your demo.**

### How Offline Mode Works

The demo is **pre-configured to use mock data by default**. The file:

```
postbatch-demo/mock/postcodes.json
```

contains 15 representative postcodes across Lagos, Abia, Kano, FCT, Rivers, and Ogun — complete with coordinates and GeoJSON polygons. The app loads this file on startup and uses it for:

- Auto-suggest (filtering by prefix as you type)
- Postcode verification (matching against the mock list)
- Polygon rendering on the Leaflet map

### No Internet? No Problem.

The only thing that requires internet is the **Leaflet tile layer** (the map background). If you're fully offline:

1. The map background will be grey/empty, but **the coloured polygons will still render**.
2. This actually looks fine on the dark theme — the polygons pop against the dark background.

If you want map tiles offline, you can:

```bash
# Pre-cache tiles for Nigeria (zoom levels 5-10) using a tile downloader
# This is optional — the polygons are the star of the demo, not the tiles.
```

### Testing Offline Mode

1. Start the demo: `npm run demo`
2. Disconnect your Wi-Fi / unplug Ethernet.
3. Refresh the page.
4. Type `LA` → suggestions should still appear.
5. Verify and place orders → polygons should still render.
6. ✅ Confirm everything works without network.

---

## Demo Script (What to Click & Say)

Use this script during the pitch. Times are approximate.

### Minute 0:00 — Open (30 seconds)

> *"Every morning, Nigerian logistics warehouses spend 2–4 hours manually sorting parcels by reading free-text addresses. PostBatch eliminates that. Let me show you."*

### Minute 0:30 — Show the Checkout (60 seconds)

1. Point to the **left pane**: *"This is a merchant's checkout page. They've added PostBatch with a single script tag."*
2. Type `LA-101` in the postcode field.
3. *"As the buyer types, we auto-suggest from the NIPOST postcode database."*
4. Click **LA-101-2001** from the suggestions.
5. *"One click — the postcode is verified. We now know the exact delivery polygon."*
6. Click **Place Order**.

### Minute 1:30 — Show the Dashboard (60 seconds)

7. Point to the **right pane**: *"This order instantly appears in the fleet dashboard."*
8. Point to the blue polygon on the map: *"The delivery zone is visualised in real time."*
9. Go back to left pane. Add 2 more orders: `LA-101-2002` and `LA-200-1001`.
10. *"Watch the clusters form automatically."*
11. Point to the zone sidebar: *"LA-101 now has 2 parcels. LA-200 has 1. Each zone gets its own vehicle."*

### Minute 2:30 — Add Cross-Country Orders (45 seconds)

12. Add `KN-100-5001` (Kano) and `FC-900-0001` (Abuja).
13. The map now shows clusters across Nigeria.
14. *"PostBatch works nationally. Kano, Abuja, Lagos — all sorted in milliseconds."*

### Minute 3:15 — The Punchline (15 seconds)

> *"What used to take 3 hours now takes 300 milliseconds. That's PostBatch."*

### Minute 3:30 — Q&A

Keep the demo visible during Q&A. Add more postcodes if asked to demonstrate further.

---

## Troubleshooting

### `npm install` fails

```bash
# Clear npm cache and retry
npm cache clean --force
rm -rf node_modules
npm install
```

### Port 3000 is in use

```bash
# Kill the process on port 3000
npx kill-port 3000
# Or start on a different port
cd postbatch-demo && npx vite --port 3001
```

### Leaflet map is blank (white/grey)

- **Cause:** You're offline and tiles can't load.
- **Fix:** This is fine. The polygons still render. Mention to the audience: *"We're using a dark tile layer that requires internet — but notice the delivery zones are still perfectly visible."*

### Polygons don't appear

- **Cause:** The mock JSON has invalid GeoJSON.
- **Fix:** Run this in the browser console to debug:
  ```js
  fetch('/mock/postcodes.json').then(r => r.json()).then(d => console.log(d));
  ```
  Verify each postcode has a `.polygon.geometry.coordinates` array.

### React error: "Cannot read properties of undefined"

- **Cause:** The cart is empty when the map tries to centre.
- **Fix:** The app handles this with a fallback UI. If it still errors, hard-refresh (Ctrl+Shift+R).

### The presenter's screen mirror is lagging

- Use **Duplicate** mode (Win+P → Duplicate), not **Extend**.
- Close all other applications.
- Disable hardware acceleration in Chrome: Settings → System → uncheck "Use hardware acceleration".

---

## NIPOST Staging Environment Notes

> **TL;DR: Don't rely on it for the pitch. Use mock data.**

| Detail | Value |
|---|---|
| Staging Base URL | `https://staging-api.nipost.gov.ng/v2` |
| Auth | Bearer token (ask CTO for current staging key) |
| Uptime (observed) | ~60% during business hours, ~80% at night |
| Rate limit | 100 req/min on staging |
| Known issues | Timeouts on `/verify` endpoint; polygon data missing for some districts |

If you *do* want to toggle live mode during the demo (e.g., an investor asks *"Is this live data?"*):

1. Open the browser console (F12).
2. Type: `window.__POSTBATCH_USE_LIVE_API = true`
3. This flag (when implemented) will switch the widget from mock to live API calls.

**Only do this if you've confirmed staging is up in the last 5 minutes.**

---

## Available Mock Postcodes

These are the postcodes pre-loaded in `mock/postcodes.json`. Use them during the demo:

| Postcode | Area | State | Zone |
|---|---|---|---|
| LA-101-2001 | Ebute Metta | Lagos | LA-101 |
| LA-101-2002 | Yaba | Lagos | LA-101 |
| LA-101-2003 | Surulere | Lagos | LA-101 |
| LA-200-1001 | GRA Ikeja | Lagos | LA-200 |
| LA-200-1002 | Alausa | Lagos | LA-200 |
| AB-101-1001 | Aba Town Centre | Abia | AB-101 |
| AB-101-1002 | Ogbor Hill | Abia | AB-101 |
| AB-202-4001 | Umuahia Centre | Abia | AB-202 |
| KN-100-5001 | Sabon Gari | Kano | KN-100 |
| KN-100-5002 | Bompai | Kano | KN-100 |
| FC-900-0001 | Central Area | FCT | FC-900 |
| FC-900-0002 | Wuse 2 | FCT | FC-900 |
| RV-110-7001 | Old GRA | Rivers | RV-110 |
| OG-301-8001 | Sapon | Ogun | OG-301 |
| OG-301-8002 | Kuto | Ogun | OG-301 |

**Pro tip:** Start with Lagos postcodes (the audience knows Lagos), then expand to Kano and Abuja for the "national scale" wow moment.

---

*Good luck on Saturday. Ship it. 🚀*
