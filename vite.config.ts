import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ]
})
