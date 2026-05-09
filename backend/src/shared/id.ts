import { randomUUID } from "node:crypto";

/**
 * SQLite 没有原生 UUID 类型，统一在应用层生成。
 */
export function newId(): string {
  return randomUUID();
}
