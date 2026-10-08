import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { env, requireBlogId } from './env.mjs';
import { candidates, config, findOne, clickIfPresent } from './sel.mjs';
import { log } from './log.mjs';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export function hasSession() {
  return fs.existsSync(env.statePath);
}

/** 저장된 세션으로 브라우저를 띄운다. headless 기본 true. */
export async function openContext({ headless = true } = {}) {
  if (!hasSession()) {
    throw new Error(
      `세션 파일이 없습니다: ${env.statePath}\n` +
        `  → 로컬 PC 에서 \`npm run login\` 을 먼저 1회 실행하세요.`,
    );
  }
  const browser = await chromium.launch({
    headless,
    slowMo: env.slowMo,
    // 브라우저가 기본 경로에 없을 때 NBG_CHROMIUM_PATH 로 직접 지정할 수 있다.
    ...(process.env.NBG_CHROMIUM_PATH ? { executablePath: process.env.NBG_CHROMIUM_PATH } : {}),
    args: ['--disable-blink-features=AutomationControlled', '--lang=ko-KR'],
  });
  const context = await browser.newContext({
    storageState: env.statePath,
    userAgent: UA,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 980 },
  });
  // navigator.webdriver 흔적 제거
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { browser, context };
}

/** 세션이 살아있는지 확인. 로그인 폼이 보이면 끊긴 것. */
export async function assertLoggedIn(page) {
  for (const selector of candidates('loggedOutMarkers.any')) {
    if (await page.locator(selector).first().isVisible({ timeout: 500 }).catch(() => false)) {
      throw new Error(
        '세션이 만료되어 로그인 화면으로 넘어갔습니다.\n' +
          '  → 로컬 PC 에서 `npm run login` 을 다시 실행해 세션을 갱신하세요.',
      );
    }
  }
}

/**
 * 글쓰기 화면을 열고, 에디터가 들어있는 scope(page 또는 frame)를 돌려준다.
 * 구 프레임셋으로 리다이렉트되면 #mainFrame 안을 가리킨다.
 */
export async function openEditor(context) {
  const blogId = requireBlogId();
  const page = await context.newPage();
  const url = config.writeUrl.replace('{blogId}', blogId);

  log.info(`글쓰기 화면 열기: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await assertLoggedIn(page);

  let scope = page;
  const mainFrame = await findOne(page, 'frame.mainFrame', { timeout: 3000, required: false });
  if (mainFrame) {
    log.info('프레임셋 감지 — #mainFrame 안에서 작업합니다.');
    scope = page.frameLocator(mainFrame.selector);
  }

  // 에디터 캔버스가 뜰 때까지 대기
  await findOne(scope, 'editor.canvas', { timeout: 30_000 });

  // 방해 레이어 정리 (임시저장 복구 팝업 / 도움말 패널)
  if (await clickIfPresent(scope, 'popups.draftRestoreCancel')) log.info('임시저장 복구 팝업 닫음');
  if (await clickIfPresent(scope, 'popups.helpPanelClose')) log.info('도움말 패널 닫음');

  return { page, scope };
}

export async function shoot(page, name) {
  fs.mkdirSync(env.outDir, { recursive: true });
  const file = path.join(env.outDir, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log.info(`스크린샷: ${path.relative(process.cwd(), file)}`);
  return file;
}
