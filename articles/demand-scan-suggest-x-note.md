---
title: "書く題材を勘で決めるのをやめた — Googleサジェスト×note検索APIで需要と供給を同時に測る"
emoji: "🔎"
type: "tech"
topics: ["python", "note", "api", "seo", "データ分析"]
published: true
---

note に39本書いて、有料記事は1本も売れていません。題材はずっと「自分が書けること」から選んでいました。

これまで測っていたのは**供給だけ**でした。note の検索 API で「この語の1ページ目に入るには何スキ要るか」を測り、競争の薄い語を選ぶ。やってみると、ひとつ抜けていました。**その語が実際に打たれているかを確認していない**のです。

競争が薄い語の中には、単に誰も探していない語が混ざります。この記事は、需要側を足した2段構えの測り方と、そのコードです。

## 2段構え

| | 何を測るか | データ元 |
|---|---|---|
| 需要 | その語が実際に打たれているか | Google のサジェスト |
| 供給 | その語の上位に入るのがどれだけ難しいか | note の検索 API |

サジェストは「過去に打たれた語」から作られます。件数は分かりませんが、**候補に出る＝誰かが打っている**という下限の証拠にはなります。ゼロ円で取れる需要の代理指標として使っています。

## 需要側：サジェストを仮名で広げる

種語そのままだと10語ほどしか返りません。末尾に1文字ずつ足して回すと、数百語に広がります。

```python
import json, urllib.request, urllib.parse, time

UA = {'User-Agent': 'Mozilla/5.0'}
KANA = list('あいかきくけこさしすせそたちつてとなにのはひふへほまみむめもやゆよらりるれろわをん')

def suggest(q):
    url = ('https://suggestqueries.google.com/complete/search'
           '?client=firefox&hl=ja&q=' + urllib.parse.quote(q))
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
        return json.loads(r.read().decode('utf-8'))[1]

def expand(seed):
    got = set(suggest(seed))
    for k in KANA:
        try:
            got |= set(suggest(f'{seed} {k}'))
        except Exception:
            pass
        time.sleep(0.12)
    return sorted(got)
```

`client=firefox` を付けると JSON が返ります。`[1]` が候補の配列です。種語5つで495語になりました。

## 供給側：1ページ目に入る最低スキ

note の検索 API は、ログインなしで人気順200件まで返します。

```python
def note_supply(q):
    url = (f'https://note.com/api/v3/searches?context=note'
           f'&q={urllib.parse.quote(q)}&size=20&start=0&sort=popular')
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        d = json.load(r)['data']['notes']
    rows = [(x.get('price') or 0, x.get('like_count') or 0) for x in d['contents']]
    if not rows:
        return None
    return {
        'total': d.get('total_count'),          # totalCount ではない
        'floor': min(l for _, l in rows),       # 1ページ目に入る最低スキ
        'paid': sum(1 for p, _ in rows if p),
    }
```

:::message
キーは `total_count` です。`totalCount` だと `None` が返り、全部0件に見えます。自分はこれで1回、表をまるごと間違えました。
:::

`floor` は「20位の記事のスキ」です。ここを超えられないなら、その語の1ページ目には入れません。

## 出てきた表

種語「note 有料記事」から広げた495語のうち、打たれていて供給が薄かったものです（2026年11月12日に取得）。

| 語 | note の総件数 | 1ページ目の最低スキ |
|---|---|---|
| note 有料記事 いくらから | 138 | 0 |
| 個人開発 収益公開 | 53 | 0 |
| note 収益化 いくらから | 119 | 2 |
| 個人開発 収益化 割合 | 156 | 2 |
| note 収益化 一般人 | 1,458 | 5 |

いっぽう、短い語はこうです。

| 語 | 1ページ目の最低スキ |
|---|---|
| note 収益化 | 172 |
| Claude Code | 185 |

## 自分の判断がひとつ覆った

この測り方を入れる前、自分は「Claude Code は185スキ必要だから捨てる」と決めていました。長い語も一緒に測ったら、こうなりました。

| 語 | 1ページ目の最低スキ |
|---|---|
| claude code 全 自動 開発 | 11 |
| claude code ブラウザ 自動 操作 | 12 |
| claude code note 自動 投稿 | 13 |
| claude code threads 自動 投稿 | 18 |

**捨てるべきだったのは単体の語だけでした。** どれも Google が候補に出す＝打たれている語で、1ページ目の最低スキは11〜18です。単体の語の数字をその語の「分野全体の難易度」だと思い込んでいたのが誤りでした。

## 注意点

- サジェストは件数を返しません。「ゼロではない」ことしか分かりません
- 人気順の上位20件は日ごとに動きます。1回の値を結論にせず、間を空けてもう一度取ってください
- note の API は非公式です。予告なく変わります（2026年11月12日に動作を確認）
- 1件ごとに0.3〜0.4秒あけています

## まとめ

供給だけ測ると「誰も探していない語」を選びます。需要だけ見ると「勝てない語」を選びます。両方を同じ表に並べると、書く順番がそのまま決まりました。

この測り方で選んだ題材で何を書いて、どうなったかは note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude）と一緒に書いていますが、コードと数字はすべて実際に動かしたものです。*
