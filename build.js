// dist/ に静的サイトを書き出す。node build.js
const fs = require('fs');
const path = require('path');
const C = require('./src/calc');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const now = new Date(process.env.BUILD_DATE || Date.now());
const TY = now.getFullYear(), TM = now.getMonth() + 1, TD = now.getDate();
const FIRST = 1926;
const OUT = path.join(__dirname, 'dist');
const url = p => cfg.siteUrl.replace(/\/$/, '') + p;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `:root{--bg:#fbfaf7;--fg:#222;--muted:#666;--line:#e5e1d8;--accent:#c2410c;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--fg:#ececec;--muted:#a3a3a3;--line:#30333a;--accent:#fb923c;--card:#1e2025}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.8 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
header,main,footer{max-width:760px;margin:0 auto;padding:0 16px}header{padding-top:16px}header a{color:var(--fg);text-decoration:none;font-weight:700}
h1{font-size:1.45rem;line-height:1.5;margin:20px 0 8px}h2{font-size:1.15rem;margin:32px 0 8px;border-left:4px solid var(--accent);padding-left:8px}
a{color:var(--accent)}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.big{font-size:1.6rem;font-weight:700}table{width:100%;border-collapse:collapse;font-size:.95rem}th,td{border-bottom:1px solid var(--line);padding:7px 6px;text-align:left}
th{color:var(--muted);font-weight:600;white-space:nowrap}.scroll{overflow-x:auto}.muted{color:var(--muted);font-size:.9rem}
input,button{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}button{background:var(--accent);color:#fff;border:0;cursor:pointer}
nav.pn{display:flex;justify-content:space-between;margin:28px 0}footer{margin-top:48px;padding-bottom:40px;color:var(--muted);font-size:.85rem}footer a{color:var(--muted)}`;

function page({ p, title, desc, body, script = '' }) {
  const ads = cfg.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(cfg.adsenseClient)}" crossorigin="anonymous"></script>` : '';
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url(p)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${url(p)}">
<link rel="stylesheet" href="/style.css">${ads}</head><body>
<header><a href="/">${esc(cfg.siteName)}</a></header><main>${body}</main>
<footer><a href="/">年齢計算</a> ・ <a href="/hayami/">年齢早見表</a> ・ <a href="/about/">このサイトについて</a> ・ <a href="/privacy/">プライバシーポリシー</a><br>最終更新 ${TY}年${TM}月${TD}日</footer>
<script src="/calc.js"></script>${script}</body></html>`;
  const file = path.join(OUT, p, p.endsWith('/') ? 'index.html' : '');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return p;
}

const wy = y => C.warekiOfYear(y).join('・');
const schoolRows = s => [
  ['幼稚園入園（3年保育）', s.kindergarten], ['小学校入学', s.elementaryIn], ['小学校卒業', s.elementaryOut],
  ['中学校入学', s.juniorIn], ['中学校卒業', s.juniorOut], ['高校入学', s.highIn], ['高校卒業', s.highOut],
  ['大学入学（現役）', s.univIn], ['大学卒業（4年制・現役）', s.univOut], ['二十歳を祝う式典（1月）', s.twenty],
];

function yearPage(y) {
  const e = C.eto(y);
  const late = C.school(y, 6, 1), early = C.school(y, 2, 1);
  const after = TY - y, before = after - 1;
  const rows = schoolRows(late).map(([k, v], i) => `<tr><th>${k}</th><td>${v}年</td><td>${schoolRows(early)[i][1]}年</td></tr>`).join('');
  const ch = C.choju(y).map(c => `<tr><th>${c.name}（数え${c.kazoe}歳）</th><td>${c.year}年（${wy(c.year)}）</td></tr>`).join('');
  const body = `<h1>${y}年（${wy(y)}）生まれは何歳？年齢・学年・干支の早見表</h1>
