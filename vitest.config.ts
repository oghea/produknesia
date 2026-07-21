import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // PGlite (in-memory Postgres) cold-starts WASM + runs migrations in
    // beforeEach; under parallel test-file execution on a loaded machine
    // this can far exceed the 5s defaults, so give generous headroom.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
