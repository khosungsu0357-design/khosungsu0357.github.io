const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (...a) => console.log(`[${stamp()}]`, ...a),
  ok: (...a) => console.log(`[${stamp()}] ✓`, ...a),
  warn: (...a) => console.warn(`[${stamp()}] !`, ...a),
  fail: (...a) => console.error(`[${stamp()}] ✗`, ...a),
  step: (n, total, msg) => console.log(`[${stamp()}] (${n}/${total}) ${msg}`),
};
