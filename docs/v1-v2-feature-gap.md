# v1 → v2 機能ギャップ一覧（2026-07-19 時点）

> **目的:** 従来版 `index.html`（v1）にあり、v2ウィザード（`gui-v2.html`）に無い機能を洗い出した記録。
> v1削除の判断材料として作成。**このドキュメント自体は削除実行の指示ではない。**
>
> 調査範囲: `assets/v1/{app.js,logic.js,blocks.js,data.js,i18n.js,operator-hints.js,preview.js,debug.js,style.css}`
> と `assets/{gui-v2.js,logic-v2.js,blocks-v2.js,data-v2.js,i18n-v2.js,preview-v2.js,validators-v2.js,gui-v2.css}` の全量比較。
>
> 生成ロジック本体（`logic.js` vs `logic-v2.js`）に**機能的な抜け漏れは無い**ことを確認済み（v2はvalidationルールを含め v1 の厳密なスーパーセット）。以下は主に UI/開発者ツール層のギャップ。

---

## A. v2に完全に欠けている機能

### 1. デバッグモード + デバッグパネル
- v1: 「?」ボタン（開発用メニュー、`index.html:14-50`）から「🛠 デバッグモード（バリデーション無視）」トグルと「🔍 デバッグパネル」を開ける。
- デバッグパネルは6ペイン構成（入力値・置換マップ・テンプレート網羅率・算出値・計算フローチャート・登録機械一覧）: `assets/v1/debug.js` 全519行。
- `assets/validators-v2.js:36` は `isDebugModeOn(){ return false; }` と**ハードスタブ**されており、バイパス機構自体が意図的に無効化されている。
- 経緯: `gui-v2.js` に一度「🔍 デバッグ」ボタンが実装され（commit `5f2b8d2`）、その18分後のコミットで明示的に削除された（commit `2e209e8`、理由の説明なし）。意図的な除去だったのか、単に後回しにしただけなのかは記録に残っていない。

### 2. 機械定義JSONのエクスポート/インポート
- v1専用: `exportMachinesJSON()` / `_importMachinesJSON()`（`assets/v1/debug.js:164-283`）。開発者が `machines`/`tubeData` 定義を丸ごとJSONで書き出し・編集し、セッション内に一時反映できる。
- v2の `exportStateJson`/`importStateJson`（`assets/gui-v2.js` 内）は**入力値（wizardState）のみ**が対象で、機械定義そのものは対象外。別機能。

### 3. オペレーター向けフォーカスヒント吹き出し
- v1: 入力欄にフォーカスすると `:focus-within` でCSS吹き出しが表示される（`assets/v1/style.css:415-437`）。文言は `assets/v1/operator-hints.js`（非エンジニアが編集しやすい独立ファイル）。
- `gui-v2.html` は `operator-hints.js` を読み込んでおらず、`gui-v2.js` にも吹き出しラッパー要素が存在しない。
- 補足: `i18n.js`/`i18n-v2.js` は内容が同一なため、デフォルト文言データ自体は `i18n-v2.js` 内に残っているが、参照するコードが無いため実質死んでいる。

### 4. スタイル説明の補足ノート
- 「通常バイト加工」と「ヨセ中継」の横にある ※ 展開ノート（`styleNormalNoteBtn`=`index.html:767`、`yoseRelayNoteBtn`=`index.html:794`、開閉処理は `assets/v1/app.js:181-220`）。
- v2の `buildStyleScreen`（`gui-v2.js:375-386`）はスタイルカードのみでノート機能なし。

### 5. 値カテゴリ色分け表示 + 表示フィルタ（計算値／入力値／機械定数）
- v1: 生成結果の各値を `wrapHCalc`/`wrapHInput`/`wrapHMachine`（`assets/v1/app.js:75-89`）で色分けし（黄=計算値・水色=入力値・マゼンタ=機械定数、`style.css:1136-1157`）、3つのチェックボックス（`index.html:1161-1164`）でカテゴリごとに表示ON/OFFできる。
- v2: 同名の `wrapH*`（`assets/validators-v2.js:25-28`）は単なる `escapeHtml` の素通しになっており、**span でのラップ自体が失われている**（`logic-v2.js` は同じ回数だけ`wrapH*`を呼んでいるのに、分類情報が画面に一切出力されない）。`gui-v2.css` に `h-val` 系CSSも無い。
- 生成結果のどの値が「入力値そのまま」でどれが「自動計算値」かを目視で監査できる、安全性に関わる機能が実質的に消えている点は要注意。

