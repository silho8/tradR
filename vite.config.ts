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
      includeAssets: ['tradr-mark.svg', 'admin-mark.svg', 'errand-mark.svg'],
      manifest: false,
      // Route-specific manifests are served from public/ and selected before the page loads.
      workbox: {
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
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
