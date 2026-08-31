---
title: "launchdの定期実行が8日間静かに死んでいた話と、Cloudflare Workersで組み直した構成"
emoji: "⏰"
type: "tech"
topics: ["macos", "launchd", "cron", "cloudflareworkers", "cloudflare"]
published: true
---

macOS の `launchd` で組んだ毎日1回の定期実行が、**8日間、一度も動いていませんでした。** エラー通知はゼロ。ログファイルは 0 バイト。`launchctl list` にはちゃんと載っている。

原因は「スクリプトを iCloud Drive の中に置いていた」ことでした。そして厄介なのは、**手でシェルから実行すると普通に成功する**ことです。テストでは絶対に気づけません。

同じ罠を踏んでいる人向けに、次の順で書きます。

1. どう気づいたか（`launchctl print` の出力と終了コード126の意味）
2. なぜ起きるか（macOS の TCC と、テストで検出できない理由）
3. フルディスクアクセスを付ける方向を選ばなかった理由
4. Cloudflare Workers（Cron Triggers）+ D1 への移行後の構成（実際のコード全文）
5. 実際の無料枠の消費量
6. 「また静かに止まった」ことに気づくための監視
7. この移行で踏んだハマりどころ

---

## 1. 現象 — `launchctl list` は正常、投稿はゼロ

毎日 21:00 に Threads へ 1 件投稿する、というだけの仕組みでした。`launchd` の plist はこの形です（ラベルとパスは伏せています。移行後に plist 自体は削除済み）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.daily-post</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <!-- ここが地雷 -->
    <string>/Users/xxx/Library/Mobile Documents/com~apple~CloudDocs/project/post.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>21</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
</dict>
</plist>
```

`launchctl bootstrap` は成功し、`launchctl list` にも出ます。手元のシェルから `bash post.sh` を叩けば投稿されます。ここで「設定完了」と判断したのが間違いでした。

8日後に投稿が1件も無いことに気づき、状態を見ました。

```bash
$ launchctl print gui/$(id -u)/com.example.daily-post | grep -E 'runs|exit'
	runs = 2
	last exit code = 126
```

### 終了コード126が意味すること

シェルの慣例で、**126 は「コマンドは見つかったが実行できなかった」**です（127 は「見つからなかった」）。つまり `/bin/bash` の起動までは行っていて、`bash` が渡されたスクリプトファイルを開けずに死んでいます。

裏付けが `StandardErrorPath` に出ていました。実物がこれです（パスは伏せています）。

```
/bin/bash: /Users/xxx/.../scripts/daily_post.sh: Operation not permitted
/bin/bash: /Users/xxx/.../scripts/daily_post.sh: Operation not permitted
```

**2行しかありません。** `runs = 2` と一致します。

同時に見た3つの状態が、そろって同じことを指していました。

| 見たもの | 状態 |
|---|---|
| `StandardOutPath` のログ | **0 バイト** |
| `StandardErrorPath` のログ | 上記2行だけ |
| スクリプトが自分で書くはずの `post.log` | **ファイルが存在しない** |
| 投稿の状態ファイル `state.json` | 手動テスト時の**1件のまま**、8日間増えていない |

3番目が決定的でした。ラッパースクリプトは冒頭で `log()` を定義してファイルに追記する作りなので、**スクリプトが1行でも実行されていれば `post.log` は必ず生まれます。** それが無い＝中身は一切走っていない。

`Operation not permitted` は見慣れた文字列ですが、ここでの意味は **「実行権限が無い」ではなく「読むことすら許されていない」**です。`ls -l` を見れば実行ビットは立っています。パーミッションの問題ではありません。

---

## 2. 原因 — TCC がユーザーデータ領域を守っている

macOS は以下のディレクトリを TCC（Transparency, Consent, and Control）の保護対象にしています。

- `~/Library/Mobile Documents/`（**iCloud Drive の実体**）
- `~/Documents`
- `~/Desktop`
- `~/Downloads`

これらの下のファイルは、**フルディスクアクセスを持たないバックグラウンドプロセスからは読めません。** `launchd` から起動された `/bin/bash` はまさにこれに該当します。だから `bash` はスクリプトを開けず、126 を返して終わります。

### なぜテストで気づけないのか

ここが本題です。**ターミナルから手で実行するとき、その `bash` の親は Terminal.app です。** Terminal.app は「ファイルとフォルダ」の許可を持っている（あるいは初回にダイアログで許可を求める）ので、iCloud Drive 配下を読めます。一方 `launchd` から起動されたプロセスの責任元は Terminal ではありません。

:::message
ここの機構の説明は、**私が観測した挙動から組み立てた推測**です。手動実行は成功し、`launchd` 経由だけが 126 で落ち、保護領域の外に出すと直る — この3点とは整合しますが、Apple のドキュメントで裏を取ったわけではありません。**確かなのは観測のほうで、説明のほうではありません。**
:::

**同じスクリプト、同じユーザー、同じパスなのに、起動経路が違うだけで結果が反転します。** 手動実行は成功し、スケジュール到来時の自動起動だけが失敗する。「動作確認しました」がまったく当てにならない構図です。

### 30秒でできる切り分け

定期実行が理由不明で動かないとき、まずこれを見ます。

```bash
# 1. 終了コードを見る（126/127 なら起動すらしていない）
launchctl print gui/$(id -u)/<ラベル> | grep -E 'state|runs|last exit code'

