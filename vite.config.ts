import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { groqApiPlugin } from './vite-plugin-groq-api'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    groqApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.png', 'templates/invoice-template.xlsx'],
      manifest: {
        name: 'NLog Invoice Generator',
        short_name: 'NLog',
        description: 'Generate Alchemy Dev invoices from markdown worklogs',
        theme_color: '#1e3a5f',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: 'https://nlog.kaila-app.com/',
        scope: 'https://nlog.kaila-app.com/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,xlsx,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  preview: {
    allowedHosts: ['nlog.kaila-app.com'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          exceljs: ['exceljs'],
          reactPdf: ['@react-pdf/renderer'],
        },
      },
    },
  },
})
