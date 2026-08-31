---
title: "個人を特定できる情報を1つも保存しない匿名集計を Cloudflare Pages Functions + D1 で作る"
emoji: "🔒"
type: "tech"
topics: ["cloudflare", "cloudflarepages", "d1", "sqlite", "privacy"]
published: true
---

Web上の診断ツールの結果を匿名で集計する仕組みを、Cloudflare Pages Functions + D1 で作りました。方針は **「とりあえず全部保存して後で消す」ではなく「最初から持たない」** です。

保存しているのは 0〜100 のスコアと `YYYY-MM-DD` の日付だけ。IPアドレス、User-Agent、セッション識別子、時刻の分秒、回答の生データは**どこにも書きません**。

先に断っておくと、**本番のデータは現在0件です。** 動いてはいますが、まだ誰も使っていません。設計の話として読んでください。

以下の順で書きます。

1. 何を保存し、何を保存しないと決めたか（`schema.sql`）
2. 同意の取り方 — 「同意しない限り何も起きない」
3. サーバ側の二重防御（`functions/api/submit.js`）
4. 少数だと個人が特定されうる問題と `MIN_N`
5. Pages Functions + D1 の実装上の注意
6. 現状：0件

---

## 1. 保存するものを先に決める

スキーマの実物です。設計方針をコメントとしてファイルの先頭に置いています。

```sql
-- じぶん解像度 匿名集計スキーマ
--
-- 設計方針:
--   - 個人を特定しうる情報を一切保存しない。IPアドレス、UA、セッションIDも記録しない。
--   - 保存するのは「どのツールで、どんなスコアが出たか」と「日付」のみ。
--   - 日付は日単位まで。時刻を残すと投稿タイミングから個人が絞れる余地が出るため。
--   - 同意した利用者の回答だけが送られてくる（同意はフロント側で明示的に取得する）。

CREATE TABLE IF NOT EXISTS decision_style (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_on  TEXT    NOT NULL,          -- YYYY-MM-DD
  loss        INTEGER NOT NULL CHECK (loss        BETWEEN 0 AND 100),
  present     INTEGER NOT NULL CHECK (present     BETWEEN 0 AND 100),
  maximize    INTEGER NOT NULL CHECK (maximize    BETWEEN 0 AND 100),
  ambiguity   INTEGER NOT NULL CHECK (ambiguity   BETWEEN 0 AND 100),
  confidence  INTEGER NOT NULL CHECK (confidence  BETWEEN 0 AND 100)
);
```

同じ形のテーブルが `calibration`（的中数と設問数）と `procrastination`（5尺度）にもあり、どれも実質的な列は**日付とスコアだけ**です。

ただし `id` は連番です。**時刻は残していませんが、同じ日の中での送信順は残ります。**ここは正確に書いておきます。

落としたものは4つあります。

| 保存しないもの | 理由 |
|---|---|
| IPアドレス | 実質的な識別子。列が無ければ、誤って書くこともできない |
| User-Agent | 端末・OS・ブラウザの組み合わせは十分に絞り込める情報になる |
| 時刻の分秒 | 「その時刻にそのページを開いていた人」と結び付く。日単位なら同じ日の他の行と区別がつかない |
| 回答の生データ | 設問ごとの選択の並びはほぼ一意になる。0〜100 に潰した5つの値なら他人と衝突する |

いちばん効いているのは4つめです。**個票を持たない**と決めると、あとの工程で悩む場面が丸ごと消えます。

:::message
「保存しない」は「一度も通っていない」という意味ではありません。IPアドレスは接続の時点でCDNのエッジには届いていますし、プラットフォーム側のログの有無や保持期間はこちらの管理外です。ここで保証できるのは**自分のDBに書かない**ところまで、という限定付きの話です。
:::

---

## 2. 同意 — 「同意したら送る」ではなく「同意しない限り何も起きない」

協力UIの方針も、同じくファイル先頭に書いてあります。

```javascript
// 方針:
//   - 結果を表示した「あと」に出す。協力しないと結果が見られない作りにはしない。
//   - チェックは既定でオフ。押さなければ何も送信されない。
//   - 何が送られるかを、実際の送信内容そのままで見せる。
```

このUIは**結果を表示したあと**に出ます。協力しないと結果が見られない作りにはしていません。同意が結果の対価になった時点で、それは同意ではなくなります。

画面の実物がこれです。

```html
    <details class="contribute-detail">
      <summary>送信される内容をそのまま見る</summary>
      <pre class="contribute-pre"></pre>
      <p class="fine" style="margin:0.5rem 0 0;">これが全てです。IPアドレス、ブラウザ情報、識別子、回答した個々の設問は送信しません。
      送信後にあなたと結び付けて取り出す方法はありません（取り消しもできません）。</p>
    </details>
    <label class="contribute-consent">
      <input type="checkbox" class="contribute-check">
      <span>上記の内容を匿名で送信することに同意します</span>
    </label>
    <div class="btn-row" style="margin:0.875rem 0 0;">
      <button type="button" class="btn contribute-send" disabled>送信する</button>
```

