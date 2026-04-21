import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 配置：
// - 前端跑在 5173，后端跑在 3000
// - /api/* 代理到后端，避免 CORS（但 server.ts 里也开了 CORS，两头保险）
// - 代理带上 cookie 透传
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false, // 同端口策略，让 cookie 生效
      },
    },
  },
});
