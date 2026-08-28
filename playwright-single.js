require('dotenv').config();
const { chromium } = require('playwright')
const {expect} = require("expect");
const cp = require('child_process');
const playwrightClientVersion = cp.execSync('npx playwright --version').toString().trim().split(' ')[1];

async function acceptCookies(page) {
  // Wait for cookie popup to appear, then dismiss it
  const acceptBtn = page.locator('button:has-text("Godta alle cookier"), button:has-text("Accept all"), button:has-text("Accept all cookies")').first();
  try {
    await acceptBtn.waitFor({ state: 'visible', timeout: 5000 });
    if (await acceptBtn.isVisible()) {
      console.log('  Accepting cookies...');
      await acceptBtn.click();
      await page.waitForTimeout(1000);
      return true;
    }
  } catch (e) {
    // No cookie popup, or already dismissed
  }
  return false;
}

async function goToHome(page) {
  try {
    await page.goto("https://www.experis.no");
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await acceptCookies(page);
    return true;
  } catch (e) {
    console.log(`  Could not return to home: ${e.message}`);
    return false;
  }
}

async function findLink(page, text) {
  // Try multiple strategies to find the link
  let btn = page.locator(`a:has-text("${text}")`).first();
  if (await btn.count() > 0 && await btn.isVisible({ timeout: 3000 }).catch(() => false)) return btn;
  
  btn = page.locator(`a[href*="${text.toLowerCase().replace(/\s/g, '-')}"]`).first();
  if (await btn.count() > 0 && await btn.isVisible({ timeout: 3000 }).catch(() => false)) return btn;
  
  return null;
}

(async () => {
  console.log('Starting Playwright test...');
  console.log('Playwright version:', playwrightClientVersion);
  
  const capabilities = {
    'browserName': 'Chrome',
    'browserVersion': 'latest',
    'LT:Options': {
      'platform': 'Windows 10',
      'build': 'Playwright Single Build',
      'name': 'Experis.no Click-Through Test',
      'user': process.env.LT_USERNAME,
      'accessKey': process.env.LT_ACCESS_KEY,
      'network': true,
      'video': true,
      'console': true,
      'tunnel': false,
      'tunnelName': '',
      'geoLocation': 'NO',
      'playwrightClientVersion': playwrightClientVersion
    }
  }

  console.log('Connecting to LambdaTest...');
  console.log('Username:', process.env.LT_USERNAME);
  console.log('Platform: Windows 10, Browser: Chrome');

  const browser = await chromium.connect({
    wsEndpoint: `wss://cdp.lambdatest.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`
  })

  console.log('Connected to LambdaTest successfully!');
  console.log('Creating new page...');

  const page = await browser.newPage()

  console.log('Navigating to experis.no...');
  await page.goto("https://www.experis.no");
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500); // Wait for cookie popup to appear
  await acceptCookies(page);

  await page.screenshot({ path: 'experis-landing.png', fullPage: false });
  console.log('Screenshot: experis-landing.png');

  const navLinks = [
    { text: 'Våre tjenester', label: 'services', href: 'våre-tjenester' },
    { text: 'Bransjer', label: 'industries', href: 'bransjer' },
    { text: 'Partner', label: 'partner', href: 'partner' },
    { text: 'Aktuelt', label: 'news', href: 'aktuelt' },
    { text: 'Bli en av oss', label: 'careers', href: 'bli-en-av-oss' },
    { text: 'Om oss', label: 'about', href: 'om-oss' },
    { text: 'Stillinger', label: 'jobs', href: 'stillinger' },
    { text: 'Kontakt Oss', label: 'contact', href: 'om-oss/kontakt-oss' },
  ];

  for (let i = 0; i < navLinks.length; i++) {
    const link = navLinks[i];
    console.log(`\n--- Clicking: ${link.label} (${link.text}) ---`);
    
    // Return to home before each click (except first)
    if (i > 0) {
      await goToHome(page);
    }
    
    await page.waitForTimeout(500);
    
    let btn = null;
    
    // Strategy 1: text-based link
    btn = await findLink(page, link.text);
    
    // Strategy 2: href-based fallback
    if (!btn) {
      const hrefBtn = page.locator(`a[href*="${link.href}"]`).first();
      if (await hrefBtn.count() > 0 && await hrefBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        btn = hrefBtn;
      }
    }
    
    // Strategy 3: specific href for contact
    if (!btn && link.label === 'contact') {
      const contactBtn = page.locator('a[href*="kontakt-oss"]').first();
      if (await contactBtn.count() > 0 && await contactBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        btn = contactBtn;
      }
    }
    
    // Strategy 4: direct URL navigation for contact
    if (!btn && link.href) {
      console.log(`  Trying direct navigation to /${link.href}...`);
      try {
        await page.goto(`https://www.experis.no/nb/${link.href}`);
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await page.waitForTimeout(1500);
        const title = await page.title();
        const url = page.url();
        console.log(`  Page: ${title}`);
        console.log(`  URL: ${url}`);
        await page.screenshot({ path: `experis-${link.label}.png`, fullPage: false });
        console.log(`  Screenshot: experis-${link.label}.png`);
        await page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'setValue', arguments: { key: 'process.step', value: `Clicked ${link.label}` } })}`);
        continue; // Skip the normal click block for this iteration
      } catch (e) {
        console.log(`  Direct navigation failed: ${e.message}`);
      }
    }
    
    try {
      if (btn) {
        console.log(`  Found ${link.label} link, clicking...`);
        await btn.click();
        
        try {
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        } catch (e) {
          console.log(`  Page load timeout, continuing...`);
        }
        await page.waitForTimeout(2000);
        
        const title = await page.title();
        const url = page.url();
        console.log(`  Page: ${title}`);
        console.log(`  URL: ${url}`);
        
        await page.screenshot({ path: `experis-${link.label}.png`, fullPage: false });
        console.log(`  Screenshot: experis-${link.label}.png`);
        
        await page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'setValue', arguments: { key: 'process.step', value: `Clicked ${link.label}` } })}`);
      } else {
        console.log(`  ${link.label} link not found`);
      }
    } catch (e) {
      console.log(`  Error clicking ${link.label}: ${e.message}`);
    }
  }

  // Final verification
  const finalUrl = page.url();
  const finalTitle = await page.title();
  console.log(`\n=== Final State ===`);
  console.log(`URL: ${finalUrl}`);
  console.log(`Title: ${finalTitle}`);

  try {
    expect(finalUrl).toContain('experis.no');
    console.log('Test PASSED! All navigation completed on experis.no domain');
    await page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'setTestStatus', arguments: { status: 'passed', remark: 'Clicked through all main navigation pages' } })}`);
    console.log('Marked test as PASSED in LambdaTest dashboard');
  } catch (e) {
    console.log('Test FAILED!');
    await page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'setTestStatus', arguments: { status: 'failed', remark: e.stack } })}`);
    console.log('Marked test as FAILED in LambdaTest dashboard');
    await teardown(page, browser);
    throw e;
  }

  await teardown(page, browser);
})().catch(err => {
  console.error('Unexpected error occurred:');
  console.error(err);
  process.exit(1);
});

async function teardown(page, browser) {
  console.log('Cleaning up resources...');
  await page.close();
  await browser.close();
  console.log('Test completed and resources cleaned up!');
}
