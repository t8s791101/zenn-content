---
title: "noteの検索APIで、自分の分野の有料記事を数える最小コード — 標準ライブラリだけ、30行"
emoji: "🔢"
type: "tech"
topics: ["python", "note", "api", "データ分析", "claudecode"]
published: true
---

note（ブログサービス）で有料記事を出しているのに売れないとき、「自分の分野では、そもそも有料記事がどれくらい反応されているか」を知りたくなります。

noteは記事の検索結果を JSON で返す非公式の API を持っていて、ログインなしで読めます。これを使って、**自分の分野の有料記事の割合・スキの中央値・価格の中央値**を出す最小コードを置きます。Python の標準ライブラリだけで動きます。

先に注意です。

- **非公式の API です。** 予告なく変わります（2026年10月25日時点で動作を確認）
- `User-Agent` を付けないと 403 が返ります
- 連続で叩くときは 0.35〜0.45 秒あけています。短くすると 429 が返ることがあります
- 取れるのは「人気順」「新着順」の検索結果だけで、**販売部数は取れません**（noteは公開していません）

## 最小コード

```python
import json, urllib.request, urllib.parse, statistics, time

UA = {'User-Agent': 'Mozilla/5.0'}
q = 'Claude Code'               # ← 自分の分野の言葉に変える

rows = []
for page in range(5):           # 20件 × 5ページ = 100件
    url = (f'https://note.com/api/v3/searches?context=note'
           f'&q={urllib.parse.quote(q)}&size=20&start={page*20}&sort=popular')
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        notes = json.load(r)['data']['notes']['contents']
    if not notes:
        break
    rows += [(x.get('price') or 0, x.get('like_count') or 0) for x in notes]
    time.sleep(0.4)

paid   = [likes for price, likes in rows if price]
prices = [price for price, likes in rows if price]

print(f'{q}： 全{len(rows)}件 / 有料{len(paid)}件（{len(paid)/len(rows)*100:.1f}%）')
print(f'  有料記事のスキ 中央値 {statistics.median(paid):.0f}')
print(f'  有料記事の価格 中央値 {statistics.median(prices):.0f}円')
print(f'  1ページ目（20件）に入る最低スキ {min(l for _, l in rows[:20])}')
```

実行結果（2026年10月25日 22:00）。

```
Claude Code： 全100件 / 有料19件（19.0%）
  有料記事のスキ 中央値 111
  有料記事の価格 中央値 1980円
  1ページ目（20件）に入る最低スキ 40
```

## 最後の1行が、いちばん使える

「1ページ目に入る最低スキ」は、**その語で検索されたときに、自分の記事が1ページ目に出るための目安**です。

自分の17語で出した値です（人気順、2026年10月24日に取得。上の実行結果は翌日のもので、「Claude Code」の最低スキは39→40と1日で動いています）。

| 語 | 1ページ目の最低スキ | 1ページ目の有料記事 |
|---|---|---|
| Zenn | 0 | 2本 |
| 自動投稿 | 4 | 4本 |
| AI自動化 | 6 | 2本 |
| Cloudflare | 10 | 3本 |
| Claude Code | 39 | 9本 |
| Threads | 42 | 10本 |
| note 収益化 | 114 | 6本 |
| AI | 300 | 5本 |

私の記事は30本中28本の題名に「Claude Code」が入っていて、スキの最大は12でした。**いちばん混んでいる語に、いちばん弱い記事で挑んでいた**ことが、この1行で分かりました。いまは題名に入れる語を、この表で選んでいます。

## 返ってくる JSON の形（必要な部分だけ）

```
data.notes.contents[]
  key          記事のキー（n + 12桁の16進）
  name         題名
  price        価格（無料は 0）
  like_count   スキ
  publish_at   公開日時
  user.urlname 書き手のID
```

`data.notes.total_count` に総件数が入りますが、`start` は 10,000 までしか進めません。

## 注意：人気順は上澄み

人気順の100件は、その語でいちばん読まれている記事です。**数字は高めに出ます。** 「うちの分野はスキ中央値100もある」と読むと、判断を誤ります。新着順（`sort=new`）も取って、両方を見てください。

30分野を人気順・新着順で各10ページ取り、書き手のフォロワー数と「○部売れた」の自己申告まで集めた版と、その結果は note に書きました。調べた結果は無料部分で全部読めます。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、コードと数字はすべて実際に動かして取ったものです。*
