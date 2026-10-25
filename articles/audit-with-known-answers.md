---
title: "分析コードを信じる前に、答えの分かるデータで壊してみた — 変異テストで見逃しが2つ出た"
emoji: "🧮"
type: "tech"
topics: ["python", "テスト", "claudecode", "ai", "データ分析"]
published: true
---

AI（Claude Code）に、ブログの運用と、その成績の分析を任せています。

分析の結果は「どの記事を直すか」「どの検索語を狙うか」の判断に使います。計算が間違っていれば、判断も間違います。**それなのに、計算が合っているかを確かめずに使っていました。**

2026年10月24日、分析コードを書き直すにあたって、次の3つを先に決めました。

1. 答えが分かるテストデータを、自分で作る
2. 計算結果が、手計算の期待値と完全に一致することを確かめる
3. 一致しなければ、原因を直す

結果、**テストは最初から全部通りました。** それで終わりにせず、計算式を1か所ずつ壊してテストが落ちるかを見たところ、**2か所の壊し方をテストが見逃していました。** この記事は、その手順と、見逃した2つの中身です。

## 何を計算しているか

note（ブログサービス）の自分の記事30本と、検索結果の上位100件を入力にして、次を出します。

| 名前 | 式 |
|---|---|
| 1日あたりPV | `pv ÷ 公開日数`（公開日数は `max(1, floor(経過秒 ÷ 86400))`） |
| スキ率 | `likes ÷ pv`（`pv` が `null` か `0` なら `null`） |
| 上位20%のPV占有率 | PV上位 `ceil(0.2 × n)` 本の合計 ÷ 全PV |
| 検索語の狙いやすさ | `有料率 × 有料記事のスキ中央値 × 到達度`。到達度は `min(1, (自分のスキ中央値 + 1) ÷ (1ページ目の最低スキ + 1))` |

式は仕様書に全部書き、丸めは「四捨五入で小数3桁」と決めました。四捨五入は Python の `round()` ではなく `Decimal` の `ROUND_HALF_UP` です。`round(0.0005, 3)` は `0.0` になるからです（銀行丸め）。

## 想定外の値は、黙って直さない

入力は JSON です。壊れた記録が混ざっても、集計は止まらず、黙って補正もしません。**その記録を外して、理由を残します。**

```python
def validate_article(rec, as_of):
    """問題なければ None、あれば理由の文字列を返す。"""
    for f in ("key", "title", "published_at", "price", "likes", "pv", ...):
        if f not in rec:
            return f"missing:{f}"
    for f in ("price", "likes", "free_chars", "h2", "tags"):
        if not _is_int(rec[f]):
            return f"type:{f}"
        if rec[f] < 0:
            return f"range:{f}"
    ...
```

`_is_int` は `isinstance(v, int) and not isinstance(v, bool)` です。Python では `True` が整数として通るので、`likes: true` を弾くにはこれが要ります。

PV だけは `null` を許します。「取れなかった」と「0」は別だからです。`null` の記事は PV を使う計算からだけ外し、`pv_unknown` に数えます。

## 答えの分かるテストデータ

テストデータは、計算式をテスト側で再実装せず、**期待値を手で計算して直接書きました。**

```python
A = art(published_at="2026-10-14T00:00:00+09:00", likes=4, pv=50)   # as_of は 10-24 00:00
# 公開日数 10、PV/日 5.0、スキ率 0.08
self.assertEqual((a["days_live"], a["pv_per_day"], a["like_rate"]), (10, 5.0, 0.08))

C = art(published_at="2026-10-23T23:00:00+09:00", likes=0, pv=0)
# 経過1時間 → floor(0.04) = 0 → max(1, 0) = 1。pv=0 なのでスキ率は None
self.assertEqual((c["days_live"], c["pv_per_day"], c["like_rate"]), (1, 0.0, None))
```

境目を狙った値も入れました。題名の文字数の合格範囲が `12〜21` なら、12字と22字の題名を用意します。説明文の合格範囲が `50〜160` なら、49・50・160・161 の4つを用意します。

不正な記録は14件、理由つきで並べました。

```python
BAD = [
    (art(), "duplicate:key"),
    (art(key="n0000000000f2", likes=True), "type:likes"),
    (art(key="n0000000000f3", pv=-1), "range:pv"),
    (art(key="n0000000000f4", price=50), "range:price"),
    (art(key="n0000000000f5", published_at="2026-10-25T00:00:00+09:00"), "range:published_at"),
    (art(key="n0000000000f6", published_at="2026-10-01T00:00:00"), "tz:published_at"),
    ...
]
```

実行結果です。

```
Ran 15 tests in 0.002s

OK
```

## 通ったあとで、壊す

全部通ると、安心します。でも「テストが通った」は「テストが正しい」とは別です。**テストが何も見ていなければ、何を壊しても通ります。**

そこで、計算式を1か所ずつ別の式に置き換えて、テストが落ちるかを見ました。置き換えは14通り用意しました。

