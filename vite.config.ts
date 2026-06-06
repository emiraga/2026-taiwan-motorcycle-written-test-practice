import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
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
