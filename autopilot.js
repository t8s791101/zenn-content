#!/usr/bin/env node
// 収益化オートパイロット（LINEスタンプ）
//   node autopilot.js plan               … 今日やることを表示
//   node autopilot.js build <テーマID>    … 画像18点・検査・zip・申請文を dist/<ID>/ に作る
//   node autopilot.js auto [--days 45]   … 申請期限が近い未制作テーマを全部 build し、TODO.md を書く
//   node autopilot.js mark <ID> <状態>    … built / submitted / approved / selling / rejected
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { stamp, svg, css, mainImage, tabImage, W, H } = require('./src/draw');

const ROOT = __dirname;
const THEMES = path.join(ROOT, 'themes');
const DIST = path.join(ROOT, 'dist');
const STATE = path.join(ROOT, 'state.json');
const MAX_BYTES = 1_000_000;
const MIN_MARGIN = 10;

const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {});
const saveState = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
const themes = () => fs.readdirSync(THEMES).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(THEMES, f), 'utf8')));
const today = () => new Date(process.env.AUTOPILOT_TODAY || Date.now()).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// 無圧縮ZIP（依存なし）
function zip(files, out) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const n = Buffer.from(name), crc = zlib.crc32(data) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    local.push(h, n, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  fs.writeFileSync(out, Buffer.concat([...local, cd, e]));
}

async function build(theme, browser) {
  const out = path.join(DIST, theme.id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const style = css(path.join(ROOT, 'fonts'));
  const page = await browser.newPage();
  async function shot(file, s, w, h) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><head><style>${style}</style></head><body>${s}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('svg').screenshot({ path: path.join(out, file), omitBackground: true });
  }
  const names = theme.stamps.map((_, i) => String(i + 1).padStart(2, '0') + '.png');
  for (let i = 0; i < theme.stamps.length; i++) await shot(names[i], svg(stamp(theme.stamps[i]), style), W, H);
  const face = theme.stamps[0];
  await shot('main.png', mainImage(face, style), 240, 240);
  await shot('tab.png', tabImage(face, style), 96, 74);

  // 検査：サイズ、透過、余白、容量、個数
  const problems = [];
  if (![8, 16, 24, 32, 40].includes(names.length)) problems.push(`個数 ${names.length} は 8/16/24/32/40 のどれでもない`);
  const expect = Object.fromEntries([...names.map(n => [n, [W, H, MIN_MARGIN]]), ['main.png', [240, 240, 0]], ['tab.png', [96, 74, 0]]]);
  for (const [file, [ew, eh, margin]] of Object.entries(expect)) {
    const buf = fs.readFileSync(path.join(out, file));
    if (buf.length > MAX_BYTES) problems.push(`${file}: ${buf.length}B が1MBを超える`);
    const r = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let l = c.width, t = c.height, r = -1, bt = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); bt = Math.max(bt, y); }
      return { w: img.width, h: img.height, corner: d[3], margin: r < 0 ? -1 : Math.min(l, t, c.width - 1 - r, c.height - 1 - bt) };
    }, buf.toString('base64'));
    if (r.w !== ew || r.h !== eh) problems.push(`${file}: ${r.w}x${r.h}（期待 ${ew}x${eh}）`);
    if (r.corner !== 0) problems.push(`${file}: 背景が透過していない`);
    if (r.margin < 0) problems.push(`${file}: 中身が空`);
    else if (r.margin < margin) problems.push(`${file}: 余白 ${r.margin}px（${margin}px以上必要）`);
  }

  // 一覧画像（確認用）
  await page.setViewportSize({ width: 4 * 190, height: Math.ceil(names.length / 4) * 165 });
  await page.setContent(`<body style="margin:0;background:#9bb0c8;display:grid;grid-template-columns:repeat(4,185px);gap:5px">${names.map(n => `<img width="185" src="data:image/png;base64,${fs.readFileSync(path.join(out, n)).toString('base64')}">`).join('')}</body>`);
  await page.screenshot({ path: path.join(out, 'preview.png'), fullPage: true });
  await page.close();

  zip([...names, 'main.png', 'tab.png'].map(n => ({ name: n, data: fs.readFileSync(path.join(out, n)) })), path.join(out, 'upload.zip'));
  fs.writeFileSync(path.join(out, 'listing.md'), listing(theme));
  return problems;
}

