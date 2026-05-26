/**
 * AES-256-GCM 加解密 — 通用敏感字段（host SSH 密码、Agent API Key 等）
 *
 * 密文布局（Base64 编码后入库）：
 *   [12 字节 IV][16 字节 AuthTag][N 字节密文]
 *
 * 密钥来自 env.HOST_CRED_KEY（hex 编码 32 字节）。
 * 一旦确定不要更改，否则历史密文全部解密失败。
 *
 * 设计取舍：
 *   · 模块名叫 HOST_CRED_KEY 是历史遗留 — 实际作用是仓库范围的"应用密钥"。
 *     新加 env 只换名字成本太大，复用就行。
 *   · 任何调用都共享同一个 cachedKey，进程内只解析一次 hex。
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM 推荐 96 bit
const TAG_LEN = 16; // 128 bit
const KEY_LEN = 32; // AES-256

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = env.HOST_CRED_KEY;
  if (!hex) {
    throw new AppError(
      "HOST_CRED_KEY is not configured. Generate one via `npm run host:keygen` and put it in .env",
      503,
      "HOST_CRED_KEY_MISSING",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new AppError(
      "HOST_CRED_KEY must be 64 hex characters (32 bytes)",
      500,
      "HOST_CRED_KEY_INVALID",
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== KEY_LEN) {
    throw new AppError(
      `HOST_CRED_KEY decoded length must be ${KEY_LEN} bytes`,
      500,
      "HOST_CRED_KEY_INVALID",
    );
  }
  cachedKey = buf;
  return cachedKey;
}

/** 是否已配置加密密钥；调用方需要在解密前自行检查避免抛错。 */
export function isCryptoConfigured(): boolean {
  return Boolean(env.HOST_CRED_KEY) && /^[0-9a-fA-F]{64}$/.test(env.HOST_CRED_KEY ?? "");
}

/**
 * 加密明文 → Base64 字符串。布局：IV (12B) || AUTH_TAG (16B) || CIPHERTEXT。
 */
export function encryptSecret(plain: string): string {
  if (typeof plain !== "string") {
    throw new TypeError("encryptSecret expects a string");
  }
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * 解密 Base64 密文 → 明文。失败抛 AppError(500, HOST_CRED_DECRYPT_FAILED)。
 */
export function decryptSecret(b64: string): string {
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new AppError("encrypted payload is empty", 500, "HOST_CRED_DECRYPT_FAILED");
  }
  const key = getKey();
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new AppError("encrypted payload is not valid base64", 500, "HOST_CRED_DECRYPT_FAILED");
  }
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new AppError("encrypted payload is too short", 500, "HOST_CRED_DECRYPT_FAILED");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (err) {
    throw new AppError(
      `failed to decrypt secret: ${(err as Error).message}`,
      500,
      "HOST_CRED_DECRYPT_FAILED",
    );
  }
}

/** 生成新的 64 字符 hex 密钥（32 字节），用于 keygen 脚本与首启动。 */
export function generateAppCredKey(): string {
  return randomBytes(KEY_LEN).toString("hex");
}
