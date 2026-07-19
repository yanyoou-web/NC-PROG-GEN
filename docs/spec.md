# NC Program Generator 仕様メモ（最小）

## 目的

- 入力値と機械設定から NC テキストを安全に生成する。
- UI 文言は `assets/i18n.js` で管理する。

## 主要入力

- 機械: `NCL044` / `NCL085` / `NCL012`
- ワーク: `M12` / `M15` / `M18` / `M22` / `G78` / `M40` / `Tube` / `Tonbo`
- 内径スタイル: `Hirazoko` / `Ichimonji` / `Normal` / `Yose` / `CrossBig` / `CrossSmall`

## 重要ルール（安全）

- `参考フォルダ` は参照専用。編集しない。
- 機械ごとの G/M コード役割は共通化しない。機械定義を優先する。
- 不正入力時は生成を止め、明確なエラーを返す。

## 直近の注意点

- `Ichimonji` は CP を使って Z を決める。`idDepth` と `valPartnerD` から CP 自動計算。
- UI 表示条件、バリデーション文言、生成ロジックの3点を常に整合させる。

## 受け入れ確認（最小）

- `npm run test:tube` が成功する。
- 代表ケース（M12 / Tube / Cross）で生成結果が崩れない。
- エラー時にメッセージが入力項目と一致する。

## 関連ドキュメント

- `docs/drilling-rules.md` — ドリル加工の分岐ルール
- `docs/debug-template.md` — 不具合報告テンプレート
