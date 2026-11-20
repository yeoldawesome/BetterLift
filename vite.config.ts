import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Start the connection to the API server while the page is still loading (saves a round trip on the first request). */
function preconnectApi(api: string | undefined): Plugin {
  return {
    name: 'preconnect-api',
    transformIndexHtml: () => (api ? [{ tag: 'link', attrs: { rel: 'preconnect', href: new URL(api).origin, crossorigin: '' }, injectTo: 'head' }] : []),
  }
}

export default defineConfig(({ mode }) => ({
  base: '/',
  // Shown at the bottom of Profile, so you can tell when a new version has reached your phone.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    preconnectApi(loadEnv(mode, '.', 'VITE_').VITE_API_URL), // loadEnv also picks up VITE_* from the real environment (CI)
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Better Lift',
        short_name: 'Better Lift',
        description: 'Log lifts, build routines, climb the ranks.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // push-sw.js (in public/) adds push notifications and the app-icon badge to the generated service worker.
      workbox: { navigateFallbackDenylist: [/^\/api/], importScripts: ['push-sw.js'] },
    }),
  ],
}))
