import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  /** Subruta pública si la app no está en la raíz del dominio (p. ej. `/mapa/`). Build: `VITE_BASE=/mapa/ npm run build` o ARG en Docker. */
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    host: true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
})
