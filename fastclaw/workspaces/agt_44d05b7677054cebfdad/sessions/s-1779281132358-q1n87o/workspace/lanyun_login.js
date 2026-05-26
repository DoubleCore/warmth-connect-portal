const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  console.log('=== Navigating to lanyun console ===');
  await page.goto('https://console.lanyun.net/#/controlBoard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Take screenshot to see current state
  await page.screenshot({ path: '/workspace/lanyun_step1.png', fullPage: true });
  console.log('=== Screenshot saved to /workspace/lanyun_step1.png ===');
  
  // Get page content
  const title = await page.title();
  const url = page.url();
  console.log(`Title: ${title}`);
  console.log(`URL: ${url}`);
  
  // Check if we're on login page
  const bodyText = await page.textContent('body');
  console.log('=== Page text (first 500 chars) ===');
  console.log(bodyText.substring(0, 500));
  
  await browser.close();
})();
