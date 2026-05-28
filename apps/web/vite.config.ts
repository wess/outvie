import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:4290",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
