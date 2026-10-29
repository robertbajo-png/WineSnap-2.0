import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repo = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "/src": `${repo}/src` },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 5200,
    strictPort: false,
    fs: { allow: [repo] },
  },
  preview: { host: "127.0.0.1", port: 5201 },
  build: {
    outDir: `${repo}/dist/chef-prototype`,
    emptyOutDir: true,
  },
});
