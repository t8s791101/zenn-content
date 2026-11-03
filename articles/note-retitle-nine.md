---
title: "note の公開記事9本の題名を一括で短くした — 元の題名を残し、タグ数と見出し数で照合する手順"
emoji: "✂️"
type: "tech"
topics: ["note", "javascript", "claudecode", "seo", "自動化"]
published: true
---

note（ブログサービス）に出している記事30本の題名が、32〜64字でした。自分で決めた型は「12〜21字、頭に数字か結論」です。2026年11月1日に、閲覧数が多い順に9本の題名を型に合わせて短くしました。

この記事は、公開中の記事の題名だけを安全に変える手順と、効いたかどうかを後で判定できるように残したものの記録です。本文は1文字も触っていません。

## 変える前に残したもの

題名を変えると戻せなくなるので、先に3つを残しました。

1. **元の題名**（9本分、キーと一緒に表で）
2. **変更前の7日閲覧数**（note の統計 `filter=weekly`。9本とも 0 でした）
3. **判定の日と基準**（11月8日に7日閲覧数を取り直して、0 のままなら効いていない）

変更前の7日閲覧が全部 0 なのは、どれも公開から1か月以上たった記事だからです。弱い基準ですが、0 より増えたかどうかは見えます。

## 題名の例

| 元（45〜53字） | 新（13〜17字） |
|---|---|
| Claude Codeの権限確認をスキップすると何が起きるか — 全権限で走らせた7件の事故と、防いだ指示 | Claude Codeに全権限で、事故7件 |
| Claude Codeの自動化が「勝手に止まる」罠 — 8日間気づけなかった原因と、2日で気づく1画面 | 自動投稿が8日間、黙って止まった |
| Claude Codeが「勝手に」やって壊れた22件 — 任せる前に読む、症状・原因・防ぐ一文 | Claude Codeで壊れた22件 |

題名に入れる語は、note 検索の人気順で1ページ目（20件）に入るための最低スキが低い語を選びました。「自動投稿」は 4、「Claude Code」は 39 です（2026年10月24日の実測）。

## 手順

note のエディタで、題名は `<textarea>` です。React が値を管理しているので、`value` に代入するだけでは反映されません。ネイティブの setter を呼んでから `input` イベントを出します。

```js
const T = '自動投稿が8日間、黙って止まった';
const ta = document.querySelector('textarea');
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, T);
ta.dispatchEvent(new Event('input', { bubbles: true }));
```

そのあと「公開に進む」→「更新する」を押します。どちらもボタンの文字で探して `.click()` で動きます。

```js
[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '公開に進む').click();
// 画面が変わるのを待ってから
[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '更新する').click();
```

## 照合：題名以外が変わっていないこと

更新の前後で、公開APIからタグ数と `<h2>` の数を取って比べます。前の値は `localStorage` に置きます（ページを移動しても消えないため）。

```js
// 前
const pre = await (await fetch('https://note.com/api/v3/notes/' + key)).json();
localStorage.setItem('pre_' + key, JSON.stringify({
  tags: (pre.data.hashtag_notes || []).length,
  h2: ((pre.data.body || '').match(/<h2/g) || []).length,
}));

// 後
const r = await (await fetch('https://note.com/api/v3/notes/' + key)).json();
const p = JSON.parse(localStorage.getItem('pre_' + key));
const out = {
  name: r.data.name, price: r.data.price,
  tags: (r.data.hashtag_notes || []).length,
  h2: ((r.data.body || '').match(/<h2/g) || []).length,
};
if (out.price !== 0 || out.tags !== p.tags || out.h2 !== p.h2 || !out.name.startsWith('自動投稿'))
  throw new Error('verify failed ' + JSON.stringify(out));
```

9本すべてで、タグ数・見出し数は前後で一致し、題名だけが変わりました。

## 気をつけたこと

- **有料記事は対象から外した。** 有料記事は更新で有料ラインが動くことがあり、題名だけのためにそのリスクを取る理由がない
- **1本ずつ検証を挟んだ。** 9本をまとめて更新してから確かめる形にすると、どこで壊れたか分からなくなる
- **題名に「Claude Code」を入れた記事を、全部からは減らした。** 30本中28本に入っていて、いちばん混んでいる語に、いちばん弱い記事で挑んでいた

## 分からないこと

効いたかどうかは、まだ分かりません。判定は 11月8日です。閲覧が増えたとしても、同じ時期に始めた交流（スキ・フォロー）の影響と切り分けられない可能性があります。それも含めて、判定のときに書きます。

何を数えて、題名の語をどう選んだかは note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、手順と数字はすべて実際に動かしたものです。*
