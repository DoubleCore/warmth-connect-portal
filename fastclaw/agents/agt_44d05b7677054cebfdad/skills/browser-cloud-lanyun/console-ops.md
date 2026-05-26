# 蓝耘控制台操作

## ⚠️ 核心警告

**不要尝试通过 Playwright/camoufox 的 DOM click 操作 cloud.lanyun.net 的前端 UI！**

原因：
1. cloud.lanyun.net 是 Vue 2 SPA，radio/checkbox/表格行选择的 DOM click 无法触发 Vue 内部状态更新
2. 蓝耘是跨域微前端：`console.lanyun.net`（控制台）+ `cloud.lanyun.net`（容器云市场）
3. 前端筛选（地区、GPU型号）是纯前端行为，不触发 API 请求，但需要 Vue 状态正确才能显示主机列表
4. 实测所有 DOM click 操作后主机列表仍显示"暂无数据"

**正确方式**：直接通过 API 调用完成所有操作，见 `api-reference.md`。

## 一、控制台导航（console.lanyun.net）

控制台首页可以正常通过 Playwright 操作，主要功能：
- 查看账号信息（余额、实名状态、邮箱绑定状态）
- 导航入口（容器云市场、容器实例、订单等）

## 二、创建实例（必须用 API）

**不要走前端 UI**，直接按 `api-reference.md` 的完整下单流程：

1. `POST /api/d/dev/list` — 查询可用主机
2. `POST /api/orders/dockerPlaceOrderCheck` — 订单检查
3. `POST /api/orders/dockerPlaceOrder` — 下单

所有 API 在 Playwright 的 `page.evaluate()` 中调用（同源绕过 CORS）。

## 三、实例管理

| 操作 | API | 说明 |
|------|-----|------|
| 查看实例列表 | 前端页面 | 需通过 cloud.lanyun.net 的实例页面 |
| 开机 | API 或前端 | 关机状态下点击"开机" |
| 关机 | API 或前端 | 运行中点击"关机" |
| 释放 | API 或前端 | 数据清空不可恢复 |

**关键规则**：
- 连续关机 15 天自动释放，数据清空
- 按量计费后付费，**余额不足触发保护性关机**
- 开机前确保余额充足

## 四、余额与费用（2026-05 实测）

| GPU 型号 | 价格 | 可用地区 |
|----------|------|---------|
| RTX 4090 6152 | ¥2.30/小时 | 河北1区 |
| RTX 4090 6230 | ¥2.30/小时 | 河北1区 |
| NVIDIA A100-SXM4-80GB | ¥9.70/小时 | 河北1区 |

> 价格通过 `/api/orders/dockerPlaceOrder/pricePreview` 实时获取，以 API 返回为准。

## 五、新账号必做

1. **绑定邮箱 + 设置密码**：否则下单报"下单需要设置密码和邮箱"
2. 未实名不影响购买（`requireRealAuth: false`）
3. 代金券可用于抵扣（`/api/coupon/queryTotalAvailableCouponAmount`）
