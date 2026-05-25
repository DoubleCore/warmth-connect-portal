# MEMORY

> 论文部署官的长期记忆。包含部署路由表、关键架构决策、后端 API 索引。
> 接到部署任务时**先查这里**，再决定调用哪个 skill。

## 〇、关键架构决策（先看这里）

### 飞书表格 → 内置后端数据库（已废弃 lark-cli）

- **所有飞书多维表格操作已废弃**，不再使用 lark-cli 操作飞书
- 数据存储改为**内置后端 SQLite 数据库**，通过后端 REST API 读写
- 后端地址：`http://localhost:8787`（确认可用，8200 不通）
- 后端项目路径：`F:\Hermes\warmth-connect-portal\backend\`
- 后端框架：Hono + Drizzle ORM + SQLite
- 原来通过 lark-cli bitable 做的事情（补代码库、写复现指标、写修改记录等），现在全部走后端 API

### 数据库表结构（SQLite, Drizzle ORM）

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `papers` | 论文基础信息 | id, title, authorsJson, abstract, field, source, publishedYear, paperUrl, pdfUrl, **repoUrl**, pdfStoragePath |
| `paper_analysis` | 论文结构化分析 | id, paperId, taskDefinition, researchQuestions, methodOverview, metrics, conclusion, notes |
| `devices` | 设备管理 | id, name, deviceType, status(idle/running/offline/error), location, description |
| `paper_reproduction_records` | 复现记录 | id, paperId, deviceId, status, progress(0-100), resultSummary, artifactUrl, **trainingNotes**, startedAt, finishedAt |
| `rag_papers` | RAG 知识库 | id(auto), title, abstract, authorsJson, venue |
| `rag_paper_embeddings` | 向量缓存 | paperId, embeddingText, embeddingJson, embeddingModel |
| `commands` | 指令记录 | id, sessionId, userMessage, status, contextJson, hermesRunId, resultJson, errorJson |
| `command_events` | 指令事件流 | id, commandId, eventType, payloadJson |
| `host_credentials` | 主机 SSH 凭证 | deviceId, host, port, username, password(加密), hostLabel |
| `host_metrics_snapshot` | 主机状态快照 | deviceId, gpu/cpu/mem/disk, status, capturedAt |

### 字段映射（飞书 → 后端，仅供历史参照）

| 飞书字段 | 后端字段 | 所在表 |
|----------|----------|--------|
| 标题 | title | papers |
| 代码库 | repoUrl | papers |
| 原链接 | paperUrl | papers |
| 地址(PDF附件) | pdfStoragePath / pdfUrl | papers |
| 复现指标 | resultSummary | paper_reproduction_records |
| 训练修改记录 | trainingNotes | paper_reproduction_records |
| 训练机箱 | device.name (via deviceId) | devices + paper_reproduction_records |
| 训练方式 | trainingMethod 字段或 trainingNotes 内记录 | paper_reproduction_records |

## 一、部署路由表

用户语义 → 调用哪个 skill：

| 用户说什么 | 路由到 | 触发动作 |
|------------|--------|---------|
| "本地"、"实验室"、"3090/4090/A6000"、"Tailscale" | **local-gpu-deploy** | SSH 到本地机箱，按 `~/LHL/<project>/` 标准目录部署 |
| "云端"、"蓝耘"、"lanyun"、"租台 GPU"、"按量计费" | **browser-cloud-lanyun** | Playwright + lanyun API 下单 → 同步后端 |
| 部署中遇到 PyTorch 版本/HuggingFace 下载/uv 超时/numpy 冲突 | **gpu-deploy-pitfalls** | 查踩坑速查表对应条目 |
| "我的机箱状态怎样"（云端 / 本地 / 都查） | 后端 host-tracking API | `GET /api/host-tracking/hosts` 现查 |
| 用户没说本地还是云端 | **必须问清** | 不要默认猜 |
| 回填代码库 / 写入论文 repoUrl | **backend-repo-backfill** | `PATCH /api/papers/<id>` |
| 写入复现指标 / 训练修改记录 | **backend-reproduction-tracker** | `POST/PATCH /api/reproduction-records` |

辅助 skill：

| skill | 何时用 |
|-------|--------|
| paper-code-finder | 论文有 paperId 但没 repoUrl 时，先找代码仓库 |
| paper-repo-search-methods | repo 找到但要确认有训练脚本/复现说明 |
| slr-paper-reproduction-setup | 手语识别（SLR）类论文的标准化复现 |

> ⚠️ 历史 skill `larkcli-bitable-repo-backfill` 与 `larkcli-bitable-reproduction-tracker` 已废弃，不再调用。

## 二、后端 API 端点速查

**论文（papers）**
- `GET    /api/papers` — 列表（支持 keyword/field/source/year 筛选 + 分页）
- `POST   /api/papers` — 创建
- `GET    /api/papers/:paperId/detail` — 详情（含 analysis）
- `PATCH  /api/papers/:paperId` — 更新（含 repoUrl）
- `DELETE /api/papers/:paperId` — 删除
- `PATCH  /api/papers/:paperId/analysis` — 更新分析
- `POST   /api/papers/:paperId/pdf` — 上传 PDF
- `GET    /api/papers/:paperId/pdf` — 获取 PDF

**设备（devices）**
- `GET    /api/devices` — 列表
- `POST   /api/devices` — 创建
- `PATCH  /api/devices/:deviceId` — 更新状态
- `DELETE /api/devices/:deviceId` — 删除

**复现记录（reproduction-records）**
- `GET    /api/reproduction-records` — 列表
- `POST   /api/reproduction-records` — 创建
- `PATCH  /api/reproduction-records/:recordId` — 更新（progress/status/resultSummary/trainingNotes/artifactUrl）
- `DELETE /api/reproduction-records/:recordId` — 删除

**主机追踪（host-tracking）**
- `GET    /api/host-tracking/hosts` — 列出所有主机（含最新状态快照）
- `GET    /api/host-tracking/hosts/:deviceId` — 单台主机详情（含 SSH 凭据）
- `GET    /api/host-tracking/hosts/:deviceId/metrics` — 历史指标
- `POST   /api/host-tracking/hosts/:deviceId/probe` — 手动触发一次状态采集
- `POST   /api/host-tracking/hosts` — **创建/绑定主机 SSH 凭证**（见第七节）

后端每分钟自动通过 SSH 采集一次 GPU/CPU/内存/磁盘状态，数据存入 `host_metrics_snapshot`。

## 三、机箱清单出处

**唯一权威源 = 后端 API**（不是任何文件、不是记忆、不是对话历史）

```bash
# 列出全部主机
curl -s http://localhost:8787/api/host-tracking/hosts | jq

