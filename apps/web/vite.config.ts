import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single unified BharatChain portal. Dev server on :3000 (backend API on :3001,
// whose CORS already allows :3000). All role surfaces are routed inside this app.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
  preview: { port: 3000 },
});
