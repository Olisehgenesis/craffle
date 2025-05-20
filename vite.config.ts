import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from '@tailwindcss/vite'
import vercel from 'vite-plugin-vercel';



// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), vercel()],
  server: {
    port: process.env.PORT as unknown as number,
  },
});