<div class="card"><div class="muted">${TY}年の年齢</div>
<div class="big" id="ageNow">${after > 0 ? `${after}歳` : '0歳'}（誕生日の前は${Math.max(before, 0)}歳）</div>
<div>数え年：${C.kazoe(y, TY)}歳　干支：${e.kanshi}（${e.animal}年）</div></div>
<p>${y}年生まれの人は、${TY}年の誕生日を迎えると<strong>${after}歳</strong>、誕生日の前は${Math.max(before, 0)}歳です。生まれた日を入れると、今日時点の正確な年齢が分かります。</p>
<p><input type="date" id="bd" min="${y}-01-01" max="${y}-12-31" value="${y}-06-01" aria-label="生年月日"> <button id="go">計算</button></p><p id="out" class="card" hidden></p>
<h2>入学・卒業の年</h2><p>日本の学年は、4月2日生まれから翌年4月1日生まれまでが同じ学年です。${y}年1月1日〜4月1日生まれ（早生まれ）は、${y - 1}年4月2日以降の生まれと同じ学年になります。</p>
<div class="scroll"><table><tr><th></th><th>${y}年4/2〜12/31生まれ</th><th>${y}年1/1〜4/1生まれ</th></tr>${rows}</table></div>
<p class="muted">浪人・留年・飛び級がない場合。大学は4年制で計算しています。二十歳を祝う式典の時期は自治体によって異なります。</p>
<h2>干支と和暦</h2><table><tr><th>干支</th><td>${e.kanshi}（${e.shi}・${e.animal}）</td></tr><tr><th>和暦</th><td>${wy(y)}</td></tr>
${y === 1989 ? '<tr><th>改元</th><td>1月7日までが昭和64年、1月8日からが平成元年</td></tr>' : ''}${y === 2019 ? '<tr><th>改元</th><td>4月30日までが平成31年、5月1日からが令和元年</td></tr>' : ''}${y === 1926 ? '<tr><th>改元</th><td>12月24日までが大正15年、12月25日からが昭和元年</td></tr>' : ''}</table>
<p class="muted">干支は1月1日で区切っています。立春（2月4日ごろ）で区切る考え方では、1月1日〜節分生まれは前年の干支になります。</p>
<h2>長寿のお祝いの年</h2><table>${ch}</table><p class="muted">数え年で祝う場合。満年齢で祝う場合は1年後になります（還暦は満60歳と同じ年）。将来の和暦は、改元がない場合の表記です。</p>
<nav class="pn">${y > FIRST ? `<a href="/year/${y - 1}/">← ${y - 1}年生まれ</a>` : '<span></span>'}${y < TY ? `<a href="/year/${y + 1}/">${y + 1}年生まれ →</a>` : '<span></span>'}</nav>`;
  const script = `<script>(function(){var t=new Date(),y=t.getFullYear(),m=t.getMonth()+1,d=t.getDate(),Y=${y};
var a=y-Y,b=a-1;document.getElementById('ageNow').textContent=a+'歳（誕生日の前は'+Math.max(b,0)+'歳）';
document.getElementById('go').onclick=function(){var v=document.getElementById('bd').value.split('-').map(Number);if(v.length<3)return;
var o=document.getElementById('out');o.hidden=false;o.innerHTML='今日（'+y+'年'+m+'月'+d+'日）時点で <strong>'+Calc.age(v[0],v[1],v[2],y,m,d)+'歳</strong>。生まれた日の和暦は'+Calc.wareki(v[0],v[1],v[2])+'、'+(Calc.isEarly(v[1],v[2])?'早生まれです。':'早生まれではありません。');};})();</script>`;
  return page({ p: `/year/${y}/`, title: `${y}年（${wy(y)}）生まれは何歳？${TY}年の年齢・学年・干支`, desc: `${y}年（${wy(y)}）生まれの${TY}年の年齢、小学校〜大学の入学・卒業年（早生まれ別）、干支（${e.kanshi}）、還暦などの年をまとめた早見表。`, body, script });
}

function hayami() {
  const rows = [];
  for (let y = TY; y >= FIRST; y--) rows.push(`<tr><td><a href="/year/${y}/">${y}年</a></td><td>${wy(y)}</td><td>${C.eto(y).shi}（${C.eto(y).animal}）</td><td>${TY - y}歳</td><td>${C.school(y, 6, 1).elementaryIn}年</td></tr>`);
  return page({ p: '/hayami/', title: `年齢早見表（${TY}年版）西暦・和暦・干支・小学校入学年`, desc: `${TY}年の年齢早見表。${FIRST}年〜${TY}年生まれの年齢、和暦、干支、小学校入学年を一覧にしました。`,
    body: `<h1>年齢早見表（${TY}年版）</h1><p>${TY}年の誕生日を迎えたあとの満年齢です。誕生日の前は1つ引いてください。年をクリックすると、学年や長寿祝いの年が見られます。</p>
