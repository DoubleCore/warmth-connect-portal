# 已踩坑记录与故障排除

## 踩坑列表

### P1: SSH/密码被遮掩
实例列表 SSH 和密码显示 `*******`，DOM 中没有真实值。
→ **直接用 `/api/d/user_ins/list` API 获取明文凭据**，不需要 clipboard 拦截法。

### P2: 点击导航新开标签页
容器云等链接在新标签页打开，需要 `browser action=tabs` 获取新 targetId。

### P3: "同意条款" checkbox ref 不唯一
→ 用 `refs=aria` 或 JS evaluate 直接定位点击。

### P4: 余额不足导致关机
按量计费余额不足触发保护性关机（差几毛钱也不行）。
→ 操作前检查余额；充值后重新开机。

### P5: SSH 频繁连接被限流
>10次/分钟会被拒：`kex_exchange_identification: Connection closed by remote host`
→ 合并命令为单次 SSH 调用；等 1-2 分钟重连。

### P6: numpy 版本与 PyTorch 冲突
PyTorch 2.1.2 基于 numpy 1.x，升级到 2.x 报错。
→ 装包后检查 `pip show numpy`，确保 `numpy<2`。

### P7: 系统 Python vs Conda Python
`/usr/bin/python3` 没有 PyTorch，必须激活 conda base。

### P8: 买了机器忘记加进 inventory
只在浏览器里买了实例没追加到 `lanyun-inventory.json`，scan 完全感知不到。
→ 采购流程**必须**走 SKILL.md Step 4。

### P9: 关机重启后密码变了
蓝耘部分镜像关机重启时会重置 root 密码。
→ 重新调用 `/api/d/user_ins/list` 获取最新凭据，更新 inventory。

### P10: 本机没装 sshpass / jq
→ Linux: `sudo apt install sshpass jq` / macOS: `brew install hudochenkov/sshpass/sshpass jq`
→ Windows: 用 Python paramiko 替代 sshpass

### P11: Windows 本机跑 scan 脚本
→ 在 WSL 里完整跑这一套；或 Task Scheduler 每分钟触发 `wsl.exe -e bash -lc "..."`。

### P12: nvidia-smi 不存在
容器没开 GPU 透传时，`nvidia-smi` 命令缺失。
→ 正常现象；`last_sync_ok` 仍然是 `true`。

### P13: cron 执行时 PATH 不全
→ crontab 行前显式 `PATH=/usr/local/bin:/usr/bin:/bin`。

### P14: inventory JSON 被手改坏了
→ 永远用 `jq` 的 upsert 片段来改；改前 `cp` 备份。

### P15: camoufox-cli 在 Windows 上无法启动 ⚠️ 2026-05 新增
daemon 启动有 5 秒硬编码超时，Windows 上冷启动远超 5 秒，100% 失败。
报错：`Daemon did not start within 5 seconds`。
→ **使用 Playwright 替代**。Playwright 在 Windows 上稳定可用。

### P16: Playwright DOM click 无法操作 cloud.lanyun.net ⚠️ 2026-05 新增
cloud.lanyun.net 是 Vue 2 SPA，Playwright 的 click 无法触发 Vue 内部状态更新。
症状：点击 radio/checkbox/表格行后，主机列表仍显示"暂无数据"。
→ **直接调 API**，见 `api-reference.md`。

### P17: 蓝耘跨域微前端架构 ⚠️ 2026-05 新增
`console.lanyun.net` 和 `cloud.lanyun.net` 是两个独立前端应用。
- console: 控制台首页、账号管理
- cloud: 容器云市场、实例管理、下单
API 全部在 `cloud.lanyun.net` 域下，需在 Playwright 中先导航到 cloud 域再调 API。

### P18: 订单 API 字段名不一致 ⚠️ 2026-05 新增
- `dockerPlaceOrderCheck` 用 `hostId` / `imgId` / `imgType`
- `dockerPlaceOrder` 用 `hostDevId` / `imageId` / `imageType`
- `dev/list` 用 `gpuId`（数组）不是 `specId`
混用会报 500 "操作失败"或"xxx不能为空"。
→ 严格按 `api-reference.md` 的字段名对照表使用。

### P19: 新账号必须绑定邮箱+设置密码 ⚠️ 2026-05 新增
下单报"下单需要设置密码和邮箱"。
→ 用户需先在 console.lanyun.net 的账号设置中绑定邮箱、设置密码。
→ 可通过 `dockerPlaceOrderCheck` 的 `userCheck.isSettingEmailAndPwd` 字段预检。

### P20: dev/list 必须提供完整参数 ⚠️ 2026-05 新增
缺少 `chargeMode`/`regionId`/`gpuId`/`gpuNum`/`pageNum`/`pageSize` 任一字段都会报 500。
其中 `gpuId` 是数组（空数组传 `null`），不是单个 specId。
→ 完整参数模板见 `api-reference.md`。