# 2. スクリプトの絶対パスが保護領域かどうか
#    Mobile Documents / Documents / Desktop / Downloads を含むならほぼ黒
```

そして根本的な回避策は、**スクリプトを保護領域の外に置くこと**です。`~/bin` や `/usr/local/bin`、あるいはリポジトリごと `~/Projects` などへ移すだけで直ります。

---

## 3. 判断 — フルディスクアクセスを付けなかった理由

「`/bin/bash` にフルディスクアクセスを与える」でも動きます。それを選ばなかった理由は3つです。

**1. 付与対象が広すぎる。** 保護を外す相手が「このスクリプト」ではなく「`/bin/bash`」になります。以降そのマシン上で `bash` 経由で起動される全てが保護領域を読めるようになる。1日1回 SNS に投稿するためのコストとしては過剰でした。

**2. コード化できない。** システム設定の GUI 操作なのでリポジトリに残せず、マシンを変えたら再現しません。**「動く条件」がリポジトリの外にあるのは、今回まさに事故った構造そのもの**です。

**3. そもそも Mac の電源に依存する。** これが決め手です。フルディスクアクセスを付けても、21:00 に Mac が閉じていれば実行されません。`launchd` は起床後に遅れて走らせることはできますが、「毎晩必ず1回」の保証にはならない。

**権限の問題を直しても、可用性の問題は残る。** それなら実行場所そのものを動かしたほうが早い、という判断です。移した先は Cloudflare Workers の Cron Triggers で、これは既に静的サイトのホスティングに使っていて追加費用がゼロだったこと、そしてローカルの権限にも電源にも依存しないことが理由でした。

---

## 4. 移行後の構成 — Workers Cron Triggers + D1

```
Cloudflare Workers (Cron Triggers)   毎日 12:00 UTC = 21:00 JST に起動
        │
        ├── D1 (SQLite互換)          「どの原稿をいつ投稿したか」の状態を持つ
        └── Threads Graph API        コンテナ作成 → 公開の2段階
```

Workers は状態を持てないので、**「同じ日に投稿済みか」「どの原稿を使ったか」を D1 に置く**のが設計の中心になります。

### `worker/wrangler.toml`

```toml
# Threads 自動投稿 Worker（Cron Trigger）
#
# デプロイ:  cd worker && CI=true npx --yes wrangler@latest deploy
#
# 認証情報は secret として保持する。wrangler.toml には書かない。
#   npx wrangler secret put THREADS_ACCESS_TOKEN
#   npx wrangler secret put THREADS_USER_ID
#   npx wrangler secret put TRIGGER_KEY