function listing(t) {
  return `# 申請用テキスト：${t.title}

| 項目 | 入力する内容 |
|---|---|
| タイトル（日本語） | ${t.title} |
| 説明文（日本語） | ${t.description} |
| タイトル（英語） | ${t.titleEn} |
| 説明文（英語） | ${t.descriptionEn} |
| 個数 | ${t.stamps.length}個 |
| 販売価格 | 120円 |
| 画像 | upload.zip をそのままアップロード |
${t.submitBy ? `| 申請の目安 | ${t.submitBy} までに審査リクエスト（売れる時期 ${t.peak[0]}〜${t.peak[1]}） |\n` : ''}
絵柄はプログラムで描いたオリジナル（他人のキャラクター・作品は不使用）。フォントは M PLUS Rounded 1c（SIL Open Font License）。
`;
}

function plan() {
  const st = loadState(), now = today();
  const rows = themes().map(t => ({ t, status: st[t.id]?.status || 'todo', left: t.submitBy ? daysBetween(now, t.submitBy) : null }))
    .sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999));
  const lines = [`# 今日やること（${now}）`, ''];
  const todo = rows.filter(r => ['todo', 'built'].includes(r.status) && (r.left === null || r.left >= 0));
  if (!todo.length) lines.push('なし。審査結果を待つだけです。');
  for (const r of todo) {
    const when = r.left === null ? '通年（いつでも）' : `申請期限まであと${r.left}日（${r.t.submitBy}）`;
    const act = r.status === 'todo' ? `\`node autopilot.js build ${r.t.id}\`` : `dist/${r.t.id}/upload.zip を LINE Creators Market で申請 → \`node autopilot.js mark ${r.t.id} submitted\``;
    lines.push(`- **${r.t.title}**：${when}。${act}`);
  }
  const late = rows.filter(r => r.left !== null && r.left < 0 && ['todo', 'built'].includes(r.status));
  for (const r of late) lines.push(`- （期限切れ）${r.t.title}：来年用に日付を更新`);
  lines.push('', '## 状態', '', '| テーマ | 状態 |', '|---|---|', ...rows.map(r => `| ${r.t.id} | ${r.status} |`));
  return lines.join('\n') + '\n';
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'plan' || !cmd) { process.stdout.write(plan()); return; }
  if (cmd === 'mark') {
    const [id, status] = args; const ok = ['todo', 'built', 'submitted', 'approved', 'selling', 'rejected'];
    if (!themes().some(t => t.id === id) || !ok.includes(status)) throw new Error(`使い方: mark <ID> <${ok.join('|')}>`);
    const st = loadState(); st[id] = { status, at: today() }; saveState(st); process.stdout.write(plan()); return;
  }
  const { chromium } = require('playwright');
  let targets;
  if (cmd === 'build') targets = themes().filter(t => args.length === 0 || args.includes(t.id));
  else if (cmd === 'auto') {
    const days = Number(args[args.indexOf('--days') + 1]) || 45, st = loadState(), now = today();
    targets = themes().filter(t => (st[t.id]?.status || 'todo') === 'todo' && (t.submitBy === null || (daysBetween(now, t.submitBy) >= 0 && daysBetween(now, t.submitBy) <= days)));
  } else throw new Error(`不明なコマンド: ${cmd}`);
  if (!targets.length) throw new Error('対象のテーマがありません');
  const browser = await chromium.launch();
  const st = loadState(); let failed = 0;
  for (const t of targets) {
    const problems = await build(t, browser);
    if (problems.length) { failed++; console.log(`NG ${t.id}\n  ` + problems.join('\n  ')); }
    else { st[t.id] = { status: 'built', at: today() }; console.log(`OK ${t.id} → dist/${t.id}/upload.zip`); }
  }
  await browser.close();
  saveState(st);
  fs.writeFileSync(path.join(ROOT, 'TODO.md'), plan());
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
