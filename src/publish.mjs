import { env } from './env.mjs';
import { findOne, clickIfPresent } from './sel.mjs';
import { shoot } from './browser.mjs';
import { log } from './log.mjs';

/** 한글 IME 문제를 피하려고 keyboard.type 대신 insertText 를 쓴다. */
async function insert(page, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) await page.keyboard.press('Shift+Enter'); // 같은 단락 안 줄바꿈
    if (lines[i]) await page.keyboard.insertText(lines[i]);
  }
}

async function fillTitle(page, scope, title) {
  const { loc } = await findOne(scope, 'editor.titleParagraph', { timeout: 20_000 });
  await loc.click();
  await insert(page, title);
  log.ok(`제목 입력: ${title}`);
}

async function fillBody(page, scope, blocks) {
  const { loc } = await findOne(scope, 'editor.bodyParagraph', { timeout: 20_000 });
  await loc.click();

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (i > 0) await page.keyboard.press('Enter'); // 새 단락

    if (block.type === 'text') {
      await insert(page, block.text);
      log.step(i + 1, blocks.length, `본문 단락 (${block.text.length}자)`);
    } else {
      await insertImage(page, scope, block.path);
      log.step(i + 1, blocks.length, `이미지 ${block.raw}`);
      await page.waitForTimeout(1200); // 업로드 완료 여유
    }
  }
}

async function insertImage(page, scope, filePath) {
  // 사진 버튼이 여는 OS file chooser 를 가로채서 파일을 넣는다.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15_000 }),
    (async () => {
      const { loc } = await findOne(scope, 'toolbar.imageButton', { timeout: 10_000 });
      await loc.click();
    })(),
  ]);
  await chooser.setFiles(filePath);
}

async function setCategory(scope, category) {
  if (!category) return;
  const button = await findOne(scope, 'publish.categoryButton', { timeout: 5000, required: false });
  if (!button) {
    log.warn(`카테고리 선택 UI 를 찾지 못해 건너뜁니다 (요청: ${category})`);
    return;
  }
  await button.loc.click();
  const option = await findOne(scope, 'publish.categoryOption', {
    vars: { category },
    timeout: 5000,
    required: false,
  });
  if (!option) {
    log.warn(`카테고리 "${category}" 를 목록에서 찾지 못했습니다. 기본값으로 둡니다.`);
    await scope.locator('body').press?.('Escape').catch(() => {});
    return;
  }
  await option.loc.click();
  log.ok(`카테고리: ${category}`);
}

async function setTags(page, scope, tags) {
  if (!tags.length) return;
  const input = await findOne(scope, 'publish.tagInput', { timeout: 5000, required: false });
  if (!input) {
    log.warn('태그 입력란을 찾지 못해 건너뜁니다.');
    return;
  }
  await input.loc.click();
  for (const tag of tags) {
    await page.keyboard.insertText(tag);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
  log.ok(`태그 ${tags.length}개: ${tags.join(', ')}`);
}

async function setVisibility(scope, visibility) {
  const target = visibility === 'private' ? 'publish.privateRadio' : 'publish.openPublicRadio';
  const hit = await findOne(scope, target, { timeout: 4000, required: false });
  if (!hit) {
    log.warn(`공개범위(${visibility}) UI 를 찾지 못해 기본값을 씁니다.`);
    return;
  }
  await hit.loc.click({ force: true });
  log.ok(`공개범위: ${visibility === 'private' ? '비공개' : '전체공개'}`);
}

async function setSchedule(scope, publishAt) {
  if (!publishAt) return;
  const m = publishAt.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) throw new Error(`publishAt 형식이 잘못됐습니다: "${publishAt}" (예: 2026-10-09 09:00)`);
  const [, y, mo, d, hh, mm] = m;

  const radio = await findOne(scope, 'publish.scheduleRadio', { timeout: 4000, required: false });
  if (!radio) {
    log.warn('예약 발행 UI 를 찾지 못했습니다. 즉시 발행으로 진행됩니다.');
    return;
  }
  await radio.loc.click({ force: true });

  const date = await findOne(scope, 'publish.scheduleDateInput', { timeout: 4000, required: false });
  if (date) {
    await date.loc.fill(`${y}.${mo}.${d}.`).catch(async () => {
      await date.loc.fill(`${y}-${mo}-${d}`);
    });
  }
  const hour = await findOne(scope, 'publish.scheduleHourSelect', { timeout: 2000, required: false });
  if (hour) await hour.loc.selectOption(hh).catch(() => {});
  const minute = await findOne(scope, 'publish.scheduleMinuteSelect', { timeout: 2000, required: false });
  if (minute) await minute.loc.selectOption(mm).catch(() => {});

  log.ok(`예약 발행: ${publishAt}`);
}

/**
 * 원고 하나를 에디터에 채우고 발행(또는 예약)한다.
 * dryRun 이면 발행 레이어까지만 열고 확정 버튼은 누르지 않는다.
 */
export async function publishPost({ page, scope }, post, { dryRun = env.dryRun } = {}) {
  await fillTitle(page, scope, post.title);
  await fillBody(page, scope, post.blocks);

  log.info('발행 레이어 열기');
  const open = await findOne(scope, 'publish.openButton', { timeout: 15_000 });
  await open.loc.click();
  await findOne(scope, 'publish.layer', { timeout: 10_000, required: false });
  await page.waitForTimeout(600);

  await setCategory(scope, post.category || env.defaultCategory);
  await setVisibility(scope, post.visibility);
  await setTags(page, scope, post.tags);
  await setSchedule(scope, post.publishAt);

  await shoot(page, 'before-confirm');

  if (dryRun) {
    log.warn('DRY RUN — 발행 버튼을 누르지 않았습니다. 실제 발행은 NBG_DRY_RUN=0 또는 --live.');
    return { published: false };
  }

  const confirm = await findOne(scope, 'publish.confirmButton', { timeout: 10_000 });
  await confirm.loc.click();
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shoot(page, 'after-publish');

  log.ok(post.publishAt ? `예약 등록 완료 (${post.publishAt})` : '발행 완료');
  return { published: true, url: page.url() };
}