### P21: Playwright 版本冲突 ⚠️ 2026-05 新增
不同目录下安装的 playwright 版本不同，导致 Chromium 浏览器版本不匹配。
报错：`browserType.launch: Executable doesn't exist at ... chromium_headless_shell-1217`
→ 在固定目录（如 `~/Desktop/workspace`）安装 playwright，所有脚本都在该目录下运行。
→ 安装后必须 `npx playwright install chromium` 下载匹配的浏览器。

### P22: access_token cookie 跨域共享 ⚠️ 2026-05 新增
`access_token` cookie 域为 `.lanyun.net`，同时被 console 和 cloud 两个子域共享。
→ 只需在任一域登录，cookies 自动在另一域生效。
→ 但 localStorage 不跨域，需要分别导出两个域的 localStorage。

### P23: page.evaluate 中引用外部变量报 ReferenceError ⚠️ 2026-05 实测
page.evaluate 内部无法访问外部 JS 变量（如 `host.id`），会报 `ReferenceError: host is not defined`。
→ 必须通过参数对象传入：`page.evaluate(async ({h, hostId}) => {...}, {h: headers, hostId: host.id})`

### P24: Windows 没有 sshpass ⚠️ 2026-05 实测
Windows 上 `ssh -p port user@host` 无法自动输入密码，`sshpass` 命令不存在。
→ 使用 Python paramiko 库替代：`pip install paramiko`
→ 示例代码见 SKILL.md "SSH 连接方案" 章节

### P25: 余额不足报 code=80000 ⚠️ 2026-05 实测
下单时余额为0，报 `{"code": 80000, "message": "用户余额不足"}`。
→ 下单前先查余额 `/api/userAccountBalances/accountBalance`（返回单位：分）
→ 确保余额 >= 230分（¥2.30，1小时最低费用）

### P26: camoufox 浏览器下载失败（GitHub API 限流）⚠️ 2026-05 实测
`npx camoufox-js fetch` 依赖 GitHub API 下载浏览器二进制，国内网络经常 403/超时。
→ 用户需手动执行（可能需要代理）：`set HTTPS_PROXY=xxx && npx camoufox-js fetch`
→ 下载后 camoufox 浏览器存放在 `~/AppData/Local/camoufox/camoufox/Cache/`
→ 即使下载成功，daemon 5秒超时问题仍存在（见 P15），推荐直接用 Playwright

### P27: 蓝耘实例容器环境预装 ⚠️ 2026-05 实测
蓝耘 PyTorch 镜像已预装 miniconda，位于 `/root/miniconda/`。
系统盘 30GB overlay，数据盘 50GB（可扩容至 ~35TB）。
→ 部署时先 `source /root/miniconda/etc/profile.d/conda.sh` 激活 conda
→ 代码和数据优先放数据盘（`/root/lanyun-fs/` 或扩容区域）

## 故障排除速查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| snapshot 返回登录页 | cookies 过期 | 重新执行首次登录流程 |
| camoufox daemon 超时 | Windows 5秒硬编码限制 | P15，换 Playwright |
| Playwright click 无效 | Vue 2 SPA 状态不响应 | P16，直接调 API |
| API 报"镜像id不能为空" | check 接口用 imgId 不是 imageId | P18 |
| API 报"操作失败" 500 | dev/list 缺必填参数 | P20 |
| API 报"下单需要设置密码和邮箱" | 新账号未绑定邮箱 | P19 |
| API 报"用户余额不足" code=80000 | 余额为0 | P25，先充值 |
| page.evaluate ReferenceError | 引用了外部变量 | P23，通过参数传入 |
| SSH 密码认证失败 | Windows 没有 sshpass | P24，用 paramiko |
| Playwright 浏览器版本不匹配 | 多个 playwright 安装 | P21 |
| SSH 连接被拒 | 频繁连接被限流 | P5 |
| SSH 连不上 | 实例已关机 | 浏览器检查状态，开机后重连 |
| PyTorch 报 numpy 错误 | numpy 被升级到 2.x | `pip install 'numpy<2'` |
| 实例自动关机 | 余额不足 | 充值后重新开机 |
| inventory 里看不到新买的机子 | 忘了追加条目 | P8 |
| scan 脚本不扫某条 | released_at 非 null 或 SSH 缺字段 | 检查条目完整性 |
| inventory JSON 无法被 jq 解析 | 手改出语法错 | P14 |
| `access_token` 在 cloud 域无效 | 只在 console 域登录 | P22，需同时访问两个域 |
| camoufox 浏览器下载失败 | GitHub API 限流 | P26，用户手动下载或挂代理 |
