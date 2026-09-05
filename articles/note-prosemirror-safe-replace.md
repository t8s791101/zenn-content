---
title: "noteの本文編集を自動化しようとして2回事故った話と、ProseMirrorを直接操作する方式"
emoji: "🩹"
type: "tech"
topics: ["prosemirror", "javascript", "react", "browserautomation", "note"]
published: true
---

note の記事本文を、ブラウザ操作の自動化で書き換えようとしました。「範囲を選択して貼り替える」だけの単純な作業のはずが、**2回、違う原因で事故りました。** 1回目は本文の先頭に意図しない挿入が起き、既存のテキストと結合して壊れた状態のまま公開されました。2回目は「貼り替えたつもり」が実際には追記になり、本文が丸ごと二重になりました。

原因はどちらも同じところにあります。**note のエディタは ProseMirror で、DOM上のテキスト選択とエディタ内部の選択状態は別物**だということです。合成イベントで「選択して削除して貼る」を再現しようとする限り、この2つのズレにいつか当たります。

最終的に落ち着いたのは、**DOM操作を諦めて ProseMirror の `EditorView` を直接掴み、トランザクションで操作する**方式でした。この記事はその記録です。

1. 事故1: 部分差し替えのつもりが先頭挿入になった
2. 事故2: 「貼る前の本文」を確認せず二重貼りした
3. 使ってはいけない方式（2つとも実際に踏んだ）
4. 効く方式: React fiber から `EditorView` を取り出す
5. 貼る前後の検証を関数として持つ
6. 「保存されているか」はDOMではなくAPIで見る
7. HTMLをブラウザに渡す経路の作り方

---

## 1. 事故1 — 部分差し替えのつもりが先頭挿入になった

最初にやったのは「本文末尾の1段落だけ書き換える」という、一見安全に見える操作でした。該当箇所をドラッグで選択し、書き換えた文章を貼り付ける想定です。

実際に公開されたものを見ると、**書き換えたはずの段落は末尾に残ったまま、新しい文章が記事の先頭に挿入されていました。** さらに直後に続けて別の追記を行ったため、先頭に入った断片と既存の書き出しが結合し、文章として成立しない状態のまま数分間、公開状態で残りました。

自動化スクリプトが選択していた範囲と、実際にProseMirrorが「選択されている」と認識していた範囲が一致していなかった、というのが事後の推測です。**部分編集は、狙った範囲を毎回正しく当てられるという前提の上に立っています。** その前提が崩れたときに何が起こるかを、身をもって確認しました。

## 2. 事故2 — 「貼る前の本文」を確認せず二重貼りした

1回目の反省を踏まえて全文置換の方式に切り替えたあと、**別の理由でもう一度事故りました。**

経緯はこうです。ある時点で本文はすでに正しく直っていました（3,636文字）。ところが手元では「まだ直っていない」という古い前提のまま作業を進め、同じ内容のHTMLをもう一度貼り付けました。画面には貼り付け前の文字数が **4,000文字** だと出ていて、想定していた3,636文字と明らかに違っていたにもかかわらず、そのまま実行しました。結果、本文が丸ごと二重になった状態で保存されました。

これは選択や削除のロジックの問題ではありません。**「そもそも貼る必要がある状態か」を確認する手順が、作業フローの中に存在しなかった**ことが原因です。全選択できたか・削除できたかだけを見ていて、貼る前の本文の実測値を見ていませんでした。

:::message
**「更新する」ボタンを押すまでは、貼り付け直後の状態を貼り直せば取り消せます。** note は編集中の下書きを自動保存しますが、公開版の本文は明示的に更新を押すまで変わりません。二重貼りに気づいてページをリロードしても下書きは壊れたままですが、慌てず正しい内容を貼り直せば実害はありませんでした。
:::

## 3. 使ってはいけない方式

事故を踏まえて、**「効かなかった」「事故った」の2種類をはっきり分けておきます。**

### 合成キーイベントの Cmd+V → そもそも発火しない

```javascript
// これは効かない
el.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }));
```

ブラウザの拡張機能・自動化ツールはセキュリティ上の理由でクリップボードに直接触れないため、**合成したキーイベントからペーストは発火しません。** キーイベント自体は届いても、OSのクリップボードを読みに行く実際の処理が起きないため、何も起こらずに終わります。

### `ClipboardEvent('paste')` を dispatch → 事故1・事故2の直接原因

```javascript
// これが二重貼り・先頭挿入の原因になった
const dt = new DataTransfer();
dt.setData('text/html', html);
el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
```

一見それらしく動きます。ProseMirror は `paste` イベントを実際にハンドリングしているので、貼り付け自体は起こります。**問題は、これが「選択範囲の置換」ではなく「カーソル位置への挿入」として処理されることです。** DOM上で選択したつもりの範囲と、ProseMirrorの内部状態が持つ選択範囲が一致していない場合、想定と違う位置に挿入されるか、選択が空（＝カーソルのみ）と解釈されて既存の本文の前後どちらかに挿入されます。

