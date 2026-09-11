import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900,
    /**
     * Firebase is named because every screen needs it, so one shared chunk is right.
     *
     * recharts deliberately is not. Naming it looked like it kept 400KB of charting out of
     * the way, and did the opposite: forcing recharts into a chunk dragged React — which
     * recharts and the entry both depend on — in with it, so the entry had to import that
     * chunk to get React, and index.html preloaded all of it for every visitor. With the five
     * chart screens behind `lazy` (App.tsx), leaving recharts unnamed lets Rollup put it in a
     * chunk those routes load on demand, and React stays where the entry can reach it.
     */
    rollupOptions: { output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'] } } },
  },
  server: { port: 5173 },
})
