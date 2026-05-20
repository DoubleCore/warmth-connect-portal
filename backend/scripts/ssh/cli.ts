#!/usr/bin/env node
/**
 * SSH CLI 工具入口
 *
 * 两种模式：
 *
 * 模式 1: 直连 (无需配置文件)
 *   tsx cli.ts -i 192.168.1.100 -u root -p pass exec "ls -la"
 *   tsx cli.ts -i 10.0.0.5 -u deploy -k ~/.ssh/id_rsa connect
 *
 * 模式 2: 配置文件 (多服务器)
 *   tsx cli.ts list
 *   tsx cli.ts -s production exec "uptime"
 *
 * 子命令: list / test / connect / exec / upload / download / deploy
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { SSHClient } from "./ssh-client.js";
import { SSHManager } from "./ssh-manager.js";
import type { ConnectOptions, ExecResult } from "./types.js";

// ============================================================
// 参数解析 (轻量手写，避免引入额外依赖)
// ============================================================

interface ParsedArgs {
  // 直连参数
  ip?: string;
  port: number;
  user?: string;
  password?: string;
  key?: string;
  keyPassphrase?: string;
  timeoutMs: number;
  // 配置参数
  config?: string;
  server?: string;
  // 子命令
  action?: string;
  // deploy 子命令参数
  deployFile?: string;
  remotePath?: string;
  restartCmd?: string;
  // 位置参数
  positional: string[];
}

const HELP = `
SSH 工具 — Warmth Connect Portal 后端运维

用法:
  tsx scripts/ssh/cli.ts [连接参数] <子命令> [参数...]
  npm run ssh -- [连接参数] <子命令> [参数...]

连接参数 (直连模式，覆盖配置文件):
  -i, --ip, --host <IP>        目标主机
  -P, --port <port>            SSH 端口 (默认 22)
  -u, --user <user>            用户名 (默认 root)
  -p, --password <pass>        密码
  -k, --key <path>             私钥文件路径
      --key-passphrase <pass>  私钥密码
  -t, --timeout <ms>           连接超时毫秒 (默认 10000)

配置文件模式:
  -c, --config <path>          配置文件路径 (默认 scripts/ssh/config.yaml)
  -s, --server <name>          服务器别名 (来自配置)

子命令:
  list                         列出所有配置的服务器
  test                         测试连接
  connect                      进入交互式 Shell
  exec <cmd...>                执行单条命令
  upload <local> <remote>      上传文件
  download <remote> <local>    下载文件
  deploy [-f file] [-r path] [--restart-cmd "..."]   快速部署

示例:
  tsx cli.ts -i 192.168.1.100 -u root -p pass exec "uname -a"
  tsx cli.ts -i 10.0.0.5 -u deploy -k ~/.ssh/id_rsa connect
  tsx cli.ts -s production exec "systemctl status app"
  tsx cli.ts list
`;

const SUBCOMMANDS = new Set(["list", "test", "connect", "exec", "upload", "download", "deploy"]);

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    port: 22,
    timeoutMs: 10_000,
    positional: [],
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) break;

    // 子命令一旦遇到，后面所有都是位置参数 (除了 deploy 的 -f/-r/--restart-cmd)
    if (SUBCOMMANDS.has(arg) && out.action === undefined) {
      out.action = arg;
      i++;
      // 收集子命令的剩余参数
      while (i < argv.length) {
        const next = argv[i];
        if (next === undefined) break;
        // deploy 子命令的特殊参数
        if (out.action === "deploy") {
          if (next === "-f" || next === "--file") {
            out.deployFile = argv[++i];
            i++;
            continue;
          }
          if (next === "-r" || next === "--remote-path") {
            out.remotePath = argv[++i];
            i++;
            continue;
          }
          if (next === "--restart-cmd") {
            out.restartCmd = argv[++i];
            i++;
            continue;
          }
        }
        out.positional.push(next);
        i++;
      }
      break;
    }

    switch (arg) {
      case "-i":
      case "--ip":
      case "--host":
        out.ip = argv[++i];
        break;
      case "-P":
      case "--port": {
        const v = argv[++i];
        if (v) out.port = Number.parseInt(v, 10);
        break;
      }
      case "-u":
      case "--user":
        out.user = argv[++i];
        break;
      case "-p":
      case "--password":
        out.password = argv[++i];
        break;
      case "-k":
      case "--key":
        out.key = argv[++i];
        break;
      case "--key-passphrase":
        out.keyPassphrase = argv[++i];
        break;
      case "-t":
      case "--timeout": {
        const v = argv[++i];
        if (v) out.timeoutMs = Number.parseInt(v, 10);
        break;
      }
      case "-c":
      case "--config":
        out.config = argv[++i];
        break;
      case "-s":
      case "--server":
        out.server = argv[++i];
        break;
      case "-h":
      case "--help":
        out.action = "help";
        break;
      default:
        // 未知参数：作为位置参数收集
        out.positional.push(arg);
        break;
    }
    i++;
  }

  return out;
}

// ============================================================
// 客户端工厂：直连优先于配置文件
// ============================================================

interface Resource {
  client: SSHClient;
  cleanup: () => void;
  label: string;
}

async function buildClient(args: ParsedArgs): Promise<Resource> {
  // 直连模式
  if (args.ip) {
    const opts: ConnectOptions = {
      host: args.ip,
      port: args.port,
      username: args.user,
      timeoutMs: args.timeoutMs,
    };
    if (args.password) opts.password = args.password;
    if (args.key) opts.keyFile = args.key;
    if (args.keyPassphrase) opts.keyPassphrase = args.keyPassphrase;

    const client = new SSHClient(opts);
    await client.connect();
    return {
      client,
      cleanup: () => client.disconnect(),
      label: `${args.user ?? "root"}@${args.ip}`,
    };
  }

  // 配置文件模式
  const mgr = new SSHManager(args.config);
  await mgr.load();
  const serverName = args.server ?? mgr.defaultServer;
  const client = await mgr.getClient(serverName);
  return {
    client,
    cleanup: () => mgr.closeAll(),
    label: serverName,
  };
}

// ============================================================
// 子命令实现
// ============================================================

async function cmdList(args: ParsedArgs): Promise<number> {
  const mgr = new SSHManager(args.config);
  await mgr.load();
  const cfg = mgr.getConfig();
  console.log("");
  console.log("=".repeat(50));
  console.log(` 已配置的服务器 (默认: ${mgr.defaultServer})`);
  console.log("=".repeat(50));
  for (const name of mgr.serverNames) {
    const srv = cfg.servers[name];
    if (!srv) continue;
    const auth = srv.keyFile ? "key" : srv.password ? "password" : "none";
    const marker = name === mgr.defaultServer ? " ★" : "";
    const port = srv.port ?? 22;
    const user = srv.username ?? "root";
    console.log(`  ${name.padEnd(15)} ${user}@${srv.host}:${port}  [${auth}]${marker}`);
  }
  console.log("");
  return 0;
}

async function cmdTest(args: ParsedArgs): Promise<number> {
  // 直连模式：测单个
  if (args.ip) {
    console.log(`\n测试 ${args.user ?? "root"}@${args.ip}:${args.port} ...`);
    try {
      const r = await buildClient(args);
      const result = await r.client.exec("echo ok");
      if (result.code === 0) {
        console.log("  ✓ 连接正常");
      } else {
        console.log(`  ✗ 连接异常 (exit=${result.code})`);
      }
      r.cleanup();
      return 0;
    } catch (err) {
      console.log(`  ✗ 失败: ${(err as Error).message}`);
      return 1;
    }
  }

  // 配置模式：测全部
  const mgr = new SSHManager(args.config);
  await mgr.load();
  console.log(`\n测试 ${mgr.serverNames.length} 台服务器连接...\n`);
  for (const name of mgr.serverNames) {
    try {
      const client = await mgr.getClient(name);
      const result = await client.exec("echo ok");
      if (result.code === 0 && result.stdout.includes("ok")) {
        console.log(`  ✓ ${name.padEnd(15)} 连接正常`);
      } else {
        console.log(`  ✗ ${name.padEnd(15)} 连接异常 (exit=${result.code})`);
      }
    } catch (err) {
      console.log(`  ✗ ${name.padEnd(15)} 失败: ${(err as Error).message}`);
    }
  }
  mgr.closeAll();
  console.log("");
  return 0;
}

async function cmdExec(args: ParsedArgs): Promise<number> {
  const command = args.positional.join(" ").trim();
  if (!command) {
    console.error("错误: 请提供要执行的命令");
    return 1;
  }
  const r = await buildClient(args);
  try {
    console.log(`[${r.label}] $ ${command}`);
    console.log("-".repeat(40));
    const res = await r.client.exec(command);
    if (res.stdout) process.stdout.write(res.stdout);
    if (!res.stdout.endsWith("\n") && res.stdout) process.stdout.write("\n");
    if (res.stderr) process.stderr.write(res.stderr);
    console.log(`--- exit: ${res.code} ---`);
    return res.code;
  } finally {
    r.cleanup();
  }
}

async function cmdConnect(args: ParsedArgs): Promise<number> {
  const r = await buildClient(args);
  console.log(`\n✓ 已连接到 ${r.label} (${r.client.target})`);
  console.log("=".repeat(50));
  console.log("  输入命令执行 | 'exit' 退出 | 'help' 查看帮助");
  console.log("=".repeat(50));

  // 显示系统信息
  try {
    const sysInfo = await r.client.exec("uname -a 2>/dev/null || ver");
    if (sysInfo.code === 0 && sysInfo.stdout.trim()) {
      console.log(`  系统: ${sysInfo.stdout.trim().slice(0, 80)}\n`);
    }
  } catch {
    // 忽略系统信息获取失败
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      let line: string;
      try {
        line = await rl.question(`(${r.label}) $ `);
      } catch {
        console.log("\n退出");
        break;
      }
      const cmd = line.trim();
      if (!cmd) continue;
      if (cmd === "exit" || cmd === "quit" || cmd === "q") break;

      if (cmd === "help") {
        console.log(`
  内置命令:
    help                       显示此帮助
    exit / quit                退出
    !info                      显示连接信息
    !upload <local> <remote>   上传文件
    !download <remote> <local> 下载文件
`);
        continue;
      }

      if (cmd === "!info") {
        console.log(`  ${r.client.target}  [${r.client.isConnected ? "已连接" : "已断开"}]`);
        continue;
      }

      if (cmd.startsWith("!upload ")) {
        const parts = cmd.split(/\s+/);
        if (parts.length === 3 && parts[1] && parts[2]) {
          try {
            await r.client.uploadFile(parts[1], parts[2]);
            console.log(`  ✓ 上传成功`);
          } catch (err) {
            console.log(`  ✗ 上传失败: ${(err as Error).message}`);
          }
        } else {
          console.log("  用法: !upload <本地路径> <远程路径>");
        }
        continue;
      }

      if (cmd.startsWith("!download ")) {
        const parts = cmd.split(/\s+/);
        if (parts.length === 3 && parts[1] && parts[2]) {
          try {
            await r.client.downloadFile(parts[1], parts[2]);
            console.log(`  ✓ 下载成功`);
          } catch (err) {
            console.log(`  ✗ 下载失败: ${(err as Error).message}`);
          }
        } else {
          console.log("  用法: !download <远程路径> <本地路径>");
        }
        continue;
      }

      // 执行远程命令
      try {
        const res: ExecResult = await r.client.exec(cmd);
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stdout && !res.stdout.endsWith("\n")) process.stdout.write("\n");
        if (res.stderr) process.stderr.write(res.stderr);
        if (res.code !== 0) console.log(`(exit: ${res.code})`);
      } catch (err) {
        console.log(`  ✗ 执行失败: ${(err as Error).message}`);
      }
    }
  } finally {
    rl.close();
    r.cleanup();
  }
  return 0;
}

async function cmdUpload(args: ParsedArgs): Promise<number> {
  const local = args.positional[0];
  const remote = args.positional[1];
  if (!local || !remote) {
    console.error("用法: upload <本地路径> <远程路径>");
    return 1;
  }
  const r = await buildClient(args);
  try {
    await r.client.uploadFile(local, remote);
    console.log(`✓ 已上传到 [${r.label}]:${remote}`);
    return 0;
  } finally {
    r.cleanup();
  }
}

async function cmdDownload(args: ParsedArgs): Promise<number> {
  const remote = args.positional[0];
  const local = args.positional[1];
  if (!remote || !local) {
    console.error("用法: download <远程路径> <本地路径>");
    return 1;
  }
  const r = await buildClient(args);
  try {
    await r.client.downloadFile(remote, local);
    console.log(`✓ 已下载到 ${local}`);
    return 0;
  } finally {
    r.cleanup();
  }
}

async function cmdDeploy(args: ParsedArgs): Promise<number> {
  const r = await buildClient(args);
  try {
    if (args.deployFile) {
      const remote = args.remotePath ?? "/tmp/deploy";
      console.log(`[1/2] 上传 ${args.deployFile} -> ${remote}`);
      await r.client.uploadFile(args.deployFile, remote);
    } else {
      console.log("[1/2] 跳过上传 (未指定 -f)");
    }

    if (args.restartCmd) {
      console.log(`[2/2] 执行: ${args.restartCmd}`);
      const res = await r.client.exec(args.restartCmd);
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      if (res.code !== 0) {
        console.log(`⚠ 退出码: ${res.code}`);
        return res.code;
      }
    } else {
      console.log("[2/2] 跳过重启 (未指定 --restart-cmd)");
    }
    console.log(`\n✓ [${r.label}] 部署完成`);
    return 0;
  } finally {
    r.cleanup();
  }
}

// ============================================================
// 入口
// ============================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.action || args.action === "help") {
    console.log(HELP);
    process.exit(0);
  }

  const handlers: Record<string, (a: ParsedArgs) => Promise<number>> = {
    list: cmdList,
    test: cmdTest,
    connect: cmdConnect,
    exec: cmdExec,
    upload: cmdUpload,
    download: cmdDownload,
    deploy: cmdDeploy,
  };

  const handler = handlers[args.action];
  if (!handler) {
    console.error(`未知子命令: ${args.action}`);
    console.log(HELP);
    process.exit(1);
  }

  try {
    const code = await handler(args);
    process.exit(code);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`\n✗ ${msg}`);
    if (msg.includes("配置文件不存在")) {
      console.error(
        "\n提示: 直连模式可用 -i/--ip 参数，无需配置文件:\n" +
          '  tsx cli.ts -i 192.168.1.100 -u root -p pass exec "ls"',
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
