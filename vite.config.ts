import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Set VITE_BASE_PATH=/portal/ when embedding the built app in the landing site.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
})