### 6. 前回生成との差分ビュー
- v1: `toggleDiffView()` / LCSベースの行差分計算 `_computeLineDiff()`（`assets/v1/app.js:2664-2761`、ボタン `index.html:1130-1138`）。
- v2に同等機能なし。

### 7. 結果エリアの手動編集ロック解除
- v1: `toggleResultLock()`（`assets/v1/app.js:2962-2987`、ボタン `index.html:1170-1179`）で生成後のGコードを一時的に手編集できる。
- v2の `#resultArea` は常に編集不可の `<pre>` 表示のみ。

### 8. オンスクリーンテンキー
- v1: `_setupNumpad()`（`assets/v1/app.js:2852-2959`）。タッチ操作・現場端末向けの数値入力補助。v2に同等機能なし。

### 9. 入力欄の「×」クリアボタン
- v1: `_setupClearButtons()`（`assets/v1/app.js:2822-2849`）。v2に同等機能なし。

### 10. ワーク種別クイックリファレンス説明文
- v1: `WORK_TYPE_DESCRIPTIONS` マップ + `updateWorkTypeDesc()`（`assets/v1/app.js:2411-2461`、表示先 `index.html:244`）。ワーク種別選択直後に「M12 — 内径 Φ4.0 / HGDR φ4.05 / 仕上げ: HSS・HGDR・バイト選択」のような一行要約を表示。
- 全文は `docs/v1-legacy-reference.md` に保存済み。v2の `buildWorkTypeScreen`（`gui-v2.js:352-358`）は選択カードのみで説明文なし。

---

## B. 判断が必要な曖昧項目（バグではなく仕様差の可能性）

### 1. 全角→半角の自動変換 vs 消去のみ
- v1の `toHankaku()`（`assets/v1/app.js:226-288`）は全角文字を**半角に変換**する（例:「１２３」→「123」）。
- v2の消去ガード（`assets/validators-v2.js:154-212`、配線 `gui-v2.js:1349-1371`）は許可文字以外を**削除するのみ**（全角数字は変換されず消える）。
- 意図的な簡略化か、UX後退かは要判断。

### 2. リアルタイムバリデーションのタイミング
- v1は `_validateFieldOnBlur`（`assets/v1/app.js:2465-2558`）でフィールドからフォーカスが外れた瞬間に赤枠エラーを表示。
- v2の `validatePositive`（`gui-v2.js:1313-1336`）は「正の数値/数式か」のみをその場でチェックし、業種固有ルール（idDepth>7、CrossSmall相手径±0.5mmルール、yoseD範囲など）は**result画面で`generateGCode()`が走るまで**検出されない（ルール自体は`logic-v2.js`に一言一句同じ形で存在し、確実に弾かれる。出力が壊れることはない）。
- 安全性の問題ではないが、ウィザード数画面分、気づくタイミングが遅い。安全性重視のアプリという性質上、早期警告を復活させるかは検討の余地あり。

---

## C. すでにv2で同等以上に実装済み（再確認不要）

- ツールパスプレビュー（commit `bbd59ca` で移植済み）
- 生成履歴（v1は最大10件・メモリのみ／v2は最大100件・`localStorage`永続化のスーパーセット）
- 入力値JSONのエクスポート/インポート（フォーマットは違うが同等機能）
- 外径最大値(maxOD)自動計算ドロワー（通常/偏心/角あり/アテ長さから、の4モード全て。SVG図解付きでv2の方が改善）
- 作成者クイックボタン、アテ長さプリセット、M99P100/X50.U8選択、MH系工具選択、G12Bノーズ R、交差穴・ヨセ・ヨセ中継の各サブパネル
- 全角文字消去ガード・フォーカスアウト時自動計算（直近のバリデーション改修コミット群で対応済み）
- `blocks.js`/`data.js`/`i18n.js` は v1/v2 でほぼ内容が同一（`data.js`はv2側がNCL015もみつけブロックを1件多く持つのみ）

---

## 次のアクション（ユーザー判断待ち）

このリストのうち、v2に**再実装すべきもの**・**意図的に廃止でよいもの**をユーザー側で仕分けてください。v1本体の削除（タスク3）は、この仕分けが済んでから実行します。
