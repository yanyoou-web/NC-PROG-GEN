# NC-PROG-GEN — Claude Code 運用ルール

## プロジェクト概要

- フォームに加工条件（機械・ワーク種別・寸法など）を入力すると、**NC旋盤向けのGコード（工作機械への命令文）を自動生成する** Web アプリ。生成された Gコードは NC旋盤（NCL044/NCL015/NCL085/NCL012 の4機種、`assets/data-v2.js` に定義）に直接送り込んで使用する。
- **入力値・出力が一文字でも間違っていると機械が誤動作する危険がある**ため、出力に関わるファイル（`logic-v2.js` / `blocks-v2.js` / `テンプレート/`）の変更はすべて慎重に扱う。
- 画面本体は `NC-PROG-GEN/gui-v2.html`（入れ子ディレクトリ内。一問一答形式のウィザード）。`-v2` は開発初期の呼称の名残で、現在はこれが唯一の画面。ビルドなし・ES モジュール不使用のグローバルスクリプト方式。将来画面を作り直す場合は接尾辞 `-v3` でファイルを複製し、変更可否表とファイル構成を更新する。

## よく使うコマンド

- `npm run check` — 総合ゲート（lint → format:check → test → check:templates → check:files → check:worktypes → check:machine-tools → check:template-reg → check:template-scripts）。マージ前に必ず通す。
- `npm run gen:template-scripts` — `gui-v2.html` のテンプレ `<script>` 群を `テンプレート/*.js` から自動同期する（`scripts/gen-template-scripts.mjs`）。**新規テンプレJS追加時は手で `<script>` を書かずこれを実行する。** `check:template-scripts`（`--check`）が `npm run check` で同期済みかを検証する。
- `npm run check:worktypes` — ワーク種別レジストリ整合性チェック（`scripts/check-work-types.mjs`）。自動生成した径マップがリファクタ前の値と一致するか、登録漏れ・UI/レジストリの不一致がないかを検証する。
- `npm run check:machine-tools` — 機械キー充足チェック（`scripts/check-machine-tools.mjs`）。テンプレが使う `{{機械キー}}` が全機種の機械定義に存在するかを検証する（未定義＝エラー。空 `""` は設備差による意図的設定として正常扱い）。
- `npm run check:template-reg` — テンプレート結線チェック（`scripts/check-template-registration.mjs`）。テンプレJSが `gui-v2.html` の `<script>` で読み込まれているか（読込漏れ）、各 `const template_XXX` が registerWorkType か behavior から参照されているか（孤立テンプレ）を検証する。
- `npm run test:golden` — ゴールデンテスト。`npm run test:golden:update` で更新（`UPDATE_GOLDEN=1` 形式のため POSIX シェルで実行）。
- `npm run test:e2e` — Playwright E2E（`check` 非包含。初回は `npx playwright install chromium`）。

## アーキテクチャの要点

- `gui-v2.html` の `<script>` 読み込み順は厳守:
  `data-v2.js → i18n-v2.js → テンプレート群 → blocks-v2.js → validators-v2.js → gui-v2.js → logic-v2.js → preview-v2.js`
  - `validators-v2.js` は gui/logic 両方が使う共通ユーティリティ（`$id`・数値整形・エスケープ・半角変換）を持つため、両者より前に置く。
  - `gui-v2.js` は `logic-v2.js` が参照する補助関数（`isMHWorkType` 等）を持つため、`logic-v2.js` より前に置く。
- 生成フロー: `wizardState` → `buildInputFromState()`（gui-v2.js）→ `generateGCode(input, machineName)`（logic-v2.js）→ `{ displayHtml, plainText }`（`plainText` がコピー・保存用の Gコード）。呼び出す直前に `currentInternalStyle = wizardState.internalStyle;` で同期させる（logic-v2.js が内部でこの値を参照するため）。
- **入力チェック**: 業種固有ルール（idDepth>7、CrossSmall 相手径±0.5mm ルールなど）は logic-v2.js の4関数（`validateBasicSelections` / `validateDrawNumAndAuthor` / `validateCommonNumericFields` / `validateStyleSpecificRules`）に分離され、`validateDomainRules()` として合成して `generateGCode()` の最終ゲートから呼ばれる。ウィザードの「加工深さ」画面の「次へ」（gui-v2.js の `next-depths` アクション）でも図番・作成者チェックを除く3関数を早期に呼ぶ。新ルールは該当関数に追加し、**ロジックを二重実装しない**。
- **isXxxWorkType ヘルパーパターン**: 複数の workType を1グループとして扱う判定関数（例: `isTomesenWorkType` = M16/M18/M22/M24/M35）。新規追加時は logic-v2.js 冒頭の既存 `isXxxWorkType` 群と並べて定義する（`FLAT_BOTTOM_TOOL_DIA_MM` などの定数より前）。加工スタイルの選択肢絞り込みは gui-v2.js の `getAvailableStyles(workType)`（純粋関数）で行い、デフォルト分岐で足りなければ専用分岐を追加する。