### `execCommand` は ProseMirror に届かない

```javascript
document.execCommand('selectAll');  // DOM上は選択できる（ように見える）
document.execCommand('delete');     // だが本文の文字数はむしろ増えることがある
```

`execCommand('selectAll')` はブラウザの選択API上ではほぼ確実に成功します（実測で99.7%程度の範囲を選択できていました）。しかし **ProseMirror は自前の選択状態（`EditorState.selection`）を持っており、ブラウザネイティブの選択とは同期していません。** そのため `execCommand('delete')` を呼んでも ProseMirror 側の文書は変化しないか、逆に不整合な操作としてわずかに文字数が増えることさえありました（8,000文字が8,001文字になった実例があります）。

**3つとも共通しているのは、「DOM上はそれらしく動いた」ように見えることです。** 見た目の反応があるぶん、失敗に気づきにくいのが厄介でした。

## 4. 効く方式 — React fiber から `EditorView` を取り出す

ProseMirror は編集状態を `EditorView` というオブジェクトで管理していて、これを直接掴んで `dispatch()` すれば、DOM操作を介さずに正確な操作ができます。問題は、**note の実装では `EditorView` が DOM のどこにもグローバル変数としては置かれていない**ことでした。

`EditorView` は React のコンポーネントに props として渡されています。DOM要素からは辿れないので、React のFiberツリーを遡って探します。

```javascript
/** 記事編集ページから ProseMirror の EditorView を取り出す。
 *  note は EditorView を React の props（editorView）で渡していて、
 *  DOM の pmViewDesc からは辿れないため、fiber ツリーを探索する。 */
function getNoteEditorView() {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) throw new Error('.ProseMirror が無い（編集ページを開いているか確認する）');

  const isView = (v) => {
    try {
      return v && typeof v === 'object' && v.state && v.state.doc
        && typeof v.dispatch === 'function' && v.dom instanceof Element;
    } catch (e) { return false; }
  };

  let host = pm.parentElement, fiberKey = null;
  while (host && !fiberKey) {
    fiberKey = Object.keys(host).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) host = host.parentElement;
  }
  if (!host) throw new Error('React fiber が見つからない');

  let root = host[fiberKey];
  while (root.return) root = root.return;

  const seen = new Set();
  let hit = null;
  function probe(o, depth) {
    if (!o || typeof o !== 'object' || depth > 3 || hit) return;
    if (isView(o)) { hit = o; return; }
    if (seen.has(o)) return;
    seen.add(o);
    try {
      for (const k of Object.keys(o)) {
        if (hit) break;
        const v = o[k];
        if (v && typeof v === 'object') {
          if (isView(v)) { hit = v; return; }
          probe(v, depth + 1);
        }
      }
    } catch (e) { /* 循環参照などは無視 */ }
  }
  function walk(fb) {
    if (!fb || hit) return;
    probe(fb.memoizedProps, 0);
    walk(fb.child);
    walk(fb.sibling);
  }
  walk(root);

  if (!hit) throw new Error('EditorView が見つからない（noteの実装が変わった可能性）');
  if (hit.dom !== pm) throw new Error('見つかったEditorViewが本文のものではない');
  return hit;
}
```

やっていることは3段階です。

1. `.ProseMirror` 要素から親を遡り、`__reactFiber$xxxx` のようなキーを持つDOMノード（＝Reactが管理しているノード）を見つける
2. そのFiberから根（root）まで遡る
3. 根から子孫方向に、`memoizedProps` の中に `state.doc` と `dispatch` を持つオブジェクト（＝`EditorView` らしきもの）が現れるまで探索する

`isView()` の判定を「型が一致するか」ではなく「必要なプロパティを持っているか」（ダックタイピング）にしているのは、ProseMirror本体のクラスを import できない環境で書いているためです。**最後に `hit.dom !== pm` で、見つけたものが本当に本文欄のEditorViewかを確認しています。** 編集画面には本文以外にもエディタが存在しうるため、ここを飛ばすと見当違いのエディタを操作しかねません。

`EditorView` さえ手に入れば、置換は数行です。

```javascript
/** 本文を html で丸ごと置き換える。部分置換はしない。 */
function replaceNoteBody(view, html) {
  if (!html || html.length < 100) throw new Error('HTMLが短すぎる。取得に失敗している可能性');
  view.focus();
  view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
  view.pasteHTML(html);
}
```

