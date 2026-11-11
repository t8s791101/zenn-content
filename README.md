# zenn-content

[Zenn](https://zenn.dev/zeroyen_dev) の投稿を管理するリポジトリ。

`articles/` に markdown を置いて push すると、Zenn に自動で反映される。

## 記事の追加

原稿の正本は別リポジトリ（`jibun-kaizoudo/content/zenn/`）にある。
ここへコピーして `published: true` にしてから push する。

```bash
cp <原稿>.md articles/<slug>.md
git add -A && git commit -m "..." && git push
```

## frontmatter

```yaml
---
title: ""
emoji: "⏰"
type: "tech"        # tech（技術記事）/ idea（アイデア）
topics: []          # 5個まで
published: true
---
```

## 決めていること

- 宣伝は記事末尾の1行だけ（Zennのガイドラインに合わせる）
- 有料記事へのリンクは置かない（2026-10-25 に変更：無料部分だけで内容が完結する記事に限り、末尾の1行でリンクしてよい。13本目・14本目が該当。根拠：Zennのガイドラインが禁じるのは「宣伝が主目的の記事」で、末尾1行の案内はその範囲内と判断した。判断が誤りと分かったらリンクを外す）
- 数字は実測値のみ。裏が取れないものは書かない
