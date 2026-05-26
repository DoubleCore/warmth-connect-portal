#!/usr/bin/env node
/**
 * Desktop（Windows 安装包）专用构建脚本。
 *
 * 等价行为：
 *   BUILD_TARGET=desktop vite build
 *
 * 不直接走 npx 因为：
 *   - 需要在 Windows 上稳定可用，跨 cmd / PowerShell；
 *   - 不想引入 cross-env 这一额外依赖；
 *   - 把"如何决定目标"的逻辑收敛到 vite.config.ts 单一信号源（process.env.BUILD_TARGET）。
 *
 * 退出码：透传 vite 子进程退出码。
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

const child = spawn(
  process.execPath,
  [resolve(projectRoot, "node_modules/vite/bin/vite.js"), "build"],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "desktop" },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