## ファイルごとの変更可否

> **安全の大原則:**
> - Gコード・Mコードへの変更は「機械への直接指示の変更」として扱う。機械ごとに G/M コードの役割が異なるため、他機種での動作を前提にしない（役割の共通化をしない）。
> - 下表のファイルを誤って書き換えると工作機械が誤動作し、機械・工具・製品の損傷や事故につながる可能性がある。

パス表記は `NC-PROG-GEN/` 配下からの相対パス。

| ファイル・フォルダ | 役割 | 変更可否 |
|---|---|---|
| `テンプレート/` 内 全ファイル | Gコードのひな形。`{{}}` に実際の数値が埋め込まれる | **原則変更しない**（新規追加が基本。既存の変更はユーザーの明示的な指示がある場合のみ、同種テンプレートとの整合確認と golden 差分レビューを必須として慎重に行う。`.nc` は草稿→後述） |
| `assets/data-v2.js` | 機械ごとのMコード・工具オフセット定義 | 機械追加時のみ変更可 |
| `assets/blocks-v2.js` | 加工ブロック文字列の組み立て | 数値調整のみ可（構造変更禁止） |
| `assets/logic-v2.js` | Gコード生成ロジック本体（`generateGCode`） | 機能追加・バグ修正のため変更可（慎重に） |
| `assets/i18n-v2.js` | UI文言（ja/en/vi） | 翻訳・ラベル追加時のみ変更可 |
| `gui-v2.html` | 画面の骨格・スクリプト読み込み順の定義 | 主に `<script>` タグの追加・並び替え。骨格（header/footer/設定ドロワー等）の変更は影響大につき慎重に |
| `assets/gui-v2.js` / `gui-v2.css` / `validators-v2.js` / `preview-v2.js` | 画面制御・スタイル・共通ユーティリティ・プレビュー | 自由に変更可 |

## テンプレート運用

- `テンプレート/` は**ワーク種別1つにつき1ファイル**（例: `data_template_M18.js` = M18用ひな形）。`{{変数名}}` は実行時にアプリが実際の数値へ置き換える。
- **`.nc` ファイル（削除禁止）**: ユーザーが内容を改変・検討している**草稿段階**のテンプレート。`<script>` タグに未登録で「どこからも参照されていない」ように見えるが、これは正常な状態。**未参照であることだけを理由に削除候補・未使用ファイルと判断してはならない**。ユーザーの明示的な指示がない限り内容も変更しない。
- 確定後のプロセス: `.nc`（草稿）→ ユーザーが内容を確定 → `.js` にリネーム → `registerWorkType` を追記 → `npm run gen:template-scripts` で `gui-v2.html` の `<script>` を同期 → 結線の残作業（特殊処理が要る場合の behavior 追加など）を実施。
- **新規テンプレート追加**: 触るファイルは固定5つ（`gui-v2.html` / `logic-v2.js` / `gui-v2.js` / `data-v2.js` / `blocks-v2.js`）。標準手順は `docs/template-add-checklist.md`。
  - ブリーフ（作業指示書: ワーク種別名・内径Φ・ドリルφ・バイトΦ・`getAvailableStyles` への専用分岐の要否）とテンプレート JS を一緒に受け取る。加工仕様3点（内径Φ・ドリルφ・バイトΦ）が明記されていれば再確認せず実装してよい（ブリーフがない場合のみ確認する）。
  - 内径Φ＝バイトΦ（同径）時の `{{平底_内径仕上出口}}` は `U-.2`、異径時は `X{toolDia}.F.03`（`computeFlatBottomExitLine` の仕様、`blocks-v2.js`）。

## ワーク種別レジストリ（段階移行フェーズ1〜8）

ワーク固有情報をテンプレートJSに集約するリファクタ。UI表示・加工径・平底出口・テンプレート選択・特殊処理（behavior）までレジストリ駆動になった。**新規ワーク種別はテンプレJSの `registerWorkType` を中心に追加できる。**

