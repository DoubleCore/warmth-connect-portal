# 蓝耘云 API 逆向参考（v2，2026-05-21 实测下单成功）

> **核心结论**：蓝耘前端是 Vue 2 SPA，Playwright/camoufox 的 DOM click 无法可靠触发 Vue 内部状态更新。
> **直接调 API 是唯一可靠方式**。所有 API 都在 `cloud.lanyun.net` 域下（通过 Playwright page.evaluate 调用，绕过 CORS）。

## 前置：获取认证 Token

1. 用 Playwright + 持久化 cookies 登录 `cloud.lanyun.net`
2. Token 在 cookie `access_token` 中，域为 `.lanyun.net`
3. 所有 API 请求头：`Authorization: Bearer <access_token>`

```javascript
// Playwright 中获取 token
const cookies = await context.cookies();
const tokenCookie = cookies.find(c => c.name === 'access_token');
const headers = { 'Authorization': 'Bearer ' + tokenCookie.value, 'Content-Type': 'application/json' };
```

## API 端点一览

### 基础信息

| 端点 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `/api/d/region/list` | GET | - | 地区列表 |
| `/api/d/spec/{regionId}/list` | GET | path: regionId | GPU 规格列表（specId 用于筛选） |
| `/api/d/img/public/list` | GET | - | 公共镜像列表 |
| `/api/sys/zhdmb/getDockerGpuBuyNum` | GET | - | 可购买的 GPU 数量选项 |
| `/api/userAccountBalances/accountBalance` | GET | - | 账户余额（单位：分） |
| `/api/coupon/queryTotalAvailableCouponAmount?hostDevId={id}` | GET | hostDevId | 可用代金券金额 |
| `/api/dict/list` | GET | - | 系统字典（含 GPU 类型映射等） |

### 实例管理 ⭐ 新增

| 端点 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `/api/d/user_ins/list` | GET | pageNum, pageSize, search, runStatus, payType | **实例列表（含 SSH 凭据！）** |
| `/api/d/user_ins/tasks` | GET | taskType=4, filterCompleted=false | 创建任务状态 |

**user_ins/list 响应关键字段**（⚠️ 这个 API 直接返回明文 SSH 凭据，不需要 clipboard 拦截）：
```json
{
  "code": 200,
  "data": [
    {
      "id": 1052598,
      "code": "LY2026052100022",         // 实例编号
      "showCode": "GS-t2web",             // 主机显示编号
      "regionName": "河北1区",
      "regionId": 14,
      "hostId": 847,
      "gpuNum": 1,
      "runStatus": 2,                     // 2=运行中
      "sshAccount": "root",               // ⭐ SSH 用户名
      "sshPort": 12528,                   // ⭐ SSH 端口
      "sshPwd": "jpu95zd3lp6tqo68",       // ⭐ SSH 明文密码
      "sshAddr": "qhdlink.lanyun.net",    // ⭐ SSH 地址
      "jupyterAddr": "http://qhdlink.lanyun.net",
      "jupyterToken": "/lab?token=db0e17f...",
      "jupyterPort": 12529,
      "imgType": 1,
      "imgId": 355,
      "payType": "按量计费"
    }
  ]
}
```

**runStatus 枚举**：
| 值 | 含义 |
|----|------|
| 0 | 创建中 |
| 1 | 开机中 |
| 2 | 运行中 |
| 3 | 关机中 |
| 4 | 已关机 |
| 5 | 已到期 |
| 6 | 重置中 |
| 7 | 创建失败 |
| 8 | 重启中 |

### 设备查询

| 端点 | 方法 | 参数 | 说明 |
|------|------|------|------|
| `/api/d/dev/list` | POST | 见下方 | 可用主机列表 |

**dev/list 请求体**（必须全部提供，否则 500）：
```json
{
  "chargeMode": 1,        // 1=按量计费, 2=包日, 3=包周, 4=包月, 5=包年
  "regionId": 14,         // 地区ID（14=河北1区）
  "gpuId": [34],          // GPU规格ID数组，空数组传 null
  "gpuNum": 1,            // GPU数量
  "pageNum": 1,
  "pageSize": 20
}
```

