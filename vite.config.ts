import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Farbvariante: Standard Petrol; `vite build --mode pink` setzt <html data-variante="pink"> (Farben in src/index.css).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "farbvariante",
      transformIndexHtml: (html) => (mode === "pink" ? html.replace('<html lang="de">', '<html lang="de" data-variante="pink">') : html),
    },
  ],
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
}));
