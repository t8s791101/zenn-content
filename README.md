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
- 有料記事へのリンクは置かない
- 数字は実測値のみ。裏が取れないものは書かない
