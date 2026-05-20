/**
 * SSH 多服务器管理器
 *
 * 从 yaml 配置文件加载多台服务器，提供：
 * - 按别名连接 (带连接池复用)
 * - 批量在所有服务器执行命令
 */

import { promises as fs } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import { SSHClient } from "./ssh-client.js";
import type { ExecResult, ServerConfig, SSHToolConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = pathResolve(__dirname, "config.yaml");
const EXAMPLE_CONFIG_PATH = pathResolve(__dirname, "config.example.yaml");

export class SSHManager {
  private config: SSHToolConfig | null = null;
  private readonly pool = new Map<string, SSHClient>();

  constructor(private readonly configPath: string = DEFAULT_CONFIG_PATH) {}

  async load(): Promise<void> {
    try {
      await fs.access(this.configPath);
    } catch {
      throw new Error(
        `配置文件不存在: ${this.configPath}\n` +
          `提示: 复制示例文件\n` +
          `  copy ${EXAMPLE_CONFIG_PATH} ${this.configPath}`,
      );
    }
    const raw = await fs.readFile(this.configPath, "utf8");
    const parsed = parseYaml(raw) as SSHToolConfig | null;
    if (!parsed || typeof parsed !== "object" || !parsed.servers) {
      throw new Error(`配置文件格式错误，缺少 servers 字段: ${this.configPath}`);
    }
    this.config = parsed;
  }

  private requireConfig(): SSHToolConfig {
    if (!this.config) {
      throw new Error("配置尚未加载，先调用 load()");
    }
    return this.config;
  }

  get serverNames(): string[] {
    return Object.keys(this.requireConfig().servers);
  }

  get defaultServer(): string {
    const cfg = this.requireConfig();
    if (cfg.defaultServer && cfg.servers[cfg.defaultServer]) {
      return cfg.defaultServer;
    }
    const first = this.serverNames[0];
    if (!first) throw new Error("配置中没有任何服务器");
    return first;
  }

  /** 获取（或建立）指定服务器的连接 */
  async getClient(name?: string): Promise<SSHClient> {
    const cfg = this.requireConfig();
    const serverName = name ?? this.defaultServer;
    const srv: ServerConfig | undefined = cfg.servers[serverName];
    if (!srv) {
      throw new Error(
        `服务器 '${serverName}' 未在配置中找到。可用: ${this.serverNames.join(", ")}`,
      );
    }

    const existing = this.pool.get(serverName);
    if (existing && existing.isConnected) return existing;

    const client = new SSHClient({
      host: srv.host,
      port: srv.port,
      username: srv.username,
      password: srv.password,
      keyFile: srv.keyFile,
      keyPassphrase: srv.keyPassphrase,
      timeoutMs: cfg.timeoutMs,
    });
    await client.connect();
    this.pool.set(serverName, client);
    return client;
  }

  /** 在指定服务器执行命令 */
  async execOn(serverName: string, command: string): Promise<ExecResult> {
    const client = await this.getClient(serverName);
    return client.exec(command);
  }

  /** 在所有服务器并行执行命令 */
  async execOnAll(command: string): Promise<Record<string, ExecResult | { error: string }>> {
    const results: Record<string, ExecResult | { error: string }> = {};
    await Promise.all(
      this.serverNames.map(async (name) => {
        try {
          results[name] = await this.execOn(name, command);
        } catch (err) {
          results[name] = { error: (err as Error).message };
        }
      }),
    );
    return results;
  }

  /** 关闭所有连接 */
  closeAll(): void {
    for (const client of this.pool.values()) {
      try {
        client.disconnect();
      } catch {
        // 忽略关闭错误
      }
    }
    this.pool.clear();
  }

  /** 暴露已加载的配置（只读） */
  getConfig(): SSHToolConfig {
    return this.requireConfig();
  }
}
