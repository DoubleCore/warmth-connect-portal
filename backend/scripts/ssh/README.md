# SSH 工具集

后端 TypeScript 实现的 SSH 工具，跟 backend 共用 `package.json` 和 `tsx`。
基于 [`ssh2`](https://github.com/mscdex/ssh2)，跨平台 (Windows / Linux / macOS) 行为一致。

## 安装

依赖已合并到 `backend/package.json`。在 `backend/` 目录下执行：

```bash
npm install
```

## 使用模式

工具支持两种模式，**任选其一**：

### 模式 1：直连（无需配置文件，AI/快速使用首选）

```bash
# 密码 + 执行命令
npm run ssh -- -i 192.168.1.100 -u root -p mypass exec "ls -la /var/log"

# 密钥 + 交互式 Shell
npm run ssh -- -i 10.0.0.5 -u deploy -k ~/.ssh/id_rsa connect

# 自定义端口
npm run ssh -- -i 10.0.0.5 -P 2222 -u admin -p pass exec "df -h"

# 上传文件
npm run ssh -- -i 192.168.1.100 -u root -p pass upload ./app.tar.gz /opt/app/

# 测试连接
npm run ssh -- -i 192.168.1.100 -u root -p pass test
```

| 参数                  | 说明                  | 默认  |
| --------------------- | --------------------- | ----- |
| `-i` `--ip` `--host`  | 目标 IP 或主机名      | 必填  |
| `-P` `--port`         | SSH 端口              | 22    |
| `-u` `--user`         | 用户名                | root  |
| `-p` `--password`     | 密码                  | -     |
| `-k` `--key`          | 私钥文件路径 (可用 ~) | -     |
| `--key-passphrase`    | 私钥密码              | -     |
| `-t` `--timeout`      | 连接超时 (ms)         | 10000 |

### 模式 2：配置文件（多服务器，常用环境）

```bash
# 1. 创建配置
copy scripts\ssh\config.example.yaml scripts\ssh\config.yaml
notepad scripts\ssh\config.yaml      # 填入真实服务器信息

# 2. 使用
npm run ssh:list                                    # 列出服务器
npm run ssh:test                                    # 测试所有连接
npm run ssh -- -s production exec "systemctl status app"
npm run ssh -- -s dev connect
```

## 子命令

```
npm run ssh -- [连接参数] <子命令> [参数]

list                        列出已配置的服务器（仅配置模式）
test                        测试连接
connect                     进入交互式 Shell
exec  <命令...>             执行单条命令
upload   <本地> <远程>      上传文件
download <远程> <本地>      下载文件
deploy   -f <file> -r <remotePath> --restart-cmd "..."   上传并重启
```

### 交互式 Shell 内置命令

```
help                       帮助
exit / quit                退出
!info                      连接信息
!upload <local> <remote>   上传
!download <remote> <local> 下载
```

## 在 backend 代码中复用

工具被设计成 ESM 模块，可在 `src/` 中直接 import：

```ts
import { SSHClient } from "../scripts/ssh/ssh-client.js";
import { SSHManager } from "../scripts/ssh/ssh-manager.js";
import { SSHTunnel, createTunnel } from "../scripts/ssh/tunnel.js";

// 直连
const client = new SSHClient({
  host: "192.168.1.100",
  username: "root",
  password: "pass",
});
await client.connect();
const { code, stdout, stderr } = await client.exec("docker ps");
client.disconnect();

// 多服务器
const mgr = new SSHManager();
await mgr.load();
const result = await mgr.execOn("production", "uptime");
mgr.closeAll();

// 端口转发：把远程 MySQL 3306 映射到本地 13306
const t = await createTunnel(client, {
  remoteHost: "db-internal",
  remotePort: 3306,
  localPort: 13306,
});
console.log(t.describe());  // "127.0.0.1:13306 -> db-internal:3306"
// ... 业务用 localhost:13306 ...
await t.stop();
```

## 文件结构

```
backend/scripts/ssh/
├── cli.ts                  # CLI 入口
├── ssh-client.ts           # 单连接 (exec / sudo / sftp)
├── ssh-manager.ts          # 多服务器 + 配置加载
├── tunnel.ts               # 本地端口转发
├── types.ts                # 公共类型
├── config.example.yaml     # 配置示例
└── README.md
```

## 安全提示

- `config.yaml` 已加入 `.gitignore`，不会进 Git
- 推荐 SSH 密钥认证，避免明文密码
- 命令行密码会进 shell history；敏感场景请用密钥或配置文件
- 工具采取"信任并继续"策略 (类似 paramiko `AutoAddPolicy`)，生产环境严格校验请用 `hostVerifier`

## 常见问题

**Q: `npm install` 后 ssh2 报 native 编译错误？**
ssh2 v1.x 默认使用纯 JS 实现，无需编译。如出现 `cpu-features` 警告可忽略，是可选优化模块。

**Q: 连接超时？**
- 检查防火墙是否开放 SSH 端口
- 确认 IP/端口正确
- 增大 `-t` 或配置中的 `timeoutMs`

**Q: 密钥认证失败？**
- 确认密钥路径正确 (支持 `~` 展开)
- 确认公钥已在服务器 `~/.ssh/authorized_keys`
- 密钥有密码时设置 `--key-passphrase` 或 `keyPassphrase`

**Q: 想让 Claude/Kiro 直接调用？**
直连模式最方便，一行搞定：
```bash
npm run ssh -- -i 192.168.1.100 -u root -p pass exec "命令"
```
