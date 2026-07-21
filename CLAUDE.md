# NC-PROG-GEN — Claude Code 運用ルール

## プロジェクト概要

- フォーム入力から NC旋盤（NCL044/NCL015/NCL085/NCL012）向けの Gコードを自動生成する静的 Web アプリ。アプリ本体は入れ子の `NC-PROG-GEN/gui-v2.html`（一問一答ウィザード。ビルドなし・ES モジュール不使用のグローバルスクリプト方式）。
- **生成 Gコードは機械に直接送り込まれる。** 出力が一文字違うだけで機械・工具・製品の損傷につながるため、出力に関わるファイル（`logic-v2.js` / `blocks-v2.js` / `テンプレート/`）の変更は慎重に扱う。

## よく使うコマンド

- `npm run check` — 総合ゲート（lint → format:check → test → check:templates → check:files）。マージ前に必ず通す。
- `npm run test:golden` — ゴールデンテスト。`npm run test:golden:update` で更新（`UPDATE_GOLDEN=1` 形式のため POSIX シェルで実行）。
- `npm run test:e2e` — Playwright E2E（`check` 非包含。初回は `npx playwright install chromium`）。

## アーキテクチャの要点

- `gui-v2.html` の `<script>` 読み込み順は厳守: `data-v2.js → i18n-v2.js → テンプレート群 → blocks-v2.js → validators-v2.js → gui-v2.js → logic-v2.js → preview-v2.js`
- 生成フロー: `wizardState` → `buildInputFromState()`（gui-v2.js）→ `generateGCode(input, machineName)`（logic-v2.js）→ `{ displayHtml, plainText }`。呼び出し直前に `currentInternalStyle = wizardState.internalStyle;` で同期させる。
- ドメインバリデーションは logic-v2.js の4関数（`validateBasicSelections` / `validateDrawNumAndAuthor` / `validateCommonNumericFields` / `validateStyleSpecificRules`）に分離。新ルールは該当関数に追加し、ロジックを二重実装しない。
- テンプレートは 1 ワーク種別 = 1 ファイル（`NC-PROG-GEN/テンプレート/data_template_*.js`）。`{{...}}` プレースホルダーを logic-v2.js が置換する。

## ファイルごとの変更可否

| ファイル・フォルダ | 変更可否 |
|---|---|
| `テンプレート/` | 既存の変更禁止（新規追加のみ可）。`.nc` は草稿につき、未参照に見えても削除・変更禁止 |
| `assets/data-v2.js` | 機械追加時のみ変更可 |
| `assets/blocks-v2.js` | 数値調整のみ可（構造変更禁止） |
| `assets/logic-v2.js` | 機能追加・バグ修正のため変更可（慎重に） |
| `assets/i18n-v2.js` | 翻訳・ラベル追加時のみ変更可 |
| `gui-v2.html` | `<script>` の追加・並び替え中心。骨格の変更は影響大につき慎重に |
| `assets/gui-v2.js` / `gui-v2.css` / `validators-v2.js` / `preview-v2.js` | 自由に変更可 |

- 新規テンプレート追加で触るのは固定5ファイル（`gui-v2.html` / `logic-v2.js` / `gui-v2.js` / `data-v2.js` / `blocks-v2.js`）。手順は `docs/template-add-checklist.md` を参照。

## 参照ドキュメント

- `docs/spec.md` — 全体仕様メモ（主要入力・安全ルール）
- `docs/golden-tests.md` — ゴールデンテストの仕組みとケース追加手順
- `docs/template-add-checklist.md` — テンプレート追加実装の標準手順
- `docs/drilling-rules.md` — ドリル加工の分岐ルール
- `.cursor/rules/nc-project-rules.mdc` — Cursor 向け開発ルール（変更可否表・実装パターンの原典）

## git / PR運用

- Claude Code on the web（クラウドセッション）は、GitHub操作を専用プロキシ経由で行う仕様上、**セッションの作業ブランチ以外へのgit pushができない**（mainへの直接pushは不可、リポジトリ側の設定では解除できない）。そのため変更は必ずブランチ作成 → PR経由になる。
- このリポジトリはCIやbranch protectionを設定していない方針のため、PRを作成したらレビュー待ちでドラフトのまま放置せず、ローカルでの確認（`npm run check` 等、関係するスクリプトのみで十分）が済んだ時点で**Claude自身がそのPRをmainへマージする**。
- 上記はユーザー（リポジトリオーナー）が明示的に許可した運用。変更内容が大規模・機械への出力（Gコード/Mコード）に関わるなど影響が大きい場合は、マージ前にユーザーに確認する。
- `logic-v2.js` / `blocks-v2.js` / テンプレートを変更するPRで `npm run test:golden`（`scripts/golden/__snapshots__/**/*.txt`）に差分が出た場合、それ自体が上記の「機械への出力に関わる変更」に該当する。差分が意図した変更かを確認し、意図しない変化であれば原因を特定してから扱うこと。詳細は `docs/golden-tests.md` を参照。