`tr.delete(0, doc.content.size)` は、文書全体をProseMirmorの座標系（0〜`content.size`の数値）で指定して削除するトランザクションです。座標は数値だけで表現できるので、**ProseMirrorの内部クラス（`Selection` や `TextSelection` など）を1つもimportせずに書けます。** 削除後の空文書に対して `view.pasteHTML()` を呼べば、ProseMirror自身のペースト処理（スキーマに沿った変換）を通してHTMLが文書化されます。**「部分編集はしない。必ず全文を入れ替える」**と決めたのも、事故1の教訓です。狙った範囲を当てにいく設計そのものをやめました。

## 5. 貼る前後の検証を関数として持つ

事故2の教訓は、「操作が成功したか」だけでなく「そもそも操作していい状態か」も確認する必要がある、ということでした。3つの関数に分けて持っています。

```javascript
/** 貼る前に、本文が想定した状態かを確認する。
 *  これを飛ばしたせいで「すでに直っていた本文」にもう一度貼って二重にした事故があった。 */
function assertBodyBeforeReplace(expectedLen, tolerance = 50) {
  const len = document.querySelector('.ProseMirror').innerText.length;
  const ok = Math.abs(len - expectedLen) <= tolerance;
  return { ok, actual: len, expected: expectedLen,
    note: ok ? '想定通り' : '想定と違う。すでに誰かが直した可能性がある。貼る前に中身を確認すること' };
}
```

貼る**前**に、現在の本文の文字数が想定と近いかを確認します。事故2ではこの関数が無く、「4,000文字」という実測値が画面に出ていたのに見過ごしました。**確認する仕組みそのものより先に、確認するタイミングを手順に組み込むことが欠けていました。**

```javascript
/** 貼ったあとの検証。「更新する」を押す前に必ず通すこと。
 *  expected 例: { minLen: 3000, h2: 7, links: ['nce6efea6dfd4', 'n964d58098fc2'] } */
function verifyNoteBody(expected) {
  const pm = document.querySelector('.ProseMirror');
  const body = pm.innerText;
  const h2s = [...pm.querySelectorAll('h2')].map((h) => h.innerText.trim());
  const count = (s) => body.split(s).length - 1;

  const result = {
    bodyLen: body.length,
    h2count: h2s.length,
    h2dup: h2s.length !== new Set(h2s).size,
    links: {},
    ok: true,
    problems: [],
  };

  for (const l of (expected.links || [])) {
    const n = count(l);
    result.links[l] = n;
    if (n !== 1) { result.ok = false; result.problems.push(`${l} が ${n} 回（1回であるべき）`); }
  }
  if (result.h2dup) { result.ok = false; result.problems.push('見出しの重複あり＝二重貼りの疑い'); }
  if (expected.h2 != null && result.h2count !== expected.h2) {
    result.ok = false; result.problems.push(`h2が${result.h2count}個（期待は${expected.h2}個）`);
  }
  if (expected.minLen != null && result.bodyLen < expected.minLen) {
    result.ok = false; result.problems.push(`本文が短すぎる（${result.bodyLen}）`);
  }
  return result;
}
```

**「見出しの重複」を二重貼りの検出に使っているのがポイントです。** 二重貼りは本文が単純に長くなるだけでなく、同じ `h2` が2回ずつ出現する、という構造的な特徴を必ず残します。文字数の増減だけを見るより、この方が確実に引っかかります。特定のリンク文字列（他記事へのリンクなど）が**ちょうど1回**含まれているかも同時に見ることで、「本文の一部が消えた」「二重に入った」の両方を1つのチェックでまとめて検出できます。

## 6. 「保存されているか」はDOMではなくAPIで見る

貼り付け後の検証をエディタのDOM（`verifyNoteBody`）だけで済ませない理由があります。**「エディタ上でそう見える」ことと「サーバーに保存されている」ことは別問題**だからです。

note は編集中の内容を自動保存しますが、それが実際にサーバー側のどの状態（下書き・予約・公開）に反映されているかは、DOMを見ているだけでは判断できません。ここで使えるのが公開APIでした。

