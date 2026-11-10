// Vite обслуживает только локальную разработку; секреты и внешние API не подключены.
import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 4316,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
  build: { outDir: "dist/client" },
});
