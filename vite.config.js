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
    },
});
