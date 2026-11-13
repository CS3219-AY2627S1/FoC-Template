import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development, /api goes to the web-client container (the gateway on 8080),
    // so dev and production route requests the same way. Start it with docker compose.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  resolve: {
    // Reads the "paths" alias from tsconfig, so it is defined in one place only.
    tsconfigPaths: true,
  },
})
