import fs from 'node:fs';
import path from 'node:path';

/**
 * 아주 단순한 YAML frontmatter 파서.
 * 지원: key: value / key: [a, b] / key: 여러 줄 없음.
 * (의존성 없이 쓰려고 최소 범위만 구현)
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };

  const head = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, '');
  const meta = {};

  for (const raw of head.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body };
}

/**
 * 본문을 에디터에 넣을 블록 배열로 쪼갠다.
 * - 빈 줄 기준으로 단락 분리
 * - `![alt](경로)` 만 있는 단락은 image 블록
 * - 그 외는 text 블록 (마크다운 기호는 의미 없는 것만 걷어냄)
 */
function toBlocks(body, baseDir) {
  const blocks = [];
  for (const chunk of body.split(/\r?\n\s*\r?\n/)) {
    const para = chunk.trim();
    if (!para) continue;

    const img = para.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (img) {
      const src = img[1].trim();
      blocks.push({
        type: 'image',
        path: path.isAbsolute(src) ? src : path.resolve(baseDir, src),
        raw: src,
      });
      continue;
    }

    const text = para
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, '')     // 헤딩 기호 제거 (에디터에서 서식 지정)
          .replace(/^[-*]\s+/, '· ')     // 불릿은 가운뎃점으로
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
          .trimEnd(),
      )
      .join('\n');

    blocks.push({ type: 'text', text });
  }
  return blocks;
}

export function loadPost(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`원고 파일이 없습니다: ${abs}`);

  const { meta, body } = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
  if (!meta.title) throw new Error(`frontmatter 에 title 이 없습니다: ${abs}`);

  const blocks = toBlocks(body, path.dirname(abs));
  for (const b of blocks) {
    if (b.type === 'image' && !fs.existsSync(b.path)) {
      throw new Error(`이미지를 찾을 수 없습니다: ${b.raw} (원고: ${path.basename(abs)})`);
    }
  }

  const tags = Array.isArray(meta.tags)
    ? meta.tags
    : String(meta.tags || '')
        .split(/[,\s]+/)
        .filter(Boolean);

  return {
    file: abs,
    title: meta.title,
    category: meta.category || '',
    tags: tags.slice(0, 30),              // 네이버 태그 상한 30개
    visibility: meta.visibility || 'public', // public | private
    publishAt: meta.publishAt || '',      // 'YYYY-MM-DD HH:mm' → 예약 발행
    blocks,
  };
}

export function listPosts(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(abs, f));
}
