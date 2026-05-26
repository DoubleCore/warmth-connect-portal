// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Build targets
 * -------------
 * 默认（BUILD_TARGET 未设或非 "desktop"）→ Cloudflare Workers SSR 构建（线上部署）。
 *
 * BUILD_TARGET=desktop  → 给 Windows 安装包用的纯 SPA 构建。
 *   · 关闭 @cloudflare/vite-plugin
 *   · 开启 TanStack Start 的 SPA 模式，prerender 出 `dist-desktop/client/index.html` 作为壳
 *   · 客户端首屏 hit `index.html`，之后 router 接管，不再依赖 SSR
 *   · 输出到 `dist-desktop/`，与默认 `dist/` 物理隔离
 *
 * 触发方式：`npm run build:desktop`（package.json 里用 cross-env 写好）
 *
 * NOTE: lovable 的 defineConfig 当传入函数时会把返回值当 vite.UserConfig 处理，
 * 这样 `cloudflare` / `tanstackStart` 这些 *lovable 选项* 会失效。所以这里只能用
 * 对象形式，并通过 process.env 区分构建目标。
 */
const isDesktop = process.env.BUILD_TARGET === "desktop";

export default defineConfig({
  cloudflare: isDesktop ? false : undefined,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
    server: { entry: "server" },
    // 桌面安装包：开 SPA 模式，prerender 一份静态 shell。
    // outputPath 故意写 `/index`，prerender 会落到 `dist-desktop/client/index.html`。
    ...(isDesktop
      ? {
          spa: {
            enabled: true,
            prerender: {
              outputPath: "/index",
              crawlLinks: false,
              retryCount: 0,
            },
          },
        }
      : {}),
  },
  vite: isDesktop
    ? {
        // 输出隔离：cloudflare build → dist/；desktop build → dist-desktop/。
        // backend 启动器只读 dist-desktop/client（由打包脚本拷贝到 app/frontend/）。
        build: { outDir: "dist-desktop" },
      }
    : {},
});