**dev/list 响应关键字段**：
```json
{
  "code": 200,
  "total": 4,
  "data": [
    {
      "id": 847,              // hostDevId（下单用这个！）
      "showCode": "GS-t2web", // 显示编号
      "gpuName": "RTX 4090 6152",
      "unuseGpuNum": 5,       // 可用GPU数
      "price": 230,           // 价格（单位：分/小时）
      "enableBuy": true,      // 是否可购买
      "gpuMemory": 24,        // 显存GB
      "dockerMemorySize": 120,// 内存GB（单卡）
      "hostDevCudaVersion": "13.1"
    }
  ]
}
```

### 订单操作

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/orders/dockerPlaceOrderCheck` | POST | 下单前检查（CUDA版本兼容性、用户状态） |
| `/api/orders/dockerPlaceOrder/pricePreview` | POST | 价格预览 |
| `/api/orders/dockerPlaceOrder` | POST | **下单** |

⚠️ **字段名不一致**（这是最坑的地方）：

**订单检查** (`dockerPlaceOrderCheck`) 参数：
```json
{
  "hostId": 847,     // 注意：是 hostId，不是 hostDevId！
  "imgId": 355,      // 注意：是 imgId，不是 imageId！
  "imgType": 1       // 1=公共镜像
}
```

**下单** (`dockerPlaceOrder`) 参数：
```json
{
  "chargeMode": 1,
  "duration": 1,
  "expandDataDisk": 0,
  "gpus": 1,
  "hostDevId": 847,    // 注意：这里是 hostDevId！
  "imageId": 355,       // 注意：这里是 imageId！
  "imageType": 1
}
```

**价格预览** (`pricePreview`) 参数（与下单相同字段名）：
```json
{
  "chargeMode": 1,
  "duration": 1,
  "expandDataDisk": 0,
  "gpus": 1,
  "hostDevId": 847
}
```

**价格预览响应**：
```json
{
  "data": {
    "paygPrice": 230,          // 按量价格（分/小时）
    "unitPrice": 5520,         // 包月单价
    "freeDataDiskSize": 50,    // 免费数据盘GB
    "sysDiskSize": 30,         // 系统盘GB
    "userBalance": 600         // 用户余额（分）
  }
}
```

**订单检查响应**：
```json
{
  "data": {
    "imgCheck": {
      "hostDevCudaVersion": "13.1",
      "imageCudaVersion": "12.1",
      "checkStatus": true      // true=兼容
    },
    "userCheck": {
      "requireRealAuth": false,  // 是否需要实名
      "requireValidate": false,  // 是否需要滑块验证
      "isRealAuth": false,
      "isSettingEmailAndPwd": true  // ⭐ 是否已设置邮箱密码（false=无法下单）
    }
  }
}
```

**下单成功响应**：
```json
{
  "successful": true,
  "code": 200,
  "message": "操作成功",
  "data": {
    "orderNo": "DC202605210017"   // 订单号
  }
}
```

## 完整下单流程（API 方式，已验证成功）

```javascript
// 在 Playwright page.evaluate 中执行（绕过 CORS）
// 注意：所有变量必须通过参数传入 page.evaluate，不能直接引用外部变量！

// 1. 获取可用主机
const devRes = await page.evaluate(async (h) => {
  const r = await fetch('/api/d/dev/list', {
    method: 'POST', headers: h,
    body: JSON.stringify({ chargeMode: 1, regionId: 14, gpuId: [34], gpuNum: 1, pageNum: 1, pageSize: 20 })
  });
  return r.json();
}, headers);

const available = (devRes.data || []).filter(d => d.unuseGpuNum > 0 && d.enableBuy);
const host = available.sort((a, b) => b.unuseGpuNum - a.unuseGpuNum)[0];

