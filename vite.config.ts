import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  // Use relative asset paths so the build can be served from any subfolder
  // (e.g. https://emira.ga/widgets/.../) instead of only the domain root.
  base: "./",
  server: {
    port: 5176,
    strictPort: true,
  },
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // pnpm gives react-dom its own physical copy of `react`, so Vite would
    // otherwise pre-bundle two React instances and the hooks dispatcher set
    // by react-dom never reaches the app's React → "Invalid hook call".
    dedupe: ["react", "react-dom"],
  },
});
