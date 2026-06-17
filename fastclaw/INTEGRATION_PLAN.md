# FastClaw 融入计划书

## 现状评估

### 已完成

| 组件 | 状态 | 说明 |
|------|------|------|
| Go 三层架构 | ✅ | agentcore → agentruntime → connector，代码完整 |
| 三个 Agent | ✅ | 论文搜索 / RAG 阅读 / 部署助手，skill 包齐全 |
| HTTP 服务器 | ✅ | `cmd/hermes-fastclaw`，OpenAI 兼容 + 自定义 SSE |
| 后端对接 | ✅ | `backend/src/modules/fastclaw/`，流式 + 非流式 |
| 前端对接 | ✅ | `fronted/src/api/command.ts`，SSE 事件消费 |
| 开发启动脚本 | ✅ | `start-hermes-fastclaw.bat`（go run 模式） |
| 配置文件 | ✅ | `config/hermes-agents.json`，支持环境变量展开 |

### 待解决问题

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | `build.bat` 构建目标错误 | 高 | 当前构建 `cmd/agent`（单 Agent 演示），应构建 `cmd/hermes-fastclaw` |
| 2 | 无 Windows 打包方案 | 高 | 缺少一键分发包（exe + config + agents 目录） |
| 3 | `go 1.25.0` 版本声明 | 中 | 需确认实际兼容的 Go 版本 |
| 4 | 运行时数据未隔离 | 低 | `runtime-data/`、`dist/` 已补充 gitignore |
| 5 | 无健康检查集成 | 低 | 后端未探测 FastClaw 存活状态 |

---

## Phase 1：构建修复（立即）

### 1.1 修复 build.bat

将构建目标从 `.\cmd\agent\` 改为 `.\cmd\hermes-fastclaw\`，输出文件名统一为 `hermes-fastclaw`：

```bat
go build -ldflags "-s -w" -o dist\hermes-fastclaw.exe .\cmd\hermes-fastclaw\
```

### 1.2 确认 Go 版本

检查 `go.work` 和各 `go.mod` 中的 `go 1.25.0` 声明，降级到实际安装的版本（如 1.23 或 1.24）。

---

## Phase 2：Windows 打包方案

### 目标

生成一个可直接分发的 zip 包，解压即用，无需安装 Go 环境：

```
hermes-fastclaw-windows-amd64/
├── hermes-fastclaw.exe          # 编译好的二进制（~11 MB）
├── config/
│   └── hermes-agents.json       # Agent 配置
├── agents/                      # Agent homes（skills + SOUL.md）
│   ├── agt_f908ad32af3120090a37/agent/
│   ├── agt_18b2eb56cb44f511848e/agent/
│   └── agt_44d05b7677054cebfdad/agent/
├── .env.example                 # 环境变量模板
└── start.bat                    # 一键启动脚本（读 .env，启动 exe）
```

### 2.1 修复 build.bat

```bat
@echo off
REM 构建 hermes-fastclaw 多 Agent 服务器
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64
go build -ldflags "-s -w -X main.version=%%VERSION%% -X main.commit=%%COMMIT%%" ^
  -o dist\hermes-fastclaw.exe .\cmd\hermes-fastclaw\
```

### 2.2 打包脚本 `package.bat`（新建）

```bat
@echo off
set OUT=dist\hermes-fastclaw-windows-amd64
if exist %OUT% rmdir /s /q %OUT%
mkdir %OUT%\config
mkdir %OUT%\agents

copy dist\hermes-fastclaw.exe %OUT%\
copy config\hermes-agents.json %OUT%\config\
xcopy agents\agt_*\agent %OUT%\agents\ /E /I
copy .env.example %OUT%\
copy start.bat.template %OUT%\start.bat
```

### 2.3 start.bat（分发包内的启动脚本）

```bat
@echo off
setlocal
for /f "usebackq tokens=1,* delims==" %%A in (".env") do set "%%A=%%B"
hermes-fastclaw.exe -config config\hermes-agents.json -bind 127.0.0.1 -port 18953
```

---

## Phase 3：后端集成加固

### 3.1 FastClaw 健康探测

后端启动时 ping `GET /health`，失败时降级（返回友好提示而非 502）：

```typescript
// backend/src/modules/fastclaw/fastclaw.client.ts
async ping(): Promise<boolean> {
  try {
    const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}
```

### 3.2 进程管理（可选）

后端可选择 spawn FastClaw 子进程，实现"启动后端即启动 Agent"：

```typescript
import { spawn } from "child_process";
const proc = spawn(path.join(FASTCLAW_DIR, "hermes-fastclaw.exe"), [
  "-config", path.join(FASTCLAW_DIR, "config/hermes-agents.json"),
  "-bind", "127.0.0.1", "-port", "18953",
], { stdio: "pipe" });
```

这样 Windows 用户只需启动后端，FastClaw 自动跟随。

---

## Phase 4：前端体验完善

| 项目 | 说明 |
|------|------|
| Agent 状态指示 | Sidebar 显示 FastClaw 连接状态（绿/红点） |
| Agent 选择器 | 对话框支持切换三个 Agent |
| 流式中断 | 用户可中止正在进行的 Agent 对话 |
| 错误降级 | FastClaw 不可用时显示"Agent 离线"而非报错 |

---

## 时间线

| 阶段 | 工作量 | 产出 |
|------|--------|------|
| Phase 1 | 0.5 天 | build.bat 修复 + gitignore 完善 |
| Phase 2 | 1 天 | Windows zip 打包方案 + start.bat |
| Phase 3 | 1 天 | 健康探测 + 可选子进程管理 |
| Phase 4 | 2-3 天 | 前端 Agent 状态 + 选择器 + 中断 |

---

## 决策点

1. **Go 版本**：`go.work` 声明 1.25.0，需确认本机版本并对齐
2. **分发方式**：zip 解压即用 vs. 安装器（NSIS/Inno Setup）
3. **进程管理**：后端 spawn 子进程 vs. 用户手动启动 vs. Windows Service
4. **Agent 配置热更新**：是否支持不重启修改 Agent 参数
