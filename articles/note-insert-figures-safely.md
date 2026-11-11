---
title: "公開中の note 有料記事に、図を3枚だけ足す — 有料ラインを動かさずに差分を確かめる手順"
emoji: "🖼️"
type: "tech"
topics: ["note", "prosemirror", "javascript", "claudecode", "自動化"]
published: true
---

公開して2週間たった有料記事に、図を3枚入れました。2026年11月8日の作業です。

公開中の有料記事を触るときに怖いのは、**有料ラインが動くこと**と、**無料部分が意図せず変わること**です。この記事は、その2つを数で確かめながら図を足した手順の記録です。

## 1. 触る前に、ログアウト側の状態を取る

note の公開API（`/api/v3/notes/<key>`）は、ログインしていない相手には**無料部分だけ**を返します。これを基準にします。

```python
import json, re, urllib.request

d = json.loads(urllib.request.urlopen(urllib.request.Request(
    "https://note.com/api/v3/notes/" + KEY,
    headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read())["data"]
b = d.get("body") or ""
t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", b)).strip()
print(json.dumps({
    "price": d.get("price"),
    "tags": len(d.get("hashtag_notes") or []),
    "h2": len(re.findall(r"<h2", b)),
    "imgs": len(re.findall(r"<img", b)),
    "free_len": len(t),
    "free_tail": t[-60:],          # 有料ラインの直前の文
}, ensure_ascii=False))
```

`free_tail`（無料部分の最後の文）が、有料ラインの位置の代わりになります。ここが変わっていなければ、ラインは動いていません。

## 2. 図を入れる

note のエディタは ProseMirror です。画像は「＋」メニューから入れます。ボタンは `aria-label` で探せます。

```js
// ＋ を開く
document.querySelector('button[aria-label="メニューを開く"]').click();
// 「画像」を選ぶ（「画像の配置」と区別するため完全一致で）
[...document.querySelectorAll('button,[role=menuitem],li')]
  .filter(x => x.textContent.trim() === '画像').pop().click();
```

押すと `input[type=file]` が生えます。ブラウザ拡張から渡す場合は、この要素に印を付けてから掴みます。

```js
const i = document.querySelector('input[type=file]');
i.setAttribute('aria-label', 'figinput');
```

カーソルのある**空の段落**に入ります。空の段落は、対象の段落の末尾にカーソルを置いて Enter を1回押すのが確実です。

```js
const n = view.state.doc.nodeAt(pos);               // 図を入れたい段落
const end = pos + 1 + n.content.size;
view.dispatch(view.state.tr.setSelection(
  Selection.near(view.state.doc.resolve(end), -1)));
view.focus();                                        // このあと Enter
```

**位置がずれないよう、下の図から順に入れます。** 上から入れると、後続の `pos` が全部ずれます。

## 3. 図の下に注記を足す

図の直後に説明文を入れたいときは、**次のノードを選んで、注記＋元のノードを貼り直します。**

```js
const pos = 1038;                                   // 図の次のノード
const orig = view.nodeDOM(pos).outerHTML;           // 元のHTMLを取っておく
view.dispatch(view.state.tr.setSelection(
  new NodeSelection(view.state.doc.resolve(pos))));
view.pasteHTML('<p>図は2026年11月3日に取り直した数字です。</p>' + orig);
```

`schema.nodes.paragraph.create(...)` で作ったノードを `tr.insert` すると、note 側のプラグインが `RangeError: Invalid content for node type paragraph` で落ちます。**HTML を貼る形にすると通ります。**

箇条書きの中に足すときは、`<p>` を2つ貼ると番号付きリストに化けることがあります。`<ul><li>…</li><li>…</li></ul>` ごと貼り直すほうが安全です。

## 4. 公開前に、有料ラインを目で見る

「公開に進む」→「有料エリア設定」を押すと、本文に「このラインより先を有料にする」の印が出ます。その**直前の段落**と**直後の見出し**が、触る前と同じ文であることを確かめます。

```js
const t = document.body.innerText;
const L = t.indexOf('このラインより先を有料にする');
console.log(t.slice(L - 90, L + 60));
```

## 5. 公開後に、同じコードでもう一度取る

```
前： price 4980 / tags 7 / h2 15 / imgs 0 / free_len 9401
後： price 4980 / tags 7 / h2 15 / imgs 3 / free_len 9680
```

変わったのは `imgs` と `free_len` だけでした。増えた279字は、図3枚につけた注記の分です。`free_tail` は前後で同じでした。

## 持ち帰れる形にすると

指示に足すなら、この2行です。

```
公開中の記事を触る前後で、ログアウト側のAPIから価格・タグ数・見出し数・無料部分の文字数と末尾の文を取り、差分が意図した分だけか確かめてください。
本文に足すノードは schema で作らず、HTML を貼って入れてください。
```

なぜ図を足したのか（有料記事153件を数えたら、図のある記事はスキが3.3倍だった）は note に書いています。無料部分で全部読めます。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、手順と数字はすべて実際に動かしたものです。*
