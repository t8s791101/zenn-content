# 収益化オートパイロット（LINEスタンプ）

キャラクター「もこひつじ」のLINEスタンプを、**季節の需要に合わせて自動で企画・制作・検査し、申請一式（zip と申請文）まで作る**アプリ。

人がやるのは「LINE Creators Market で zip をアップロードして審査リクエストを押す」だけ（LINEに申請用の公開APIがなく、自動ログインは規約違反になるため）。

## 自動で回る部分

| 工程 | 担当 |
|---|---|
| 何をいつ作るか（申請期限から逆算） | `plan` / GitHub Actions（毎月1日・15日） |
| 絵柄・文字の制作（16個＋メイン＋タブ） | `themes/*.json` → `src/draw.js` |
| 規格チェック（サイズ・透過・余白10px・1MB・個数） | `build` 内で全画像を検査。NGなら止まる |
| 申請一式（upload.zip・listing.md・preview.png） | `dist/<テーマ>/` |
| 通知 | GitHub Issue（スマホのGitHubアプリに届く） |
| 販売・決済・配布 | LINE（審査後は自動） |

## 使い方

```bash
npm install && npx playwright install chromium
node autopilot.js plan                  # 今日やること
node autopilot.js build newyear2027     # 1テーマ作る
node autopilot.js auto --days 45        # 期限45日以内の未制作テーマを全部作る
node autopilot.js mark newyear2027 submitted   # 申請したら記録
```

## テーマを増やす

`themes/` に JSON を1つ足すだけ。1行＝スタンプ1個。

```json
{"t": ["ありがとう"], "c": "#f25f7a", "e": "happy", "m": "open", "props": [["heart", 70, 80, 1.4]]}
```

- `t` 文字（1〜2行。長いと自動で縮小）、`c` 文字色
- `e` 目：open / happy / wink / sleep / cry / star / heart
- `m` 口：smile / open / o / flat / wavy
- `layout`：center（既定）/ left（右に小物）/ kotatsu
- `props` 小物：spark, heart, sweat, zzz, maru, batsu, label, envelope, mochi, omikuji, torii, kotatsu, flag, paper, banner, choco, gift, cake, flower, sakura, cup, phone
- `submitBy` 申請期限（null なら通年）、`peak` 売れる期間

## 注意

- 規格値は二次情報と自動検査で確認したもの。初回申請前に LINE 公式の制作ガイドラインと照合すること
- フォント：M PLUS Rounded 1c（SIL Open Font License、`fonts/OFL.txt`）
