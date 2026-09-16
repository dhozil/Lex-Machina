import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The GenLayer RPC endpoints do not send CORS headers, so browsers refuse
// direct calls from this origin. These same-origin proxies forward
// /rpc/<network> to the real endpoints; the app always talks to /rpc/*.
// Production hosting needs the equivalent rewrite (e.g. Vercel rewrites,
// Netlify redirects, or any reverse proxy) for the same /rpc/* paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/rpc/localnet": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc\/localnet/, "/api"),
      },
      "/rpc/studionet": {
        target: "https://studio.genlayer.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc\/studionet/, "/api"),
      },
      "/rpc/studio_next": {
        target: "https://studio-dev.genlayer.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc\/studio_next/, "/api"),
      },
      "/rpc/testnet_asimov": {
        target: "https://rpc-asimov.genlayer.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc\/testnet_asimov/, ""),
      },
      "/rpc/testnet_bradbury": {
        target: "https://rpc-bradbury.genlayer.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc\/testnet_bradbury/, ""),
      },
    },
  },
});
