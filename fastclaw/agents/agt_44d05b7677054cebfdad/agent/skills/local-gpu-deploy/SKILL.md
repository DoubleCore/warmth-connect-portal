---
name: local-gpu-deploy
description: 本地 GPU 机箱环境部署与训练管理。当需要通过 SSH 在本地 Tailscale 网络中的 GPU 机箱上进行代码部署、环境配置、数据准备和模型训练时使用。触发场景：用户说"部署环境"、"跑实验"、"复现论文"、"SSH到某某机箱"、"检查GPU"、"装依赖"、"开始训练"、"数据集准备"、"软链接"等。
---

# 本地 GPU 机箱部署与训练管理

## 〇、核心原则

1. **卡住必须说** — 不静默换方案绕过，卡住了直接告知用户卡在哪
2. **换方案要说明原理和风险** — 包括为什么换、原理是什么、可能埋什么雷
3. **只在允许范围内操作** — 只动 `~/LHL/` 目录，不碰其他用户的文件和环境
4. **主机信息一律查后端** — 不在本文档硬编码任何主机名、IP、用户名、磁盘容量、密码

## 一、机箱信息来源（唯一权威源 = 后端 API）

**❌ 不要在此文档硬编码主机清单。** 每次部署任务前先查后端：

```bash
# 列出全部主机（含最新状态快照）
curl -sS http://localhost:8787/api/host-tracking/hosts

# 单台主机详情（含 Tailscale IP、用户名、SSH 密码、磁盘容量等）
curl -sS http://localhost:8787/api/host-tracking/hosts/<deviceId>
```

后端返回字段约定：
- `tailscale_ip` — 连接时使用的 IP
- `username` — SSH 用户名
- `password` — SSH 明文密码（只用于 sshpass 一次性传入，不写入任何文件）
- `gpu_info` / `disk_info` / `status` — GPU、磁盘、运行状态快照
- `allowed` 或 `status` — 是否允许 agent 操作

注意事项：
- **允许操作的主机由后端字段决定**，不要凭记忆判断
- **多卡机箱**：`gpu_info` 显示多卡时，训练用 `CUDA_VISIBLE_DEVICES` 指定
- **磁盘信息**：调 API 取 `disk_info`，或目标机器上 `df -h` 现查

## 二、SSH 连接方式（重要 — 必读）

**⚠️ 所有本地机箱一律使用密码登录，禁止使用 SSH 密钥认证。**

### 连接命令模板

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> '<要执行的命令>'
```

### 凭据获取方式

1. 从部署任务的 system prompt 中读取（每次部署会动态注入）
2. 或通过后端 API 查询：`GET http://localhost:8787/api/host-tracking/hosts/<deviceId>`
   返回 JSON 中的 `tailscale_ip` / `username` / `password` 即为连接所需

### 禁止事项

- ❌ **不要执行** `ssh-copy-id`
- ❌ **不要尝试配置** `~/.ssh/authorized_keys`
- ❌ **不要使用** `ssh-keygen` 生成密钥对
- ❌ **不要用裸** `ssh user@host`（会走密钥认证然后失败）
- ❌ **不要建议用户配置公钥**
- ❌ **不要在文档/代码/对话上下文中硬编码 IP、用户名、密码**

### 正确做法

- ✅ 始终用 `sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no ...`
- ✅ 如果目标机器没有 sshpass，先安装：`sudo apt-get install -y sshpass`
- ✅ 凭据每次从 system prompt 或后端 API 现取

## 三、标准部署流程

### Step 1：检查 GPU 可用性

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader'
```

### Step 2：环境准备

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'ls ~/LHL/ && export PATH="$HOME/.local/bin:$PATH" && uv --version'
```

若缺失则安装：

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'mkdir -p ~/LHL && curl -LsSf https://astral.sh/uv/install.sh | sh'
```

### Step 3：代码拉取

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'cd ~/LHL && git clone <repo_url>'
```

### Step 4：依赖安装

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'cd ~/LHL/<project> && export PATH="$HOME/.local/bin:$PATH" && uv venv .venv && source .venv/bin/activate && uv pip install -r requirements.txt'
```

常见问题：
- PyTorch 安装：必须从官网确认对应 CUDA 版本的正确命令
- uv pip 超时：`export UV_HTTP_TIMEOUT=300`
- 系统依赖缺失：`sudo apt install` 后记录

### Step 5：数据准备

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'df -h'
```

软链接示例（具体数据盘路径以 `df -h` 现查为准）：
`ln -s <数据盘>/datasets/<dataset> ~/LHL/<project>/datasets/<dataset>`

### Step 6：跑通验证

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'cd ~/LHL/<project> && source .venv/bin/activate && python train.py --batch_size 1 --epochs 1'
```

## 四、训练管理

### 启动训练（后台运行）

```bash
# nohup 方式
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'cd ~/LHL/<project> && source .venv/bin/activate && nohup python train.py > train.log 2>&1 &'

# tmux 方式（推荐）
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'tmux new -d -s train "cd ~/LHL/<project> && source .venv/bin/activate && python train.py"'
```

### 监控

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'nvidia-smi'
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<IP> 'tail -20 ~/LHL/<project>/train.log'
```

部署完后也可调后端 probe 端点确认采集结果：
`POST http://localhost:8787/api/host-tracking/hosts/<deviceId>/probe`

## 五、统一目录结构

```
~/LHL/
├── <project>/
│   ├── .venv/              # uv 管理的 Python 环境
│   ├── requirements.txt
│   ├── datasets/           # 软链接到数据盘
│   ├── checkpoints/        # 软链接到数据盘
│   └── train.log
```

## 六、SSH 连接排障

| 问题 | 原因 | 解决方法 |
|------|------|---------|
| `Permission denied` | 密码错误/已变更 | 查 API 取最新密码：`GET /api/host-tracking/hosts/<deviceId>` |
| `Connection refused` | sshd 未运行 | 在目标机器上 `sudo systemctl start sshd` |
| `Could not resolve hostname` | DNS 未生效 | 用 Tailscale IP 代替主机名（API 返回的 `tailscale_ip`） |
| `Connection timed out` | 机器离线 | 确认机器开机 + Tailscale 运行；调 probe 端点确认 |

## 七、踩坑记录

部署/训练过程中遇到的问题，沉淀到 `knowledge/lessons/` 目录。
