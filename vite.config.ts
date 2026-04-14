import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts':   ['recharts'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-utils':    ['date-fns', 'papaparse', 'zustand', 'idb-keyval'],
        },
      },
    },
  },
})