<div class="scroll"><table><tr><th>生まれ年</th><th>和暦</th><th>干支</th><th>${TY}年の年齢</th><th>小学校入学（4/2〜12/31生まれ）</th></tr>${rows.join('')}</table></div>` });
}

function home() {
  return page({ p: '/', title: `年齢計算・学年早見｜生年月日から年齢・入学卒業年・干支・和暦がすぐ分かる`, desc: '生年月日を入れるだけで、今日の満年齢、数え年、小学校〜大学の入学・卒業年、干支、和暦、還暦などの年が分かる無料ツール。',
    body: `<h1>年齢計算・学年早見ツール</h1><p>生年月日を入れると、今日の年齢と、入学・卒業の年、干支、和暦をまとめて出します。</p>
<div class="card"><label>生年月日 <input type="date" id="bd" value="1990-06-01"></label> <button id="go">計算する</button><div id="out" style="margin-top:12px"></div></div>
<h2>年齢から生まれ年を調べる</h2><div class="card"><label>年齢 <input type="number" id="ag" min="0" max="120" value="30" style="width:6em">歳</label> <button id="go2">調べる</button><div id="out2" style="margin-top:12px"></div></div>
<h2>生まれ年から探す</h2><p><a href="/hayami/">年齢早見表（${FIRST}年〜${TY}年）</a></p>
<p>${[2010, 2000, 1990, 1980, 1970, 1960, 1950].map(y => `<a href="/year/${y}/">${y}年生まれ</a>`).join(' ・ ')}</p>`,
    script: `<script>(function(){function T(){var t=new Date();return[t.getFullYear(),t.getMonth()+1,t.getDate()]}
document.getElementById('go').onclick=function(){var v=document.getElementById('bd').value.split('-').map(Number);if(v.length<3||!v[0])return;var t=T(),s=Calc.school(v[0],v[1],v[2]),e=Calc.eto(v[0]);
var r=[['今日の年齢',Calc.age(v[0],v[1],v[2],t[0],t[1],t[2])+'歳（数え年'+Calc.kazoe(v[0],t[0])+'歳）'],['和暦',Calc.wareki(v[0],v[1],v[2])+' '+v[1]+'月'+v[2]+'日'],['干支',e.kanshi+'（'+e.animal+'）'],['早生まれ',s.early?'はい':'いいえ'],
['小学校入学',s.elementaryIn+'年4月'],['中学校入学',s.juniorIn+'年4月'],['高校入学',s.highIn+'年4月'],['高校卒業',s.highOut+'年3月'],['大学卒業（4年制）',s.univOut+'年3月'],['二十歳を祝う式典',s.twenty+'年1月ごろ'],['還暦',(v[0]+60)+'年']];
document.getElementById('out').innerHTML='<table>'+r.map(function(x){return'<tr><th>'+x[0]+'</th><td>'+x[1]+'</td></tr>'}).join('')+'</table><p><a href="/year/'+v[0]+'/">'+v[0]+'年生まれの詳しい早見表</a></p>';};
document.getElementById('go2').onclick=function(){var a=Number(document.getElementById('ag').value),t=T(),b=Calc.birthYearsFromAge(a,t[0]);
document.getElementById('out2').innerHTML='今年の誕生日を<strong>迎えた人</strong>は'+b.afterBirthday+'年（'+Calc.warekiOfYear(b.afterBirthday).join('・')+'）生まれ、<strong>まだの人</strong>は'+b.beforeBirthday+'年（'+Calc.warekiOfYear(b.beforeBirthday).join('・')+'）生まれです。';};})();</script>` });
}

function staticPages() {
  page({ p: '/about/', title: `このサイトについて｜${cfg.siteName}`, desc: `${cfg.siteName}の運営方針と計算方法。`,
    body: `<h1>このサイトについて</h1><p>${esc(cfg.siteName)}は、生年月日から年齢・学年・干支・和暦を調べる無料ツールです。</p>
