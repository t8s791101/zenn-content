// キャラクター「もこひつじ」と小物を SVG 文字列で描く。テーマJSONの1行＝スタンプ1個。
const fs = require('fs');
const path = require('path');

const INK = '#5a4636', WOOL = '#ffffff', FACE = '#f8e4cc', CHEEK = '#f6a5b0', HORN = '#c98b5a';
const W = 370, H = 320;

function eyes(e) {
  const L = -14, R = 14, y = -4;
  const arcUp = x => `<path d="M${x - 6} ${y + 2} Q${x} ${y - 6} ${x + 6} ${y + 2}" class="ln"/>`;
  const arcDown = x => `<path d="M${x - 6} ${y} Q${x} ${y + 5} ${x + 6} ${y}" class="ln"/>`;
  const dot = x => `<circle cx="${x}" cy="${y}" r="4.5" fill="${INK}"/><circle cx="${x + 1.5}" cy="${y - 1.5}" r="1.4" fill="#fff"/>`;
  switch (e) {
    case 'happy': return arcUp(L) + arcUp(R);
    case 'sleep': return arcDown(L) + arcDown(R);
    case 'wink': return dot(L) + arcUp(R);
    case 'cry': return `<path d="M${L - 6} ${y - 2} L${L + 5} ${y + 2} L${L - 6} ${y + 5}" class="ln"/><path d="M${R + 6} ${y - 2} L${R - 5} ${y + 2} L${R + 6} ${y + 5}" class="ln"/>`
      + [L, R].map(x => `<path d="M${x} ${y + 8} q-4 8 0 12 q4 -4 0 -12z" fill="#7cc4f2"/>`).join('');
    case 'star': return [L, R].map(x => `<path d="M${x} ${y - 7} l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.7z" fill="#ffc02e" stroke="${INK}" stroke-width="1.5"/>`).join('');
    case 'heart': return [L, R].map(x => `<path transform="translate(${x} ${y})" d="M0 5 C-8 -2 -6 -9 0 -5 C6 -9 8 -2 0 5Z" fill="#f25f7a" stroke="${INK}" stroke-width="1.2"/>`).join('');
    default: return dot(L) + dot(R);
  }
}

function mouth(m) {
  switch (m) {
    case 'open': return `<path d="M-7 10 Q0 22 7 10 Z" fill="#e0606e" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    case 'o': return `<ellipse cx="0" cy="13" rx="4" ry="5" fill="#e0606e" stroke="${INK}" stroke-width="2.5"/>`;
    case 'flat': return `<path d="M-5 12 L5 12" class="ln"/>`;
    case 'wavy': return `<path d="M-8 13 q2.7 -4 5.3 0 q2.7 4 5.3 0 q2.7 -4 5.3 0" class="ln"/>`;
    default: return `<path d="M-6 9 Q-3 14 0 10 Q3 14 6 9" class="ln"/>`;
  }
}

function sheep({ x = 185, y = 160, s = 1, e = 'open', m = 'smile', tilt = 0, legs = true, wool = WOOL }) {
  const puffs = [[0, -58, 26], [-34, -46, 24], [34, -46, 24], [-52, -14, 24], [52, -14, 24], [-46, 22, 24], [46, 22, 24], [-20, 40, 24], [20, 40, 24], [0, -20, 40]];
  const outline = puffs.map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r + 3}" fill="${INK}"/>`).join('');
  const fill = puffs.map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r}" fill="${wool}"/>`).join('');
  const legSvg = legs ? `<ellipse cx="-22" cy="62" rx="9" ry="11" fill="${INK}"/><ellipse cx="22" cy="62" rx="9" ry="11" fill="${INK}"/>` : '';
  const horn = side => `<g transform="translate(${side * 44} -30) scale(${side} 1)"><circle r="13" fill="${HORN}" stroke="${INK}" stroke-width="3"/><path d="M0 0 m-6 0 a6 6 0 1 1 6 6" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/></g>`;
  return `<g transform="translate(${x} ${y}) rotate(${tilt}) scale(${s})">${legSvg}${outline}${fill}${horn(-1)}${horn(1)}
    <ellipse cx="0" cy="0" rx="34" ry="30" fill="${FACE}" stroke="${INK}" stroke-width="3"/>
    <circle cx="0" cy="-30" r="12" fill="${wool}" stroke="${INK}" stroke-width="3"/><circle cx="-10" cy="-26" r="9" fill="${wool}"/><circle cx="10" cy="-26" r="9" fill="${wool}"/><circle cx="0" cy="-30" r="10" fill="${wool}"/>
    <ellipse cx="-22" cy="9" rx="7" ry="4.5" fill="${CHEEK}" opacity=".85"/><ellipse cx="22" cy="9" rx="7" ry="4.5" fill="${CHEEK}" opacity=".85"/>
    ${eyes(e)}${mouth(m)}</g>`;
}

