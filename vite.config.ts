import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /\/node_modules\/(?:react|react-dom|scheduler)\// },
            { name: 'supabase-vendor', test: /\/node_modules\/@supabase\// },
            { name: 'query-vendor', test: /\/node_modules\/@tanstack\// },
            { name: 'zod', test: /\/node_modules\/zod\// },
            { name: 'vendor', test: /\/node_modules\// }
          ]
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['tradr-mark.svg'],
      manifest: {
        name: 'tradR. Campus Marketplace',
        short_name: 'tradR.',
        description: 'The student marketplace for Lead City University.',
        theme_color: '#102a43',
        background_color: '#f7f8f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/tradr-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/tradr-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/tradr-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/zod-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tradr-product-images-v1',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tradr-fonts-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