name = "jibun-kaizoudo-threads"
main = "src/index.js"
compatibility_date = "2026-08-22"

# cron で動かすだけなので公開URLは持たせない。
# workers.dev のサブドメイン登録も不要になり、外部から叩かれる経路も無くなる。
workers_dev = false

# 毎日 12:00 UTC = 21:00 JST。日本の夜はThreadsの閲覧が伸びる時間帯。
[triggers]
crons = ["0 12 * * *"]

# 投稿状態の保存先。サイト側の集計と同じDBを使う。
[[d1_databases]]
binding = "DB"
database_name = "jibun-kaizoudo-stats"
database_id = "＜wrangler d1 create で発行されたID＞"

[observability]
enabled = true
```

ポイントは3つです。

- **`workers_dev = false`** — cron でしか起動しないので `*.workers.dev` の公開URLは不要です。付けたままにすると、アクセストークンを持った Worker に誰でも到達できる URL が存在することになる。**使わない入口は塞ぐ。**
- **cron は UTC 指定** — JST 21:00 なら `0 12 * * *`。ここを間違えると9時間ずれます。
- **`[[d1_databases]]` のバインディング** — `env.DB` として渡ってきます。`database_id` は `wrangler d1 create` の出力に入っています。シークレットではなく識別子なのでリポジトリにコミットして問題ありません（アクセスにはアカウント認証が要る）。この記事では自分のIDを伏せていますが、隠す必要があるからではなく、載せる必要が無いからです。トークン類は `wrangler secret put` に寄せています。

### `worker-schema.sql`

```sql
-- Threads自動投稿の状態。
-- Worker は状態を持てないため、どの原稿を使ったかをここに記録する。
CREATE TABLE IF NOT EXISTS threads_posted (
  post_key   TEXT PRIMARY KEY,   -- content/posts.json の id
  kind       TEXT NOT NULL,      -- value / link
  posted_on  TEXT NOT NULL,      -- YYYY-MM-DD
  thread_id  TEXT                -- Threads側の投稿ID
);

CREATE INDEX IF NOT EXISTS idx_threads_posted_on ON threads_posted (posted_on);
```

適用はこれだけです。

```bash
CI=true npx --yes wrangler@latest d1 execute jibun-kaizoudo-stats \
  --remote --file=worker-schema.sql -y
```

### `worker/src/index.js` の要点

#### JST の日付を作る

```javascript
/** JSTの日付（YYYY-MM-DD）。UTCで日付が変わるとズレるため明示的に+9時間する。 */
function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
```

Workers のランタイムは UTC です。cron は 12:00 UTC に起きるので `toISOString()` をそのまま切ると同じ日付にはなりますが、**手動実行や再試行が JST 0:00〜9:00 に走ると前日になります。** ここは素直に +9 時間しておくのが安全でした。`Intl` を使わないぶん依存も増えません。

#### 同日二重実行の防止

```javascript
const today = todayJST();

// 同日に投稿済みなら何もしない
const already = await env.DB
  .prepare(`SELECT COUNT(*) AS n FROM threads_posted WHERE posted_on = ?`)
  .bind(today)
  .first();
