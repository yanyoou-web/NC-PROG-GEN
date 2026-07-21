# ゴールデン（スナップショット）テスト

## これは何か

`generateGCode()`（`NC-PROG-GEN/assets/logic-v2.js`）が、特定の入力に対して生成する Gコード全文（またはバリデーションエラー時のメッセージ）を「正解ファイル」として `scripts/golden/__snapshots__/` 配下に保存し、以後のあらゆる変更（バグ修正・機能追加・AIによる自動修正含む）に対して意図しない出力変化を検知する。

`scripts/check-template-placeholders.mjs`（テンプレートの `{{key}}` が定義されているかの静的チェック）や `scripts/test-calc-functions.mjs`（個別の計算関数の単体テスト）とは役割が異なり、こちらは**実際に生成される Gコード全文そのもの**を対象にする。

## しくみ

- `scripts/golden/lib/load-app-context.mjs` が、`gui-v2.html` と同じスクリプト読み込み順で `assets/*.js` とテンプレート群を Node の `vm` に読み込み、本物の `generateGCode` をそのまま呼び出せるようにしている（ロジックの再実装ではない）。
- `scripts/golden/lib/run-case.mjs` が、ケース1件（`{ machine, wizardState }`）を実行するラッパー。`wizardState` はウィザードの初期値からの**上書き分のみ**を書けばよく、本物の `buildInputFromState()` に通して実際の `input` を組み立てる。
- `scripts/test-golden.mjs` が `scripts/golden/cases/**/*.json` を走査し、1ケース1テストとして実行する（`npm run test:golden`、`npm run check` にも含まれる）。

## ケースの追加方法

1. `scripts/golden/cases/` 配下の適切なサブフォルダ（`workType/` `style/` `regression/` `error/` など）に `.json` を追加する。

   ```json
   {
     "description": "何を守るためのケースか（回帰ケースなら対応するコミットハッシュも書く）",
     "machine": "NCL044",
     "wizardState": {
       "workType": "M18",
       "internalStyle": "Normal",
       "ateLength": "20",
       "maxOD": "30.1",
       "idDepth": "15",
       "drawNumA": "12345",
       "workerName": "YAMADA"
     }
   }
   ```

   `wizardState` に書ける項目は `NC-PROG-GEN/assets/gui-v2.js` の `wizardState` 初期値・`buildInputFromState()` を参照。書かなかった項目は初期値がそのまま使われる。

2. スナップショットを生成する:

   ```
   npm run test:golden:update
   ```

3. `scripts/golden/__snapshots__/` 配下に生成された `.txt` を**必ず目視レビュー**する（想定通りの Gコードになっているか）。バリデーションエラーを期待するケースは `ERROR:` で始まるテキストになる。

4. `npm run test:golden` が通ることを確認してからコミットする。

## 標準テスト条件とブリッジルール

新しいワーク種別のケースを書くときは、外径最大径まわりを以下の**標準条件**に揃える（テンプレート間でスナップショットを見比べやすくするため）:

- **通常**: `calcMode: "normal"`、母材幅 `valStockA` = `valStockB` = `33.5` → `maxOD: "47.376"`（=√(A²+B²)）
- **角あり**: `calcMode: "corner"`、`valCornW: "33.5"` / `valCornH: "11"` → `maxOD: "64.83"`（=√(((W/2+H)×2)²+W²)）

**ブリッジルール**: 外径最大径のように実UIが自動計算して入力欄に流し込む値は、ケースに適当な数値を手書きしない。UIと同じ計算式（`gui-v2.js` の `computeMaxOdResult()`）で算出した値を書くこと。捏造すると実UIでは起こり得ない入力の組み合わせになり、偽の異常出力を「バグ」として検証してしまう（例: 角ありで maxOD を捏造すると `{{最大径+角}}` のXが `{{最大径+3}}` のXより小さい、実機では出ない工具経路が生成される）。

## 既存の出力を変えるとき

ロジック側の意図した変更（バグ修正・仕様変更）でスナップショットに差分が出るのは正常。`npm run test:golden:update` で更新し、**git diff に出る `__snapshots__/*.txt` の差分そのものをレビューの主対象にする**。差分が意図と違えば、それはコードの方にバグが混入したサイン。

## ケースの位置づけ・拡充方針

現在 `scripts/golden/cases/` 配下に計77ケース（`workType/` 44・`style/` 20・`regression/` 5・`error/` 8）。フォルダの役割:

- `workType/` — ワーク種別ごとの基本ケース（各種の生成が通ることを担保）
- `style/` — 加工スタイル（平底 / 通常 / ヨセ / ヨセ中継 / 交差穴小 / 一文字 など）の網羅
- `regression/` — 過去バグの再発防止（`description` に対応するコミットハッシュを記載）。旧 `scripts/verify-tube-x6u2.mjs`（手計算による再実装ベースの検証）のチューブ平底ケースも本物の `generateGCode` を通す形で取り込み済み
- `error/` — バリデーションエラーを期待するケース（`ERROR:` で始まるスナップショット）

全45ワーク種別・全スタイルの完全網羅は継続タスク。**新しいバグを修正したら、再発防止のため `regression/` にケースを1つ追加するのを運用ルールにする**。