# 单台主机详情（含 SSH 凭据）
curl -s http://localhost:8787/api/host-tracking/hosts/<deviceId> | jq
```

汇总查询时按 `deviceType` 或 `location` 字段分组（云端 / 本地）给用户。

## 四、用户偏好

- 默认中文，命令/路径/报错保留英文原文
- 不喜欢被绕弯子：本地还是云端要先问清，不要默认猜
- 破坏性操作（rm / kill / 释放实例）必须先确认
- 卡住要直接说卡在哪，不要静默换方案

## 五、跨任务上下文（每次部署后追加在这里）

> 格式：`YYYY-MM-DD | paperId | 部署到哪台机器 | 状态 | 关键备注`

### 蓝耘云 GPU 实例（2026-05-21 实战记录）

**完整订阅流程**（从零到实例运行，已验证）：
1. 安装 Playwright：`cd ~/Desktop/workspace && npm init -y && npm install playwright && npx playwright install chromium`
2. 创建凭据文件：`~/.openclaw/workspace/knowledge/cloud-credentials.json`
3. 首次登录 + 导出 cookies：见 skill `auth-persistence.md`
4. 账号绑定邮箱+设置密码（否则下单报错）
5. 充值余额（至少 ¥2.30，1小时费用）
6. API 下单流程（3 步，见 `api-reference.md`）：
   - `POST /api/d/dev/list` → 获取可用主机
   - `POST /api/orders/dockerPlaceOrderCheck` → 订单检查
   - `POST /api/orders/dockerPlaceOrder` → 下单
7. `GET /api/d/user_ins/list` → 获取 SSH 凭据（明文！）
8. paramiko SSH 连接 → 部署代码 → 跑训练
9. 同步后端：创建 device + reproduction-record + 绑定 host credential

**当前实例**：

| 项目 | 值 |
|------|-----|
| 订单号 | DC202605210017 |
| 实例编号 | LY2026052100022 |
| 主机编号 | GS-t2web |
| GPU | RTX 4090 6152 × 1 (24GB) |
| 计费 | 按量 ¥2.30/小时 |
| SSH | root@qhdlink.lanyun.net:12528 |
| JupyterLab | http://qhdlink.lanyun.net:12529/lab?token=db0e17f0b60a406e9119eb2aa50cf13f |
| 后端设备ID | 0e7ed361-a424-420d-8f52-6d86453197ff |
| 后端复现记录ID | 7f91c230-83b0-474b-8a3c-3612855982a4 |

**关键踩坑**（详见 skill `bugs-and-fixes.md` P15-P27）：
- camoufox-cli 在 Windows 上 5 秒 daemon 超时，100% 失败 → 用 Playwright
- cloud.lanyun.net Vue 2 SPA 的 DOM click 无法触发状态更新 → 用 API
- 订单 check 和下单的字段名不一致（hostId vs hostDevId, imgId vs imageId）
- page.evaluate 中不能引用外部变量，必须通过参数传入
- Windows 没有 sshpass → 用 Python paramiko
- 余额不足报 code=80000 → 下单前先查余额

## 六、SSH 连接方式（重要）

**所有机箱一律使用密码登录，不使用密钥认证。**

### Windows 环境（没有 sshpass，用 Python paramiko）

```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('host', port=port, username='root', password='pwd', timeout=15)
stdin, stdout, stderr = ssh.exec_command('command')
print(stdout.read().decode())
ssh.close()
```

### Linux/WSL 环境

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <用户名>@<IP>
```

