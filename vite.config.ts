// Базовый путь позволяет собирать тот же интерфейс для корня или раздела на сервере.
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: process.env.APP_BASE_PATH ?? "/",
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 4316,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
  build: { outDir: "dist/client" },
});
