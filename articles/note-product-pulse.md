---
title: "note の統計に出てこない記事を、公開APIで毎日1行だけ記録する — 40行の Python と、同日は後勝ちの規則"
emoji: "📈"
type: "tech"
topics: ["python", "note", "api", "claudecode", "自動化"]
published: true
---

note（ブログサービス）で、2026年10月24日に有料記事を1本公開しました。公開から6日間、**note のアクセス状況の一覧にその記事が出てきませんでした。** 10月5日と10月20日に出した無料記事2本も同じです。理由は分かっていません（公開中で、ログアウトしても開けます）。

閲覧数が取れないと、何をしても効いたかどうかが分かりません。そこで、ログインなしで取れる値（スキ数・コメント数・フォロワー数）を、毎日1行ずつファイルに残すことにしました。この記事は、その40行と、決めた規則の話です。

## 取れるもの・取れないもの

| 値 | 取れるか | どこから |
|---|---|---|
| 閲覧数（PV） | ログインが要る。統計の一覧に出ない記事は取れない | `/api/v1/stats/pv` |
| スキ数・コメント数・価格 | ログイン不要 | `/api/v3/notes/<key>` |
| フォロワー数・公開本数 | ログイン不要 | `/api/v2/creators/<urlname>` |

どちらも非公式の API です。予告なく変わります（2026年11月1日時点で動作を確認）。`User-Agent` を付けないと 403 になります。

## コード

```python
#!/usr/bin/env python3
"""商品記事の反応を、公開APIで取って logs/product_pulse.jsonl に追記する。"""
import json, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "logs" / "product_pulse.jsonl"
PRODUCT = "nb1f41f553673"
USER = "zeroyen_dev"
UA = {"User-Agent": "Mozilla/5.0"}
JST = timezone(timedelta(hours=9))

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return json.loads(r.read().decode())

def main() -> int:
    note = get(f"https://note.com/api/v3/notes/{PRODUCT}")["data"]
    user = get(f"https://note.com/api/v2/creators/{USER}")["data"]
    row = {
        "date": datetime.now(JST).strftime("%Y-%m-%d"),
        "at": datetime.now(JST).isoformat(timespec="minutes"),
        "likes": note.get("like_count"),
        "comments": note.get("comment_count"),
        "price": note.get("price"),
        "followers": user.get("followerCount"),
        "notes": user.get("noteCount"),
    }
    LOG.parent.mkdir(exist_ok=True)
    rows = []
    if LOG.exists():
        rows = [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = [r for r in rows if r["date"] != row["date"]] + [row]   # 同じ日は後勝ち
    LOG.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    print(json.dumps(row, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

## 決めた規則：同じ日は後勝ち

1日に何回走っても、**その日の行は1行だけ**にしています。朝に取って夜にもう一度取ったら、夜の値で置き換えます。

理由は2つです。

- 日ごとの推移を見たいだけなので、同じ日に複数行あると集計で二重に数える
- 「その日の最後の値」が、翌朝の値といちばん近い

逆に、**取れなかった日は行を作りません。** 0 を入れると「反応が0だった」と区別がつかなくなります。

## 実際の記録

公開日からの推移です（`logs/product_pulse.jsonl` から。各日の最後の値）。

| 日 | スキ | フォロワー |
|---|---|---|
| 10-25 | 5 | 7 |
| 10-26 | 5 | 9 |
| 10-27 | 6 | 11 |
| 10-28 | 8 | 12 |
| 10-29 | 8 | 12 |
| 10-30 | 8 | 12 |
| 10-31 | 8 | 12 |
| 11-01 | 9 | 14 |

統計の一覧に記事が出たのは 10月30日で、そのときの閲覧は 22 でした。**それまでの6日間は、この表だけが手がかりでした。**

## 持ち帰れる形にすると

指示に足すなら、この2行です。

```
公式の数字が取れないときは、取れる値を毎日1行、日付つきで残してください。
同じ日は後の値で置き換え、取れなかった日は行を作らないでください。
```

何を売っていて、数字がどう動いたかは note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、コードと数字はすべて実際に動いているものです。*
