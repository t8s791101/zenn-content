---
title: "Pillowが読み込めない環境で、OGP画像をヘッドレスChromeで生成する"
emoji: "🖼️"
type: "tech"
topics: ["ogp", "python", "headlesschrome", "pillow", "macos"]
published: true
---

OGP画像（1200×630）を7枚、コードから生成したい。よくある要件です。

ところがこの環境では、**画像生成ライブラリが読み込めませんでした。** 最終的に選んだのは、**HTMLを書いてヘッドレスChromeでスクリーンショットを撮る**という方式です。実装は `scripts/make_og.py` の1ファイル、追加の依存パッケージはゼロです。

以下の順で書きます。

1. なぜ Pillow を使わないのか（`import PIL` が失敗する前に約2分ハングする）
2. HTMLで画像を作るという方式そのもの
3. ヘッドレスChromeの呼び出しと、`--screenshot` 後に終了しない問題
4. 実際に踏んだ失敗 — 文字が重なったまま公開されかけた
5. 大きなPNGの一部だけを見たいとき

---

## 1. なぜ Pillow を使わないのか

`make_og.py` の冒頭に、そのまま書いてあります。

```python
#!/usr/bin/env python3
"""OGP画像（1200×630）を生成する。

ヘッドレスChromeでHTMLを描画してPNGに落とす。追加ライブラリは不要。
Pillow を使わないのは、この環境で native 拡張がロードできないため。

    python3 scripts/make_og.py

生成先: public/assets/og/<name>.png
"""
```

「native 拡張がロードできない」の中身です。引き継ぎ資料にはこう記録してあります。

```text
| Pillow が `ImportError`（code signature 不正） | macOSのポリシーでnative拡張がロード不可。**`import PIL` は失敗する前に2分ハングする**ので試さないこと。画像生成は**ヘッドレスChrome**で行う（`scripts/make_og.py`） |
```

`ImportError` 自体は珍しくありません。この環境で厄介だったのは、**エラーの内容ではなく失敗の仕方**でした。

### `import PIL` は、失敗する前に約2分ハングする

これが一番共有する価値のある観測だと思うので、単独で書きます。

`import PIL` を実行すると、すぐ `ImportError` が返るのではなく、**約2分無言で止まってから**落ちます。この2分間、標準出力にも標準エラーにも何も出ません。

これが何を引き起こすかというと、

- **手で試すと「固まった」と誤認する。** ネットワークを見に行っているのか、インストールが壊れているのか、判断がつかない
- **タイムアウトのあるツールやCIから呼ぶと、`ImportError` すら見えない。** 「応答なし」で打ち切られ、原因を示す文字列が1バイトも残らない
- **切り分けのために何度も試すと、そのたびに2分溶ける**

だから引き継ぎ資料には「試さないこと」と書いてあります。エラーメッセージを見に行く行為そのものがコストになる、という珍しい状態です。

:::message
原因を「Pillow が悪い」とは書けません。観測できたのは、**この環境（macOS 上のこの Python）では native 拡張のロードが通らず、その失敗までに長い待ちが挟まる**ということだけです。同じ Pillow が別のマシンでは普通に動きます。コード署名の検証がどこで時間を使っているのか、私は裏を取っていません。**確かなのは観測のほうで、説明のほうではありません。**
:::

判断としては、原因を追うより**native 拡張に依存しない経路に移したほうが早い**でした。Chrome はすでに入っていて、追加インストールも権限の付与も要りません。

---

## 2. HTMLで画像を作るという方式

方式を変えてみると、これは代替品ではなく普通に良い選択でした。理由は3つです。

**1. レイアウトをCSSで書ける。** `display:flex` と `justify-content:space-between` で「ブランド名を上、見出しを中央、タグとURLを下」を書けます。`radial-gradient` の光も `border-radius:999px` のピル型タグも1行です。同じ絵を描画ライブラリで出そうとすると、全部が座標とループになります。

