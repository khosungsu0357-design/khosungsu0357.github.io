import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { env } from './env.mjs';
import { candidates } from './sel.mjs';
import { log } from './log.mjs';

const prompt = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close();
      resolve(a);
    });
  });

/**
 * 1회 수동 로그인 → 세션(쿠키)만 파일로 저장.
 * 네이버는 자동 로그인 시도를 캡차/기기등록으로 차단하므로 비밀번호를 코드에 두지 않는다.
 * 화면이 있는 로컬 PC 에서 실행해야 한다 (headless 불가).
 */
export async function login() {
  const browser = await chromium.launch({
    headless: false,
    ...(process.env.NBG_CHROMIUM_PATH ? { executablePath: process.env.NBG_CHROMIUM_PATH } : {}),
    args: ['--disable-blink-features=AutomationControlled', '--lang=ko-KR'],
  });
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto('https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com%2F');

  console.log('');
  console.log('  브라우저 창에서 직접 로그인하세요.');
  console.log('  - 아이디/비밀번호는 입력창에 붙여넣기(Ctrl+V)로 넣으면 캡차가 덜 뜹니다.');
  console.log('  - 2단계 인증/기기 등록이 나오면 "등록"까지 완료하세요. 세션이 오래 갑니다.');
  console.log('  - 블로그 홈까지 들어간 뒤 아래에서 Enter 를 누르세요.');
  console.log('');
  await prompt('  로그인을 마쳤으면 Enter: ');

  await page.goto('https://blog.naver.com/', { waitUntil: 'domcontentloaded' });
  for (const selector of candidates('loggedOutMarkers.any')) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (visible) {
      await browser.close();
      throw new Error('아직 로그인 상태가 아닙니다. 다시 `npm run login` 을 실행하세요.');
    }
  }

  fs.mkdirSync(path.dirname(env.statePath), { recursive: true });
  await context.storageState({ path: env.statePath });
  await browser.close();

  log.ok(`세션 저장: ${path.relative(process.cwd(), env.statePath)}`);
  log.warn('이 파일은 로그인 쿠키입니다. 절대 커밋/공유하지 마세요 (.gitignore 에 이미 포함).');
}