if ((already?.n ?? 0) > 0) {
  return { ok: true, skipped: true, reason: `${today} は投稿済み` };
}
```

Cron Triggers は重複起動しうる前提で書く必要があり、加えて手動トリガーとの衝突もあります。「実行のたびに投げる」ではなく **「今日の分がまだ無ければ投げる」という冪等な形**にしておけば、どちらの理由でも二重投稿しません。判定を「直近○時間以内」ではなく `posted_on` の等値比較にしているのは、日付を単位として扱ったほうが SQL も目視確認も単純だからです。

#### 原稿を一巡したら記録を消す

```javascript
/** 未投稿の原稿を1件選ぶ。使い切っていたらその種別の記録を消して一巡目に戻す。 */
async function pickPost(db, kind) {
  const candidates = POSTS.filter((p) => p.kind === kind);
  if (candidates.length === 0) return null;

  const { results } = await db
    .prepare(`SELECT post_key FROM threads_posted WHERE kind = ?`)
    .bind(kind)
    .all();
  const used = new Set(results.map((r) => r.post_key));

  let unused = candidates.filter((p) => !used.has(p.id));
  if (unused.length === 0) {
    await db.prepare(`DELETE FROM threads_posted WHERE kind = ?`).bind(kind).run();
    unused = candidates;
  }
  return unused[Math.floor(Math.random() * unused.length)];
}
```

「未使用の原稿からランダムに1件」「全部使い切ったらその種別の記録を消して最初に戻る」。**テーブルが無限に伸びないので、ローテーションの状態管理と履歴のクリーンアップが同じ1つの処理になります。**

`DELETE` を打った直後は「最終投稿日」の履歴も消えますが、当日のレコードは直後に `INSERT` されるので `MAX(posted_on)` は当日のままです（後述の監視がこれに依存します）。

#### コンテナ作成 → 公開の2段階と再試行

Threads の Graph API は、投稿を「メディアコンテナを作る」「そのコンテナIDを publish する」の2段階で行います。

```javascript
async function publish(env, post) {
  const token = env.THREADS_ACCESS_TOKEN;
  const userId = env.THREADS_USER_ID;

  const params = { media_type: "TEXT", text: post.text, access_token: token };
  if (post.url) params.link_attachment = post.url;

  const container = await postForm(`${API}/${userId}/threads`, params);
  if (!container.id) throw new Error(`コンテナIDが返らない: ${JSON.stringify(container)}`);

  // Meta はコンテナ作成から公開まで少し間を置くことを推奨している。
  // Worker の実行時間上限があるため、長く待たず失敗時に一度だけ再試行する。
  await new Promise((r) => setTimeout(r, 8000));

  try {
    return await postForm(`${API}/${userId}/threads_publish`, {
      creation_id: container.id,
      access_token: token,
    });
  } catch (e) {
    await new Promise((r) => setTimeout(r, 8000));
    return await postForm(`${API}/${userId}/threads_publish`, {
      creation_id: container.id,
      access_token: token,
    });
  }
}
```

コンテナ作成直後に publish すると失敗しうるため待ちが要りますが、**Worker には実行時間の上限があるので長く待てません。** 「8秒待つ → 失敗したらもう8秒待って1回だけ再試行」に落としています。指数バックオフで粘るのではなく、**cron が明日また来ることを前提に、諦めどころを短くする**設計です。

#### エントリポイント

```javascript
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      run(env)
        .then((r) => console.log("threads-post:", JSON.stringify(r)))
        .catch((e) => console.error("threads-post failed:", e.message))
    );
  },

  // 手動確認用。?dry=1 で投稿せず、次に出る原稿だけを返す。
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("forbidden", { status: 403 });
    }
    if (url.searchParams.get("dry") === "1") {
      const kind = await decideKind(env.DB);
      const post = (await pickPost(env.DB, kind)) ?? (await pickPost(env.DB, "value"));
      return Response.json({ ok: true, dry_run: true, kind, next: post });
    }
    const result = await run(env);
    return Response.json(result);
  },
};
```

`scheduled` の中では `ctx.waitUntil()` で包みます。これをしないと非同期処理の完了前にハンドラが返り、途中で切られます。

`fetch` 側は `?dry=1` で**投稿せずに「次に出る原稿」だけを返す**確認口です。`workers_dev = false` にしてあるので公開URLからは到達できず、Routes を貼ったときだけ生きます。念のためシークレットのキー比較も入れています。

### 稼働確認

```bash
cd worker