**2. フォントを名前で指定できる。** `font-family:"Hiragino Sans"` と書けば、システムのフォントをブラウザが解決します。TTFのパスを探して、サイズを指定してオブジェクトを作って……という工程がありません。

**3. 日本語の折り返しをブラウザに任せられる。** これが決定的でした。後述する事故はまさにここで起きています。

テンプレートの実物です。

```python
TEMPLATE = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html, body {{ width:1200px; height:630px; }}
  body {{
    background:#12100e;
    color:#fff;
    font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",system-ui,sans-serif;
    padding:76px 80px;
    display:flex; flex-direction:column; justify-content:space-between;
    position:relative; overflow:hidden;
  }}
  .glow {{
    position:absolute; top:-320px; right:-260px;
    width:760px; height:760px; border-radius:50%;
    background:radial-gradient(circle,rgba(42,120,214,0.30) 0%,rgba(42,120,214,0) 70%);
  }}
  .brand {{
    font-size:27px; font-weight:700; letter-spacing:.09em;
    color:#8fbdf0; position:relative;
  }}
  .brand::after {{
    content:""; display:block; width:52px; height:3px;
    background:#2a78d6; border-radius:2px; margin-top:16px;
  }}
  h1 {{
    font-size:{size}px; line-height:1.32; font-weight:700;
    letter-spacing:.005em; position:relative;
  }}
  .sub {{
    font-size:26px; line-height:1.68; color:#b9b7ae;
    margin-top:24px; max-width:930px; position:relative;
  }}
  .foot {{
    display:flex; justify-content:space-between; align-items:center;
    position:relative;
  }}
  .tag {{
    font-size:23px; color:#dcdad2; border:1px solid rgba(255,255,255,.26);
    border-radius:999px; padding:9px 26px;
  }}
  .url {{ font-size:23px; color:#7d7b74; letter-spacing:.02em; }}
</style></head>
<body>
  <div class="glow"></div>
  <div class="brand">じぶん解像度</div>
  <div>
    <h1>{title}</h1>
    <p class="sub">{sub}</p>
  </div>
  <div class="foot">
    <span class="tag">{tag}</span>
    <span class="url">jibun-kaizoudo.pages.dev</span>
  </div>
</body></html>
"""
```

Python の `str.format` に渡すので、CSSの `{` は `{{` にエスケープしてあります。ここは書き味が落ちる唯一の場所です。差し込んでいるのは `title` / `sub` / `tag` と、見出しの `size` だけ。

その `size` の決め方がこれです。

```python
def title_size(title: str) -> int:
    """行数と文字数から見出しのサイズを決める。サムネイルで潰れないよう大きめに。"""
    longest = max(len(line) for line in title.split("<br>"))
    if longest <= 10:
        return 78
    if longest <= 16:
        return 66
    return 56
```

**折り返し位置ではなく、文字サイズだけを決めています。** 「何文字で改行するか」はブラウザが決めるので、こちらが計算する必要がありません。逆に、改行位置を意図的に指定したい見出しだけ、データ側に `<br>` を持たせています（`CARDS` の第2要素）。`title_size()` が `title.split("<br>")` の最長行を見ているのはそのためです。

---

## 3. ヘッドレスChromeの呼び出し

実際のコマンドです。

```python
    # このChromeは --screenshot を書き出したあとプロセスが終了しない（--headless=new も同様）。
    # そのため終了を待たず、ファイルのサイズが安定したところで打ち切る。
    proc = subprocess.Popen(
        [
            CHROME,
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--virtual-time-budget=2000",
            f"--screenshot={dest}",
            "--window-size=1200,630",
            f"--user-data-dir={tmp / 'chrome-profile'}",
            src.as_uri(),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
```

フラグの役割を、効いているものだけ。

