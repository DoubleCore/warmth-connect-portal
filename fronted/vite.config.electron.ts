// Node SSR build for Electron packaging.
//
// Two deviations from the default (Cloudflare) build:
//   1. cloudflare: false  -> emit a plain Node fetch-handler instead of a
//      Workers bundle (vite build -> dist/server/server.js + dist/client/**).
//   2. ssr.noExternal: true -> bundle ALL dependencies into the SSR output so
//      the shipped frontend dir needs no node_modules at runtime. The default
//      build externalizes react / @tanstack / h3-v2 / radix etc., expecting the
//      Workers runtime to resolve them; under plain Node with no node_modules
//      that throws ERR_MODULE_NOT_FOUND. node: builtins stay external.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    ssr: {
      noExternal: true,
    },
  },
});
