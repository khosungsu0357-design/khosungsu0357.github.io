import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** .env 를 아주 단순하게 읽는다 (의존성 없이). 이미 들어있는 process.env 가 우선. */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

export const root = ROOT;

export const env = {
  blogId: process.env.NAVER_BLOG_ID || '',
  statePath: path.resolve(ROOT, process.env.NBG_STATE_PATH || '.auth/naver.json'),
  defaultCategory: process.env.NBG_DEFAULT_CATEGORY || '',
  dryRun: process.env.NBG_DRY_RUN !== '0',
  slowMo: Number(process.env.NBG_SLOWMO ?? 120),
  outDir: path.join(ROOT, 'out'),
};

export function requireBlogId() {
  if (!env.blogId) {
    throw new Error('NAVER_BLOG_ID 가 비어 있습니다. .env.example 을 .env 로 복사해 채워주세요.');
  }
  return env.blogId;
}