# リアルタイムのログ
npx --yes wrangler@latest tail

# 投稿記録
cd .. && npx --yes wrangler@latest d1 execute jibun-kaizoudo-stats --remote \
  --command="SELECT * FROM threads_posted ORDER BY posted_on DESC LIMIT 10" -y
```

**今回の教訓の実践として、「デプロイした」ではなく「D1 に行が増えた」を完了条件にしています。**

---

## 5. 無料枠の実数

9日間運用した時点の実測です。全て Cloudflare の Free プラン、クレジットカード未登録の状態で動いています。

| リソース | 使用量 | 無料枠（2026-08 時点で確認した値） |
|---|---|---|
| Pages リクエスト | 数百 | 無制限 |
| Pages ビルド | **0回** | 月500回 |
| D1 書き込み | 数十行 | 1日10万行 |
| D1 読み取り | — | 1日5万行 |
| Workers 実行 | **1日1回** | 1日10万リクエスト（cron 込み） |

**枠の 0.1% も使っていません。** この用途の負荷が「1日1回、数行の SELECT と1行の INSERT」しかないからです。cron の起動は Workers のリクエスト数としてカウントされますが、日次なら月30回です。

Pages のビルド回数が **0 回**なのは、**ビルドの要らない純静的サイトにしている**からです。フレームワークを入れるとビルド回数と時間の枠を消費し始めます。素の HTML/CSS/JS ならアップロードするだけなので、この枠は減りません。無料枠で長く回すなら、ここが一番効きました。

なお無料枠の数値は変わります。**上の値は自分で確認した時点のものなので、必ず公式の料金ページで現在値を見てください。**

---

## 6. 監視 — 「また静かに止まる」ことを前提にする

原因を直しても、静かに止まる理由は残ります。実際に数えたら3つありました。

1. **アクセストークンが60日で失効する**（Threads の長期トークンの仕様。切れた瞬間に投稿は失敗し、やはり何も通知されない）
2. **実行はされるが API 呼び出しだけ失敗する**
3. **原稿を使い切る**

どれも例外で落ちるだけで、誰にも届きません。**「止まったことが分かる仕組み」**を別 Worker として作り、判定はこの1行に集約しました。

```javascript
const r = await env.DB
  .prepare(`SELECT COUNT(*) AS n, MAX(posted_on) AS last FROM threads_posted`)
  .first();
