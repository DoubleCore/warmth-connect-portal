# Ask Hermes 报错排查手册

> 适用症状: 前端 Ask Hermes 卡片显示 `Failed to fetch` + `Code: NETWORK_ERROR`

## 前提检查 (服务端侧, 一次性都过)

所有命令在项目根目录跑, 期望每条都返回成功:

```bash
# 1) Hermes gateway 和 API server 起来了
curl -sS --max-time 3 http://127.0.0.1:8642/health
# 期望: {"status": "ok", "platform": "hermes-agent"}

# 2) backend 起来了 (tsx watch)
curl -sS --max-time 3 http://localhost:8787/api/command/_debug/hermes-ping
# 期望: {"success":true,"data":{"reachable":true}}

# 3) CORS 允许前端 origin (如果前端跑在 8080)
curl -sS -i -X OPTIONS http://localhost:8787/api/command/sessions \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -i access-control-allow-origin
# 期望看到: access-control-allow-origin: http://localhost:8080
```

任意一条不通就去修对应那层, 别往前端 debug.

## 如果三层都过了但前端仍然 NETWORK_ERROR

一定是浏览器侧状态/缓存问题. 按顺序做:

1. **硬刷新**: `Ctrl+Shift+R` 清掉页面缓存和 preflight 缓存
2. **清 DevTools**: 打开 DevTools → Network 勾 "Disable cache" → 再操作一次
3. **看 Network 真实请求**:
   - 找到那条 `sessions` 或 `messages` 请求
   - **Status 显示什么**? 
     - `(failed) net::ERR_*` → 真的是网络/CORS, 看 Console 有没有 CORS 报错细节
     - `200 OK` 但前端仍然报错 → 前端代码解析问题, 不是网络问题
   - 请求 URL 是不是 `http://localhost:8787/...`? 不是的话, 可能设了 `VITE_API_BASE_URL` 指到别的地方
4. **确认前端跑在哪个端口**: Vite 日志里的 `Local: http://localhost:XXXX/`. 如果不是 3000/5173/8080, 就要在 `backend/.env` 的 `CORS_ORIGIN` 追加, 改完**必须停 backend 再起**(tsx 不重载 .env)

## 背景: 为什么 CORS 预检失败也叫 NETWORK_ERROR

`src/lib/api-client.ts` 里:

```ts
try {
  res = await fetch(url, ...);
} catch (err) {
  // fetch TypeError: 不管是 TCP 连不上、CORS 预检拒绝、DNS 炸了,
  // 浏览器都抛同一种 TypeError. 我们在这里统一包成:
  throw new ApiError(0, "NETWORK_ERROR", message);
}
```

所以 `NETWORK_ERROR` 不等于 "后端没跑". 它是一个"请求根本没拿到 HTTP 响应"的总分类. 必须去 Network 面板看实际原因.

## 常见 CORS_ORIGIN 取值

`backend/.env` 里:

```env
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:8080
```

改完:

```bash
# 必须重启 backend, tsx watch 不会重新读 .env
# (假设是 kiro 后台 process, 去面板停了再起; 终端的话 Ctrl-C 再 npm run dev)
```
