---
title: "note の有料記事153件を乱数で選んで、無料部分の作りを数えた — 公開APIだけで測る手順"
emoji: "📐"
type: "tech"
topics: ["note", "python", "api", "データ分析", "claudecode"]
published: true
---

note（ブログサービス）の有料記事は、ログインしていない相手にも**無料部分だけ**を返します。この性質を使うと、「無料部分に何が置いてあるか」を外から数えられます。

2026年11月8日に、有料記事153件を乱数で選んで数えました。結果、**無料部分に画像がある記事のスキは中央値33、ない記事は10**でした。この記事は、その測り方と、気をつけた点の記録です。

## 何を数えたか

公開APIの `body` は、有料記事なら無料部分のHTMLです。ここから数えられるものは限られていますが、構造の特徴は取れます。

| 数えたもの | 取り方 |
|---|---|
| 無料部分の文字数 | タグを除き、空白をまとめてから長さ |
| 見出しの数 | `<h2>` `<h3>` の出現数 |
| 画像の数 | `<img>` の出現数 |
| 表・コードの数 | `<table>` `<pre>` `<code>` の出現数 |
| 価格・スキ | `price` `like_count` |

## コード

母集団は、別に集めてある有料記事のキーの一覧です（検索APIで30語 × 人気順/新着順）。そこから `random.seed(42)` で160件を選び、153件を取得できました。

```python
import json, re, time, random, urllib.request, statistics as st

UA = {"User-Agent": "Mozilla/5.0"}
keys = [...]                 # 有料記事のキー
random.seed(42)              # 選び直せるように固定する

rows = []
for k in random.sample(keys, 160):
    try:
        req = urllib.request.Request("https://note.com/api/v3/notes/" + k, headers=UA)
        d = json.loads(urllib.request.urlopen(req, timeout=20).read())["data"]
    except Exception:
        continue             # 消された記事などは飛ばす
    b = d.get("body") or ""
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", b))
    rows.append({
        "price": d.get("price") or 0,
        "likes": d.get("like_count") or 0,
        "free_chars": len(text),
        "h2": len(re.findall(r"<h2", b)),
        "imgs": len(re.findall(r"<img", b)),
        "code": len(re.findall(r"<pre|<code", b)),
    })
    time.sleep(0.35)         # 相手のサーバーへの間隔。縮めない

med = lambda xs: st.median(xs) if xs else 0
wi = [r["likes"] for r in rows if r["imgs"] > 0]
wo = [r["likes"] for r in rows if r["imgs"] == 0]
print(f"画像あり n={len(wi)} スキ中央 {med(wi):.0f}")
print(f"画像なし n={len(wo)} スキ中央 {med(wo):.0f}")
```

非公式のAPIです。予告なく変わります（2026年11月8日に動作を確認）。`User-Agent` を付けないと 403 になります。

## 結果

```
画像あり n=54 スキ中央 33
画像なし n=99 スキ中央 10

無料部分の長さ帯ごとのスキ中央値
      0〜999 字 n=46 スキ中央 10
   1000〜2999 字 n=61 スキ中央 19
   3000〜5999 字 n=33 スキ中央 31
  10000〜     字 n= 8 スキ中央  3
```

スキ上位25%（38件）の無料部分は中央値2,107字、下位50%（77件）は1,465字でした。**長さだけでは分かれません。**

## 気をつけた3点

### 1. 乱数の種を固定する

`random.seed(42)` を書いておくと、同じ母集団から同じ153件を選び直せます。あとで「その記事、本当にそうだった？」と聞かれたときに開き直せます。

### 2. 件数（n）を必ず横に出す

集計の表に `n` を出す1行を足しました。

```python
tab.append((med([x["likes"] or 0 for x in p]), len(p) / len(v) * 100,
            med([x["price"] for x in p]), q, len(p)))
for m, rate, pr, q, n in sorted(tab, reverse=True):
    print(f"  {q:<14} スキ中央 {m:>4.0f}  n={n:>3}  有料率 {rate:5.1f}%")
```

**n が30未満の行は、見出しや結論に使わない**と決めています。上の「10,000字以上はスキ中央3」は n=8 なので、結論には使いません。

### 3. 結びつきと、原因・結果を分けて書く

画像ありの中央値が3.3倍でも、「画像を足せばスキが増える」とは言えません。よく読まれる書き手が図も作っている、という順序もありえます。

それでも、図を足すのは費用0円で、戻すのも簡単です。**測れない理由があるときは、安く試して後で測る**ことにしました。自分の有料記事には図が1枚もなかったので、同じ日に3枚入れて、2週間後に比べます。

## 持ち帰れる形にすると

指示に足すなら、この2行です。

```
サンプルを取るときは乱数の種を固定して、何件取れたかを出力に書いてください。
集計の表には件数（n）を必ず付け、n が30未満の行は結論に使わないでください。
```

何を数えて、自分の記事をどう直したかは note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、コードと数字はすべて実際に動かしたものです。*
