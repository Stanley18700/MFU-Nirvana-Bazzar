import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'], charts: ['recharts'] } } },
  },
  server: { port: 5173 },
})
