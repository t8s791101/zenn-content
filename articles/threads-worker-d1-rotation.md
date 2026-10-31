---
title: "Workers の cron で Threads に毎日投稿する — 周回で計測記録ごと消していた1行"
emoji: "🔁"
type: "tech"
topics: ["cloudflare", "cloudflareworkers", "d1", "threads", "claudecode"]
published: true
---

Threads に毎日21時、自動で1本投稿しています。Cloudflare Workers の cron と D1（SQLite）で動いていて、費用は0円です。2026年8月22日から1日も欠けていません。

この記事は、その仕組みと、**原稿を一周したときに計測の記録まで消していた**1行の話です。2026年10月16日に見つけました。

## 仕組み

```
cron (0 12 * * * = 21:00 JST)
  └─ run(env)
       ├─ decideKind(db)      … 今日はリンクなし(value)かリンクあり(link)か
       ├─ pickPost(db, kind)  … 未投稿の原稿から1本選ぶ
       ├─ publishOne(...)     … Threads API: コンテナ作成 → 8秒待つ → 公開
       └─ 自己リプライに URL   … 本文にリンクを置かない（リーチが落ちるため）
  └─ collectInsights(env)     … 直近14本の views/likes/replies を取り直す
```

原稿は JSON（`content/posts.json`）で、`kind` が `value`（単体で使える一文）か `link`（記事への案内）です。リンクありは4回に1回だけ混ぜます。

```js
const LINK_EVERY = 4;

async function decideKind(db) {
  const { results } = await db
    .prepare(`SELECT kind FROM threads_posted ORDER BY posted_on DESC, rowid DESC LIMIT ?`)
    .bind(LINK_EVERY)
    .all();
  if (results.length < LINK_EVERY) return "value";
  return results.some((r) => r.kind === "link") ? "value" : "link";
}
```

## 消していた1行

`threads_posted` という表を、2つの用途に使っていました。

1. この周回でどの原稿を使ったか（同じ文面を続けて出さないため）
2. 投稿ごとの表示回数・いいねの記録

原稿を使い切ると、1 のために表を空にします。

```js
await db.prepare(`DELETE FROM threads_posted WHERE kind = ?`).bind(kind).run();
```

このとき **2 の記録も一緒に消えていました。** 10月16日に表を見たら、9月から毎日投稿しているのに10件しか残っていませんでした。投稿そのものは止まっていません。Threads 本体の API で、9/27〜10/16 に欠けがないことを確かめました。消えたのは記録だけです。

気づけたのは、別の判定（リンクありとなしの表示数の比較）をしようとして、件数が合わなかったからです。**消す処理が正しく動いていた**ので、エラーは一度も出ていません。

## 直したこと

**追記しかしない表を分けました。** 鍵は Threads 側の投稿 ID です。

```sql
CREATE TABLE threads_log (
  thread_id   TEXT PRIMARY KEY,
  post_key    TEXT,
  kind        TEXT,
  posted_on   TEXT,
  views       INTEGER,
  likes       INTEGER,
  replies     INTEGER,
  insights_at TEXT
);
```

投稿時に両方へ書き、計測の取得元を `threads_log` に変えました。

```js
await env.DB.batch([
  env.DB.prepare(`INSERT OR REPLACE INTO threads_posted (post_key, kind, posted_on, thread_id, has_image) VALUES (?, ?, ?, ?, ?)`)
    .bind(post.id, post.kind, today, result.id ?? null, result.withImage ? 1 : 0),
  env.DB.prepare(`INSERT OR IGNORE INTO threads_log (thread_id, post_key, kind, posted_on) VALUES (?, ?, ?, ?)`)
    .bind(result.id ?? null, post.id, post.kind, today),
]);
```

失った分は、Threads の insights API から48件を取り直しました。**表示回数は後からでも取れる**ので、10月16日時点の値としては復旧できています。日ごとの推移は戻りません。

## ついでに見つかった2つ目

復旧した記録で、同じ原稿が **10月10日と10月16日の6日間で2回**出ていました。一周したあと、空にした表から無作為に選び直していたためです。

いちばん長く出していない原稿を選ぶ形に変えました。

```js
const { results: hist } = await db
  .prepare(`SELECT post_key, MAX(posted_on) AS last_on FROM threads_log WHERE kind = ? GROUP BY post_key`)
  .bind(kind)
  .all();
const lastOn = new Map(hist.map((r) => [r.post_key, r.last_on]));
const sorted = [...candidates].sort((x, y) =>
  (lastOn.get(x.id) ?? "").localeCompare(lastOn.get(y.id) ?? "")
);
```

一度も出していないもの（`""`）が先頭に来て、次に最後に出した日が古いものが来ます。

## 計測は投稿と切り離す

反応の取得は、投稿の成否と独立させています。投稿を飛ばした日も、直近14本を測り直します。反応は投稿の直後ではなく、後から付くからです。

```js
async scheduled(event, env, ctx) {
  ctx.waitUntil(
    run(env)
      .then((r) => console.log("threads-post:", JSON.stringify(r)))
      .catch((e) => console.error("threads-post failed:", e.message))
      .then(() => collectInsights(env))
      .then((r) => console.log("threads-insights:", JSON.stringify(r)))
      .catch((e) => console.error("threads-insights failed:", e.message))
  );
}
```

`collectInsights` の中で HTTP エラーは握りつぶしません。1件目だけ本文を残してログに出します。トークンの失効は、ここにしか出ないからです。

## 持ち帰れる形にすると

指示に足すなら、この2行です。

```
処理の状態を持つ表と、計測の記録を持つ表は分けてください。
周回や初期化で消してよいのは、状態の表だけです。
```

## 正直に書いておくこと

この仕組みは61日で表示 3,657回、フォロワーの増加は1人でした。10月の表示は9月より下がっています。**仕組みは止まっていませんが、集客としては成立していません。** 数字を測れるようにしたので、そう言い切れます。

何を数えて、何を変えたかは note に書いています（調べた結果は無料部分で全部読めます）。

https://note.com/zeroyen_dev/n/nb1f41f553673

*この記事はAI（Claude Code）と一緒に書いていますが、コードと数字はすべて実際に動いているものです。*
