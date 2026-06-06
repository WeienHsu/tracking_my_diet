import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 讓測試解析 `@/` 路徑別名（與 tsconfig 一致），指向 src/。
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
