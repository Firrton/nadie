import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_GATEWAY_PROXY_TARGET;

  return proxyTarget
    ? {
        plugins: [react()],
        server: {
          proxy: {
            "/api/gateway": {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api\/gateway/, ""),
            },
          },
        },
      }
    : { plugins: [react()] };
});
