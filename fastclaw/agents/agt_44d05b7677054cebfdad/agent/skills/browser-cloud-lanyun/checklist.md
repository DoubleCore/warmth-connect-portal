# 采购 / 释放 / 扩展 Checklist

## 一、初次部署（只做一次）

- [x] `~/.openclaw/workspace/knowledge/cloud-credentials.json` 已创建（含蓝耘账密）
- [x] `~/.openclaw/workspace/knowledge/lanyun-inventory.json` 已创建
- [x] `~/.openclaw/workspace/knowledge/lanyun-cookies.json` 已创建（登录态持久化）
- [x] `~/.openclaw/workspace/knowledge/lanyun-localstorage.json` 已创建
- [x] `~/.openclaw/workspace/knowledge/lanyun-auth.js` 已创建（辅助模块）
- [x] Playwright + Chromium 已安装（`~/Desktop/workspace` 目录下）
- [x] 蓝耘账号已绑定邮箱 + 设置密码
- [x] paramiko 已安装（Windows SSH 替代方案）
- [ ] `scan-lanyun.sh` 已落盘并 `chmod +x`（WSL/Linux 环境）
- [ ] `which sshpass jq` 两个命令都有输出（WSL/Linux 环境）
- [ ] cron / Task Scheduler 已配好

## 二、采购新机箱（日常）

- [ ] 确认账号邮箱已绑定（`dockerPlaceOrderCheck` 的 `isSettingEmailAndPwd=true`）
- [ ] 确认余额充足（`/api/userAccountBalances/accountBalance`，单位：分，需 >= 230）
- [ ] 通过 API 下单（见 `api-reference.md` 完整流程）
  - [ ] `POST /api/d/dev/list` 查询可用主机
  - [ ] `POST /api/orders/dockerPlaceOrderCheck` 订单检查
  - [ ] `POST /api/orders/dockerPlaceOrder` 下单
- [ ] 通过 `/api/d/user_ins/list` 获取 SSH 凭据（明文）
- [ ] jq 追加到 `lanyun-inventory.json`
- [ ] `POST /api/devices` 创建设备记录到 Hermes 后端
- [ ] `POST /api/reproduction-records` 创建复现记录
- [ ] 1 分钟内 scan 结果 `last_sync_ok=true`

## 三、释放机箱

- [ ] API/浏览器触发"释放"
- [ ] inventory 写 `released_at`
- [ ] Hermes 后端 `PATCH device → status=idle`
- [ ] Hermes 后端 `PATCH reproduction-record → status=failed/success`

## 四、接入一个全新云平台

- [ ] 用户首次手动登录
- [ ] 验证重启后 cookies 保持有效
- [ ] 逆向 API 端点（抓包 + JS 源码分析）
- [ ] 更新 `cloud-credentials.json`
- [ ] 确认新平台 SSH 可直连
- [ ] 决定 inventory 文件策略
- [ ] 更新 SKILL.md 与本 checklist

## 当前已注册实例

| id | 实例编号 | 主机编号 | GPU | 计费 | SSH | 状态 |
|----|----------|----------|-----|------|-----|------|
| 1052598 | LY2026052100022 | GS-t2web | RTX 4090 6152 ×1 | 按量 ¥2.30/h | root@qhdlink.lanyun.net:12528 | ✅ 运行中 |

## 当前账号状态（2026-05-21）

| 项目 | 状态 |
|------|------|
| 账号 | user15743559 |
| 实名 | ❌ 未实名（不影响购买） |
| 邮箱 | ✅ 已绑定 |
| 密码 | ✅ 已设置 |
| 手机 | 19357311762 |
| 余额 | ¥6.00（约2.6小时可用） |
| 代金券 | ¥0.00 |
