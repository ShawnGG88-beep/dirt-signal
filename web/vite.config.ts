/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Dirt Signal",
        short_name: "Dirt Signal",
        description: "Live soil and plant monitoring",
        display: "standalone",
        start_url: "/",
        // Dark "night soil" canvas token
        background_color: "#14140f",
        theme_color: "#14140f",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Shell caching only: precache the built app shell so the UI loads
        // offline. No runtime caching is registered, so every Supabase
        // request goes to the network and sensor data is never served
        // stale from cache; the OfflineBanner handles the no-network case.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "/index.html",
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: "node",
  },
});
