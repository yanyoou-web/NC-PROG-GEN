/**
 * test-drill-depth-auto.mjs
 * gui-v2.js の computeDrillDepthAuto()（ドリル深さ「自動計算」表示欄の値）のユニットテスト。
 *
 * 背景（回帰防止）:
 *   修正前は workType === "Tube" の場合、加工スタイルを見る前に「ドリル深さ = チューブ長さ」を
 *   即returnしていた。Hirazoko/YoseRelay は logic-v2.js 側で finalDrillDepth が再計算・上書き
 *   されるため最終Gコードへの影響はなかったが、Normal/Yose/CrossSmall は上書きされないため、
 *   誤った値（チューブ長さ）がそのまま最終Gコードのドリル深さとして出力されていた。
 *   また workType === "Tube_MH" は文字列の完全一致漏れでこの分岐に入らず、代わりに
 *   CrossSmall/Yose 用の DRILL_DIA_MAP にチューブのキーが無いため自動計算が常にnullになり
 *   （＝手動切替しない限り「自動計算されます」のプレースホルダーのまま先へ進めてしまう）
 *   一貫しない挙動になっていた。
 *
 *   修正後は Hirazoko/Ichimonji/YoseRelay を先に判定し、Normal はチューブも含めて他ワーク種別と
 *   同様「自動計算式なし＝手動入力必須」に統一。Yose/CrossSmall は tubeData[規格].drill
 *   （"DR5.0" 等）から実ドリル径を解決して calcSpecialDrillZ() に渡すようにした
 *   （logic-v2.js の resolveDrillDia() と同じ「DR等の接頭辞を除去して数値化」規則）。
 *
 * ロジックの再実装ではなく、scripts/golden/lib/load-app-context.mjs 経由で
 * 本物の gui-v2.js（と依存する data-v2.js 等）を読み込んで検証する。
 *
 * 使い方: node --test scripts/test-drill-depth-auto.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAppContext } from "./golden/lib/load-app-context.mjs";

const { context, defaultWizardState } = loadAppContext();

function autoVal(overrides) {
    context.wizardState = { ...defaultWizardState, ...overrides };
    return context.computeDrillDepthAuto();
}

test("Tube + Hirazoko: idDepth + 0.1（チューブ長さではない）", () => {
    const v = autoVal({
        workType: "Tube",
        internalStyle: "Hirazoko",
        tubeSpec: "8x6 (R0.5)",
        tubeLength: "18",
        idDepth: "15",
    });
    assert.equal(v, "15.100");
});

test("Tube + YoseRelay: calcYoseRelayMetrics の結果（チューブ長さではない）", () => {
    const v = autoVal({
        workType: "Tube",
        internalStyle: "YoseRelay",
        tubeSpec: "8x6 (R0.5)",
        tubeLength: "18",
        yoseTotalLength: "40",
        yosePartnerDepth: "10",
        yoseD: "10",
        yoseAngle: "30",
    });
    assert.equal(v, "28.036");
});

test("Tube + Normal: 自動計算式なし（null）。他ワーク種別・Tube_MHと同様に手動入力必須", () => {
    const v = autoVal({
        workType: "Tube",
        internalStyle: "Normal",
        tubeSpec: "8x6 (R0.5)",
        tubeLength: "18",
        idDepth: "15",
    });
    assert.equal(v, null);
});

test("Tube + Yose: 規格ごとの実ドリル径で calcSpecialDrillZ", () => {
    const v = autoVal({
        workType: "Tube",
        internalStyle: "Yose",
        tubeSpec: "6.35x3.95 (R0.5)", // drill: "DR3.3" → 3.3
        idDepth: "15",
    });
    // 0.3*3.3 + 15 - 0.4 = 15.59
    assert.equal(v, "15.59");
});

test("Tube + CrossSmall: 規格ごとの実ドリル径で calcSpecialDrillZ", () => {
    const v = autoVal({
        workType: "Tube",
        internalStyle: "CrossSmall",
        tubeSpec: "6.35x3.95 (R0.5)", // drill: "DR3.3" → 3.3
        idDepth: "15",
        valPartnerD: "8", // cp = 15 - 8/2 = 11
    });
    // 11 + 1 + 0.3*3.3 = 12.99
    assert.equal(v, "12.99");
});

test("Tube_MH + Normal: Tubeと同じくnull（従来から変化なし）", () => {
    const v = autoVal({
        workType: "Tube_MH",
        internalStyle: "Normal",
        tubeSpec: "8x6 (R0.5)",
        tubeLength: "18",
        idDepth: "15",
    });
    assert.equal(v, null);
});

test("Tube_MH + CrossSmall: 修正前はDRILL_DIA_MAPにキーが無くnull固定だったが、規格の実ドリル径で計算できる", () => {
    const v = autoVal({
        workType: "Tube_MH",
        internalStyle: "CrossSmall",
        tubeSpec: "8x6 (R0.5)", // drill: "DR5.0" → 5.0
        idDepth: "15",
        valPartnerD: "8", // cp = 11
    });
    // 11 + 1 + 0.3*5.0 = 13.5
    assert.equal(v, "13.50");
});

test("非チューブ（M18）は従来どおり DRILL_DIA_MAP ベースで計算される（回帰防止）", () => {
    const yose = autoVal({ workType: "M18", internalStyle: "Yose", idDepth: "15" });
    assert.equal(yose, "16.70"); // 0.3*7 + 15 - 0.4
    const cross = autoVal({ workType: "M18", internalStyle: "CrossSmall", idDepth: "15", valPartnerD: "8" });
    assert.equal(cross, "14.10"); // 11 + 1 + 0.3*7
});
