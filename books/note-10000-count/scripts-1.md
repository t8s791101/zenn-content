---
title: "有料：使い方と collect.py（記事と書き手を集める）"
free: false
---

## 有料部分の使い方

ここから先は3つのファイルと、2か月の記録です。

| ファイル | やること | かかる時間（私の環境） |
|---|---|---|
| `collect.py` | 30分野の記事を集め、有料記事の書き手のフォロワーを取る | 約25分 |
| `sales.py` | 「○部売れた」と書いている記事を集め、本文から部数を拾う | 約20分 |
| `analyze.py` | 上の2つの結果から、無料部分の表をすべて作り直す | 数秒 |

**3つとも Python の標準ライブラリだけで動きます。** インストールもAPIキーも要りません。
同じフォルダに置いて、`python3 collect.py` → `python3 sales.py` → `python3 analyze.py` の順に実行します。

**先に知っておいてほしいこと**

- 使っているのは note のサイトが内部で使っている API です。**note が公式に公開しているものではありません。**
  仕様が変われば動かなくなります。2026年10月20日時点で動いたことを確認しています
- 1件ごとに0.35〜0.45秒あけています。**この間隔は縮めないでください。** 相手のサーバーに負担をかけないためです
- `User-Agent` を付けないと拒否されます（403）。コードには入れてあります
- 部数は**書き手の自己申告**です。盛っている可能性は除けません。この記事の表も同じ制約の上にあります

---


## ① collect.py（記事と書き手を集める）

`QUERIES` の中を自分の分野の言葉に変えれば、そのまま自分の分野の表になります。

```python
#!/usr/bin/env python3
"""noteの有料記事市場を実測する。推測は入れない。"""
import json, time, urllib.request, urllib.parse, sys, re
from pathlib import Path
UA = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}
OUT = Path('/tmp/mkt')

def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == tries-1: return None
            time.sleep(1.5*(i+1))

QUERIES = ["AI活用","ChatGPT","Claude","生成AI","プロンプト","自動化","AI副業",
           "SNS運用","Threads","X運用","Instagram運用","note 収益化",
           "副業","在宅ワーク","複業","フリーランス",
           "恋愛","復縁","婚活","夫婦関係","片思い",
           "育児","教育","投資","資産形成","キャリア","転職","ライティング","デザイン","動画編集"]

def collect_notes():
    seen, rows = set(), []
    for qi,q in enumerate(QUERIES,1):
        for sort in ("popular","new"):
            for page in range(10):
                u = (f'https://note.com/api/v3/searches?context=note&q={urllib.parse.quote(q)}'
                     f'&size=20&start={page*20}&sort={sort}')
                d = get(u)
                if not d or 'data' not in d: break
                c = d['data'].get('notes',{}).get('contents') or []
                if not c: break
                for x in c:
                    k = x.get('key')
                    if not k or k in seen: continue
                    seen.add(k)
                    rows.append(dict(key=k, price=x.get('price') or 0, likes=x.get('like_count'),
                                     comments=x.get('comment_count'), name=x.get('name',''),
                                     desc=(x.get('description') or '')[:200],
                                     publish=(x.get('publish_at') or '')[:10],
                                     user=(x.get('user') or {}).get('urlname'),
                                     q=q, sort=sort))
                time.sleep(0.45)
        print(f'  [{qi}/{len(QUERIES)}] {q}: 累計 {len(rows)}', file=sys.stderr, flush=True)
    (OUT/'notes.jsonl').write_text('\n'.join(json.dumps(r,ensure_ascii=False) for r in rows), encoding='utf-8')
    return rows

def collect_creators(rows):
    users = sorted({r['user'] for r in rows if r['price'] and r['user']})
    print(f'有料記事の書き手 {len(users)}人を取得', file=sys.stderr, flush=True)
    out=[]
    for i,u in enumerate(users,1):
        d = get(f'https://note.com/api/v2/creators/{urllib.parse.quote(u)}')
        if d and 'data' in d:
            x=d['data']
            out.append(dict(user=u, followers=x.get('followerCount'), following=x.get('followingCount'),
                            notes=x.get('noteCount'), magazines=x.get('magazineCount'),
                            likes=x.get('likeCount'), nickname=x.get('nickname','')))
        if i%100==0: print(f'  {i}/{len(users)}', file=sys.stderr, flush=True)
        time.sleep(0.35)
    (OUT/'creators.jsonl').write_text('\n'.join(json.dumps(r,ensure_ascii=False) for r in out), encoding='utf-8')
    return out

if __name__ == '__main__':
    rows = collect_notes()
    paid = [r for r in rows if r['price']]
    print(f'収集: 全{len(rows)}件 / 有料{len(paid)}件', file=sys.stderr, flush=True)
    collect_creators(rows)
    print('完了', file=sys.stderr, flush=True)
```

---
