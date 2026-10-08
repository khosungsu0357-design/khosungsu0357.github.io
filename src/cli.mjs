#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { env, root, requireBlogId } from './env.mjs';
import { loadPost, listPosts } from './post.mjs';
import { log } from './log.mjs';

// playwright 가 필요한 모듈은 실제로 쓸 때만 불러온다.
// 덕분에 new / check 는 npm install 없이도 돌아간다.
const lazy = {
  browser: () => import('./browser.mjs'),
  publish: () => import('./publish.mjs'),
  doctor: () => import('./doctor.mjs'),
  login: () => import('./login.mjs'),
};

const USAGE = `
네이버 블로그 자동화 (nbg)

  npm run login                       1회 수동 로그인 → 세션 저장 (화면 있는 PC 에서)
  npm run doctor                      글쓰기 화면을 열어 선택자 상태 점검
  node src/cli.mjs new <슬러그>        원고 템플릿 생성
  node src/cli.mjs check <파일|디렉터리>  원고 파싱만 검증 (브라우저 안 띄움)
  node src/cli.mjs publish <파일>      원고 1건 작성 → 발행 레이어까지 (기본 dry-run)
       옵션: --live        실제 발행까지 진행
            --headed      브라우저 창을 띄워서 확인
            --all <디렉터리>  디렉터리 내 .md 전부 순차 처리

  환경변수는 .env (.env.example 참고)
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out.flags[key] = next;
        i += 1;
      } else {
        out.flags[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function cmdNew(slug) {
  if (!slug) throw new Error('슬러그를 주세요. 예: node src/cli.mjs new 하마비-텀블벅-오픈');
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(root, 'posts', `${date}-${slug}.md`);
  if (fs.existsSync(file)) throw new Error(`이미 있습니다: ${file}`);
  fs.writeFileSync(
    file,
    `---
title: 제목을 여기에
category: ${env.defaultCategory}
tags: [태그1, 태그2]
visibility: public
publishAt:
---

첫 단락을 씁니다. 빈 줄로 구분하면 에디터에서 새 단락이 됩니다.

![대표 이미지](./images/example.jpg)

다음 단락.
`,
    'utf8',
  );
  log.ok(`생성: ${path.relative(process.cwd(), file)}`);
}

function cmdCheck(target) {
  if (!target) throw new Error('검증할 파일이나 디렉터리를 주세요.');
  const files = fs.statSync(target).isDirectory() ? listPosts(target) : [path.resolve(target)];
  if (!files.length) throw new Error(`.md 원고가 없습니다: ${target}`);

  for (const file of files) {
    const post = loadPost(file);
    const images = post.blocks.filter((b) => b.type === 'image').length;
    const chars = post.blocks
      .filter((b) => b.type === 'text')
      .reduce((n, b) => n + b.text.length, 0);
    console.log(
      `  ✓ ${path.basename(file)}\n` +
        `     제목   ${post.title}\n` +
        `     카테고리 ${post.category || '(기본)'}  공개 ${post.visibility}` +
        `${post.publishAt ? `  예약 ${post.publishAt}` : ''}\n` +
        `     태그   ${post.tags.join(', ') || '(없음)'}\n` +
        `     본문   단락 ${post.blocks.length}개 · 글자 ${chars}자 · 이미지 ${images}장`,
    );
  }
  log.ok(`${files.length}건 파싱 정상`);
}

async function cmdPublish(args) {
  requireBlogId();
  const { openContext, openEditor, hasSession } = await lazy.browser();
  const { publishPost } = await lazy.publish();
  if (!hasSession()) {
    throw new Error(
      `세션이 없습니다 (${path.relative(process.cwd(), env.statePath)}).\n` +
        '  → 로컬 PC 에서 `npm run login` 먼저 실행하세요.',
    );
  }

  const dryRun = args.flags.live ? false : env.dryRun;
  const headless = !args.flags.headed;
  const files = args.flags.all
    ? listPosts(String(args.flags.all))
    : args._.slice(1).map((f) => path.resolve(f));

  if (!files.length) throw new Error('발행할 원고를 지정하세요. (파일 경로 또는 --all posts)');

  const posts = files.map(loadPost); // 브라우저 띄우기 전에 전부 검증
  log.info(`${posts.length}건 / dryRun=${dryRun} / headless=${headless}`);

  const { browser, context } = await openContext({ headless });
  const results = [];
  try {
    for (const post of posts) {
      log.info(`── ${post.title}`);
      const handle = await openEditor(context);
      try {
        const r = await publishPost(handle, post, { dryRun });
        results.push({ title: post.title, ...r });
      } finally {
        await handle.page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }

  console.log('');
  for (const r of results) {
    console.log(`  ${r.published ? '발행' : 'dry-run'}  ${r.title}${r.url ? `  ${r.url}` : ''}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  switch (cmd) {
    case 'login': {
      const { login } = await lazy.login();
      return login();
    }
    case 'doctor': {
      const { doctor } = await lazy.doctor();
      return doctor({ headless: !args.flags.headed });
    }
    case 'new':
      return cmdNew(args._[1]);
    case 'check':
      return cmdCheck(args._[1] || 'posts');
    case 'publish':
      return cmdPublish(args);
    default:
      console.log(USAGE);
      if (cmd) process.exitCode = 1;
  }
}

main().catch((err) => {
  log.fail(err.message);
  process.exitCode = 1;
});
