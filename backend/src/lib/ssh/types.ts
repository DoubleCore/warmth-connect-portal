/**
 * SSH 工具公共类型定义
 */

export interface ServerAuth {
  /** 私钥文件路径 (优先级 1) */
  keyFile?: string;
  /** 私钥密码 */
  keyPassphrase?: string;
  /** 登录密码 (优先级 2) */
  password?: string;
}

export interface ServerConfig extends ServerAuth {
  /** 主机名或 IP */
  host: string;
  /** SSH 端口，默认 22 */
  port?: number;
  /** 用户名，默认 root */
  username?: string;
}

export interface SSHToolConfig {
  /** 服务器列表，键为别名 */
  servers: Record<string, ServerConfig>;
  /** 默认服务器别名 */
  defaultServer?: string;
  /** 全局连接超时 (毫秒)，默认 10000 */
  timeoutMs?: number;
}

export interface ExecResult {
  /** 退出码，-1 表示信号导致退出 */
  code: number;
  stdout: string;
  stderr: string;
}

export interface ConnectOptions {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  keyFile?: string;
  keyPassphrase?: string;
  /** 连接超时 (毫秒)，默认 10000 */
  timeoutMs?: number;
}
