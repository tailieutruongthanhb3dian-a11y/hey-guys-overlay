import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";

// Các HUD dùng entry riêng để không kéo Svelte/Leaflet vào WebView chạy cạnh game.
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  define: {
    // Compile-time so the footer needs no IPC (and no permission) to show it.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        minimap: fileURLToPath(new URL("./minimap.html", import.meta.url)),
        dinoHud: fileURLToPath(new URL("./dino-hud.html", import.meta.url)),
      },
    },
  },
  // Tauri dev server conventions.
  clearScreen: false,
  server: {
    watch: { ignored: ["**/.tools/**", "**/src-tauri/target/**", "**/docs/qa-output/**"] },
    port: 1420,
    strictPort: true,
  },
})
