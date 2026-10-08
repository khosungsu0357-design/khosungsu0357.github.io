import fs from 'node:fs';
import path from 'node:path';
import { root } from './env.mjs';

const raw = JSON.parse(
  fs.readFileSync(path.join(root, 'config', 'selectors.json'), 'utf8'),
);

/** config/selectors.json 의 중첩 경로를 'publish.openButton' 형태로 읽는다. */
export function candidates(dottedPath, vars = {}) {
  let node = raw;
  for (const key of dottedPath.split('.')) node = node?.[key];
  if (!node) throw new Error(`선택자 경로를 찾을 수 없습니다: ${dottedPath}`);
  const list = Array.isArray(node) ? node : [node];
  return list.map((s) =>
    String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`),
  );
}

export const config = raw;

/**
 * 후보 선택자를 순서대로 시도해 '보이는' 첫 locator 를 돌려준다.
 * 하나도 못 잡으면 required 에 따라 throw 하거나 null.
 */
export async function findOne(scope, dottedPath, { vars = {}, timeout = 8000, required = true } = {}) {
  const list = candidates(dottedPath, vars);
  const per = Math.max(600, Math.floor(timeout / list.length));
  for (const selector of list) {
    const loc = scope.locator(selector).first();
    try {
      await loc.waitFor({ state: 'visible', timeout: per });
      return { loc, selector };
    } catch {
      /* 다음 후보 */
    }
  }
  if (required) {
    throw new Error(
      `선택자를 찾지 못했습니다: ${dottedPath}\n  시도: ${list.join('\n       ')}\n` +
        `  → config/selectors.json 의 "${dottedPath}" 를 갱신하세요. (npm run doctor 로 확인)`,
    );
  }
  return null;
}

/** 있으면 클릭, 없으면 조용히 통과 (방해 레이어 닫기용). */
export async function clickIfPresent(scope, dottedPath, { vars = {}, timeout = 1500 } = {}) {
  const hit = await findOne(scope, dottedPath, { vars, timeout, required: false });
  if (!hit) return false;
  try {
    await hit.loc.click({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