- **登録機構（`data-v2.js`）**: `workTypeRegistry`・`registerWorkType(definition)`・`getWorkTypeDefinition(workType)` を持つ。`data-v2.js` はテンプレート群より先に読み込まれるため、各テンプレートJSが読み込み時に自身を登録すると、`gui-v2.js`/`logic-v2.js` が使う時点でレジストリが埋まっている。
- **各テンプレートJSの末尾**に `registerWorkType({ id, ui:{label,group,order,styles}, machining:{idDiameterMm,drillDiameterMm,flatBottomToolDiameterMm,drillMaxDepthMm}, features:{mh,tube}, template })` を持つ（既存の `const template_XXX` はそのまま残す）。M12/M12_MH は既定バリアント（HSS）のファイルで1回だけ登録し、M42X3系の4種は同一ファイルにまとめて登録する。
- **レジストリ駆動になったもの**:
  - `logic-v2.js`: `WORK_ID_MAP` / `DRILL_DIA_MAP` / `FLAT_BOTTOM_TOOL_DIA_MM` は `createWorkTypeValueMap()` で `machining.*` から生成（値 `null` の種別は従来同様キーごと除外）。**標準ワーク種別のテンプレート選択**は `getWorkTypeDefinition(workType).template` へ集約（巨大な `if-else` チェーンを廃止）。
  - `gui-v2.js`: `getAvailableStyles`（`ui.styles`）・`isMHWorkType`/`isTubeWorkType`（`features.mh`/`tube`）・`getDrillMaxDepthMM`（`machining.drillMaxDepthMm`）・`WORK_TYPE_GROUPS`（`buildWorkTypeGroups()` が `ui.group`/`label`/`order` から再構成。グループ表示順のみ `WORK_TYPE_GROUP_ORDER` に持つ）。
  - `blocks-v2.js`: `computeFlatBottomExitLine()` はワーク固有のデフォルト出口行・許容差・加工径を `flatBottomExit`/`machining` から取得する（共通の判定アルゴリズムのみ関数側に残す）。
  - **特殊処理は名前付き behavior（`logic-v2.js` の `WORK_TYPE_BEHAVIORS`）**: 固定データだけで処理できないワーク種別は `registerWorkType(behavior)` に名前（`"tube"`/`"m40"`/`"g12b"`/`"m12"`）を持たせ、対応する `applyXxxBehavior()` へ振り分ける。未指定は `"standard"`（`registerWorkType(template)` をそのまま使う）。
  - → **新規の標準ワーク種別は、テンプレJSの `registerWorkType` と `gui-v2.html` の `<script>` 追加だけで UI 表示・生成まで通る**（`gui-v2.js`/`logic-v2.js` へ workType ごとの分岐を足す必要はない）。特殊処理が要る場合のみ新しい behavior 関数を追加する。
- 生成される Gコードはリファクタ前と完全一致する（全ゴールデンケース＋全45種×全スタイルで出力差分ゼロを確認済み）。`npm run check:worktypes` が全ワーク種別について径マップ一致・レジストリ整合・behavior 名の妥当性を、`npm run check:machine-tools` がテンプレの使う機械キーの全機種充足を、機械的に保証する。

## 参照ドキュメント

- `docs/spec.md` — 全体仕様メモ（主要入力・安全ルール）
- `docs/golden-tests.md` — ゴールデンテストの仕組みとケース追加手順
- `docs/template-add-checklist.md` — テンプレート追加実装の標準手順
- `docs/drilling-rules.md` — ドリル加工の分岐ルール
- `.cursor/rules/nc-project-rules.mdc` — Cursor 向け開発ルール（本ファイルと同内容を保つ。片方を変えたらもう片方も更新する）

## git / PR運用

- Claude Code on the web（クラウドセッション）は、GitHub操作を専用プロキシ経由で行う仕様上、**セッションの作業ブランチ以外へのgit pushができない**（mainへの直接pushは不可、リポジトリ側の設定では解除できない）。そのため変更は必ずブランチ作成 → PR経由になる。
- このリポジトリはCIやbranch protectionを設定していない方針のため、PRを作成したらレビュー待ちでドラフトのまま放置せず、ローカルでの確認（`npm run check` 等、関係するスクリプトのみで十分）が済んだ時点で**Claude自身がそのPRをmainへマージする**。
- 上記はユーザー（リポジトリオーナー）が明示的に許可した運用。変更内容が大規模・機械への出力（Gコード/Mコード）に関わるなど影響が大きい場合は、マージ前にユーザーに確認する。
- `logic-v2.js` / `blocks-v2.js` / テンプレートを変更するPRで `npm run test:golden`（`scripts/golden/__snapshots__/**/*.txt`）に差分が出た場合、それ自体が上記の「機械への出力に関わる変更」に該当する。差分が意図した変更かを確認し、意図しない変化であれば原因を特定してから扱うこと。詳細は `docs/golden-tests.md` を参照。
