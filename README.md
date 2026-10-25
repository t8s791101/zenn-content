# 年齢・学年早見ナビ

生年月日から、年齢・入学卒業年（早生まれ別）・干支・和暦・長寿祝いの年が分かる無料ツールサイト。収益は広告（Google AdSense）。

- `node test.js` … 答えの分かる37例で計算を検査
- `node build.js` … `dist/` に105ページを生成（トップ、早見表、1926年〜今年の生まれ年別、about、privacy）
- 毎月1日に GitHub Actions がテスト → Cloudflare Pages を再ビルド（年齢と「◯年版」が自動で更新される）

## 最初の1回だけの設定（人が行う。30分程度）

1. **GitHub**：このフォルダを非公開リポジトリとして置く
2. **ドメイン**：Cloudflare Registrar などで独自ドメインを取る（年1,500円前後）。AdSense審査は独自ドメインが無難
3. **Cloudflare Pages**：Workers & Pages → 作成 → Pages → Git に接続 → このリポジトリ
   - ビルドコマンド `node build.js`、出力ディレクトリ `dist`
   - カスタムドメインに 2 のドメインを設定
   - 設定 → ビルド → デプロイフック を作り、URL を GitHub の Secrets に `CF_DEPLOY_HOOK` で保存
4. `config.json` の `siteUrl` と `contactEmail` を書き換えて push
5. **Google AdSense**：サイトを追加して審査申請 → 合格後、`config.json` の `adsenseClient` に `ca-pub-…` を入れて push（ads.txt と広告タグは自動で入る）。振込先と税務情報を登録
6. **Google Search Console**：ドメインを登録し、`/sitemap.xml` を送信

以降は手を触れずに回る。
