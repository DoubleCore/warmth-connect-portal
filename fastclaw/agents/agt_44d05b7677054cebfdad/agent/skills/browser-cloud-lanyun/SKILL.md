---
name: browser-cloud-lanyun
version: 7.0.0
description: 蓝耘服务器租用与机箱调度。通过 Playwright/API 自动化下单蓝耘云GPU，SSH 凭据写进本地 inventory 文件，再用一个 bash 扫描脚本每分钟 SSH 探活并把 GPU/CPU/磁盘 快照刷回同一份 inventory。支持 Hermes 后端同步。已验证完整下单流程（2026-05-21）。
---

# 蓝耘服务器租用与机箱调度 🔐📟

通过 Playwright + API 自动化采购蓝耘云 GPU 实例，把实例的 SSH 凭据和元数据写进本机 JSON inventory，由一个 bash 扫描脚本定时 SSH 所有实例刷新指标。同时支持同步到 Hermes 后端的 devices 和 reproduction-records 表。

## 触发条件

- "蓝耘"、"lanyun"、"云服务器"、"GPU 租用"、"租用实例"
- "机箱管理"、"机箱调度"、"同步机箱状态"、"扫描机箱"
- 需要创建/管理云实例、SSH 连接远程 GPU、把新买的机器纳管到本地清单

## 核心原理

```
┌────────── 用户本机 ──────────┐
│                              │
│  Playwright + API 直调       │  ← 登录/下单/查询实例（API 优先）
│      ↓ 把 SSH 凭据抄写进      │
│                              │
│  lanyun-inventory.json       │  ← 机箱清单（SSH creds + 指标快照）
│      ↑ cron 每分钟更新        │
│                              │
│  scan-lanyun.sh              │  ← bash 脚本，读 inventory → 逐台 SSH → 写回
│                              │
│  Hermes 后端 (可选)           │  ← devices + reproduction-records 同步
│                              │
└──────────────────────────────┘
                ↕ SSH (paramiko on Windows)
┌──── 蓝耘容器实例（N 台）────┐
│  nvidia-smi / /proc/uptime   │
│  free -m / df -BG /          │
└──────────────────────────────┘
```

## ⚠️ 关键架构认知（必读）

蓝耘是**跨域微前端**架构：
- `console.lanyun.net` — 控制台首页（账号信息、余额、导航入口）
- `cloud.lanyun.net` — 容器云市场（创建实例、实例管理、下单）

**前端操作不可靠**：cloud.lanyun.net 是 Vue 2 SPA，Playwright/camoufox 的 DOM click 无法可靠触发 Vue 内部状态更新（radio/checkbox/表格行选择全部失效）。

**必须用 API 直调**：所有操作通过 `cloud.lanyun.net` 的 REST API 完成，在 Playwright 的 `page.evaluate()` 中调用以绕过 CORS。完整 API 文档见 `api-reference.md`。

## 浏览器工具选择

| 工具 | 状态 | 用途 |
|------|------|------|
| **Playwright** | ✅ 推荐 | 登录、cookies 管理、API 调用载体 |
| camoufox-cli | ❌ Windows 不可用 | daemon 5 秒硬编码超时，浏览器下载常失败 |

Playwright 安装：
```bash
cd ~/Desktop/workspace && npm init -y && npm install playwright && npx playwright install chromium
```

## SSH 连接方案（Windows）

Windows 没有 sshpass，不能直接 `ssh -p port user@host` 传密码。使用 Python paramiko：

```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('qhdlink.lanyun.net', port=12528, username='root', password='xxx', timeout=15)
stdin, stdout, stderr = ssh.exec_command('your command here')
print(stdout.read().decode())
ssh.close()
```

## 端到端流程（已验证 2026-05-21）

### Step 0 — 前置条件检查

1. **账号必须绑定邮箱+设置密码**，否则下单报"下单需要设置密码和邮箱"
2. 未实名不影响购买（`requireRealAuth: false`）
3. 确认 `cloud-credentials.json` 存在且有正确账密
4. 确认 Playwright + Chromium 已安装
5. **确认余额充足**（至少 ¥2.30，即1小时费用）

### Step 1 — 登录并持久化认证

按 `auth-persistence.md` 完成首次登录，导出 cookies + localStorage。后续操作无需重新登录。

```javascript
// 使用持久化认证
const { createAuthenticatedPage } = require('~/.openclaw/workspace/knowledge/lanyun-auth.js');
const { browser, page } = await createAuthenticatedPage();
```

