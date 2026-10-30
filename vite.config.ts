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
      registerType: 'autoUpdate',
      includeAssets: ['tradr-mark.svg'],
      manifest: {
        name: 'tradR. Campus Marketplace',
        short_name: 'tradR.',
        description: 'The student marketplace for Lead City University.',
        theme_color: '#102a43',
        background_color: '#f7f8f4',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/tradr-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/zod-*.js']
      }
    })
  ]
})
