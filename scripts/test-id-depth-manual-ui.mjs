/**
 * test-id-depth-manual-ui.mjs
 * gui-v2.js の buildDepthsScreen()（加工深さ画面）における、内径深さの
 * 「自動計算 ⇄ 手動入力」表示切り替えのユニットテスト。
 *
 * 背景（回帰防止）:
 *   チューブ + ヨセ（internalStyle==="Yose"）のとき、内径深さが tubeLength（チューブ長さ）から
 *   自動セットされ、「自動（規格値）」バッジ付きで表示されていた（手入力欄(#id-depth)自体が
 *   DOMに存在しなかった）。内径深さはチューブ長さに依存しない図面値のため、これは誤りだった
 *   （commit be55afd で「ヨセはチューブ長さを自動値として使う」という仕様として導入されたが、
 *   今回のバグ修正でその判断を撤回し、撤去した）。
 *
 *   修正後は、自動で決まる内径深さがあるのはヨセ中継（YoseRelay、calcYoseRelayMetricsの
 *   計算式ベース）のみとし、ヨセ（Yose）はチューブの有無に関わらず、他のスタイル
 *   （通常バイト加工／内径バイト平底／一文字DR平底／交差穴）と同じく常に手入力必須にした。
 *   なお、ヨセのドリル深さ自動計算（0.3×ドリル径 + 内径深さ - 0.4、非チューブのMねじ等と
 *   同じ計算式）自体はこの修正前から存在しており、手入力された内径深さを正しく参照する
 *   （scripts/test-drill-depth-auto.mjs でカバー済み）。
 *
 * ロジックの再実装ではなく、scripts/golden/lib/load-app-context.mjs 経由で
 * 本物の gui-v2.js を読み込んで検証する（buildDepthsScreen() が参照する document.getElementById
 * は常に null を返すスタブのため、画面はウィザードの初回表示相当＝wizardState の値のみで描画される）。
 *
 * 使い方: node --test scripts/test-id-depth-manual-ui.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAppContext } from "./golden/lib/load-app-context.mjs";

const { context, defaultWizardState } = loadAppContext();

function depthsScreenHtml(overrides) {
    context.wizardState = { ...defaultWizardState, ...overrides };
    return context.buildDepthsScreen();
}

const ID_INPUT_ID = 'id="id-depth"';
const ID_AUTO_VAL_ID = 'id="id-depth-auto-val"';

test("チューブ + ヨセ: 内径深さは手入力欄が表示され、チューブ長さが自動セットされないこと", () => {
    const html = depthsScreenHtml({
        workType: "Tube",
        internalStyle: "Yose",
        tubeSpec: "12x10 (R1)", // id=10, 長さ候補=[24,25]
        tubeLength: "25",
        yoseD: "6",
    });
    assert.ok(html.includes(ID_INPUT_ID), "内径深さの手入力欄(#id-depth)が表示されること");
    assert.ok(!html.includes(ID_AUTO_VAL_ID), "自動計算バッジ（id-depth-auto-val）を出さないこと");
    assert.equal(context.wizardState.idDepth, "", "内径深さがチューブ長さ(25)へ自動セットされないこと");
});

test("Tube_MH + ヨセ: Tubeと同様に内径深さは手入力必須（従来から変化なし）", () => {
    const html = depthsScreenHtml({
        workType: "Tube_MH",
        internalStyle: "Yose",
        tubeSpec: "12x10 (R1)",
        tubeLength: "25",
        yoseD: "6",
    });
    assert.ok(html.includes(ID_INPUT_ID), "内径深さの手入力欄が表示されること");
    assert.equal(context.wizardState.idDepth, "", "内径深さがチューブ長さへ自動セットされないこと");
});

test("非チューブ（M18）+ ヨセ: 従来どおり内径深さは手入力必須（回帰防止）", () => {
    const html = depthsScreenHtml({ workType: "M18", internalStyle: "Yose", yoseD: "5" });
    assert.ok(html.includes(ID_INPUT_ID), "内径深さの手入力欄が表示されること");
});

test("ヨセ中継（YoseRelay）: チューブでも計算式ベースの自動値が出て、「自動（規格値）」ラベルにはならないこと", () => {
    const html = depthsScreenHtml({
        workType: "Tube",
        internalStyle: "YoseRelay",
        tubeSpec: "12x10 (R1)", // id(machinedDia)=10
        tubeLength: "25",
        yoseD: "20",
        yoseTotalLength: "40",
        yosePartnerDepth: "10",
        yoseAngle: "30",
    });
    assert.ok(!html.includes(ID_INPUT_ID), "自動計算される場合は内径深さの手入力欄は出さないこと");
    assert.ok(html.includes("自動計算"), "バッジ文言は「自動計算」であること");
    assert.ok(!html.includes("規格値"), "チューブでも「自動（規格値）」ラベルは出ないこと（計算式ベースのため）");
    // taiYoseLength(21.340) + 1.0 = 22.340 が正しい期待値（チューブ長さ25とは一致しない）
    assert.equal(context.wizardState.idDepth, "22.340", "内径深さはチューブ長さ(25)ではなく計算式の結果になること");
});
