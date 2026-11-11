---
title: "有料：sales.py と analyze.py（「○部売れた」を拾い、表を作り直す）"
free: false
---

## ② sales.py（「○部売れた」を拾う）

題名と説明文に部数が無ければ、本文を取りに行って探します。1〜10万部の範囲だけを数えています
（「2026年」などの数字を部数と誤読しないため）。

```python
#!/usr/bin/env python3
"""「○部売れた」と自分で書いている記事を集め、価格×部数で売上の実例を作る。"""
import json,time,urllib.request,urllib.parse,re,sys
from pathlib import Path
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}
OUT=Path('/tmp/mkt')
def get(u,t=3):
    for i in range(t):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=25) as r:
                return json.loads(r.read().decode())
        except Exception:
            if i==t-1: return None
            time.sleep(1.5*(i+1))
Q=["部突破","部売れ","部販売","売上 万円 note","初売上","有料note 売れた","部達成","万円達成 note"]
seen,rows={},[]
for q in Q:
    for sort in ("popular","new"):
        for p in range(8):
            d=get(f'https://note.com/api/v3/searches?context=note&q={urllib.parse.quote(q)}&size=20&start={p*20}&sort={sort}')
            if not d or 'data' not in d: break
            c=d['data'].get('notes',{}).get('contents') or []
            if not c: break
            for x in c:
                k=x.get('key')
                if not k or k in seen: continue
                seen[k]=1
                rows.append(dict(key=k,price=x.get('price') or 0,likes=x.get('like_count'),
                    name=x.get('name',''),desc=(x.get('description') or '')[:300],
                    user=(x.get('user') or {}).get('urlname'),publish=(x.get('publish_at') or '')[:10],q=q))
            time.sleep(0.45)
    print(f'  {q}: 累計{len(rows)}',file=sys.stderr,flush=True)
# 本文から「N部」を拾う
pat=re.compile(r'(\d[\d,]{0,6})\s*(?:部|本)(?:突破|販売|売れ|達成|完売)')
hits=[]
for i,r in enumerate(rows,1):
    txt=r['name']+' '+r['desc']
    m=pat.search(txt)
    if not m:
        d=get(f"https://note.com/api/v3/notes/{r['key']}")
        if d and 'data' in d:
            body=re.sub(r'<[^>]+>',' ',d['data'].get('body') or '')
            m=pat.search(body)
            r['price']=d['data'].get('price') or r['price']
        time.sleep(0.3)
    if m:
        n=int(m.group(1).replace(',',''))
        if 1<=n<=100000:
            r['claim']=n; hits.append(r)
    if i%100==0: print(f'  本文確認 {i}/{len(rows)} / 実例{len(hits)}',file=sys.stderr,flush=True)
(OUT/'sales_claims.jsonl').write_text('\n'.join(json.dumps(r,ensure_ascii=False) for r in hits),encoding='utf-8')
print(f'完了 実例{len(hits)}件',file=sys.stderr,flush=True)
```

---


## ③ analyze.py（表を作り直す）

```python
#!/usr/bin/env python3
"""collect.py と sales.py が書き出したファイルから、記事中の表をすべて作り直す。

    python3 analyze.py            # 同じフォルダの notes.jsonl / creators.jsonl / sales_claims.jsonl を読む
"""
import json, statistics as st
from collections import defaultdict
from pathlib import Path

D = Path(__file__).resolve().parent
load = lambda n: [json.loads(l) for l in open(D / n, encoding='utf-8') if l.strip()]
rows, cr, cl = load('notes.jsonl'), load('creators.jsonl'), load('sales_claims.jsonl')
fo = {c['user']: c.get('followers') for c in cr}
paid = [r for r in rows if r['price']]
med = lambda xs: st.median(xs) if xs else 0

print(f'■ 集めた記事 {len(rows):,}件 / 有料 {len(paid):,}件（{len(paid)/len(rows)*100:.1f}%）')
lk = [r['likes'] or 0 for r in paid]
print(f'  有料のスキ中央値 {med(lk):.0f} / 無料のスキ中央値 {med([r["likes"] or 0 for r in rows if not r["price"]]):.0f}')
print(f'  スキ0〜1の有料記事 {sum(1 for x in lk if x <= 1) / len(lk) * 100:.1f}%')

print('\n■ 分野ごと（有料記事のスキ中央値の高い順）')
by = defaultdict(list)
for r in rows: by[r['q']].append(r)
tab = []
for q, v in by.items():
    p = [x for x in v if x['price']]
    if len(v) >= 50 and p:
        tab.append((med([x['likes'] or 0 for x in p]), len(p) / len(v) * 100, med([x['price'] for x in p]), q))
for m, rate, pr, q in sorted(tab, reverse=True):
    print(f'  {q:<14} スキ中央 {m:>4.0f}  有料率 {rate:5.1f}%  価格中央 {pr:>6.0f}円')

import re
cc = [r for r in paid if re.search(r'Claude ?Code|AI社員|AIエージェント|自動化', r['name'], re.I)]
print(f'  ※題名に Claude Code / AI社員 / AIエージェント / 自動化 を含む有料記事 {len(cc)}件: スキ中央 {med([r["likes"] or 0 for r in cc]):.0f}')

print('\n■ 価格帯ごとの「スキ10以上」の割合')
for lo, hi in [(1, 499), (500, 980), (981, 1980), (1981, 4980), (4981, 10**9)]:
    g = [r for r in paid if lo <= r['price'] <= hi]
    if g:
        print(f'  {lo:>5}〜{hi if hi < 10**9 else "":<5}円 n={len(g):>4}  {sum(1 for r in g if (r["likes"] or 0) >= 10) / len(g) * 100:5.1f}%')

print('\n■ 書き手のフォロワーと反応')
hot = [fo.get(r['user']) for r in paid if (r['likes'] or 0) >= 30 and fo.get(r['user']) is not None]
cold = [fo.get(r['user']) for r in paid if (r['likes'] or 0) <= 1 and fo.get(r['user']) is not None]
print(f'  スキ30以上の書き手 フォロワー中央 {med(hot):,.0f}（n={len(hot)}）')
print(f'  スキ0〜1の書き手   フォロワー中央 {med(cold):,.0f}（n={len(cold)}）')

rev = [(c['claim'], c['price']) for c in cl if c.get('price') and c.get('claim')]
R = sorted(n * p for n, p in rev)
print(f'\n■ 「○部売れた」×価格（n={len(R)}）')
print(f'  売上中央 {R[len(R)//2]:,}円 / 上位25% {R[int(len(R)*.75)]:,}円 / 上位10% {R[int(len(R)*.9)]:,}円')
print(f'  20万円以上 {sum(1 for x in R if x >= 2*10**5) / len(R) * 100:.1f}% / 100万円以上 {sum(1 for x in R if x >= 10**6) / len(R) * 100:.1f}%')
print('  価格帯ごとの部数中央値:')
for lo, hi in [(1, 999), (1000, 2999), (3000, 5999), (6000, 9999), (10000, 10**9)]:
    g = [n for n, p in rev if lo <= p <= hi]
    if len(g) >= 5:
        print(f'    {lo:>6}〜{hi if hi < 10**9 else "":<6}円 n={len(g):>3}  {med(g):.0f}部')
```