const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
// 小物。引数は [名前, x, y, ...]。x,y はスタンプ座標
const PROPS = {
  spark: (x, y, s = 1, c = '#ffc02e') => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12Z" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`,
  heart: (x, y, s = 1, c = '#f25f7a') => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 8 C-14 -4 -10 -16 0 -9 C10 -16 14 -4 0 8Z" fill="${c}" stroke="${INK}" stroke-width="2"/>`,
  sweat: (x, y) => `<path transform="translate(${x} ${y})" d="M0 0 q-6 10 0 14 q6 -4 0 -14z" fill="#7cc4f2" stroke="${INK}" stroke-width="1.5"/>`,
  zzz: (x, y) => `<text x="${x}" y="${y}" font-size="30" class="tx2" fill="#6c8ebf">Z</text><text x="${x + 22}" y="${y - 22}" font-size="22" class="tx2" fill="#6c8ebf">z</text><text x="${x + 38}" y="${y - 40}" font-size="16" class="tx2" fill="#6c8ebf">z</text>`,
  maru: (x, y, c = '#3aa35b') => `<circle cx="${x}" cy="${y}" r="58" fill="none" stroke="${c}" stroke-width="16"/>`,
  batsu: (x, y) => `<path d="M${x - 45} ${y - 45} L${x + 45} ${y + 45} M${x + 45} ${y - 45} L${x - 45} ${y + 45}" stroke="#e2483d" stroke-width="16" stroke-linecap="round"/>`,
  label: (x, y, t, size = 34, c = INK) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" class="tx" fill="${c}">${t}</text>`,
  envelope: (x, y, t = 'おとし', c = '#f25f5c') => `<g transform="translate(${x} ${y}) rotate(-10)"><rect x="-22" y="-30" width="44" height="60" rx="5" fill="${c}" ${S}/><path d="M-22 -14 L0 2 L22 -14" fill="none" stroke="#ffd166" stroke-width="3"/><text x="0" y="22" text-anchor="middle" font-size="13" class="tx2" fill="#fff">${t}</text></g>`,
  mochi: (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="14" rx="40" ry="16" fill="#fff" ${S}/><ellipse cx="0" cy="-8" rx="30" ry="14" fill="#fff" ${S}/><circle cx="0" cy="-26" r="9" fill="#f7a234" ${S}/><path d="M0 -35 l5 -6" stroke="#3aa35b" stroke-width="4" stroke-linecap="round"/></g>`,
  omikuji: (x, y) => `<g transform="translate(${x} ${y}) rotate(12)"><rect x="-17" y="-40" width="34" height="80" rx="3" fill="#fffaf0" ${S}/><text x="0" y="-8" text-anchor="middle" font-size="26" class="tx2" fill="#e2483d">大</text><text x="0" y="24" text-anchor="middle" font-size="26" class="tx2" fill="#e2483d">吉</text></g>`,
  torii: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-38" y="-4" width="10" height="70" fill="#e2483d" ${S}/><rect x="28" y="-4" width="10" height="70" fill="#e2483d" ${S}/><path d="M-54 -14 Q0 -24 54 -14 L50 -4 L-50 -4Z" fill="#e2483d" ${S}/><rect x="-44" y="10" width="88" height="8" fill="#e2483d" ${S}/></g>`,
  kotatsu: () => `<g><path d="M60 190 L310 190 L330 270 L40 270 Z" fill="#e85d5d" ${S}/><path d="M60 190 L310 190" stroke="#ffd166" stroke-width="6"/><rect x="40" y="176" width="290" height="18" rx="6" fill="#c98b5a" ${S}/><circle cx="270" cy="160" r="15" fill="#ff9f1c" ${S}/><circle cx="240" cy="166" r="12" fill="#ff9f1c" ${S}/></g>`,
  flag: (x, y, t) => `<g transform="translate(${x} ${y}) rotate(-8)"><path d="M0 0 L0 -80" stroke="${INK}" stroke-width="4"/><rect x="0" y="-80" width="70" height="44" rx="4" fill="#fff" ${S}/><text x="35" y="-50" text-anchor="middle" font-size="18" class="tx2" fill="#e2483d">${t}</text></g>`,
  paper: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-65" y="-75" width="130" height="150" rx="6" fill="#fffaf0" ${S}/><path d="M-47 -35 h94 M-47 0 h94 M-47 35 h60" stroke="#c9b8a4" stroke-width="4" stroke-linecap="round"/></g>`,
  banner: (x, y, t, c = '#e2483d') => { const ch = [...t]; const h = ch.length * 64 + 20; return `<rect x="${x - 60}" y="${y - h / 2}" width="120" height="${h}" rx="10" fill="${c}" ${S}/>` + ch.map((k, i) => `<text x="${x}" y="${y - h / 2 + 62 + i * 64}" text-anchor="middle" font-size="54" class="tx2" fill="#fff">${k}</text>`).join(''); },
  choco: (x, y, r = -12) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-34" y="-24" width="68" height="48" rx="6" fill="#7b4a2e" ${S}/><path d="M-11 -24 v48 M12 -24 v48 M-34 0 h68" stroke="#5c3520" stroke-width="3"/><rect x="-34" y="4" width="68" height="20" fill="#f25f7a" ${S}/></g>`,
  gift: (x, y, c = '#3a7bd5') => `<g transform="translate(${x} ${y})"><rect x="-32" y="-18" width="64" height="48" rx="4" fill="${c}" ${S}/><rect x="-36" y="-30" width="72" height="16" rx="4" fill="${c}" ${S}/><path d="M0 -30 v60" stroke="#ffd166" stroke-width="8"/><path d="M0 -30 q-22 -22 -26 -4 q4 8 26 4 q22 4 26 -4 q-4 -18 -26 4z" fill="#ffd166" stroke="${INK}" stroke-width="2.5"/></g>`,
  cake: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-40" y="-10" width="80" height="44" rx="6" fill="#fff4e6" ${S}/><path d="M-40 4 q10 8 20 0 q10 8 20 0 q10 8 20 0 q10 8 20 0" fill="none" stroke="#f25f7a" stroke-width="4"/><circle cx="-18" cy="-16" r="7" fill="#e2483d" ${S}/><circle cx="18" cy="-16" r="7" fill="#e2483d" ${S}/><rect x="-3" y="-44" width="6" height="30" fill="#7cc4f2" stroke="${INK}" stroke-width="2"/><path d="M0 -58 q-6 8 0 12 q6 -4 0 -12z" fill="#ffc02e" stroke="${INK}" stroke-width="1.5"/></g>`,
  flower: (x, y, c = '#f25f7a') => `<g transform="translate(${x} ${y})"><path d="M0 10 v60" stroke="#3aa35b" stroke-width="5"/><path d="M0 50 q-20 -6 -24 -22 q16 2 24 22z" fill="#5cbf75" stroke="${INK}" stroke-width="2"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-16" rx="12" ry="18" transform="rotate(${a})" fill="${c}" stroke="${INK}" stroke-width="2.5"/>`).join('')}<circle r="10" fill="#ffd166" stroke="${INK}" stroke-width="2.5"/></g>`,
  sakura: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map(a => `<path transform="rotate(${a})" d="M0 0 q-9 -10 -5 -20 l5 4 l5 -4 q4 10 -5 20z" fill="#ffc2d1" stroke="${INK}" stroke-width="1.5"/>`).join('')}</g>`,
  cup: (x, y) => `<g transform="translate(${x} ${y})"><path d="M-26 -20 h52 l-6 46 h-40z" fill="#fff" ${S}/><path d="M26 -10 q18 0 14 16 q-4 10 -18 8" fill="none" stroke="${INK}" stroke-width="3"/><path d="M-10 -32 q-6 -10 0 -18 M6 -32 q-6 -10 0 -18" stroke="#c9b8a4" stroke-width="3" fill="none" stroke-linecap="round"/></g>`,
  phone: (x, y) => `<g transform="translate(${x} ${y}) rotate(10)"><rect x="-24" y="-44" width="48" height="88" rx="9" fill="#5a6b80" ${S}/><rect x="-18" y="-34" width="36" height="62" rx="3" fill="#bfe3ff"/><circle cx="0" cy="36" r="4" fill="#fff"/></g>`,
};

