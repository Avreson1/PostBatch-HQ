import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The .env lives in the repo root (PostBatch-HQ/.env), one level above this app.
const ENV_DIR = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  // Load ALL vars (no prefix filter) so the server can read the key, but only
  // VITE_* vars are ever exposed to browser code.
  const env = loadEnv(mode, ENV_DIR, '');
  const apiKey = env.NIPOST_API_KEY || env.VITE_NIPOST_API_KEY || '';
  const apiBase = (env.NIPOST_API_BASE || 'https://api.postcode.gov.ng').replace(/\/+$/, '');

  return {
    plugins: [react()],
    root: '.',
    build: {
      rollupOptions: {
        output: {
          // Vendor libraries in their own cached files instead of one 670 kB bundle
          manualChunks: {
            react: ['react', 'react-dom'],
            map: ['leaflet', 'react-leaflet'],
            motion: ['framer-motion'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    envDir: ENV_DIR,
    // Never ship the key to the browser. Vite normally exposes every VITE_*
    // variable to client code, so only PB_PUBLIC_* vars are exposed, and the
    // proxy below attaches the key server-side.
    envPrefix: 'PB_PUBLIC_',
    define: {
      __NIPOST_KEY_CONFIGURED__: JSON.stringify(Boolean(apiKey)),
      __NIPOST_KEY_KIND__: JSON.stringify((apiKey.match(/^nipost_(pk_)?(live|test)_/) || [''])[0]),
      __NIPOST_LOOKUP_LEVEL__: JSON.stringify(Number(env.NIPOST_LOOKUP_LEVEL || 1)),
    },
    server: {
      port: 3000,
      open: true,
      fs: { allow: ['..'] },
      proxy: {
        // Browser calls /nipost/v1/... → https://api.postcode.gov.ng/v1/...
        // The key is added here (server to server), so there is no browser
        // Origin to allowlist and the key never appears in page source.
        '/nipost': {
          target: apiBase,
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/nipost/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              proxyReq.removeHeader('cookie');
              if (apiKey) proxyReq.setHeader('X-API-Key', apiKey);
            });
          },
        },
      },
    },
  };
});
