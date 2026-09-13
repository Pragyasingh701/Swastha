import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../wireframe/screenshots');

const publicRoutes = [
  { route: '/', filename: '01-landing.png' },
  { route: '/login', filename: '02-login.png' },
  { route: '/register', filename: '03-register.png' },
  { route: '/doctor-login', filename: '04-doctor-login.png' },
  { route: '/forgot-password', filename: '05-forgot-password.png' },
  { route: '/reset-password', filename: '06-reset-password.png' }
];

async function capturePublic() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  for (const item of publicRoutes) {
    console.log(`Navigating to ${item.route}...`);
    await page.goto(`${BASE_URL}${item.route}`, { waitUntil: 'networkidle' });
    // Small delay to ensure all animations/fonts render
    await page.waitForTimeout(1000);
    const targetPath = path.join(OUTPUT_DIR, item.filename);
    await page.screenshot({ path: targetPath, fullPage: true });
    console.log(`Saved ${targetPath}`);
  }

  await browser.close();
  console.log('Public screenshots captured successfully.');
}

capturePublic().catch((err) => {
  console.error('Error capturing public routes:', err);
  process.exit(1);
});
