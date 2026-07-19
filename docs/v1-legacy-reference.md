# v1 開発資産アーカイブ（今後の開発向け記録）

> v1（`assets/v1/*`, `index.html`）に蓄積されていた、今後の開発で再利用しうる仕様・コードパターンをまとめた記録。
> v1本体を削除する場合でも、ここに書いた内容は残す。
> ドリル分岐ルールは既に `docs/drilling-rules.md` に、不具合報告手順は `docs/debug-template.md` に、
> `isXxxWorkType` パターンは `.cursor/rules/nc-project-rules.mdc` にまとまっているため、本書では重複させない。

---

## 1. ワーク種別クイックリファレンス（v1 `WORK_TYPE_DESCRIPTIONS`）

`assets/v1/app.js:2411-2447` にあった一覧。新しいワーク種別を追加する際のフォーマット見本、および
既存ワーク種別の内径Φ・ドリルφ・バイトΦを一目で確認できる一次資料として保存。

| ワーク種別 | 説明 |
|---|---|
| M12 | 内径 Φ4.0 / HGDR φ4.05 / 仕上げ: HSS・HGDR・バイト選択 |
| M15 | 内径 Φ6.0 / ドリル φ3.3 |
| M18 | 内径 Φ8.0 / ドリル φ7.0 |
| M22 | 内径 Φ10.0 / ドリル φ7.0 |
| G78 | 内径 Φ16.0 / ドリル φ14.0 |
| M40 | 内径 Φ22.0 / ドリル φ14.0 |
| M12-MH | 内径 Φ4.0 / ドリル φ4.05 |
| M15-MH | 内径 Φ6.0 / ドリル φ3.3 |
| M18-MH | 内径 Φ8.0 / ドリル φ7.0 |
| M22-MH | 内径 Φ10.0 / ドリル φ7.0 |
| G78-MH | 内径 Φ16.0 / ドリル φ14.0 |
| M40-MH | 内径 Φ22.0 / ドリル φ14.0 |
| M42×3 Φ25.175 ストレート | 内径 Φ25.175 / 内径バイト Φ16 |
| M42×3 Φ25.175→Φ16 段付き | 内径 Φ16 / 内径バイト Φ16 |
| M42×3 Φ25.175→Φ20 段付き | 内径 Φ20 / 内径バイト Φ16 |
| M42×3 Φ25.175→Φ22 段付き | 内径 Φ22 / 内径バイト Φ16 |
| M8(φ2.1) | 内径 Φ2.1 / ドリル φ2.2 |
| M8(φ3.1) | 内径 Φ3.1 / ドリル φ3.2 |
| J-M8-ASWD-300 | ドリル φ3.0(ASWD) / スタイル固定: CrossSmall / 深さ自動計算 |
| G18(φ4.0) | 内径 Φ4.0 / HGDR φ4.05 |
| G18(φ4.2) | 内径 Φ4.2 / HGDR φ4.15 |
| G18(φ6.2) | 内径 Φ6.2 / HGDR φ4.15 / HGDR下穴 |
| G18(φ6.55) | 内径 Φ6.55 / HGDR φ4.15 / HGDR下穴 |
| G18(φ6.175) | 内径 Φ6.175 / HGDR φ4.15 / HGDR下穴 |
| G18(φ4.0)-MH | 内径 Φ4.0 / HGDR φ4.05 |
| G18(φ4.2)-MH | 内径 Φ4.2 / HGDR φ4.15 |
| G18(φ6.2)-MH | 内径 Φ6.2 / HGDR φ4.15 / HGDR下穴 |
| G18(φ6.55)-MH | 内径 Φ6.55 / HGDR φ4.15 / HGDR下穴 |
| G18(φ6.175)-MH | 内径 Φ6.175 / HGDR φ4.15 / HGDR下穴 |
| G12B-G-ST-12.175-8 | 内径 Φ8 / ドリル φ7.0 / 内径バイト Φ8 |
| トメセン M16 | 内径 Φ8.0 / ドリル φ7.0 / バイト Φ8 |
| トメセン M18 | 内径 Φ10 / ドリル φ7 / バイト Φ8 |
| トメセン M22 | 内径 Φ12 / ドリル φ10.7 / バイト Φ8 |
| トメセン M24 | 内径 Φ16 / ドリル φ14 / バイト Φ16 |
| トメセン M35 | 内径 Φ22 / ドリル φ14 / バイト Φ16 |
| Tube | チューブ 規格とチューブ長さを選択して使用 |

※ v2にのみ存在する `J_M8_200`（ドリル φ2.0 ASWD）はこの一覧の作成時点（v1）にはまだ無かった追加分。

