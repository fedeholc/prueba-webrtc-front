import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const __dirname = path.resolve();
export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "localhost.key")),
      cert: fs.readFileSync(path.resolve(__dirname, "localhost.cert")),
    },

    port: 5173, // Puedes cambiar el puerto si lo necesitas
    host: true, // Permite que se acceda desde otras IPs de tu red local
  },
  plugins: [react()],
});
