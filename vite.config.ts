/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import mkcert from 'vite-plugin-mkcert'
import { fileURLToPath, URL } from 'node:url'

// Chemin de base : "/popote/" sur GitHub Pages, "/" en local.
const base = process.env.VITE_BASE || '/'
// `npm run dev:iphone` : HTTPS local (certificat mkcert) pour tester caméra et installation sur l'iPhone.
const httpsLocal = process.env.POPOTE_HTTPS === '1'

/**
 * Content-Security-Policy, ajoutée seulement au build (en dev, Vite injecte des scripts en ligne).
 * Seuls destinataires réseau : Anthropic (clé de l'utilisateur), Open Food Facts / Open Prices,
 * et jsDelivr (données de langue de l'OCR Tesseract).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.anthropic.com https://*.openfoodfacts.org https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://*.openfoodfacts.org",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const csp = {
  name: 'popote-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

export default defineConfig({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: httpsLocal ? { host: true } : undefined,
  plugins: [
    ...(httpsLocal ? [mkcert()] : []),
    react(),
    csp,
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Le manifest est écrit ici ; les icônes sont dans /public/icons.
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Popote',
        short_name: 'Popote',
        description: 'Tes repas de la semaine et ta liste de courses sous 50 €.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF8F1',
        theme_color: '#FFF8F1',
        icons: [
          { src: 'icons/logo.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout le shell + les polices + les données JSON sont en cache : l'appli marche hors ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,webmanifest}'],
        // Les écrans de lancement ne servent qu'à l'installation : inutile de les mettre en cache.
        globIgnores: ['**/splash/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Photos produits Open Food Facts : cache "stale-while-revalidate".
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'off-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