| フラグ | 役割 |
|---|---|
| `--headless` | 画面を出さずに起動する |
| `--screenshot=<path>` | 描画結果をPNGとして書き出す |
| `--window-size=1200,630` | **これがそのまま出力の画素数になる** |
| `--force-device-scale-factor=1` | 付けないと、環境によっては2倍の解像度で出る |
| `--virtual-time-budget=2000` | 仮想時間を進めて描画の完了を待つ |
| `--user-data-dir=<tmp>` | 一時プロファイル。普段使いのChromeが起動中でも衝突しない |

`--window-size` と `--force-device-scale-factor=1` はセットで考えたほうがいいです。OGPは「1200×630 ちょうど」が求められる規格なので、勝手に2400×1260 が出ると仕様から外れます。

入力は `src.as_uri()`、つまり一時ディレクトリに書いた HTML の `file://` URLです。サーバは要りません。

### `--screenshot` を書き出したあと、プロセスが終了しない

ここが最大のハマりどころでした。

```text
| Chromeが `--screenshot` 後に終了しない | `--headless=new` でも同じ。プロセス終了を待たず**ファイルサイズの安定**で打ち切る実装にしてある |
```

PNGは正しく書き出されているのに、Chromeのプロセスが残り続けます。`subprocess.run()` や `proc.wait()` で待つ実装だと、ここで永久に止まります。**「画像は完成しているのにスクリプトが返ってこない」**という、原因が見えにくい形の停止です。

`make_og.py` の対処がこれです。

```python
    try:
        last = -1
        for _ in range(60):  # 最大30秒
            time.sleep(0.5)
            if dest.exists():
                size = dest.stat().st_size
                if size > 0 and size == last:
                    break
                last = size
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
```

**完了条件を「プロセスの終了」ではなく「出力ファイルのサイズが2回連続で同じ」に置き換えています。** 0.5秒ごとに最大60回、つまり30秒で打ち切り、`finally` で `terminate()`、それでも死ななければ `kill()`。

`dest.exists()` だけでは足りない点が要注意です。書き込み途中のPNGもファイルとしては存在するので、存在確認で抜けると**途中まで書かれた壊れた画像**を掴みます。`size > 0 and size == last` の2条件が要ります。

なお、起動前に `dest.unlink(missing_ok=True)` で既存ファイルを消しています。これを忘れると、**前回の生成物が残っているだけの状態を「サイズが安定した」と判定します。** 失敗しても前回の画像がそこにあるので、気づけません。

そのうえで、最後にもう一度確認します。

```python
    if not dest.exists() or dest.stat().st_size == 0:
        print(f"  失敗 {name}", file=sys.stderr)
        return False
    print(f"  生成 {name}.png  ({dest.stat().st_size // 1024} KB)")
    return True
```

:::message
サイズの安定で打ち切るのは、**ファイルの完成を直接確認しているわけではありません。** 書き込みが0.5秒以上止まってから再開するようなことがあれば、途中で切ります。1200×630のPNG（実測で133〜156KB）では今のところ起きていませんが、保証ではありません。DevTools Protocol 経由でChromeを駆動すれば完了イベントを取れるはずで、本来はそちらが正しい。依存を増やさない側に倒しているだけ、という自覚はあります。
:::

---

## 4. 実際に踏んだ失敗 — 文字が重なったまま公開されかけた

この方式に落ち着く前、ブラウザの canvas で画像を作らせていた時期に事故を起こしています。記録から引きます。

> canvas の `fillText` は自動改行しません。文字数が想定を超えると、次の行に描いた文字とそのまま重なります。エラーは出ません。

大きく出した「60%」という数字と、その下の本文が**完全に重なった**状態で、危うくそのまま公開するところでした。

`fillText(text, x, y)` は、指定した座標に一行で描き続けます。テキスト幅を `measureText` で測って自分で折り返さない限り、**要素の外にはみ出しても、下の行に描いた文字の上に重なっても、何も起きません。** 例外も警告も出ず、終了コードは0です。

