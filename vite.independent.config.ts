import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { independentEnvironment } from "./config/independent/environment";

const root = fileURLToPath(new URL(".", import.meta.url));
const envDir = fileURLToPath(new URL("./config/independent", import.meta.url));
const output = fileURLToPath(new URL("./dist/independent-runtime", import.meta.url));

export default defineConfig(({ mode, command }) => {
  const publicValues = independentEnvironment(mode, loadEnv(mode, envDir, "VITE_"));
  return {
    root,
    // Disable Vite's automatic exposure; inject only the reviewed public allowlist.
    envDir: false,
    envPrefix: [],
    define: Object.fromEntries(
      Object.entries(publicValues).map(([key, value]) => [
        `import.meta.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
    cacheDir: "node_modules/.vite-independent",
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      ...(command === "build"
        ? [
            nitro({
              preset: "node_server",
              buildDir: "node_modules/.nitro-independent",
              output: { dir: output, serverDir: `${output}/server`, publicDir: `${output}/public` },
            }),
          ]
        : []),
      react(),
    ],
    resolve: {
      alias: { "@": `${root}/src` },
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
    server: { host: "127.0.0.1", port: 5202, strictPort: true },
  };
});
