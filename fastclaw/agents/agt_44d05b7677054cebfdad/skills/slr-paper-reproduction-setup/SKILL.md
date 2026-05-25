---
name: slr-paper-reproduction-setup
version: 2.0
description: 从后端论文库（按 field/keyword 筛选）拉取论文及代码库 URL，在远程 GPU 机箱上创建复现目录并批量 git clone 所有代码仓库。适用于"复现论文""批量clone代码库""准备复现环境"场景。
tags: [reproduction, git-clone, backend-api, remote-gpu, slr]
triggers:
  - 复现
  - 批量clone
  - 代码库下载
  - 准备复现环境
---

# SLR 论文复现环境搭建

## 概述
从 Warmth Connect Portal 后端按字段/关键词筛选论文及其 `repoUrl`，在远程 GPU 机箱上创建统一复现目录，批量 git clone 所有代码仓库。

## 前置条件
- 后端服务运行中（`http://localhost:8787`）
- 论文已入库且 `repoUrl` 字段已回填（必要时先跑 `backend-repo-backfill` 或 `paper-code-finder`）
- 远程机箱 SSH 可达（具体主机名/IP/凭据通过 `GET /api/host-tracking/hosts/<deviceId>` 查询，**不要硬编码**）

## 流程

### Step 1: 拉取目标论文列表（按 field/keyword 筛选）

```bash
# 例：拉所有 SLR 类论文
curl -s "http://localhost:8787/api/papers?field=SLR&limit=500" | \
  jq '.data.items[] | select(.repoUrl != null) | {id, title, repoUrl}'
```

要点：
- 提取 `id`（paperId）、`title`、`repoUrl`
- 同一仓库可能对应多篇论文（如 SLRT 含 5 篇子目录），需在下一步去重
- 没有 `repoUrl` 的论文跳过，先调 `paper-code-finder` 补全

### Step 2: 提取并去重代码库 URL

- 从 `repoUrl` 字段提取 GitHub URL
- 去重：同一 base repo 只 clone 一次（注意子路径仓库 `https://github.com/X/Y/tree/main/sub` 的 base repo 是 `https://github.com/X/Y.git`）
- 验证 URL 格式
- 记录 repo→论文映射关系（paperId 列表），方便后续逐篇配置

### Step 3: 选择目标主机并取凭据

```bash
# 列主机
curl -s "http://localhost:8787/api/host-tracking/hosts" | jq

# 取目标主机详情（含 SSH 凭据）
curl -s "http://localhost:8787/api/host-tracking/hosts/<deviceId>" | jq
```

记录 `tailscale_ip`/`host`、`username`、`password`、`port` 备用。

### Step 4: 在远程机箱创建复现目录

```bash
# Linux/WSL
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<host> 'mkdir -p /mnt/sda/Datasets/SLR-Reproduction'
```

Windows 环境用 paramiko：

```python
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('<host>', port=<port>, username='<user>', password='<pwd>', timeout=15)
ssh.exec_command('mkdir -p /mnt/sda/Datasets/SLR-Reproduction')
```

要点：
- 优先使用数据盘而非系统盘（具体路径以 `df -h` 现查为准）
- 目录命名建议：`SLR-Reproduction` 或按任务自定义

### Step 5: 批量 git clone（后台）

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<host> 'cd /mnt/sda/Datasets/SLR-Reproduction && \
  repos=( \
    "https://github.com/xxx/repo1.git" \
    "https://github.com/yyy/repo2.git" \
  ) && \
  for repo in "${repos[@]}"; do \
    name=$(basename "$repo" .git) && \
    if [ -d "$name" ]; then \
      echo "SKIP $name (exists)"; \
    else \
      echo "=== Cloning $name ===" && \
      git clone --depth 1 "$repo" 2>&1 && \
      echo "OK $name" || echo "FAIL $name"; \
    fi; \
  done && \
  echo "=== ALL DONE ===" && ls -la'
```

要点：
- `--depth 1` 浅克隆节省时间和空间
- 已存在的目录自动跳过（幂等）
- 长任务建议放 tmux/nohup 后台跑，避免 SSH 断连

### Step 6: 验证 clone 结果

```bash
sshpass -p '<密码>' ssh -o StrictHostKeyChecking=no <user>@<host> 'ls -la /mnt/sda/Datasets/SLR-Reproduction/'
```

- 检查所有仓库目录是否存在
- 对比预期仓库数与实际目录数
- 记录失败的仓库，必要时重试

### Step 7: 同步后端复现记录

为每篇论文创建 `paper_reproduction_records` 记录（status=`not_started` 或 `running`）：

```bash
curl -X POST "http://localhost:8787/api/reproduction-records" \
  -H "Content-Type: application/json" \
  -d '{
    "paperId": "<PAPER_ID>",
    "deviceId": "<DEVICE_ID>",
    "status": "not_started",
    "progress": 0,
    "trainingMethod": "远程SSH"
  }'
```

后续指标/修改记录回填走 `backend-reproduction-tracker` skill。

### Step 8: 汇报结果

输出结构化表格：

| # | 仓库 | 对应论文 (paperIds) | 状态 |
|---|------|---------------------|------|
| 1 | SLRT | id_a / id_b / id_c | ✅ |
| 2 | UPRet | id_d | ✅ |

## 坑位与注意事项

1. **SSH 长连接超时**：批量 clone 可能耗时 10-20 分钟，SSH 连接易断。建议用 tmux/nohup 后台跑，不要前台阻塞
2. **fairseq 等大仓库**：即使 `--depth 1` 仍有数百 MB
3. **repoUrl 子路径**：后端存的可能是带子目录的 URL（如 `.../tree/main/Part-wise_3D`），clone 前需提取 base repo URL（`.git` 结尾）；保留子路径仅用于定位代码位置
4. **数据盘 vs 系统盘**：系统盘空间有限，代码仓库放数据盘
5. **去重逻辑**：同一 repo 多篇论文常见（如 SLRT 含 5 个子项目），必须去重
6. **凭据安全**：从 host-tracking API 取到的 password 仅在内存使用，**不要写入任何文件或日志**

## 与其他技能的衔接
- 论文 repoUrl 缺失时：先跑 `paper-code-finder` 或 `backend-repo-backfill`
- clone 完成后逐篇复现：读 README → 创建 venv → 装依赖 → 配数据集 → 跑训练（参考 `local-gpu-deploy`）
- 复现指标/修改记录回填：`backend-reproduction-tracker`
