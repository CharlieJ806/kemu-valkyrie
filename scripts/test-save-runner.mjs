/**
 * 存档兼容测试 runner(Node ESM 需要显式 .ts 扩展名,Next bundler 不需要)。
 * 将 lib/{save,cards,types}.ts 复制到临时目录补全扩展名后运行 test_save.mts。
 * 运行: node scripts/test-save-runner.mjs
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "pd-save-test-"));
try {
  for (const f of ["save", "cards", "types"]) {
    const src = readFileSync(join(root, "lib", `${f}.ts`), "utf8");
    writeFileSync(
      join(dir, `${f}.ts`),
      src.replace(/from "\.\/([a-z]+)"/g, 'from "./$1.ts"'),
    );
  }
  const test = readFileSync(join(root, "scripts", "test_save.mts"), "utf8");
  writeFileSync(
    join(dir, "test_save.mts"),
    test.replace('from "../lib/save"', `from "${pathToFileURL(join(dir, "save.ts")).href}"`),
  );
  execSync(`node --experimental-strip-types "${join(dir, "test_save.mts")}"`, {
    stdio: "inherit",
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
