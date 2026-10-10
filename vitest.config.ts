import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: { provider: "v8", include: ["src/lib/**/*.ts", "src/app/api/**/route.ts"], exclude: ["src/lib/**/*.test.ts"] }
  }
});