out.threads投稿数 = r?.n ?? 0;
out.threads最終投稿 = r?.last ?? "なし";
out.threads停止疑い = r?.last ? daysBetween(r.last, today) >= 2 : true;
```

### 「2日」という線の引き方

1日1回の処理なので、1日空くのは通信の揺れやリトライの範囲に収まります。**2日空いたら異常。** ここを「1日」にすると誤検知で狼少年になり、「1週間」にすると今回と同じ8日を繰り返します。**実行間隔の2倍**、が今のところ妥当な線でした。

画面にはこう出ます。

```
最終投稿  2026-08-31  2日以上途切れています。トークン失効を疑う
```

**疑うべき原因まで書いておく**のが実用上のポイントでした。赤くなっても次に何を見ればいいか分からなければ、結局放置します。

### データが無いときは異常に倒す

上の式の末尾、**`: true`** の部分がこの監視の芯です。

```javascript
out.threads停止疑い = r?.last ? daysBetween(r.last, today) >= 2 : true;
```

`MAX(posted_on)` が `null`、つまりレコードが1件も無いとき、**正常ではなく異常として扱っています。**

「まだ始まっていないだけ」と「壊れていて記録が書けていない」は、外側からは同じ「データ無し」に見えます。**見分けがつかないなら、危ないほうに倒す。** 今回まさに、`state.json` が1件のままなのを「まだ始まっていないのだろう」と読み流して8日を失っています。

同じ方針を、後から足した note 側の更新停滞チェックにも入れました。

```javascript
// 記事の公開が途切れたことにも気づけるようにする。
// Threads と同じ考えで、データが取れないときは正常ではなく異常に倒す。
const 公開日一覧 = items.map((i) => (i.publishAt ?? "").slice(0, 10)).filter(Boolean).sort();
out.note最終公開 = 公開日一覧.length ? 公開日一覧[公開日一覧.length - 1] : null;
out.note経過日数 = out.note最終公開 ? daysBetween(out.note最終公開, out.today) : null;
out.note更新停滞 = out.note最終公開 ? out.note経過日数 >= 7 : true;
```

もうひとつ、**取得できない値は空欄にせず「取得できない理由」を出す**ようにしています。

```javascript
${row("ビュー数", "手動で確認", "APIが認証必須のため取得できない")}
```

空欄はゼロに見えます。「取れないから空」なのか「本当に0」なのかが区別できない画面は、監視として機能しません。

### 正直に書いておく限界

この監視 Worker は、監視対象の投稿 Worker と**同じアカウントの同じ基盤の上に載っています。** 基盤ごと落ちれば両方止まり、何も気づけません。外部の死活監視サービスを噛ませない限りこの穴は塞がらないので、分かった上で今は受け入れています。

---

## 7. ハマりどころ

この移行で実際に踏んだもののうち、他の人にも起きるものだけ。

### `workers_dev = false` でも workers.dev サブドメインは1つ要る

`wrangler deploy` で **cron の登録だけが失敗する**、という状態になりました。Worker のコードのアップロードは成功していて、Cron Triggers が登録されない。

原因は、**Cloudflare アカウントに workers.dev サブドメインが一度も作られていなかった**ことでした。`workers_dev = false` にしていても、アカウント側にサブドメインが1つ必要です。ダッシュボードの Workers オンボーディング画面で一度だけ名前を決めれば通ります（Free プランのままで可）。

公開URLとしては使わないので、名前は何でも構いません。

### `wrangler pages dev --d1=` を渡すと別のDBができる

ローカル確認のときに `--d1=DB` のようなフラグを渡すと、**バインディングだけのローカル用DBが新規に作られ**、`wrangler.toml` に書いた本来の D1 とは別物になります。デバッグ中ずっと空のテーブルを見ることになるので、**フラグを渡さず `wrangler.toml` のバインディングを使う**のが正解でした。

### 同期フォルダのリポジトリに `node_modules` を作らない

リポジトリ自体が iCloud Drive 配下にあるため、`npm install` で `node_modules` を作ると数万ファイルが同期対象になります。wrangler はローカルにインストールせず、毎回 `npx --yes wrangler@latest` で呼ぶ運用に統一しました。`CI=true` を付けると対話プロンプトが出ません。

```bash
CI=true npx --yes wrangler@latest deploy
```


## まとめ

- **終了コード126 = コマンドは見つかったが実行できない。** 定期実行が動かないときは、まず `launchctl print` の `last exit code` を見る
- **ログが空なのは、エラーが出ていないからではなく起動すらしていないから。** スクリプトが自分で書くログの有無が一番確実な証拠になる
- **iCloud Drive・Documents・Desktop・Downloads の下にスクリプトを置かない。** 手動実行では通るのでテストで検出できない
- **権限を直しても電源依存は残る。** 「毎日必ず1回」が要るなら実行場所をクラウドに出すのが早い
- **Cron Triggers は重複起動しうる前提で、冪等に書く。** 「実行のたびに投げる」ではなく「今日の分が無ければ投げる」
- **止まったと判定する基準を数字で決める。** 実行間隔の2倍が最初の線として使いやすい
- **データが取れないときは、正常ではなく異常に倒す**

「設定した」は「動いている」ではありません。今回それを、8日分の沈黙で教わりました。

---

この構成でサイトとSNS自動投稿を9日で作った記録は note に書いています: https://note.com/zeroyen_dev