---

## 2. 共通ユーティリティ関数（v1 `app.js` utils セクション → v2は `validators-v2.js` に移設済み）

再利用頻度が高いので原型をここにも残す（現行の正はv2側 `assets/validators-v2.js`）。

```js
// 文字列のエスケープ処理
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// NC旋盤用数値フォーマット（整数でも末尾にドットを付与。例: "5" → "5."）
function ncFormat(val) {
    if (val === "" || val === null || val === undefined) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";
    const s = num.toString();
    return s.indexOf(".") === -1 ? s + "." : s;
}

// 文字列の四則演算式（+ - * / と括弧のみ）を評価。評価不能なら入力をそのまま返す
function evaluateFormula(str) {
    if (!str) return "";
    const sanitized = str.replace(/[^0-9+\-*/.()]/g, "");
    try {
        const result = new Function("return " + sanitized)();
        return isNaN(result) ? str : result;
    } catch (e) {
        return str;
    }
}

// 単純な数値、または四則演算式を数値へ変換。無効なら NaN
function parseSimpleNumberOrFormula(str) {
    if (str === null || str === undefined) return NaN;
    const raw = String(str).trim();
    if (!raw) return NaN;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return Number(raw);
    if (!/^[0-9+\-*/().\s]+$/.test(raw)) return NaN;
    const evaluated = evaluateFormula(raw);
    return typeof evaluated === "number" && isFinite(evaluated) ? evaluated : NaN;
}
```

「四則演算入力欄」（アテ長さ・寸法欄などで `50-27-7.5` のような式を直接打てる）はこの2関数が支えている。
新しい数値入力欄を追加するときはこのペアを踏襲すること。

---

## 3. 値カテゴリ色分け表示の設計（v1のみ・2026-07-19付でv2側は廃止確定）

生成結果のGコードを「入力値そのまま」「自動計算値」「機械固有の定数」の3種に色分けして目視監査できた仕組み。
**2026-07-19、v2への再実装はしない方針が確定し、v2側に残っていた関連コード（`wrapHCalc`/`wrapHInput`/`wrapHMachine` の分類名）も削除済み**（`docs/v1-v2-feature-gap.md` A-5参照）。
将来方針が変わった場合の再実装用に、設計をここに保存しておく。

**分類ラッパー**（`assets/v1/app.js:62-89`）:

```js
function isMCodeLike(val) {
    const s = String(val == null ? "" : val).trim().toUpperCase();
    return /^M\d+(?:\.\d+)?(?:P\d+)?$/.test(s); // 例: M3 / M19 / M458 / M99P100
}
function wrapH(val, attr) {
    if (val === "" || val === undefined) return "";
    if (isMCodeLike(val)) return escapeHtml(val); // Mコードは色分け対象外
    const kind = attr === "input" || attr === "machine" ? attr : "calc";
    return `<span class="h-val h-val--${kind}" data-hl-attr="${kind}">${escapeHtml(val)}</span>`;
}
// wrapHCalc(val) / wrapHInput(val) / wrapHMachine(val) はそれぞれ wrapH(val, "calc"|"input"|"machine") の薄いラッパー
```

**CSS**（`assets/v1/style.css:1136-1161`）: 計算値=黄、入力値=水色、機械定数=マゼンタ、未解決プレースホルダ=赤。
`#resultArea.h-off-{calc|input|machine}` クラスで種別ごとに色を打ち消し、通常表示に戻せる。

**表示ON/OFFの配線**（`assets/v1/app.js:107-134`）: 3つのチェックボックス（`hlCalcToggle`/`hlInputToggle`/`hlMachineToggle`）の
`change` イベントで `_ncHighlightAttrEnabled` を更新し、`resultArea` にクラスをトグルするだけの単純な仕組み。

上記は v2 に一度存在した状態の記録（`wrapH*` が同じ回数呼ばれ、分類情報自体は計算されていた）。
2026-07-19時点では `wrapHCalc`/`wrapHInput`/`wrapHMachine` を単一の `wrapH()` に統合済みのため、この分類情報自体がもう存在しない。
再度必要になった場合は、`wrapH()` を分類引数付きの `<span>` 生成版に戻し、CSSとチェックボックスUIを移植する必要がある。

---

## 4. オペレーターヒント吹き出しの設計パターン（`operator-hints.js`） 【v2に実装予定】

**設計意図:** ヒント文言をロジック本体から独立したファイルに切り出すことで、非エンジニア（現場担当者）が
`app.js` を触らずに文言だけ編集できるようにしていた。編集対象はキー右側の文字列のみ、キー名は画面と対応するため変更不可、
という運用ルール込みで設計されている（ファイル冒頭のコメントに使用方法を明記）。