HTML+CSSに寄せた理由の半分はこれです。ブロック要素の中のテキストは勝手に折り返し、`line-height` の分だけ下に伸び、`display:flex` の兄弟要素を押します。**重なりようがありません。**

ただし、方式を変えても消えない教訓のほうが重要でした。当時決めたルールがこれです。

```text
画像や図を生成したら、実際に表示して目で確認してから完了としてください。
生成できたことと、正しく見えることは別です。
```

**「生成できた」と「正しく見える」は別です。**

- 終了コードは0
- ファイルは存在する
- ファイルサイズも妥当
- ログにも `生成 home.png  (156 KB)` と出る

この4つが全部そろっていて、絵は壊れている、という状態が普通に起こります。上のチェックはどれも**「PNGとして成立しているか」しか見ていない**からです。文字が重なっているかどうかは、そこには一切現れません。

だから7枚生成したら、7枚とも開いて見ます。自動化した工程の最後に人間の目を1回置く、という話で、ここは今も自動化していません。

---

## 5. 大きなPNGの一部だけを見たいとき

前節の「目で見る」を実際にやろうとすると、次の問題にぶつかります。1200×630 を画面に収めて見ると縮小がかかるので、**文字の潰れや細部のズレが見えません。** 等倍のまま一部だけ切り出したい。

macOS には `sips` が最初から入っています。が、`sips -c <height> <width>` は中央基準のクロップで、この環境では `--cropOffset` を渡しても切り出し位置が動きませんでした。「左上の見出しだけ見たい」ができません。

そこで、**切り出しもHTMLでやります。** 引き継ぎ資料の記述を書き下すとこうなります。

```html
<div style="width:600px;height:315px;overflow:hidden;position:relative">
  <img src="file:///.../public/assets/og/home.png"
       style="position:absolute;top:-0px;left:-0px">
</div>
```

これを一時ファイルに書いて、`--window-size=600,315 --screenshot=crop.png` で撮る。`top` / `left` の負の値がそのままオフセットになります。

つまり **画像を作るのと同じ道具で、画像を切り出せます。** `overflow:hidden` の親のサイズが切り出しサイズ、`top:-Npx` が縦のオフセット、それだけです。

:::message
`sips` の `--cropOffset` については、**このmacOSのこのバージョンで効かなかった**という観測です。オプションの解釈を私が間違えている可能性も残ります。ただ、代替手段のほうが確実に動いたので、原因の特定はしていません。
:::

---

## まとめ

- **`import PIL` が2分固まる環境がある。** 「固まった」ではなく「まだ失敗していない」だけのことがある。タイムアウトのあるツールから呼ぶと、原因を示すエラーが1行も残らない
- **native 拡張が読めない環境では、ブラウザが画像生成器になる。** 追加インストールも権限付与も要らない
- **HTML+CSSで描くと、日本語の折り返しをブラウザに任せられる。** 文字サイズだけ決めればよく、改行位置の計算が消える
- **`--window-size` は出力の画素数そのもの。** `--force-device-scale-factor=1` とセットで指定する
- **ヘッドレスChromeは `--screenshot` 後に終了しないことがある。** プロセスの終了を待つ実装は止まる。ファイルサイズの安定で打ち切る
- **撮る前に出力ファイルを消す。** 消さないと、前回の生成物を「成功」と誤判定する
- **canvas の `fillText` は折り返さない。** はみ出しても重なってもエラーは出ない
- **「生成できた」と「正しく見える」は別。** 終了コード・ファイルサイズ・ログは、絵が壊れていることを教えてくれない
- **PNGの部分切り出しは、`overflow:hidden` + `position:absolute` のHTMLをもう一度撮るのが確実**

画像生成ライブラリが使えないのは制約でしたが、結果として**レイアウトをCSSで書いてブラウザに折り返させる**という、こちらのほうが素直な方式に移りました。制約が設計を良くすることは、たまにあります。

---

AIに開発を任せてこれを作った記録は note に書いています: https://note.com/zeroyen_dev