如果目标机器没有 sshpass：`sudo apt-get install -y sshpass`

### 凭据获取

- 主机 IP / 用户名 / 密码 / 端口：`GET /api/host-tracking/hosts/<deviceId>` 现查，不要硬编码
- 部署任务的 system prompt 也会动态注入凭据
- 不要尝试用 SSH 密钥连接，所有机器都未配置 authorized_keys
- 连接时加 `-o StrictHostKeyChecking=no` 避免首次连接确认提示

## 七、创建设备后必须绑定 SSH 凭证

创建设备（`POST /api/devices`）后，**必须立即调用凭证绑定 API**，否则部署会报 `HostCredential not found`。

### 凭证绑定 API

```http
POST http://localhost:8787/api/host-tracking/hosts
Content-Type: application/json

{
  "deviceId": "<刚创建的 device id>",
  "host": "<目标机器 IP>",
  "port": 22,
  "username": "<SSH 用户名>",
  "password": "<SSH 密码>",
  "hostLabel": "<设备标签，如 RTX 3090>"
}
```

### 注意事项

- 具体的 IP、用户名、密码根据实际机器填写，**不要硬编码**
- 如果用户没提供这些信息，必须先问清楚再创建
- 凭证 = IP + 端口 + 用户名 + 密码，缺一不可
- 密码会被后端自动加密存储，API 返回时不会暴露密码
- **创建设备和绑定凭证是两步**，都要做：
  1. `POST /api/devices` → 拿到 deviceId
  2. `POST /api/host-tracking/hosts` → 用 deviceId 绑定 SSH 凭证
