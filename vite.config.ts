import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // three.js is one big chunk, but it only loads when a 3D view opens.
  build: { chunkSizeWarningLimit: 1500 },
})
