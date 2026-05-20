/**
 * SSH 本地端口转发 (Local Port Forwarding)
 *
 * 把远程主机的端口映射到本地，常用于：
 * - 通过跳板机访问远程内网数据库 (例如 localhost:13306 -> remote-db:3306)
 * - 临时访问 K8s 集群内部服务
 */

import { createServer, type Server, type Socket } from "node:net";

import type { Client as SSH2Client } from "ssh2";

import type { SSHClient } from "./ssh-client.js";

export interface TunnelOptions {
  /** 远程目标主机 (从 SSH 跳板机视角看) */
  remoteHost: string;
  /** 远程目标端口 */
  remotePort: number;
  /** 本地监听地址，默认 127.0.0.1 */
  localHost?: string;
  /** 本地监听端口，0 表示随机分配 */
  localPort?: number;
}

export class SSHTunnel {
  private server: Server | null = null;
  private actualPort = 0;
  private readonly localHost: string;
  private readonly requestedPort: number;
  private active = false;

  constructor(
    private readonly sshClient: SSHClient,
    private readonly remoteHost: string,
    private readonly remotePort: number,
    options: { localHost?: string; localPort?: number } = {},
  ) {
    this.localHost = options.localHost ?? "127.0.0.1";
    this.requestedPort = options.localPort ?? 0;
  }

  get localPort(): number {
    return this.actualPort;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** 启动隧道，返回实际监听的本地端口 */
  async start(): Promise<number> {
    if (this.active) return this.actualPort;
    if (!this.sshClient.isConnected) {
      await this.sshClient.connect();
    }
    const raw: SSH2Client = this.sshClient.getRawClient();

    const server = createServer((local: Socket) => {
      const srcAddr = local.remoteAddress ?? "127.0.0.1";
      const srcPort = local.remotePort ?? 0;
      raw.forwardOut(srcAddr, srcPort, this.remoteHost, this.remotePort, (err, channel) => {
        if (err) {
          local.destroy(err);
          return;
        }
        local.pipe(channel).pipe(local);
      });
    });

    server.on("error", (err) => {
      // 把错误暴露给调用方便于排查
      console.error(`[ssh-tunnel] server error: ${err.message}`);
    });

    this.actualPort = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.requestedPort, this.localHost, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          resolve(addr.port);
        } else {
          reject(new Error("无法获取本地端口"));
        }
      });
    });

    this.server = server;
    this.active = true;
    return this.actualPort;
  }

  /** 关闭隧道 */
  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = null;
    this.active = false;
  }

  describe(): string {
    return `${this.localHost}:${this.actualPort} -> ${this.remoteHost}:${this.remotePort}`;
  }
}

/**
 * 便捷工厂：传入连接参数和转发目标，返回已启动的 tunnel + 底层 SSHClient
 */
export async function createTunnel(
  sshClient: SSHClient,
  options: TunnelOptions,
): Promise<SSHTunnel> {
  const tunnel = new SSHTunnel(sshClient, options.remoteHost, options.remotePort, {
    localHost: options.localHost,
    localPort: options.localPort,
  });
  await tunnel.start();
  return tunnel;
}
