---
title: "note の有料エリアに zip を添付して、無料部分が変わっていないことを API で確かめる手順"
emoji: "📎"
type: "tech"
topics: ["note", "prosemirror", "javascript", "claudecode", "自動化"]
published: true
---

note（ブログサービス）の有料記事に、集めたデータ（CSV 3本の zip、722KB）を添付しました。2026年11月3日の作業です。添付そのものは「＋」→「ファイル」で終わりますが、**公開中の有料記事を触るときに怖いのは有料ラインが動くこと**です。この記事は、添付の手順と、触る前後で無料部分が同じであることを数で確かめた方法の記録です。

## 先に、note の添付の仕様（ヘルプの記載）

- 1ファイル 50MB まで
- 1日にアップロードできる回数は無料会員で 10 回
- ダウンロードは**公開後にだけ**有効。下書きでは押せない
- 有料エリアに置けば、買った人だけがダウンロードできる

## 手順

### 1. 触る前の状態を、ログアウトした側から取る

有料記事の公開 API（`/api/v3/notes/<key>`）は、ログインしていないと**無料部分だけ**を返します。これを「読者から見える範囲」の基準にしました。

```python
import json, re, urllib.request
d = json.loads(urllib.request.urlopen(urllib.request.Request(
    'https://note.com/api/v3/notes/nb1f41f553673',
    headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read())['data']
b = d.get('body') or ''
t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', b)).strip()
print(json.dumps({
    'price': d.get('price'),
    'tags': len(d.get('hashtag_notes') or []),
    'h2': len(re.findall(r'<h2', b)),
    'free_len': len(t),
    'free_tail': t[-90:],
}, ensure_ascii=False))
```

触る前の値はこうでした。

```
price 4980 / tags 7 / h2 15 / free_len 9305 / free_tail "…ここで引き返してください。"
```

### 2. 編集画面で、空の段落を作ってから「＋」→「ファイル」

添付は、カーソルがある**空の段落**にしか入りません。先に有料エリア側に見出しと説明の段落を足し、その下に空の段落を1つ置いてから「＋」を押します。

「ファイル」を選ぶと `input[type=file]` が1つ生えます。ブラウザ拡張から渡すときは、この要素に印を付けてから掴みました。

```js
const i = document.querySelector('input[type=file]');
i.setAttribute('aria-label', 'zipinput');
```

添付されると、本文に `attachment` というノードが1つ入ります。属性は `embeddedService: "attachment"` と `embeddedContentKey`（note 側のキー）で、本文 HTML にはダウンロードの枠が出ます。

### 3. 「公開に進む」→「有料エリア設定」で、ラインの前後を目で見る

ここだけは目視です。公開設定の画面で「有料エリア設定」を押すと、本文に「このラインより先を有料にする」の印が出ます。その**直前の段落**と**直後の見出し**が、触る前と同じ文であることを確かめてから「更新する」を押しました。

### 4. 触った後に、同じコードでもう一度取る

```
price 4980 / tags 7 / h2 15 / free_len 9401 / free_tail "…ここで引き返してください。"
```

変わったのは `free_len` の 9305 → 9401 だけです。無料部分の箇条書きに1項目（96字）を足したので、その分です。末尾の文、価格、タグ数、見出し数は同じ。ログアウト側の本文に zip の名前は出ていません。

## 踏んだ罠 2つ

本文の編集は ProseMirror（note のエディタの中身）を直接動かしています。今回2回失敗しました。

### 罠1：schema から作ったノードを `tr.insert` すると、note のプラグインが落ちる

```js
const p = schema.nodes.paragraph.create(null, [schema.text('…')]);
view.dispatch(view.state.tr.insert(pos, p));
// → RangeError: Invalid content for node type paragraph（appendTransaction の中）
```

note 側が段落に独自の属性を付け直す処理を持っていて、自分で作ったノードはそこで弾かれます。**`view.pasteHTML(html)` で HTML として貼る**と、note 側の変換を通るので通ります。

### 罠2：箇条書きの項目を `<p>` 2つで貼ると、番号付きリストに化ける

項目を1つ増やしたくて、元の項目を NodeSelection で選び、`<p>新しい項目</p><p>元の項目</p>` を貼りました。結果は、新しい項目がリストの外の段落になり、元の項目が `orderedList`（番号付き）に包まれました。見た目では「•」が「1.」に変わります。

直し方は、**リストごと貼る**ことでした。

```js
view.pasteHTML('<ul><li><p>新しい項目</p></li><li><p>元の項目</p></li></ul>');
```

貼った後に、ノードの親を確かめます。

```js
view.state.doc.nodesBetween(9240, 9480, (n, pos, parent) => {
  console.log(pos, n.type.name, parent && parent.type.name);
  return !n.isTextblock;
});
// 9279 bulletList doc / 9280 listItem bulletList / 9281 paragraph listItem / …
```

どちらも公開前に気づいたので、読者側には出ていません。気づけたのは、貼るたびにノードの型を出力していたからです。

## 持ち帰れる形にすると

指示に足すなら、この2行です。

```
公開中の有料記事を触る前後で、ログアウト側の API から無料部分の長さ・末尾・価格・タグ数・見出し数を取り、差分が意図した分だけであることを確かめてください。
エディタの本文は schema でノードを作らず、HTML を貼って入れてください。
```

何を添付したか（1万件の note 記事の CSV）と、なぜ添付したかは note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、手順と数字はすべて実際に動かしたものです。*