ポイントは2つあります。

**1. ボタンは `disabled` で始まる。** チェックが入ったときだけ有効になり、外せば戻ります。送信は `click` ハンドラの中でしか起きません。ページを開いただけでも、スクロールしても、`fetch` は1回も飛びません。

```javascript
  pre.textContent = JSON.stringify(summary ?? payload, null, 2);

  check.addEventListener("change", () => {
    send.disabled = !check.checked;
  });
```

**2. 送信内容を説明文ではなく実データで見せる。** `pre` に入れているのは、送信するオブジェクトそのものを `JSON.stringify` したものです。呼び出し側が渡しているのはこれだけです。

```javascript
  const scores = Object.fromEntries(results.map((r) => [r.id, r.score]));
  mountContribute({
    mount: document.getElementById("contribute"),
    payload: { tool: "decision-style", scores },
    summary: { tool: "decision-style", scores, 日付: new Date().toISOString().slice(0, 10) },
  });
```

`summary` は `payload` に日付を足しただけのもので、「これが全てです」という文言の裏取りが画面上でできる状態になっています。文章で約束するより、出力を見せるほうが早い。

送信時に `consent: true` を明示的に付けます。

```javascript
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, consent: true }),
      });
```

---

## 3. サーバ側の二重防御

フロントの同意チェックは、フロントの不具合ひとつで無効になります。エンドポイントは直接叩けます。なので受け口でもう一度見ます。

```javascript
  // 同意していない送信は受け付けない（フロント側の不具合を検知するための二重の防御）
  if (body.consent !== true) {
    return json({ ok: false, error: "同意が確認できません" }, 400);
  }
```

`body.consent !== true` で弾きます。`truthy` 判定ではなく `true` との厳密比較にしているので、`"false"` のような文字列も通りません。

入力の検証はこれだけです。

```javascript
/** 0〜max の整数か検証する。文字列や小数、範囲外は弾く。 */
function isInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}
```

`Number.isInteger` を使っているので、`"50"`（文字列）も `50.5` も `NaN` も落ちます。範囲は `schema.sql` の `CHECK` 制約とも二重になっていて、アプリ側をすり抜けてもDBが拒否します。

INSERT はこの形です。

```javascript
  const cols = dims.join(", ");
  const marks = dims.map(() => "?").join(", ");
  await db
    .prepare(`INSERT INTO ${table} (created_on, ${cols}) VALUES (?, ${marks})`)
    .bind(today, ...values)
    .run();
```

テーブル名と列名を文字列連結していますが、**この2つはリクエストから来ません。** `dims` はモジュール定数の配列、`table` は `body.tool` を `if` で3つの固定値に分岐させた結果です。値のほうは必ず `bind()` に渡します。動的にSQLを組み立てるときは、「どの変数が外から来るか」を1行で言い切れる形にしておかないと、後から読んで判断できなくなります。

失敗したときに返すものも決めています。

```javascript
  } catch (e) {
    // 内部エラーの詳細は返さない（スタックトレースや構成情報を漏らさないため）
    console.error("submit failed:", e);
    return json({ ok: false, error: "保存に失敗しました" }, 500);
  }
```

D1 のエラーメッセージはテーブル名や列名を含むことがあります。詳細は `console.error` でログに残し、レスポンスは固定の文字列にしています。

---

## 4. 件数が少ないうちは統計を返さない — `MIN_N`

```javascript
// 匿名集計の公開。
//
// 件数が少ないうちに平均や順位を出すと誤解を招くため、MIN_N に達するまでは
// 統計値を返さず ready:false のみを返す。

const MIN_N = 30;
```

**個票を持っていなくても、集計が個票になることがあります。** 具体的には、

- **n=1 のとき、平均はその1人のスコアそのもの**です。「匿名の集計値」という見た目で、1人の回答をそのまま公開することになります
- **n=2 で、自分の値を知っている人がいれば、引き算で相手の値が出ます**
- ヒストグラムも同じです。10点刻みのバケットに1件だけ立っていれば、「その人がどの範囲にいるか」が公開されます

だから件数の門番を最初に置きます。

```javascript
  const countRow = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
  const n = countRow?.n ?? 0;
  if (n < MIN_N) return { ready: false, n, min_n: MIN_N };
```

`MIN_N` に達するまでは `ready: false` と `n` だけを返し、平均もヒストグラムも計算しません。件数 `n` を返すのは意図的で、これは単独ではスコアと結び付かないため許容しています。

フロント側はその状態を隠さず表示します。

```javascript
  if (!ds.ready) {
    els.dsSummary.innerHTML =
      `<em>現在 ${ds.n} 件。${ds.min_n} 件に達するまで数値は公開しません。</em>`;
```

