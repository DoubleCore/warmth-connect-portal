/**
 * SSH 客户端 - 单连接管理
 *
 * 基于 ssh2 封装，提供：
 * - 密码 / 密钥认证
 * - 命令执行 (普通 / sudo)
 * - SFTP 文件传输
 *
 * 设计目标：API 简洁，错误信息清晰，可在 backend 业务代码中复用。
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { resolve as pathResolve } from "node:path";

import { Client, type ConnectConfig, type SFTPWrapper } from "ssh2";

import type { ConnectOptions, ExecResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/** 展开 ~ 为用户主目录 */
function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return pathResolve(homedir(), p.slice(2));
  }
  return p;
}

export class SSHClient {
  private readonly opts: Required<Omit<ConnectOptions, "password" | "keyFile" | "keyPassphrase">> &
    Pick<ConnectOptions, "password" | "keyFile" | "keyPassphrase">;

  private client: Client | null = null;
  private connected = false;

  constructor(opts: ConnectOptions) {
    this.opts = {
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.username ?? "root",
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      password: opts.password,
      keyFile: opts.keyFile,
      keyPassphrase: opts.keyPassphrase,
    };
  }

  get isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  get target(): string {
    return `${this.opts.username}@${this.opts.host}:${this.opts.port}`;
  }

  /** 建立 SSH 连接 */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    // 重连前先收掉上一个已死但未释放的 Client，避免 socket / 监听器泄露。
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.end();
      } catch {
        // 旧连接清理失败无所谓，继续建新连接
      }
      this.client = null;
    }

    const cfg: ConnectConfig = {
      host: this.opts.host,
      port: this.opts.port,
      username: this.opts.username,
      readyTimeout: this.opts.timeoutMs,
      // 不读取系统 known_hosts，首次连接信任 (跟 paramiko AutoAddPolicy 行为一致)
      // 生产环境如需严格校验，使用 hostVerifier 自行实现
    };

    if (this.opts.keyFile) {
      const keyPath = expandHome(this.opts.keyFile);
      try {
        cfg.privateKey = await fs.readFile(keyPath);
      } catch (err) {
        throw new Error(`无法读取私钥文件 ${keyPath}: ${(err as Error).message}`);
      }
      if (this.opts.keyPassphrase) {
        cfg.passphrase = this.opts.keyPassphrase;
      }
    } else if (this.opts.password) {
      cfg.password = this.opts.password;
    } else {
      throw new Error(`未提供认证信息 (密码或密钥)：${this.target}`);
    }

    const client = new Client();
    this.client = client;

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        client.removeAllListeners();
        this.client = null;
        reject(new Error(`连接失败 ${this.target}: ${err.message}`));
      };
      const onReady = () => {
        client.removeListener("error", onError);
        this.connected = true;
        resolve();
      };
      client.once("ready", onReady);
      client.once("error", onError);
      client.connect(cfg);
    });

    // 后续 error / close 事件标记断开，并释放死连接引用。
    // 只在仍是当前 client 时清理，避免竞态下把一个新建立的连接误置空。
    client.on("error", () => {
      this.connected = false;
      if (this.client === client) this.client = null;
    });
    client.on("close", () => {
      this.connected = false;
      if (this.client === client) this.client = null;
    });
  }

  /** 关闭连接 */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this.connected = false;
  }

  /**
   * 执行远程命令，等待完成并收集输出
   *
   * @param command 要执行的命令
   * @param options.pty 是否分配伪终端 (sudo 等需要)
   * @param options.timeoutMs 命令执行超时；超时会强制断开连接
   */
  async exec(
    command: string,
    options: { pty?: boolean; timeoutMs?: number } = {},
  ): Promise<ExecResult> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
    const client = this.client;
    if (!client) throw new Error("内部错误：客户端未初始化");

    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;
      if (options.timeoutMs && options.timeoutMs > 0) {
        timeout = setTimeout(() => {
          this.disconnect();
          reject(new Error(`命令执行超时 (${options.timeoutMs}ms): ${command}`));
        }, options.timeoutMs);
      }

      client.exec(command, { pty: options.pty ?? false }, (err, stream) => {
        if (err) {
          if (timeout) clearTimeout(timeout);
          reject(new Error(`exec 失败: ${err.message}`));
          return;
        }

        let stdout = "";
        let stderr = "";
        let code = -1;

        stream.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        stream.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        stream.on("exit", (exitCode: number | null) => {
          code = exitCode ?? -1;
        });
        stream.on("close", () => {
          if (timeout) clearTimeout(timeout);
          resolve({ code, stdout, stderr });
        });
        stream.on("error", (e: Error) => {
          if (timeout) clearTimeout(timeout);
          reject(e);
        });
      });
    });
  }

  /** 打开 SFTP 会话；调用方负责 sftp.end() */
  async openSftp(): Promise<SFTPWrapper> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
    const client = this.client!;
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  }

  /** 上传本地文件到远程 */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const local = expandHome(localPath);
    await fs.access(local).catch(() => {
      throw new Error(`本地文件不存在: ${local}`);
    });
    const sftp = await this.openSftp();
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.fastPut(local, remotePath, (err) => (err ? reject(err) : resolve()));
      });
    } finally {
      sftp.end();
    }
  }

  /** 从远程下载文件到本地 */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const local = expandHome(localPath);
    const sftp = await this.openSftp();
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(remotePath, local, (err) => (err ? reject(err) : resolve()));
      });
    } finally {
      sftp.end();
    }
  }

  /** 列出远程目录条目 */
  async listRemote(remotePath = "."): Promise<string[]> {
    const sftp = await this.openSftp();
    try {
      return await new Promise<string[]>((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
          if (err) reject(err);
          else resolve(list.map((entry) => entry.filename));
        });
      });
    } finally {
      sftp.end();
    }
  }
}
