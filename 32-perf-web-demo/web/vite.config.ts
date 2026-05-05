import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Lesson 32 · vite.config.ts
// 前端跑在 5173，后端跑在 3000；/api 代理到后端避免 CORS 麻烦。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
});
