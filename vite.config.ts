import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages publishes the compiled application below /emprises/.
// Vite's development server remains at the root.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/emprises/' : '/',
}))
