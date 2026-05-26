# 蓝耘登录态持久化方案

## 原理

蓝耘的 `access_token` cookie 域为 `.lanyun.net`，同时被 `console.lanyun.net` 和 `cloud.lanyun.net` 共享。导出 cookies + localStorage 后，Playwright 启动时重新加载即可恢复登录态，无需重复输入账密。

## 持久化文件

| 文件 | 位置 | 内容 |
|------|------|------|
| `lanyun-cookies.json` | `~/.openclaw/workspace/knowledge/` | Playwright 导出的 cookies 数组 |
| `lanyun-localstorage.json` | `~/.openclaw/workspace/knowledge/` | 按域名分组的 localStorage 键值对 |
| `lanyun-auth.js` | `~/.openclaw/workspace/knowledge/` | 可复用的 Playwright 辅助模块 |

## 首次登录（生成持久化文件）

```javascript
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // 1. 登录 console.lanyun.net
  await page.goto('https://console.lanyun.net/#/controlBoard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 切换到账号登录
  const accountTab = await page.locator('text=账号登录').first();
  if (await accountTab.isVisible()) { await accountTab.click(); await page.waitForTimeout(1000); }
  
  // 读取凭据文件填入
  const creds = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.openclaw', 'workspace', 'knowledge', 'cloud-credentials.json'), 'utf8'));
  await page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="用户"]').first().fill(creds.platforms.lanyun.username);
  await page.locator('input[type="password"]').first().fill(creds.platforms.lanyun.password);
  await page.waitForTimeout(500);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(5000);

  // 2. 访问 cloud.lanyun.net（让 cookies 在两个域都生效）
  await page.goto('https://cloud.lanyun.net/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 3. 导出 cookies
  const cookies = await context.cookies();
  const knowledgeDir = path.join(process.env.USERPROFILE, '.openclaw', 'workspace', 'knowledge');
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.writeFileSync(path.join(knowledgeDir, 'lanyun-cookies.json'), JSON.stringify(cookies, null, 2));

  // 4. 导出 localStorage（两个域名都要）
  const localStorageData = {};
  
  await page.goto('https://console.lanyun.net/#/controlBoard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  localStorageData['console.lanyun.net'] = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      items[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    }
    return items;
  });

  await page.goto('https://cloud.lanyun.net/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  localStorageData['cloud.lanyun.net'] = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      items[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    }
    return items;
  });

  fs.writeFileSync(path.join(knowledgeDir, 'lanyun-localstorage.json'), JSON.stringify(localStorageData, null, 2));
  
  await browser.close();
  console.log('Auth persistence complete!');
})();
```

## 后续使用（加载持久化认证）

```javascript
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function createAuthenticatedPage(headless = true) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const knowledgeDir = path.join(process.env.USERPROFILE, '.openclaw', 'workspace', 'knowledge');

  // 加载 cookies
  const cookiesPath = path.join(knowledgeDir, 'lanyun-cookies.json');
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await context.addCookies(cookies);
  }

  // 加载 localStorage
  const storagePath = path.join(knowledgeDir, 'lanyun-localstorage.json');
  if (fs.existsSync(storagePath)) {
    const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    for (const [origin, items] of Object.entries(storage)) {
      const p = await context.newPage();
      const url = origin === 'console.lanyun.net' ? 'https://console.lanyun.net' : 'https://cloud.lanyun.net';
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await p.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) {
          try { localStorage.setItem(key, value); } catch(e) {}
        }
      }, items);
      await p.close();
    }
  }

  const page = await context.newPage();
  return { browser, context, page };
}

module.exports = { createAuthenticatedPage };
```

## 验证认证是否有效

```javascript
const { browser, page } = await createAuthenticatedPage();
await page.goto('https://cloud.lanyun.net/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const body = await page.textContent('body');
const loggedIn = body.includes('余额') || body.includes('立即购买');
console.log('Auth valid: ' + loggedIn);
await browser.close();
```

## Cookies 过期处理

- `access_token` cookie 有效期约 **30 天**（expires 字段可查看）
- 过期后重新执行"首次登录"流程即可
- 如果登录页出现验证码，截图发给用户手动处理

## 注意事项

- Playwright 必须在安装了 `playwright` npm 包的目录下运行（如 `~/Desktop/workspace`）
- `chromium` 浏览器需要通过 `npx playwright install chromium` 预装
- Windows 上 `process.env.USERPROFILE` 替代 `process.env.HOME`
- 辅助模块 `lanyun-auth.js` 已保存在 `~/.openclaw/workspace/knowledge/` 中
