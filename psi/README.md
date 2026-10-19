# PSI（仮題）

2015年に東南アジアで起きた越境煙害（ヘイズ）と、2026年のいまを、実在の統計と研究にもとづいてたどる、短い体験ゲームです。プレイ時間は30〜40分。

- 第1幕：煙を受ける側（S国の親）— 予算と決まりを決めて、先の見えない実際のPSIの日々を乗り切る
- 第2幕：煙の向こう側（I国 K島の州都 P市の家族）— 1日の限られた時間を、仕事・世話・家の手入れに割りふる
- 第3幕：火をつける側（I国の小さな農家）と、そのまわりの構造 — 畑を選び、乾いていく季節の中で開墾の方法と時期を決める
- 第4幕：遠くの買い手（日本の消費者）— 限られた回数で手がかりを集め、商品と火事のつながりについて結論を出す
- エンディング（2015年の煙のあとで）
- 第5幕：2026年、遠いはずの煙が近づいてくる（M国 P州に住む人）
- エピローグ（2026年のいま）／データと出典

遊びのしくみと決まりの一覧は [GAMEPLAY.md](GAMEPLAY.md) にあります。

ゲーム本文では国を I国・S国・M国 と書き、実在の名前は「データと出典」の画面にだけ、元の資料のまま表示します。物語の部分は「ゲーム上の設定」と表示し、数字や出来事には出典 id（D-xx）がついています。

## 遊び方（ローカル）

ES Modules と `fetch` を使っているので、ファイルを直接開かず、HTTPサーバー経由で開いてください。

```sh
cd psi
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

外部のCDNやフォントは使っていないので、オフラインでも動きます。

### 日本語と英語

タイトル画面と「データと出典」画面の右上のボタンで、日本語と英語を切りかえられます。選んだ言葉はブラウザの `localStorage` に保存されます。最初に開いたときは、ブラウザの言語設定が英語なら英語、それ以外は日本語で表示します。URL の末尾に `?lang=en`（または `?lang=ja`）をつけると、その言葉で開きます（英語で見てほしい人に送るとき用）。

英語版でも、国や地域の伏せ方（Country I／Country S／Country M、P City、P State、K Island など）、数字、出典 id、場面の流れは日本語版と同じです。進み具合はブラウザの `localStorage` に保存されます（保存できない環境でも遊べます）。広告・アクセス解析・Cookie はありません。

## 公開手順（GitHub Pages）

1. このフォルダを含むリポジトリを GitHub に push する。
2. リポジトリの **Settings → Pages** を開く。
3. **Build and deployment** の Source で **Deploy from a branch** を選び、ブランチ **main**、フォルダ **/ (root)** を選んで保存する。
4. 数分後に公開されます。
   - このリポジトリ（Yoshi-is-a-dinosaur）のままなら、URL は `https://<ユーザー名>.github.io/<リポジトリ名>/psi/` です。
   - `psi/` の中身を別のリポジトリの直下に置いた場合は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。

参照はすべて相対パスなので、どちらのサブパスでも動きます。`.nojekyll` は、`psi/` の中身をリポジトリ直下に置いたときに効きます。

## ファイル構成

```
psi/
├─ index.html
├─ .nojekyll
├─ README.md
├─ TODO.md              … 不明点・未確認事項・依頼書との食い違い
├─ GAMEPLAY.md          … 各幕の遊びのしくみと決まり（数値はゲーム上の設定）
├─ IMAGE_CREDITS.md     … 写真とイラストのクレジット
├─ PLAN_PENANG_2026.md  … 第5幕の計画書
├─ css/style.css
├─ js/
│   ├─ main.js          … 画面の流れと進み具合の保存
│   ├─ scenes.js        … 場面の描き方（選択肢の日、ひと息、2つのメーター、棒、視点を引く図）
│   ├─ play.js          … 遊びの部品（状態の欄、決まりの箱、スイッチ、行動カード、日の帯、決定の表）
│   ├─ meter.js         … 汚染メーター
│   ├─ sources.js       … 出典シートと「データと出典」画面
│   ├─ ui.js / i18n.js  … 共通の道具と文言（言葉の切りかえ）
│   ├─ images.js        … 場面の中の写真とイラスト
│   └─ acts/act1.js 〜 act5.js, ending.js, epilogue.js
├─ assets/img/          … 写真（Wikimedia Commons、幅960px）とイラスト（SVG）
├─ data/
│   ├─ sources.json      … 出典の一覧（id、ゲームで見せる文、元の資料のタイトル・発行元・URL、確認したこと）
│   ├─ s_psi_2015.json   … D-01 から作った2015年8〜11月の日別PSI
│   ├─ now.json          … エピローグ用の数字（asOf つき）
│   ├─ assumptions.json  … ゲーム上の設定（各幕の遊びの数値も）
│   └─ images.json       … 画像の一覧（ファイル、作者、ライセンス）
├─ i18n/ja.json          … 画面の文言すべて（日本語）
├─ i18n/en.json          … 同じ構成の英語版
├─ scripts/build_psi.js  … D-01 から s_psi_2015.json を作るスクリプト
└─ scripts/check_i18n.js … ja.json と en.json の食い違いを調べるスクリプト
```

