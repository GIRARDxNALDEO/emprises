import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages publishes this repository at /emprises/.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? '/emprises/' : '/',
})
