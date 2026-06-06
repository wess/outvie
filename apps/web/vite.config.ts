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
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          mantine: ["@mantine/core", "@mantine/hooks", "@mantine/notifications", "@tabler/icons-react"],
          query: ["@tanstack/react-query"],
          emulator: ["nostalgist", "fzstd"],
        },
      },
    },
  },
})
