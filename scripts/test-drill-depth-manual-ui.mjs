/**
 * test-drill-depth-manual-ui.mjs
 * gui-v2.js の buildDepthsScreen()（加工深さ画面）における、ドリル深さの
 * 「自動計算 ⇄ 手動入力」トグルUIのユニットテスト。
 *
 * 背景:
 *   internalStyle === "Normal"（通常バイト加工）には、そもそもドリル深さの自動計算式が
 *   存在しない（computeDrillDepthAuto() は Normal で常に null を返す）。しかし修正前の
 *   buildDepthsScreen() は wizardState.drillDepthManual の生の値だけを見て表示を切り替えて
 *   いたため、Normal スタイルでも初期状態（drillDepthManual=false）では「自動計算モード」の
 *   UI（「上の項目を入力すると自動計算されます」というプレースホルダーと「手動で変更」ボタン）
 *   が表示され、実際の入力欄（#drill-depth）自体がDOMに存在しなかった。
 *
 *   この状態で気づかず「次へ」を押すと、next-depths ハンドラも drillDepthManual===false を見て
 *   「自動計算値を採用」する分岐に入るため、DOM上の値を一切読まずに wizardState.drillDepth を
 *   確定させてしまい、かつ手動入力必須チェック（drillDepthManual && 値が空ならブロック）も
 *   一緒にスキップされていた。結果、ドリル深さが未入力のまま次の画面へ進めてしまう
 *   （最終的に logic-v2.js の finalDrillDepth フォールバックで idDepth が代用され、
 *   ユーザーが意図した値と異なるドリル深さがGコードに出力されるおそれがあった）。
 *
 *   修正後は styleHasDrillAutoCalc()/isDrillDepthManualEffective() を導入し、自動計算式が
 *   存在しないスタイル（Normal）は wizardState.drillDepthManual の値に関わらず常に「手動入力」
 *   として扱う。ヨセ／ヨセ中継／交差穴（小径）／内径バイト平底／一文字DR平底は従来どおり
 *   自動計算⇄手動入力のトグルが機能する。
 *
 * ロジックの再実装ではなく、scripts/golden/lib/load-app-context.mjs 経由で
 * 本物の gui-v2.js を読み込んで検証する（buildDepthsScreen() が参照する document.getElementById
 * は常に null を返すスタブのため、画面はウィザードの初回表示相当＝wizardState の値のみで描画される）。
 *
 * 使い方: node --test scripts/test-drill-depth-manual-ui.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAppContext } from "./golden/lib/load-app-context.mjs";

const { context, defaultWizardState } = loadAppContext();

function depthsScreenHtml(overrides) {
    context.wizardState = { ...defaultWizardState, ...overrides };
    return context.buildDepthsScreen();
}

const TOGGLE_ACTION = 'data-action="toggle-drill-manual"';
const AUTO_ROW_ID = 'id="drill-depth-auto-row"';
const DRILL_INPUT_ID = 'id="drill-depth"';
const AUTO_PLACEHOLDER = "上の項目を入力すると自動計算されます";
const BACK_TO_AUTO_LABEL = "自動計算に戻す";

test("styleHasDrillAutoCalc(): Normalのみ自動計算式なし、他5スタイルは自動計算式あり", () => {
    assert.equal(context.styleHasDrillAutoCalc("Normal"), false);
    for (const st of ["Hirazoko", "Ichimonji", "CrossSmall", "Yose", "YoseRelay"]) {
        assert.equal(context.styleHasDrillAutoCalc(st), true, `${st} は自動計算式ありのはず`);
    }
    // ALL_STYLES と完全に対応していること（新スタイル追加時の更新漏れ検知）
    // ALL_STYLES は vm コンテキスト（別レルム）の配列のため、Array.from で outer 側の配列に
    // 変換してから比較する（そのまま deepEqual すると cross-realm 配列として不一致判定になる）。
    assert.deepEqual(
        Array.from(context.ALL_STYLES).filter((st) => !context.styleHasDrillAutoCalc(st)),
        ["Normal"]
    );
});

test("isDrillDepthManualEffective(): Normalは drillDepthManual フラグの値に関わらず常にtrue", () => {
    context.wizardState = { ...defaultWizardState, workType: "M18", internalStyle: "Normal", drillDepthManual: false };
    assert.equal(context.isDrillDepthManualEffective(), true, "フラグfalseでも常に手動扱い");
    context.wizardState.drillDepthManual = true;
    assert.equal(context.isDrillDepthManualEffective(), true, "フラグtrueでも当然手動扱い");
});

test("isDrillDepthManualEffective(): 自動計算式のあるスタイルはフラグどおり", () => {
    context.wizardState = { ...defaultWizardState, workType: "M18", internalStyle: "Yose", drillDepthManual: false };
    assert.equal(context.isDrillDepthManualEffective(), false);
    context.wizardState.drillDepthManual = true;
    assert.equal(context.isDrillDepthManualEffective(), true);
});

test("Normal: 自動計算UIを一切出さず、常に手動入力欄をそのまま表示する（drillDepthManual=false）", () => {
    const html = depthsScreenHtml({ workType: "M18", internalStyle: "Normal", idDepth: "15", drillDepthManual: false });
    assert.ok(html.includes(DRILL_INPUT_ID), "手動入力欄(#drill-depth)が最初から表示されること");
    assert.ok(!html.includes(TOGGLE_ACTION), "トグルボタン（手動で変更／自動計算に戻す）を出さないこと");
    assert.ok(!html.includes(AUTO_ROW_ID), "自動計算バッジ行を出さないこと");
    assert.ok(!html.includes(AUTO_PLACEHOLDER), "「自動計算されます」という誤った案内を出さないこと");
});

test("Normal: JSONインポート等でdrillDepthManual=trueが紛れ込んでいても表示は変わらない（トグルなし）", () => {
    const html = depthsScreenHtml({
        workType: "M18",
        internalStyle: "Normal",
        idDepth: "15",
        drillDepth: "20",
        drillDepthManual: true,
    });
    assert.ok(html.includes(DRILL_INPUT_ID), "手動入力欄が表示されること");
    assert.ok(!html.includes(TOGGLE_ACTION), "トグルボタンは出さないこと（自動計算に戻す先が無いため）");
    assert.ok(html.includes('value="20"'), "既存の入力値は保持されること");
});

test("Normal: チューブ（Tube/Tube_MH）でも同様に自動計算UIを出さない", () => {
    for (const wt of ["Tube", "Tube_MH"]) {
        const html = depthsScreenHtml({
            workType: wt,
            internalStyle: "Normal",
            tubeSpec: "8x6 (R0.5)",
            tubeLength: "18",
            idDepth: "15",
        });
        assert.ok(html.includes(DRILL_INPUT_ID), `${wt}: 手動入力欄が表示されること`);
        assert.ok(!html.includes(TOGGLE_ACTION), `${wt}: トグルボタンを出さないこと`);
    }
});

test("ヨセ・ヨセ中継・交差穴・平底・一文字: 従来どおり自動計算⇄手動入力のトグルを維持する", () => {
    const fixtures = [
        { internalStyle: "Hirazoko", extra: { idDepth: "15" } },
        { internalStyle: "Ichimonji", extra: { idDepth: "15" } },
        { internalStyle: "Yose", extra: { idDepth: "15" } },
        { internalStyle: "CrossSmall", extra: { idDepth: "15", valPartnerD: "8" } },
    ];
    for (const { internalStyle, extra } of fixtures) {
        const html = depthsScreenHtml({ workType: "M18", internalStyle, drillDepthManual: false, ...extra });
        assert.ok(html.includes(TOGGLE_ACTION), `${internalStyle}: 自動計算モードのトグルボタンが出ること`);
        assert.ok(html.includes(AUTO_ROW_ID), `${internalStyle}: 自動計算バッジ行が出ること`);
        assert.ok(!html.includes(DRILL_INPUT_ID), `${internalStyle}: 自動計算モードでは手動入力欄を出さないこと`);
    }
    // YoseRelay は自動計算に yose-detail 画面の値一式が必要なため、idDepth だけでは未算出（プレースホルダー）
    // だが、それでも「自動計算式はある」スタイルとしてトグルUI自体は出ること
    const relayHtml = depthsScreenHtml({ workType: "M18", internalStyle: "YoseRelay", drillDepthManual: false });
    assert.ok(relayHtml.includes(TOGGLE_ACTION), "YoseRelay: 自動計算モードのトグルボタンが出ること");
    assert.ok(relayHtml.includes(AUTO_ROW_ID), "YoseRelay: 自動計算バッジ行が出ること");
});

test("ヨセ・ヨセ中継・交差穴・平底: 手動切替後は「自動計算に戻す」リンクが出る（従来どおり）", () => {
    const fixtures = [
        { internalStyle: "Hirazoko", extra: { idDepth: "15" } },
        { internalStyle: "Yose", extra: { idDepth: "15" } },
        { internalStyle: "CrossSmall", extra: { idDepth: "15", valPartnerD: "8" } },
    ];
    for (const { internalStyle, extra } of fixtures) {
        const html = depthsScreenHtml({
            workType: "M18",
            internalStyle,
            drillDepthManual: true,
            drillDepth: "99",
            ...extra,
        });
        assert.ok(html.includes(DRILL_INPUT_ID), `${internalStyle}: 手動入力欄が出ること`);
        assert.ok(html.includes(TOGGLE_ACTION), `${internalStyle}: トグルボタンが出ること`);
        assert.ok(html.includes(BACK_TO_AUTO_LABEL), `${internalStyle}: 「自動計算に戻す」の文言が出ること`);
    }
});