### Step 2 — 通过 API 创建实例 ⭐

**不要尝试前端 UI 操作**，直接按 `api-reference.md` 的完整下单流程调用 API：

1. `POST /api/d/dev/list` — 查询可用主机
2. `POST /api/orders/dockerPlaceOrderCheck` — 订单检查（字段：`hostId`/`imgId`/`imgType`）
3. `POST /api/orders/dockerPlaceOrder` — 下单（字段：`hostDevId`/`imageId`/`imageType`）

⚠️ **page.evaluate 中不能直接引用外部变量！** 必须通过参数对象传入：
```javascript
// ❌ 错误：host 变量在 evaluate 内不可见
const res = await page.evaluate(async () => {
  const r = await fetch('/api/orders/dockerPlaceOrder', { body: JSON.stringify({ hostDevId: host.id }) });
  return r.json();
});

// ✅ 正确：通过参数传入
const res = await page.evaluate(async ({h, hostDevId}) => {
  const r = await fetch('/api/orders/dockerPlaceOrder', { method: 'POST', headers: h, body: JSON.stringify({ hostDevId }) });
  return r.json();
}, {h: headers, hostDevId: host.id});
```

### Step 3 — 获取 SSH 凭据

下单成功后，通过实例列表 API 直接获取明文 SSH 凭据：

```javascript
const insRes = await page.evaluate(async (h) => {
  const r = await fetch('/api/d/user_ins/list?pageNum=1&pageSize=10&search=&runStatus=&payType=', { headers: h });
  return r.json();
}, headers);
const instance = insRes.data[0]; // 最新的实例
// instance.sshAddr, .sshPort, .sshAccount, .sshPwd 全是明文
```

### Step 4 — 写入 inventory 和后端

1. 用 jq 追加到 `lanyun-inventory.json`（见 `terminal-sync.md`）
2. `POST /api/devices` — 创建设备记录到 Hermes 后端
3. `POST /api/reproduction-records` — 创建复现记录

### Step 5 — SSH 连接部署（paramiko）

```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(instance['sshAddr'], port=instance['sshPort'], 
            username=instance['sshAccount'], password=instance['sshPwd'], timeout=15)
# 执行部署命令...
ssh.close()
```

### Step 6 — 启动扫描调度器（一次性设置）

按 `terminal-sync.md` §四 配置定时扫描。

### Step 7 — 释放实例

1. API 调用释放
2. inventory 写 `released_at`
3. Hermes 后端 `PATCH device → status=idle`

## 子文件索引

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| **`api-reference.md`** | **蓝耘 API 逆向文档（端点、参数、字段名、错误码、实战记录）** | **创建实例时必读** |
| **`auth-persistence.md`** | **Playwright 登录态持久化方案** | **首次登录或 cookies 过期时** |
| `terminal-sync.md` | inventory JSON 结构、scan-lanyun.sh 完整脚本、cron 配置 | 采购后写入清单、排查同步问题时 |
| `ssh-and-remote.md` | SSH 凭据获取、连接模板、容器环境、pip 踩坑 | 需要连接或操作远程服务器时 |
| `console-ops.md` | 控制台导航、实例管理、余额费用 | 需要操作蓝耘控制台时 |
| `bugs-and-fixes.md` | 踩坑记录 + 故障排除速查表 | 遇到问题排查时 |
| `checklist.md` | 采购/释放/扩展 checklist + 当前实例表 | 操作前对照 |

## 凭据文件

- **平台账号**：`~/.openclaw/workspace/knowledge/cloud-credentials.json`
- **登录态**：`~/.openclaw/workspace/knowledge/lanyun-cookies.json` + `lanyun-localstorage.json`
- **实例 SSH 密码**：`lanyun-inventory.json` 的 `sshPwd` 字段
- 所有文件在 `~/.openclaw/workspace/knowledge/`，**不进 git 仓库**

## 责任分工

| 触发点 | 谁负责 | 动作 |
|--------|--------|------|
| 用户说"买台 4090" | 本 skill | Playwright 登录 → API 下单 → 写入 inventory + 后端 |
| 用户说"我的机箱现在什么状态" | 本 skill | `jq` 查询 inventory |
| 每分钟状态刷新 | cron / Task Scheduler | 调用 `scan-lanyun.sh` |
| 用户说"这台机子卡了" | 本 skill | paramiko SSH 登上去看，手动刷一次 scan 更新 |
| 用户说"释放掉" | 本 skill | API 释放 → inventory 写 `released_at` → Hermes 后端同步 |