```python
muts = [
    ("math.ceil(0.2 * n)", "math.floor(0.2 * n)"),
    ("ROUND_HALF_UP)", "ROUND_HALF_EVEN)"),
    ("max(1, math.floor(", "max(0, math.floor("),
    ("not isinstance(v, bool)", "True"),
    ('re.sub(r"\\s+", "", ', "(lambda a,b,c: c)(0, 0, "),
    ("res[:20]", "res[:25]"),
    ("min(1.0, ", "max(1.0, "),
    ("50 <= dl <= 160", "50 <= dl <= 161"),
    ("median(paid) if paid else 0", "(sum(paid)/len(paid)) if paid else 0"),
    ...
]
for a, b in muts:
    src_mut = src.replace(a, b, 1)   # 1か所だけ壊したコピーを作る
    # コピーに対してテストを実行し、落ちたら「検出」、通ったら「見逃し」
```

結果です。

```
検出   | math.ceil(0.2 * n) -> math.floor(0.2 * n)
検出   | ROUND_HALF_UP) -> ROUND_HALF_EVEN)
検出   | max(1, math.floor( -> max(0, math.floor(
検出   | not isinstance(v, bool) -> True
★見逃し | re.sub(r"\s+", "",  -> (lambda a,b,c: c)(0, 0,
検出   | res[:20] -> res[:25]
検出   | min(1.0,  -> max(1.0,
検出   | 50 <= dl <= 160 -> 50 <= dl <= 161
検出   | 1 <= tl <= 60 -> 1 <= tl <= 59
検出   | if dt > as_of: -> if False:
検出   | rec["price"] > 0: -> rec["price"] >= 0:
検出   | t["title_min"] <= title_len -> t["title_min"] < title_len
検出   | None if not pv else -> None if pv is None else
★見逃し | median(paid) if paid else 0 -> (sum(paid)/len(paid)) if paid else 0
```

14通りのうち、2通りを見逃していました。

## 見逃し1：空白を消す処理

題名に「Claude Code」が入っているかを見るとき、`Claude Code` と `ClaudeCode` を同じ語として扱うために、空白をすべて消してから比べています。この「空白を消す」をやめても、テストは通りました。

テストデータの題名が、すべて空白ありの `Claude Code` だったからです。空白なしの題名を1つも入れていませんでした。

足したテストです。

```python
def test_keyword_match_ignores_spaces(self):
    self.assertEqual(L.match_keyword("ClaudeCodeで直す", L.DEFAULT_KEYWORDS), "Claude Code")
    self.assertEqual(L.match_keyword("claude　code の話", L.DEFAULT_KEYWORDS), "Claude Code")
    self.assertIsNone(L.match_keyword("クロードの話", L.DEFAULT_KEYWORDS))
```

## 見逃し2：中央値を平均にすり替える

検索語のスコアに「有料記事のスキの中央値」を使っています。これを平均に置き換えても、テストは通りました。

テストデータの有料記事のスキが、**全部同じ値（50が8本）**だったからです。全部同じなら、中央値も平均も50です。

足したテストです。有料のスキを `[1, 2, 30]` にしました。中央値は 2、平均なら 11 で、違いが出ます。

```python
def test_median_not_mean(self):
    # 有料のスキ [1, 2, 30]：中央値 2（平均なら 11）
    e = {"keyword": "Cloudflare", "results": [
        {"key": "a", "likes": 1, "price": 100}, {"key": "b", "likes": 30, "price": 100},
        {"key": "c", "likes": 0, "price": 0}, {"key": "d", "likes": 2, "price": 100}]}
    row, why = L.keyword_score(e, set(), 2)
    self.assertEqual((row["paid_share"], row["median_paid_likes"], row["score"]), (0.75, 2.0, 1.5))
```

2件足して、変異テストを20通りに増やして再実行し、**20通りすべてで検出**になりました。

## 分かったこと

- テストが全部通っても、テストが正しいとは限らない。**壊して落ちるかを見るまで、テストの価値は分からない**
- 見逃した2つは、どちらも「テストデータの偏り」が原因だった。空白なしの題名が無い、スキの値が全部同じ。**期待値を手計算すると、計算しやすい値を選びがちで、偏る**
- 境目の値（12字と22字、49と50）は入れていたのに、**式の形を変えたときに差が出る値**は入れていなかった。両方要る

## 分析で出た数字（おまけ）

この計算を実データに当てた結果です（2026年10月24日）。

- 自分の記事に関係する検索語17個で、note検索（人気順）の上位100件に自分の記事が入った語は **0個**
- 1ページ目（20件）に入るのに要るスキの最低値は、「Claude Code」で 39、「自動投稿」で 4。自分の記事のスキは最大 12。**いちばん混んでいる語に、いちばん弱い記事で挑んでいた**

この数字をもとに、狙う語と記事の形を変えました。何をどう変えたかは note に書いています。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、テストの結果と見逃しはすべて実際に起きたことです。*
