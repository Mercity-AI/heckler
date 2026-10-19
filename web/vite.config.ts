import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server proxies /api to the Heckler backend so the browser never needs CORS.
// Point it elsewhere with HECKLER_API_URL (e.g. HECKLER_API_URL=http://127.0.0.1:8765 npm run dev).
const backend = process.env.HECKLER_API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