私の環境で実行した結果がこれです。無料部分の表は、すべてここから取っています。

```
■ 集めた記事 10,126件 / 有料 1,313件（13.0%）
  有料のスキ中央値 2 / 無料のスキ中央値 15
  スキ0〜1の有料記事 45.5%

■ 分野ごと（有料記事のスキ中央値の高い順）
  note 収益化       スキ中央   56  有料率  11.8%  価格中央    840円
  Threads        スキ中央   38  有料率  25.6%  価格中央    980円
  AI活用           スキ中央   36  有料率   6.9%  価格中央    500円
  Claude         スキ中央   28  有料率  12.0%  価格中央    980円
  デザイン           スキ中央   16  有料率   7.1%  価格中央    640円
  フリーランス         スキ中央   15  有料率   9.4%  価格中央    500円
  AI副業           スキ中央   10  有料率  16.3%  価格中央    500円
  復縁             スキ中央    8  有料率  36.7%  価格中央    980円
  X運用            スキ中央    8  有料率  19.0%  価格中央    980円
  動画編集           スキ中央    8  有料率   8.4%  価格中央    500円
  夫婦関係           スキ中央    6  有料率   7.4%  価格中央    500円
  在宅ワーク          スキ中央    6  有料率   5.4%  価格中央    345円
  SNS運用          スキ中央    4  有料率  14.3%  価格中央    800円
  プロンプト          スキ中央    3  有料率  21.0%  価格中央    500円
  自動化            スキ中央    2  有料率  12.8%  価格中央    345円
  婚活             スキ中央    2  有料率  10.2%  価格中央    500円
  資産形成           スキ中央    2  有料率   5.5%  価格中央    300円
  投資             スキ中央    1  有料率  23.8%  価格中央    500円
  恋愛             スキ中央    1  有料率  20.1%  価格中央    685円
  副業             スキ中央    1  有料率  19.7%  価格中央    640円
  Instagram運用    スキ中央    1  有料率  15.3%  価格中央    500円
  キャリア           スキ中央    1  有料率   7.4%  価格中央    500円
  複業             スキ中央    1  有料率   6.4%  価格中央    400円
  教育             スキ中央    0  有料率  18.4%  価格中央   1980円
  生成AI           スキ中央    0  有料率  13.0%  価格中央    300円
  転職             スキ中央    0  有料率  11.1%  価格中央   4330円
  ChatGPT        スキ中央    0  有料率  10.5%  価格中央    300円
  片思い            スキ中央    0  有料率   7.3%  価格中央    980円
  ライティング         スキ中央    0  有料率   5.0%  価格中央    980円
  育児             スキ中央    0  有料率   2.8%  価格中央    300円
  ※題名に Claude Code / AI社員 / AIエージェント / 自動化 を含む有料記事 68件: スキ中央 38

■ 価格帯ごとの「スキ10以上」の割合
      1〜499  円 n= 429   32.9%
    500〜980  円 n= 468   42.1%
    981〜1980 円 n= 196   46.4%
   1981〜4980 円 n= 165   45.5%
   4981〜     円 n=  55   41.8%

■ 書き手のフォロワーと反応
  スキ30以上の書き手 フォロワー中央 1,964（n=404）
  スキ0〜1の書き手   フォロワー中央 12（n=597）

■ 「○部売れた」×価格（n=437）
  売上中央 37,620円 / 上位25% 66,800円 / 上位10% 356,400円
  20万円以上 15.1% / 100万円以上 5.5%
  価格帯ごとの部数中央値:
         1〜999   円 n=137  10部
      1000〜2999  円 n=135  12部
      3000〜5999  円 n=130  10部
      6000〜9999  円 n= 24  10部
     10000〜      円 n= 11  30部
```

---
