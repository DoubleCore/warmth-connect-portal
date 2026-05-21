#!/usr/bin/env node
/**
 * 生成 HOST_CRED_KEY — 32 字节 hex 密钥
 *
 * 用法:
 *   npm run host:keygen
 *
 * 把输出粘贴到 backend/.env 的 HOST_CRED_KEY=<...> 即可。
 * 一旦生成不要更改，否则历史加密密码全部解密失败。
 */

import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("hex");
console.log("");
console.log("HOST_CRED_KEY=" + key);
console.log("");
console.log("把上面这行粘贴到 backend/.env，覆盖现有的 HOST_CRED_KEY 行。");
console.log("注意：一旦写入不要更改，已加密的主机密码会全部解不开。");
