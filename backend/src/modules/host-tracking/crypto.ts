/**
 * Re-export of the shared AES-256-GCM helper.
 *
 * 历史上 host-tracking 自带一份加解密实现；现在 agent 配置也要用同一把 HOST_CRED_KEY，
 * 把实现集中到 `@/shared/crypto.ts`，本文件只保留旧 import 路径的兼容入口。
 */

export {
  encryptSecret,
  decryptSecret,
  isCryptoConfigured,
  generateAppCredKey as generateHostCredKey,
} from "@/shared/crypto.js";