## データの更新方法

### S国の24時間PSI（D-01）

```sh
cd psi
node scripts/build_psi.js
```

data.gov.sg の API から履歴データを読み、2015年8〜11月について「その日、5地域・24時間分の中の最大値」を `data/s_psi_2015.json` に書き出します（Node.js 18 以上）。期間を変えるときはスクリプトの `FROM` / `TO` を書きかえてください。

### エピローグの数字（now.json）

1. `data/now.json` の各項目の `vars`（数字）と `date`（その数字の時点）を書きかえる。
2. ファイル全体の `asOf`（まとめた日）を書きかえる。画面に「〇年〇月〇日時点でまとめた数字です」と出ます。
3. `data/sources.json` の同じ id の `label`・`url`・`title`・`accessed`・`check` を直す。
4. 文の言い回しを変えるときは `i18n/ja.json` と `i18n/en.json` の `epilogue.items` を直す。
5. 日本語と英語で書き方が変わる値（例：「約89.6万ha」と "about 896,000 ha"）は、`vars` に `{ "ja": …, "en": … }` と書く。

### そのほかの数字

ゲームの文は `i18n/ja.json` にあり、`{{表示する文字|D-xx}}` と書いた部分が、タップで出典が開く数字になります。数字を変えるときは、必ず元の資料を開いて確かめ、`sources.json` の `check` に確認した内容を書いてください。

### 英語の文を直すとき

- 画面の文言を変えたら、`i18n/en.json` の同じ場所も直す。キーの構成、`{name}`、`{{…|D-xx}}` の出典 id は日本語版とそろえる。
- 出典の説明（`label`・`note`・`check`）を変えたら、`data/sources.json` の同じ項目の `en` も直す。
- 直したあと、次のスクリプトで食い違いがないか確かめる。

```sh
cd psi
node scripts/check_i18n.js
```

## データのライセンス

- **D-01**（S国 24時間PSI の履歴データ）
  Contains information from Historical 24-hr PSI accessed on 2026-10-18 from data.gov.sg which is made available under the terms of the Singapore Open Data Licence version 1.0 https://data.gov.sg/open-data-licence
- **D-02**（M国の大気汚染物質の月平均濃度、OpenDOSM）は CC BY 4.0 です。このゲームでは数値を使っていません。
- そのほかの資料は、数字を引用し、リンクで元の資料を示しています。資料そのものは再配布していません。
- 写真は Wikimedia Commons のもので、ライセンスは写真ごとに違います（CC BY-SA 4.0、CC BY-SA 2.0、パブリックドメイン）。一覧は `IMAGE_CREDITS.md`。

コード自体のライセンスはまだ決めていません（TODO.md）。

## 表現のルール（依頼書から）

- 数字にはすべて出典 id をつけ、推計は推計と書き、幅があれば幅も出す。
- 死や乳幼児の病気は場面を描かず、数字と短い文だけで伝える。効果音や劇的な演出はつけない。
- 煙は、画面の彩度とコントラストを少しずつ落とすことで表す（`prefers-reduced-motion` のときは煙の動きを止める）。
- どの国の人々も悪者として描かない。責任は構造（土地の値段、開墾のコスト、泥炭地の排水、企業と資本、需要、気候）として見せる。
