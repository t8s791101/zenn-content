---
title: "noteの公開記事31本の末尾に、1段落を安全に足した — ProseMirrorのNodeSelectionと、前後の照合"
emoji: "🧷"
type: "tech"
topics: ["note", "prosemirror", "javascript", "claudecode", "自動化"]
published: true
---

note（ブログサービス）の自分の記事31本に、同じ案内の段落を1つずつ足しました。公開中が29本、予約中が2本です。全文を貼り替えずに、末尾の区切り線の前に段落を差し込み、更新の前後でタグ数と見出し数が変わっていないことを1本ずつ確かめました。

以前、本文を全文置換したときに目次と画像が消えかけたことがあります。今回はその反省から、**置換ではなく挿入**にしました。この記事は、その手順と、途中で引っかかった3点の記録です。

## 何をしたか

noteのエディタは ProseMirror でできています。ブラウザのコンソールから、エディタの `view` を取り出せれば、`dispatch` と `pasteHTML` で本文を操作できます。

`view` は React のコンポーネントの中にあります。`.ProseMirror` 要素の親から React の fiber をたどり、hooks の中に `dispatch` と `state.doc` を持つオブジェクトを探します。

```js
function isView(x) {
  return x && typeof x === 'object' && typeof x.dispatch === 'function' && x.state && x.state.doc && x.dom;
}
function getView() {
  const host = document.querySelector('.ProseMirror').parentElement;
  const fk = Object.keys(host).find(k => k.startsWith('__reactFiber'));
  let f = host[fk];
  for (let lvl = 0; f && lvl < 60; lvl++, f = f.return) {
    let s = f.memoizedState;
    for (let n = 0; s && n < 200; n++, s = s.next) {
      const m = s.memoizedState;
      if (isView(m)) return m;
      if (m && isView(m.view)) return m.view;
      if (m && m.current && isView(m.current.view)) return m.current.view;
    }
  }
  return null;
}
```

hooks を 30 個まで見る版では見つからず、200 個まで広げたら 12 段上の 44 番目にありました。

## 挿入の仕方：区切り線を NodeSelection で選び、貼り直す

末尾の区切り線（`horizontalRule`）の位置を取り、その 1 ノードを選択してから `pasteHTML` します。貼る HTML の最後に `<hr>` を含めれば、選んだ区切り線が「段落＋段落＋区切り線」に置き換わります。

```js
const v = getView();
let hrPos = -1;
v.state.doc.forEach((n, off) => { if (n.type.name === 'horizontalRule') hrPos = off; });
const Sel = Object.getPrototypeOf(v.state.selection.constructor);  // Selection クラス
v.dispatch(v.state.tr.setSelection(Sel.fromJSON(v.state.doc, { type: 'node', anchor: hrPos })));
v.pasteHTML('<p>案内の一文</p><p>https://example.com/...</p><hr>');
```

区切り線が無い記事もありました。その場合は、末尾の「この記事はAIと一緒に書いていますが…」の段落を選び、その段落を `<em>` 付きで貼り直す形にしました。それも無い記事（末尾がURLの段落）は、末尾の段落を選んで「その段落＋案内」の順で貼りました。

## 照合：更新の前後で、タグ数と見出し数を比べる

貼る前に、公開APIからタグ数と `<h2>` の数を取って `localStorage` に置きます。更新したあと、同じ値を取り直して比べます。違えばその場で例外を投げて止めます。

```js
// 貼る前
const pre = await (await fetch('https://note.com/api/v3/notes/' + key)).json();
localStorage.setItem('pre_' + key, JSON.stringify({
  tags: (pre.data.hashtag_notes || []).length,
  h2: ((pre.data.body || '').match(/<h2/g) || []).length,
}));

// 更新のあと
const r = await (await fetch('https://note.com/api/v3/notes/' + key)).json();
const b = r.data.body || '';
const p = JSON.parse(localStorage.getItem('pre_' + key));
const out = { tags: (r.data.hashtag_notes || []).length, h2: (b.match(/<h2/g) || []).length, link: b.includes('nb1f41f553673') };
if (!out.link || out.tags !== p.tags || out.h2 !== p.h2) throw new Error('verify failed ' + JSON.stringify(out));
```

`localStorage` を使うのは、ページを移動すると `window` の変数が消えるからです。エディタと公開設定の画面は同じオリジンなので、`localStorage` なら残ります。

31本すべてで、タグ数と見出し数は前後で一致しました。

## 引っかかった3点

**1. 予約中の記事は「下書き保存」では本文が入らない。** 予約中の記事では、本文を貼ったあと「公開に進む」→ 日時の表示を確かめる → 「予約投稿」を押して初めて保存されます。「下書きを保存しました」と出ても、取り直した本文は元のままでした（これは以前にも踏んでいます）。

**2. 有料記事は、更新で有料ラインが動くことがある。** 有料3本は、更新する前に「有料エリア設定」の画面で、ラインの直前と直後の要素のテキストを読み、想定どおりの位置にあることを確かめてから「更新する」を押しました。更新後は、ログアウト状態のAPIで有料部分の見出しが出てこないことを見ています。

**3. 背景タブでは、座標クリックが当てにならない。** 2つのタブで並行して進めたとき、背景側のタブへの座標クリックが効かないことがありました。「公開に進む」「更新する」は、ボタンの文字で探して `.click()` する形に変えました。

```js
[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '更新する').click();
```

## 持ち帰れる形にすると

指示に足すならこの3行です。

```
本文を直すときは、全文の置換ではなく、位置を指定した挿入にしてください。
更新の前後で、タグ数と見出し数を公開APIで取り直して比べ、違えば止めてください。
予約中の記事は、予約投稿のボタンまで押して、取り直した本文で確かめてください。
```

何の案内を足したのかは、note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、手順と引っかかった点はすべて実際に起きたことです。*
