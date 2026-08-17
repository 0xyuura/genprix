/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5200,
    // Prevent gstack /browse .jsonl writes from triggering Vite HMR reload loops.
    watch: { ignored: ["**/.gstack/**"] },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // These suites cover local/demo mode: the room key, the invite link, the
    // one-run-per-player rule. Vitest loads .env.local, so a developer who has
    // Supabase configured would otherwise run them in secure mode, where
    // adoptRoomFromUrl() deliberately returns null and the tests fail for a
    // reason that has nothing to do with the code under test.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" },
  },
});