```javascript
/** サーバーに保存されている実物を検証する。これが最も確実。
 *  ログイン状態なら、公開前の予約記事でも本文が取れる（未ログインだと404）。
 *  返り値の status は "reserved"（予約中）か "published"（公開済み）。 */
async function verifyStoredNote(key, expected) {
  const r = await fetch(`https://note.com/api/v3/notes/${key}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`記事が取得できない（${r.status}）。ログインしているか確認する`);
  const d = (await r.json()).data;
  const body = d.body || '';
  const count = (s) => body.split(s).length - 1;

  const out = {
    name: d.name,
    status: d.status,
    reservedAt: d.reserved_publish_at || null,
    price: d.price,
    bodyLen: body.length,
    h2: (body.match(/<h2/g) || []).length,
    links: {},
    ok: true,
    problems: [],
  };
  for (const l of (expected.links || [])) {
    const n = count(l);
    out.links[l] = n;
    if (n !== 1) { out.ok = false; out.problems.push(`${l} が ${n} 回`); }
  }
  if (expected.h2 != null && out.h2 !== expected.h2) {
    out.ok = false; out.problems.push(`h2が${out.h2}個（期待は${expected.h2}個）`);
  }
  if (expected.price != null && out.price !== expected.price) {
    out.ok = false; out.problems.push(`価格が${out.price}（期待は${expected.price}）`);
  }
  if (expected.reservedAt && out.reservedAt !== expected.reservedAt) {
    out.ok = false; out.problems.push(`予約日時が${out.reservedAt}に変わっている`);
  }
  return out;
}
```

このエンドポイントの興味深い点は、**ログイン済みであれば、公開前の予約投稿でも本文がそのまま返ってくる**ことです（未ログインだと `404` になります）。つまり「予約中の記事に対して行った編集が、実際にどう保存されたか」を、公開を待たずに検証できます。加えて `price`（価格）や `reserved_publish_at`（予約日時）も同時に返るため、**本文の差し替え作業のついでに、価格や予約日時が意図せず変わっていないかも同じ呼び出しで確認できます。**

もう1つ分かったことがあります。**予約記事の場合、本文を貼り替えた時点でサーバー側にも保存され、「更新する」ボタンを別途押す必要はありませんでした。** 実際、貼り替えた直後にこのAPIを呼ぶと、`body` は新しい内容に変わっている一方で `reserved_publish_at` と `price` は元のままでした。エディタのDOM確認と、サーバーの実物確認を両方行って初めて、「見た目が変わった」で終わらせずに済みます。

## 7. HTMLをブラウザに渡す経路

最後に、地味だが詰まりやすい点です。書き換えたいHTMLを、どうやって記事編集ページ（`editor.note.com`）のJavaScript実行コンテキストに渡すか、という経路の問題です。

- **長い文字列を直接書き写す** → 数千文字を超えるとどこかで文字化けや欠落が起こり、貼った内容の整合性が信用できなくなります
- **手元のPCでローカルサーバーを立てて `fetch` する** → ブラウザの Private Network Access の制約により、パブリックなWebページから `localhost` への `fetch` はブロックされます

最終的に選んだのは、**すでにデプロイ経路を持っている自分の静的サイトを中継先に使う**方法でした。

```javascript
async function fetchBodyFromTransfer(url, expected) {
  const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
  const html = await r.text();
  const h2 = (html.match(/<h2>/g) || []).length;
  const ok = (expected.len == null || html.length === expected.len)
    && (expected.h2 == null || h2 === expected.h2)
    && (expected.links || []).every((l) => html.includes(l));
  if (!ok) {
    throw new Error(`取得したHTMLが想定と違う（len=${html.length}, h2=${h2}）。貼らずに中止`);
  }
  return html;
}
```

`editor.note.com` の Content-Security-Policy には `connect-src` も `default-src` も設定されていなかったため、外部オリジンへの `fetch` がそのまま通ります。そこで書き換えたいHTMLを自分の静的サイトの1ファイルとしてデプロイし、そのURLをここから取得します。**取得したHTML自体の長さ・見出し数・想定リンクの有無を検証してから返す**ことで、中継の途中で内容が壊れていた場合に「気づかず貼ってしまう」ことを防いでいます。

運用上守っているのは1点だけです。**使い終わったら中継ファイルを消し、再デプロイする。** 未公開・予約中の記事の本文が、そのままパブリックなURLに残り続けることになるためです。削除できたかどうかは、HTTPステータスコードでは判定できません（ホスティング先が未知のパスに対してトップページを `200` で返す設定になっているため、消してもステータスは変わりません）。**中身を実際に取得して、消えたことを確認する**必要があります。

---

## まとめ

- **DOM上の選択とProseMirrorの内部選択は別物。** `execCommand` も合成 `ClipboardEvent` も、この2つがズレたときに事故る
- **部分編集はしない。全文を入れ替える。** 狙った範囲を当てにいく設計そのものが事故の温床だった
- **`EditorView` は React の props にある。** DOMからは辿れないので、Fiberツリーを遡って探す
- **貼る前にも本文の状態を確認する。** 「そもそも貼る必要があるか」は、貼った後の検証だけでは分からない
- **見出しの重複は二重貼りの強いシグナル。** 文字数の増減より確実に検出できる
- **「エディタ上でそう見える」と「保存されている」は別問題。** 公開APIで実物を見て初めて確認したことになる
- **中継ファイルを消したかは、ステータスコードではなく中身で確認する**

自動化のコードは「動いた」ところで安心しがちですが、**エディタの内部状態・サーバーに保存された実物という、2つの見えない層**を通るまでは何も確定していません。

---

この仕組みで動いているnoteアカウントと、AIに開発を任せた記録は note に書いています: https://note.com/zeroyen_dev