```js
window.NC_OPERATOR_HINTS = {
    ateLengthFocusHint: "※プリセット選ぶか、半角数値で直接入力。\n四則演算が使えます。例)50-27-7.5=15.5",
    idDepthFocusHint: "※ 図面の内径深さ（穴の深さ）を半角 mm で入力。交差穴（加工径小）スタイルでは穴交差点の距離 IP を入力してください。",
    // ...フィールドID単位でキーを持つ。空文字にするとi18n.js側のデフォルト文言にフォールバック。
};
```

表示は純CSSの `:focus-within` で行い（JS側の開閉ロジックが不要）:

```css
.nc-input-focus-popover { display: none; /* ...吹き出しの見た目... */ }
.nc-input-popover-wrap:focus-within .nc-input-focus-popover { display: block; }
```

今後、現場向けの入力ヒントをv2ウィザードに追加する場合、この「専用ファイル + CSS `:focus-within`」パターンは
そのまま踏襲する価値がある（JSでの開閉制御が不要な分、実装・保守コストが低い）。

---

## 5. LCSベースの行差分アルゴリズム（`_computeLineDiff`, `assets/v1/app.js:2670-2711`）

生成結果を2回分保持し、行単位でLCS（最長共通部分列）による diff を計算していた。500行超は計算スキップする
パフォーマンスガード付き。将来、生成結果の変更点確認機能を作る際に流用できる汎用実装:

```js
function _computeLineDiff(oldText, newText) {
    if (!oldText || !newText) return null;
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    if (oldLines.length > 500 || newLines.length > 500) return { oldLines, newLines, ops: null };

    const m = oldLines.length, n = newLines.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

    const ops = []; // { type: 'keep'|'add'|'remove', line }
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) { ops.unshift({ type: "keep", line: newLines[j - 1] }); i--; j--; }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { ops.unshift({ type: "add", line: newLines[j - 1] }); j--; }
        else { ops.unshift({ type: "remove", line: oldLines[i - 1] }); i--; }
    }
    return { oldLines, newLines, ops };
}
```

---

## 6. デバッグパネルの構成（`assets/v1/debug.js`、全519行・2026-07-19付でv2への移植を廃止確定）

**2026-07-19、v2への再実装はしない方針が確定。** v2側にあったデバッグモードの残骸（`isDebugModeOn`スタブ、
`logic-v2.js`のデバッグバイパス分岐・中間値保持ブロック）も削除済み（`docs/v1-v2-feature-gap.md` A-1参照）。
以下は方針が将来変わった場合の設計メモとして、6ペイン構成と役割を記録する（詳細実装は `assets/v1/debug.js` を参照。
v1本体削除後もgit履歴から復元可能）。

| ペイン | 役割 |
|---|---|
| 入力値パネル | 直近生成時の全入力フォーム値をキー=値で一覧表示。空値は視覚的に区別。 |
| 置換マップパネル | テンプレートの `{{key}}` → 実際に埋め込まれた値の対応を、種別（calc/input/machine）色分き表示。 |
| テンプレート網羅率パネル | テンプレート内の `{{key}}` のうち「解決済み」「未解決（❌）」「出力に残存（⚠️）」「未使用（💤）」を集計。テンプレート追加・改修時のデバッグに有用。 |
| 算出値パネル | `calcMax1`/`calcMax2`/`finalDrillDepth`/`crossSmallFinishDepth`/YoseRelayメトリクス等、内部計算の中間値を一覧表示。 |
| 計算フローチャートパネル | 「①外径計算→②深さ決定→③ドリルブロック選択→④内バリ処理→⑤テンプレート選択→⑥最終出力」の6ステップを、実際の入力値・計算値を埋め込んだ形でテキスト表示。ロジックの動作確認に有用。 |
| 登録機械一覧パネル | `machines` オブジェクトの一覧表示 + `machines.json` エクスポート/インポート（セッション内一時反映）。 |

F3相当（`exportDebugJSON()`）: 直近生成の入力値・算出値・置換マップ・テンプレートキー一覧をJSONダウンロード。
不具合報告時の証跡として有用（`docs/debug-template.md` の「4) 生成結果」欄と組み合わせて使える）。

---

## 7. その他の小ネタ（参考情報・優先度低）

- v1の「?」ボタンにはイースターエッグの秘密メッセージ機能もあった（`assets/v1/i18n.js:134-137`）。
  「スーパー」「NPT R G」「クォーツねじ」「M12もみつけ」という隠し文言リストと開発者クレジット表示。
  機能に影響はないが、社内的な小ネタとして記録のみ残す。
