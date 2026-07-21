# NC-PROG-GEN — NCプログラムジェネレーター

フォームに加工条件（機械・ワーク種別・内径スタイル・寸法など）を入力すると、**NC旋盤向けのGコード（工作機械への命令文）を自動生成する** Web アプリです。画面は一問一答形式のウィザードで、対応機械は NCL044 / NCL015 / NCL085 / NCL012。

> **⚠️ 安全上の前提**
> 生成された Gコードは NC旋盤に直接送り込んで使用します。出力が一文字違うだけで機械・工具・製品の損傷や事故につながるため、Gコード出力に関わるファイル（`logic-v2.js` / `blocks-v2.js` / `テンプレート/`）の変更はすべて慎重に扱い、ゴールデンテスト（後述）で意図しない出力変化がないことを必ず確認します。

## 使い方（現場運用）

1. main ブランチを最新化する（現場PCではダブルクリック用の `pull.bat` で `git pull` する運用）。
2. `NC-PROG-GEN/gui-v2.html` をブラウザで開く。ビルド・サーバーは不要。
3. ウィザードに従って入力し、生成された Gコードをコピー・保存して機械へ転送する。

PWA 対応（`manifest.webmanifest`）のため、HTTP 経由で開けば端末へのインストールも可能。UI は日本語・英語・ベトナム語に対応（言語設定のみ sessionStorage に保持）。

## リポジトリ構成

```
NC-PROG-GEN/                  # リポジトリルート
├── NC-PROG-GEN/              # アプリ本体（入れ子ディレクトリ）
│   ├── gui-v2.html           # エントリポイント（唯一の画面）
│   ├── manifest.webmanifest  # PWA マニフェスト
│   ├── assets/               # JS / CSS / アイコン
│   └── テンプレート/          # ワーク種別ごとの Gコードひな形（data_template_*.js）
├── docs/                     # 仕様・手順ドキュメント
├── scripts/                  # Node 製テスト・チェックスクリプト（.mjs）
│   └── golden/               # ゴールデンテスト（cases/ + __snapshots__/）
├── CLAUDE.md                 # Claude Code 向けの運用ルール・コードベース概要
└── package.json              # npm scripts（lint / test / check）
```

### assets/ の各ファイル

| ファイル | 役割 |
|---|---|
| `data-v2.js` | 機械定義（NCL044/NCL015/NCL085/NCL012 の Mコード・工具オフセット）とチューブ規格データ |
| `i18n-v2.js` | UI 文言（ja / en / vi） |
| `blocks-v2.js` | Gコードブロック（部分文字列）の組み立て関数群 |
| `validators-v2.js` | 共通ユーティリティ（数値整形・全角→半角変換・四則演算パーサー等） |
| `gui-v2.js` | ウィザード画面の描画・遷移・状態管理（`wizardState`） |
| `logic-v2.js` | Gコード生成ロジック本体（`generateGCode`）とドメインバリデーション |
| `preview-v2.js` | 生成 Gコードのツールパスを canvas に描画 |
| `gui-v2.css` | スタイル |

## アーキテクチャ

- ビルド工程なし。ES モジュール不使用のグローバルスクリプト方式で、`gui-v2.html` の `<script>` 読み込み順を**厳守**する:

  ```
  data-v2.js → i18n-v2.js → テンプレート群 → blocks-v2.js → validators-v2.js → gui-v2.js → logic-v2.js → preview-v2.js
  ```

- 生成フロー: ウィザード入力（`wizardState`）→ `buildInputFromState()`（gui-v2.js）→ `generateGCode(input, machineName)`（logic-v2.js）→ テンプレートの `{{...}}` プレースホルダーを実数値・ブロック文字列へ置換 → `{ displayHtml, plainText }` を返す（`plainText` がコピー・保存用の Gコード）。
- テンプレートは **1 ワーク種別 = 1 ファイル**（`テンプレート/data_template_*.js`）。既存テンプレートの Gコード本文は原則変更しない。各ファイルは末尾で `registerWorkType(...)` を呼び、ワーク固有情報（UI表示・加工径・許可スタイル・属性・behavior）を `data-v2.js` のレジストリへ登録する。`gui-v2.js` / `logic-v2.js` / `blocks-v2.js` はこの登録情報を参照するため、workType ごとの分岐を持たない。

## 開発環境

```bash
npm install                        # eslint / prettier / playwright
```