// 2. 订单检查（⚠️ 注意：变量必须通过参数传入！）
const checkRes = await page.evaluate(async ({h, hostId}) => {
  const r = await fetch('/api/orders/dockerPlaceOrderCheck', {
    method: 'POST', headers: h,
    body: JSON.stringify({ hostId: hostId, imgId: 355, imgType: 1 })
  });
  return r.json();
}, {h: headers, hostId: host.id});

// 3. 下单（⚠️ 注意：字段名和 check 不同！变量通过参数传入！）
const orderRes = await page.evaluate(async ({h, hostDevId}) => {
  const r = await fetch('/api/orders/dockerPlaceOrder', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      chargeMode: 1, duration: 1, expandDataDisk: 0,
      gpus: 1, hostDevId: hostDevId, imageId: 355, imageType: 1
    })
  });
  return r.json();
}, {h: headers, hostDevId: host.id});

// 4. 获取实例列表（含 SSH 凭据）
const insRes = await page.evaluate(async (h) => {
  const r = await fetch('/api/d/user_ins/list?pageNum=1&pageSize=10&search=&runStatus=&payType=', { headers: h });
  return r.json();
}, headers);

const instance = insRes.data.find(i => i.hostId === host.id);
// instance.sshAddr, instance.sshPort, instance.sshAccount, instance.sshPwd 全是明文！
```

## 已知地区

| id | 名称 | GPU 可用情况 |
|----|------|-------------|
| 14 | 河北1区 | RTX 4090 6152 (多台可买), RTX 4090 6230, A100-PCIE-40GB, A100-SXM4-80GB |

## 已知 GPU 规格（河北1区）

| specId | gpuName | 价格 |
|--------|---------|------|
| 11 | RTX 4090 | ¥2.30/小时 |
| 34 | RTX 4090 6152 | ¥2.30/小时 |
| 40 | RTX 4090 6230 | ¥2.30/小时 |
| 39 | NVIDIA A100-PCIE-40GB | ¥5.10/小时 |
| 42 | NVIDIA A100-SXM4-80GB | ¥9.70/小时 |

## 已知镜像（PyTorch 系列）

| id | 框架 | 版本 | Python | CUDA | OS |
|----|------|------|--------|------|----|
| 355 | PyTorch | 2.1.0 | 3.10 | 12.1 | Ubuntu 22.04 |
| 356 | PyTorch | 2.0.1 | 3.10 | 11.8 | Ubuntu 22.04 |
| 357 | PyTorch | 2.1.0 | 3.10 | 11.8 | Ubuntu 22.04 |
| 358 | PyTorch | 2.1.2 | 3.10 | 12.1 | Ubuntu 22.04 |

> 完整镜像列表通过 `/api/d/img/public/list` 获取。

## 错误码

| code | 含义 | 处理 |
|------|------|------|
| 200 | 成功 | - |
| 400 | 参数异常 | 检查必填字段 |
| 500 | 操作失败 | 可能缺少必填字段（字段名不对也会报这个） |
| 80000 | 余额不足 | 需充值后再下单 |
| 801321 | 需要验证 | 可能需要滑块验证 |

## 常见报错与字段名对照

| 报错信息 | 原因 | 正确字段名 |
|----------|------|-----------|
| "显卡数量不能为空" | dev/list 缺 gpuNum | 加 `gpuNum: 1` |
| "镜像id不能为空" | check 用了 imageId | 改为 `imgId` |
| "镜像类型不能为空" | check 缺 imageType | 加 `imgType: 1` |
| "docker容器宿主机设备Id不能为空" | order 用了 hostId | 改为 `hostDevId` |
| "购买时长不能为空" | pricePreview 缺 duration | 加 `duration: 1` |
| "下单需要设置密码和邮箱" | 新账号未绑定邮箱 | 需先在控制台设置 |
| "用户余额不足" | 余额为0或不够 | 充值后再下单 |
| ReferenceError: host is not defined | page.evaluate 引用了外部变量 | 必须通过参数对象传入 |

## 实战记录（2026-05-21 首次成功下单）

### 环境
- Windows 10, Playwright 1.60.0 + Chromium
- 账号