:::message
`MIN_N = 30` に理論的な裏付けはありません。k-匿名性のような形式的な保証ではなく、「平均を出しても1人の値が読み取れない」ことを狙った実務上の線です。**時系列で n が 29→30 に変わった瞬間の差分を取る攻撃は防げていません。** 集計を10分キャッシュしているのが結果的に多少の緩和になっていますが、それを目的に入れたものではありません（D1への負荷対策です）。
:::

バケット化はこの1行です。

```javascript
/** 0〜100 のスコアを10点刻み10段階に落とす（100 は最終バケットに含める）。 */
const BUCKET_SQL = (col) => `MIN(${col} / 10, 9)`;
```

`MIN(col / 10, 9)` なので、バケットは `0〜9, 10〜19, ..., 90〜100` の**10段階**です。100 だけが最後のバケットに合流します。

余談ですが、この記事を書くためにコードを読み直すまで、**この行のコメントは「11段階」と書き間違えたまま**でした（実装は10バケットで正しく、コメントだけがずれていた）。書きながら見つけて直しています。**説明を書くと実装との食い違いが出てくる**、というのはよくある話で、今回もそうでした。

返すJSONには、この統計の性質も添えています。

```javascript
    note: "同意した利用者の回答のみを匿名で集計したもの。自己選択による標本であり、日本の一般人口を代表するものではない。",
```

自己選択による標本であることは、数字と同じ場所に置かないと読まれません。

---

## 5. Pages Functions + D1 の実装上の注意

### ルーティングとバインディング

`functions/api/submit.js` が `/api/submit` になります。ファイル配置がそのままURLで、ビルドステップはありません。

Workers の `export default { fetch }` とは書き方が違い、Pages Functions は名前付きエクスポートで、第1引数のコンテキストから `env` を取ります。

```javascript
export async function onRequest({ request, env }) {
```

D1 は `env.DB` として渡ってきます。この `DB` という名前は `wrangler.toml` の `binding` で決まります。

```toml
name = "jibun-kaizoudo"
compatibility_date = "2026-08-22"
pages_build_output_dir = "public"

# 匿名集計用のデータベース。個人を特定しうる情報は保存しない。
[[d1_databases]]
binding = "DB"
database_name = "jibun-kaizoudo-stats"
database_id = "＜wrangler d1 create で発行されたID＞"
```

`database_id` は秘密情報ではありませんが、載せる必要が無いので伏せています。スキーマの適用は `--remote` を明示します。

```bash
CI=true npx --yes wrangler@latest d1 execute jibun-kaizoudo-stats --remote --file=schema.sql -y
```

### `wrangler pages dev --d1=` を渡すと別のDBになる

ローカル確認で `--d1=DB` のようなフラグを渡すと、**バインディング名だけの空のローカルDBが新規に作られ**、`wrangler.toml` に書いたDBとは別物になります。ずっと空のテーブルを見続けることになるので、フラグは渡さず `wrangler.toml` のバインディングをそのまま使います。

:::message
`submit.js` の日付は `new Date().toISOString().slice(0, 10)` で、これは**UTCの日付**です。JSTの 0:00〜9:00 に送信された分は前日として記録されます。日単位までしか持たない設計なので実害は無いと判断して直していませんが、`created_on` はJSTの日付ではない、という点は正確に書いておきます。
:::

---

## 6. 現状 — 本番データ0件

エンドポイントは動き、スキーマは適用済みで、UIも結果画面に出ています。それでも本番の3テーブルは**0行**です。統計ページは今日も「現在 0 件。30 件に達するまで数値は公開しません。」と表示し続けています。

つまり `MIN_N` の設計が実際に効くかどうかは、**まだ一度も検証されていません。** 匿名化の工夫がどれも空回りしているとも言えます。

順序を間違えたのはこの点です。**集める仕組みより先に、集まる理由が要りました。** ただ、0件の状態で先に決めてしまったおかげで、「あとで消す」判断を一度もしなくて済んでいます。持っていないものは、消す必要も、漏れる心配もありません。

---

## まとめ

- **保存しないものは、列を作らない。** 削除の運用より、そもそも受け取らないほうが確実
- **日付は日単位まで落とす。** 分秒は行動時刻という別の情報になる
- **回答の生データを持たない。** 選択の並びはほぼ一意で、スコアに潰すと衝突する
- **同意は既定オフ、送信は `click` の中だけ。** 「同意したら送る」と「同意しない限り何も起きない」は別物
- **送る内容は文章ではなく実データで見せる。** 説明と実装がずれても気づける
- **フロントの同意チェックはサーバでもう一度見る。** エンドポイントは直接叩ける
- **件数が閾値未満なら統計を返さない。** 個票を持たなくても、n が小さいと集計が個票になる
- **内部エラーの詳細は返さない。** DBのエラーは構造を語る

---

AIに開発を任せてこれを作った記録は note に書いています: https://note.com/zeroyen_dev