- VS Code の `launch.json` に Chrome を `http://localhost:8080` で起動する構成あり（任意の静的サーバーでも可）。
- 保存時フォーマット・ESLint 自動修正は `.vscode/settings.json` で設定済み。推奨拡張は `.vscode/extensions.json` を参照。

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run check` | **総合ゲート**: lint → format:check → test → check:templates → check:files → check:worktypes → check:machine-tools → check:template-reg → check:template-scripts。マージ前に必ず通す |
| `npm test` | 単体・回帰・ゴールデンテスト一式（tube / calc / drill-depth / id-depth / golden） |
| `npm run test:golden` | ゴールデン（スナップショット）テスト |
| `npm run test:golden:update` | スナップショット更新（`UPDATE_GOLDEN=1`）。差分は必ず内容を確認してからコミットする |
| `npm run test:e2e` | Playwright によるブラウザ E2E（`check` 非包含。初回は `npx playwright install chromium`） |
| `npm run check:templates` | テンプレート内の `{{key}}` が logic-v2.js 側で定義済みか静的検証 |
| `npm run check:files` | `gui-v2.html` が参照するファイルの実在チェック |
| `npm run check:worktypes` | ワーク種別レジストリ整合性（径マップのリファクタ前一致・登録漏れ・behavior 妥当性） |
| `npm run check:machine-tools` | テンプレの使う `{{機械キー}}` が全機種の機械定義に存在するか（空 `""` は設備差で正常） |
| `npm run check:template-reg` | テンプレJSの読込漏れ・孤立テンプレ（未参照の `const template_XXX`）検出 |
| `npm run check:template-scripts` | `gui-v2.html` のテンプレ `<script>` が実ファイルと同期済みか（`--check`） |
| `npm run gen:template-scripts` | `gui-v2.html` のテンプレ `<script>` を `テンプレート/*.js` から自動同期 |
| `npm run lint` / `lint:fix` | ESLint（アプリ JS と scripts/*.mjs） |
| `npm run format` / `format:check` | Prettier（設定ファイル・docs/*.md・.vscode/*.json が対象） |

※ `test:golden:update` は `UPDATE_GOLDEN=1 node ...` 形式のため、Windows では Git Bash 等の POSIX シェルから実行する。

## ゴールデンテスト（安全網）

`generateGCode()` の生成 Gコード全文を `scripts/golden/__snapshots__/**/*.txt` に保存し、意図しない出力変化を機械的に検知します。`logic-v2.js` / `blocks-v2.js` / テンプレートの変更で差分が出た場合、それは「機械への出力が変わった」ことを意味するため、差分が意図した変更かを必ず確認してください。仕組みとケース追加手順は [docs/golden-tests.md](docs/golden-tests.md) を参照。

## テンプレート追加

ワーク固有情報（UI表示・加工径・許可スタイル・属性など）は各テンプレJSの `registerWorkType(...)` に集約されており（ワーク種別レジストリ）、`gui-v2.js` / `logic-v2.js` は登録情報を参照する。**標準ワーク種別の追加はテンプレJSに `registerWorkType` を書き、`npm run gen:template-scripts` で `gui-v2.html` の `<script>` を同期するだけ**で UI 表示・生成まで通る（新工具が要れば `data-v2.js`、特殊処理が要れば behavior を追加）。標準手順（フェーズ0〜5のチェックリスト）は [docs/template-add-checklist.md](docs/template-add-checklist.md) を参照。

`テンプレート/` 内に `.nc` ファイルがある場合、それは検討中の**草稿**です。`<script>` 未登録で未参照に見えても正常な状態なので、削除・変更しないでください。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/spec.md](docs/spec.md) | 全体仕様メモ（主要入力・安全ルール・受け入れ確認） |
| [docs/golden-tests.md](docs/golden-tests.md) | ゴールデンテストの仕組みとケース追加手順 |
| [docs/template-add-checklist.md](docs/template-add-checklist.md) | テンプレート追加実装の標準手順 |
| [docs/drilling-rules.md](docs/drilling-rules.md) | ドリル加工の分岐ルール |
| [docs/debug-template.md](docs/debug-template.md) | 不具合報告テンプレート |
| [CLAUDE.md](CLAUDE.md) | Claude Code 向けの運用ルール・コードベース概要 |
| [.cursor/rules/nc-project-rules.mdc](.cursor/rules/nc-project-rules.mdc) | Cursor 向け開発ルール（ファイル変更可否表・実装パターンの原典） |