<h2>計算方法</h2><ul><li>満年齢は誕生日の当日に1つ増えるものとして計算します（2月29日生まれは、平年は3月1日）。</li><li>学年は4月2日生まれから翌年4月1日生まれまでを同じ学年として計算します。</li><li>和暦の改元日：大正 1912年7月30日、昭和 1926年12月25日、平成 1989年1月8日、令和 2019年5月1日。</li><li>干支は1月1日で区切ります。</li></ul>
<p>計算はすべてあなたのブラウザの中で行い、入力した生年月日は送信・保存しません。</p><h2>お問い合わせ</h2><p>${cfg.contactEmail ? esc(cfg.contactEmail) : '（準備中）'}</p>` });
  page({ p: '/privacy/', title: `プライバシーポリシー｜${cfg.siteName}`, desc: 'プライバシーポリシー',
    body: `<h1>プライバシーポリシー</h1><h2>入力した情報</h2><p>入力した生年月日はブラウザ内で計算に使うだけで、サーバーへ送信・保存しません。</p>
<h2>広告について</h2><p>当サイトは第三者配信の広告サービス「Google アドセンス」を利用します。広告配信事業者は、ユーザーの興味に応じた広告を表示するために Cookie を使用することがあります。Cookie を無効にする方法や Google アドセンスについては、<a href="https://policies.google.com/technologies/ads?hl=ja" rel="nofollow">Google の広告に関するポリシー</a>をご覧ください。パーソナライズ広告は<a href="https://adssettings.google.com/" rel="nofollow">広告設定</a>で無効にできます。</p>
<h2>アクセス解析</h2><p>サイト改善のため、Cookie を使わないアクセス解析（Cloudflare Web Analytics）を利用する場合があります。</p>
<h2>免責事項</h2><p>計算結果の正確性には注意していますが、その利用によって生じた損害について責任を負いかねます。公的な手続きでは、各機関の案内をご確認ください。</p>
<h2>改定</h2><p>本ポリシーは予告なく改定することがあります。制定 ${TY}年${TM}月${TD}日</p>` });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'style.css'), CSS);
fs.copyFileSync(path.join(__dirname, 'src/calc.js'), path.join(OUT, 'calc.js'));
const pages = [home(), hayami()];
for (let y = FIRST; y <= TY; y++) pages.push(yearPage(y));
staticPages(); pages.push('/about/', '/privacy/');
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `<url><loc>${url(p)}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${url('/sitemap.xml')}\n`);
if (cfg.adsenseClient) fs.writeFileSync(path.join(OUT, 'ads.txt'), `google.com, ${cfg.adsenseClient.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
fs.writeFileSync(path.join(OUT, '404.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ページが見つかりません</title><link rel="stylesheet" href="/style.css"><main><h1>ページが見つかりません</h1><p><a href="/">年齢計算のトップへ</a></p></main>`);
console.log(`${pages.length}ページ → dist/（${TY}-${TM}-${TD}時点）`);
