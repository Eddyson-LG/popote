/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// Chemin de base : "/popote/" sur GitHub Pages, "/" en local.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Le manifest est écrit ici ; les icônes sont dans /public/icons.
      includeAssets: ['icons/*.png', 'icons/*.svg', 'splash/*.png'],
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
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout le shell + les polices + les données JSON sont en cache : l'appli marche hors ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,webmanifest}'],
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
