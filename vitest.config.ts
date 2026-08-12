import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "vitest.server-only.ts")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"]
    }
  }
});
