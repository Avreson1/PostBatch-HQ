/**
 * PostBatch Widget — Embeddable Checkout Postcode Capture
 * ========================================================
 *
 * A lightweight vanilla JS widget that merchants embed via a single <script>
 * tag. It renders a postcode input field inside a Shadow DOM container,
 * verifies the entered postcode against the NIPOST Digital Postcode API,
 * and returns the verified polygon payload to the merchant via a callback.
 *
 * Usage (see README.md for full docs):
 *
 *   <div id="postbatch-root"></div>
 *   <script src="https://cdn.postbatch.io/widget/v1.js"></script>
 *   <script>
 *     PostBatch.init({
 *       publishableKey: 'pb_live_xxxxxxxx',
 *       container: '#postbatch-root',
 *       onVerified: function (payload) {
 *         console.log('Verified postcode:', payload);
 *       }
 *     });
 *   </script>
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const NIPOST_API_BASE = 'https://api.nipost.gov.ng/v2';
  const WIDGET_VERSION = '0.1.0';

  // ---------------------------------------------------------------------------
  // Default Styles (injected into Shadow DOM)
  // ---------------------------------------------------------------------------

  const STYLES = `
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .pb-container {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background: #ffffff;
      max-width: 420px;
    }
    .pb-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
    }
    .pb-input-row {
      display: flex;
      gap: 8px;
    }
    .pb-input {
      flex: 1;
      padding: 10px 12px;
      font-size: 14px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      outline: none;
      transition: border-color 0.2s;
    }
    .pb-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }
    .pb-btn {
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      background: #2563eb;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .pb-btn:hover { background: #1d4ed8; }
    .pb-btn:disabled { background: #93c5fd; cursor: not-allowed; }
    .pb-status {
      margin-top: 10px;
      font-size: 12px;
      color: #64748b;
      min-height: 18px;
    }
    .pb-status.success { color: #16a34a; }
    .pb-status.error   { color: #dc2626; }
    .pb-suggestions {
      list-style: none;
      margin: 4px 0 0;
      padding: 0;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      max-height: 160px;
      overflow-y: auto;
    }
    .pb-suggestions li {
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
    }
    .pb-suggestions li:hover { background: #f1f5f9; }
  `;

  // ---------------------------------------------------------------------------
  // Widget Class
  // ---------------------------------------------------------------------------

  class PostBatchWidget {
    /**
     * @param {Object}   opts
     * @param {string}   opts.publishableKey  — Merchant's publishable API key (pb_live_* | pb_test_*)
     * @param {string}   opts.container       — CSS selector for the mount point
     * @param {Function} opts.onVerified      — Callback invoked with the verified NIPOST payload
     * @param {Function} [opts.onError]       — Optional error callback
     * @param {string}   [opts.placeholder]   — Input placeholder text
     */
    constructor(opts) {
      this.key = opts.publishableKey;
      this.onVerified = opts.onVerified || function () {};
      this.onError = opts.onError || function () {};
      this.placeholder = opts.placeholder || 'e.g. LA-101-2001';

      const mountPoint = document.querySelector(opts.container);
      if (!mountPoint) {
        console.error(`[PostBatch] Container "${opts.container}" not found.`);
        return;
      }

      this._render(mountPoint);
    }

    // -------------------------------------------------------------------------
    // Rendering (Shadow DOM for style isolation)
    // -------------------------------------------------------------------------

    _render(mountPoint) {
      const shadow = mountPoint.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = STYLES;

      const container = document.createElement('div');
      container.className = 'pb-container';
      container.innerHTML = `
        <label class="pb-label">Delivery Postcode (NIPOST)</label>
        <div class="pb-input-row">
          <input class="pb-input" type="text" placeholder="${this.placeholder}" autocomplete="postal-code" />
          <button class="pb-btn" type="button">Verify</button>
        </div>
        <ul class="pb-suggestions" style="display:none;"></ul>
        <div class="pb-status"></div>
      `;

      shadow.appendChild(style);
      shadow.appendChild(container);

      // Cache DOM refs
      this._input = shadow.querySelector('.pb-input');
      this._btn = shadow.querySelector('.pb-btn');
      this._status = shadow.querySelector('.pb-status');
      this._suggestions = shadow.querySelector('.pb-suggestions');

      // Bind events
      this._btn.addEventListener('click', () => this._verify());
      this._input.addEventListener('input', () => this._onInputChange());
      this._input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._verify();
      });
    }

    // -------------------------------------------------------------------------
    // Auto-suggest (debounced)
    // -------------------------------------------------------------------------

    _onInputChange() {
      clearTimeout(this._debounce);
      const query = this._input.value.trim();
      if (query.length < 3) {
        this._suggestions.style.display = 'none';
        return;
      }
      this._debounce = setTimeout(() => this._fetchSuggestions(query), 300);
    }

    async _fetchSuggestions(query) {
      try {
        const res = await fetch(`${NIPOST_API_BASE}/postcodes/suggest?q=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${this.key}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        this._renderSuggestions(data.suggestions || []);
      } catch (_) {
        // Silently degrade — suggestions are a nice-to-have
      }
    }

    _renderSuggestions(items) {
      if (!items.length) {
        this._suggestions.style.display = 'none';
        return;
      }
      this._suggestions.innerHTML = items
        .map((s) => `<li data-code="${s.postcode}">${s.postcode} — ${s.area}</li>`)
        .join('');
      this._suggestions.style.display = 'block';

      this._suggestions.querySelectorAll('li').forEach((li) => {
        li.addEventListener('click', () => {
          this._input.value = li.dataset.code;
          this._suggestions.style.display = 'none';
          this._verify();
        });
      });
    }

    // -------------------------------------------------------------------------
    // Verification against NIPOST API
    // -------------------------------------------------------------------------

    async _verify() {
      const postcode = this._input.value.trim().toUpperCase();
      if (!postcode) {
        this._setStatus('Please enter a postcode.', 'error');
        return;
      }

      this._btn.disabled = true;
      this._setStatus('Verifying…');

      try {
        const res = await fetch(`${NIPOST_API_BASE}/postcodes/${encodeURIComponent(postcode)}/verify`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ postcode }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Verification failed (${res.status})`);
        }

        const payload = await res.json();

        // ── The Verified Payload ──
        // {
        //   postcode:  "LA-101-2001",
        //   state:     "Lagos",
        //   lga:       "Lagos Mainland",
        //   area:      "Ebute Metta",
        //   polygon: {
        //     type: "Feature",
        //     geometry: { type: "Polygon", coordinates: [...] }
        //   },
        //   confidence: 0.98,
        //   verified:   true
        // }

        this._setStatus(`✓ Verified: ${payload.postcode} — ${payload.area}`, 'success');
        this.onVerified(payload);
      } catch (err) {
        this._setStatus(`✗ ${err.message}`, 'error');
        this.onError(err);
      } finally {
        this._btn.disabled = false;
      }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    _setStatus(msg, type) {
      this._status.textContent = msg;
      this._status.className = `pb-status ${type || ''}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API — window.PostBatch
  // ---------------------------------------------------------------------------

  global.PostBatch = {
    version: WIDGET_VERSION,
    init: function (opts) {
      if (!opts || !opts.publishableKey) {
        console.error('[PostBatch] publishableKey is required. Get yours at https://dashboard.postbatch.io');
        return null;
      }
      return new PostBatchWidget(opts);
    },
  };

})(typeof window !== 'undefined' ? window : globalThis);
