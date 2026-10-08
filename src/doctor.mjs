import { openContext, openEditor, shoot } from './browser.mjs';
import { findOne } from './sel.mjs';
import { log } from './log.mjs';

/** 글쓰기 화면에서 각 선택자가 실제로 잡히는지 한 번에 점검한다. */
const EDITOR_TARGETS = [
  'editor.canvas',
  'editor.titleParagraph',
  'editor.bodyParagraph',
  'toolbar.imageButton',
  'publish.openButton',
];

const PUBLISH_TARGETS = [
  'publish.layer',
  'publish.categoryButton',
  'publish.tagInput',
  'publish.openPublicRadio',
  'publish.scheduleRadio',
  'publish.confirmButton',
];

async function probe(scope, targets) {
  const rows = [];
  for (const target of targets) {
    const hit = await findOne(scope, target, { timeout: 4000, required: false });
    rows.push({ target, ok: !!hit, selector: hit?.selector ?? '—' });
  }
  return rows;
}

function report(title, rows) {
  console.log(`\n  ${title}`);
  for (const r of rows) {
    console.log(`   ${r.ok ? '✓' : '✗'} ${r.target.padEnd(26)} ${r.selector}`);
  }
}

export async function doctor({ headless = true } = {}) {
  const { browser, context } = await openContext({ headless });
  try {
    const handle = await openEditor(context);
    const { page, scope } = handle;

    const editorRows = await probe(scope, EDITOR_TARGETS);
    report('에디터 선택자', editorRows);

    let publishRows = [];
    const open = editorRows.find((r) => r.target === 'publish.openButton');
    if (open?.ok) {
      await scope.locator(open.selector).first().click();
      await page.waitForTimeout(1200);
      publishRows = await probe(scope, PUBLISH_TARGETS);
      report('발행 레이어 선택자', publishRows);
    } else {
      log.warn('발행 버튼을 못 찾아 발행 레이어 점검을 건너뜁니다.');
    }

    await shoot(page, 'doctor');

    const broken = [...editorRows, ...publishRows].filter((r) => !r.ok);
    console.log('');
    if (broken.length === 0) {
      log.ok('모든 선택자 정상. 바로 publish 가능합니다.');
    } else {
      log.fail(`깨진 선택자 ${broken.length}개 — config/selectors.json 을 수정하세요:`);
      for (const r of broken) console.log(`     - ${r.target}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}