function charWidth(t) { return [...t].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 0.62 : 1.0), 0); }

function text(t, y, size, color) {
  const fit = Math.min(size, Math.floor(330 / charWidth(t)));
  return `<text x="185" y="${y}" text-anchor="middle" font-size="${fit}" class="tx" fill="${color}">${t}</text>`;
}

// 1スタンプ分の内側SVG
function stamp(spec) {
  const lines = spec.t || [];
  const color = spec.c || '#e2483d';
  const size = spec.size || 46;
  const layout = spec.layout || 'center';
  let pos;
  if (layout === 'left') pos = { x: 130, y: 160, s: 0.95 };
  else if (layout === 'kotatsu') pos = { x: 185, y: 160, s: 0.8, legs: false };
  else pos = { x: 185, y: lines.length >= 2 ? 140 : 150, s: 1 };
  if (layout === 'none') pos = null;
  const body = pos ? sheep({ ...pos, e: spec.e, m: spec.m, tilt: spec.tilt || 0, wool: spec.wool }) : '';
  const props = (spec.props || []).map(([name, ...args]) => {
    if (!PROPS[name]) throw new Error(`未知の小物: ${name}`);
    return PROPS[name](...args);
  });
  // コタツは羊の前、その他は後ろに描く小物を分ける
  const front = (spec.props || []).map(p => p[0]).includes('kotatsu');
  const txt = lines.map((t, i) => text(t, 300 - (lines.length - 1 - i) * 50, i === lines.length - 1 ? size : size - 6, color)).join('');
  const inner = front ? body + props.join('') + txt : props.join('') + body + txt;
  return `<g transform="translate(185 160) scale(0.94) translate(-185 -160)">${inner}</g>`;
}

function css(fontDir) {
  const ja = fs.readFileSync(path.join(fontDir, 'm-plus-rounded-1c-japanese-800-normal.woff2')).toString('base64');
  const la = fs.readFileSync(path.join(fontDir, 'm-plus-rounded-1c-latin-800-normal.woff2')).toString('base64');
  return `@font-face{font-family:R;src:url(data:font/woff2;base64,${ja}) format('woff2')}@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');unicode-range:U+0000-00FF}
.tx{font-family:R;font-weight:800;stroke:#fff;stroke-width:10;paint-order:stroke;stroke-linejoin:round}
.tx2{font-family:R;font-weight:800}.ln{fill:none;stroke:${INK};stroke-width:3;stroke-linecap:round}html,body{margin:0;background:transparent}`;
}

function svg(inner, style, w = W, h = H, vb = `0 0 ${W} ${H}`) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}"><style>${style}</style>${inner}</svg>`;
}

function mainImage(spec, style) {
  return svg(sheep({ x: 0, y: 0, e: spec.e || 'happy', m: spec.m || 'open', wool: spec.wool }) + PROPS.spark(60, -60, 1.2), style, 240, 240, '-90 -100 180 180');
}
function tabImage(spec, style) {
  return svg(sheep({ x: 0, y: 0, e: spec.e || 'happy', m: spec.m || 'open', wool: spec.wool }), style, 96, 74, '-92 -102 184 142');
}

module.exports = { stamp, svg, css, mainImage, tabImage, PROPS, W, H };
