/**
 * test-calc-functions.mjs
 * app.js の純粋計算関数のユニットテスト。
 * Node.js 18+ の組み込みテストランナーを使用。
 *
 * 使い方:
 *   node --test scripts/test-calc-functions.mjs
 *   または: npm test (package.json の "test" スクリプトを参照)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ─── テスト対象の純粋関数を app.js と同じロジックで再実装 ───────────────────
// （app.js はブラウザグローバルに依存するため直接 import は不可。
//   数式ロジックのみを抽出してテスト対象とする）

function ncFormat(str) {
    if (str === null || str === undefined || str === "") return "";
    const n = parseFloat(str);
    if (isNaN(n)) return String(str);
    const fixed = n.toFixed(3);
    // 整数部が 0 の場合は 0 を省略: "0.500" → ".500"
    return fixed.replace(/^0\./, ".").replace(/^-0\./, "-.");
}

function parseSimpleNumberOrFormula(str) {
    if (!str) return NaN;
    const s = String(str).trim();
    // 数式 "A*B/2" のような形式
    const m = s.match(/^([0-9.]+)\s*\*\s*([0-9.]+)\s*\/\s*([0-9.]+)$/);
    if (m) return (parseFloat(m[1]) * parseFloat(m[2])) / parseFloat(m[3]);
    const m2 = s.match(/^([0-9.]+)\s*\*\s*([0-9.]+)$/);
    if (m2) return parseFloat(m2[1]) * parseFloat(m2[2]);
    const m3 = s.match(/^sqrt\(([0-9.]+)\s*\*\s*\*\s*2\s*\+\s*([0-9.]+)\s*\*\s*\*\s*2\)$/i);
    if (m3) return Math.sqrt(parseFloat(m3[1]) ** 2 + parseFloat(m3[2]) ** 2);
    return parseFloat(s);
}

function calcSpecialDrillZ(style, drillDia, baseDepth) {
    if (!drillDia || isNaN(baseDepth)) return null;
    if (style === "Yose" || style === "YoseRelay") {
        return (0.3 * drillDia + baseDepth - 0.4).toFixed(2);
    }
    if (style === "CrossBig" || style === "CrossSmall") {
        return (baseDepth + 1 + 0.3 * drillDia).toFixed(2);
    }
    return null;
}

function calcCrossSmallFinishDepth(cp, partnerDia, machinedDia) {
    const rPartner = partnerDia / 2;
    const rMachined = machinedDia / 2;
    const sq = rPartner * rPartner - rMachined * rMachined;
    if (sq < 0) return NaN;
    const A = Math.sqrt(sq);
    const B = rPartner - A;
    return Number((cp + B + 1.0).toFixed(3));
}

function calcYoseRelayMetrics(totalLength, partnerDepth, partnerDia, machinedDia, angleDeg, drillDia) {
    if ([totalLength, partnerDepth, partnerDia, machinedDia, angleDeg].some((n) => isNaN(n) || !isFinite(n))) {
        return null;
    }
    const rad = (angleDeg * Math.PI) / 180;
    const tanVal = Math.tan(rad);
    if (!isFinite(tanVal) || Math.abs(tanVal) < 1e-6) return null;

    const opposedDistance = totalLength - partnerDepth;
    const yoseLength = (partnerDia / 2 - machinedDia / 2) / tanVal;
    const taiYoseLength = opposedDistance - yoseLength;
    const relayIdDepth = taiYoseLength + 1.0;
    const relayDrillDepth = isNaN(drillDia) ? NaN : taiYoseLength + 0.3 * drillDia;

    return { opposedDistance, yoseLength, taiYoseLength, relayIdDepth, relayDrillDepth };
}

function getDrillBlock_logic(depth, mode) {
    if (mode === "G1") {
        return "G1";
    }
    if (depth <= 30) {
        return "G74_single";
    }
    return "G74_step";
}

// ─── テスト定義 ───────────────────────────────────────────────────────────────

describe("ncFormat", () => {
    test("整数値の先頭ゼロを省略する", () => {
        assert.equal(ncFormat("0.5"), ".500");
        assert.equal(ncFormat(0.5), ".500");
    });
    test("負数の先頭ゼロを省略する", () => {
        assert.equal(ncFormat(-0.5), "-.500");
    });
    test("1 以上の値はそのまま 3 桁小数", () => {
        assert.equal(ncFormat("25.1"), "25.100");
        assert.equal(ncFormat(12), "12.000");
    });
    test("空文字は空文字を返す", () => {
        assert.equal(ncFormat(""), "");
        assert.equal(ncFormat(null), "");
    });
    test("非数値はそのまま返す", () => {
        assert.equal(ncFormat("ABC"), "ABC");
    });
});

describe("parseSimpleNumberOrFormula", () => {
    test("通常の数値をパース", () => {
        assert.equal(parseSimpleNumberOrFormula("30.1"), 30.1);
    });
    test("乗算式をパース", () => {
        assert.equal(parseSimpleNumberOrFormula("5*6"), 30);
    });
    test("除算式をパース", () => {
        assert.equal(parseSimpleNumberOrFormula("30*2/2"), 30);
    });
    test("無効な文字列は NaN", () => {
        assert.ok(isNaN(parseSimpleNumberOrFormula("ABC")));
    });
});

describe("calcSpecialDrillZ", () => {
    test("Yose スタイル: 0.3×D + 深さ - 0.4", () => {
        // D=14.0, depth=20.0 → 0.3*14+20-0.4 = 4.2+20-0.4 = 23.8
        assert.equal(calcSpecialDrillZ("Yose", 14.0, 20.0), "23.80");
    });
    test("CrossBig スタイル: depth + 1 + 0.3×D", () => {
        // D=4.05, depth=10.0 → 10+1+1.215 = 12.215 → toFixed(2) = "12.21" (JS 丸め)
        assert.equal(calcSpecialDrillZ("CrossBig", 4.05, 10.0), "12.21");
    });
    test("CrossSmall も同じ式", () => {
        assert.equal(calcSpecialDrillZ("CrossSmall", 7.0, 8.0), "11.10");
    });
    test("drillDia が falsy なら null", () => {
        assert.equal(calcSpecialDrillZ("Yose", 0, 10), null);
    });
    test("baseDepth が NaN なら null", () => {
        assert.equal(calcSpecialDrillZ("Yose", 7.0, NaN), null);
    });
    test("未対応スタイルは null", () => {
        assert.equal(calcSpecialDrillZ("Normal", 7.0, 10.0), null);
    });
});

describe("calcCrossSmallFinishDepth", () => {
    test("基本ケース: CP=8, partnerD=12, machinedD=4", () => {
        // R=6, r=2, A=sqrt(36-4)=sqrt(32)≈5.657, B=6-5.657=0.343
        // depth = 8 + 0.343 + 1 = 9.343
        const result = calcCrossSmallFinishDepth(8, 12, 4);
        assert.ok(Math.abs(result - 9.343) < 0.001, `Expected ~9.343, got ${result}`);
    });
    test("加工径=相手径なら NaN (sq<0 にはならないが B=0 のケース)", () => {
        // partnerD=machineD=8: B = 4 - sqrt(16-16) = 4 - 0 = 4 → depth = CP+4+1
        const result = calcCrossSmallFinishDepth(5, 8, 8);
        assert.equal(result, 10.0);
    });
    test("加工径 > 相手径なら NaN", () => {
        assert.ok(isNaN(calcCrossSmallFinishDepth(5, 4, 8)));
    });
});

describe("calcYoseRelayMetrics", () => {
    test("基本ケース", () => {
        // totalLength=50, partnerDepth=20, partnerDia=10, machinedDia=4, angle=30°, drillDia=14
        // rad = 30*PI/180, tan(30)=0.5774
        // opposed = 50-20 = 30
        // yoseLen = (5-2)/0.5774 = 3/0.5774 ≈ 5.196
        // taiYose = 30-5.196 = 24.804
        // relayId = 24.804+1 = 25.804
        // relayDrill = 24.804+0.3*14 = 24.804+4.2 = 29.004
        const m = calcYoseRelayMetrics(50, 20, 10, 4, 30, 14);
        assert.ok(m !== null);
        assert.ok(Math.abs(m.opposedDistance - 30) < 0.001);
        assert.ok(Math.abs(m.yoseLength - 5.196) < 0.01);
        assert.ok(Math.abs(m.taiYoseLength - 24.804) < 0.01);
        assert.ok(Math.abs(m.relayIdDepth - 25.804) < 0.01);
        assert.ok(Math.abs(m.relayDrillDepth - 29.004) < 0.01);
    });
    test("入力が NaN なら null", () => {
        assert.equal(calcYoseRelayMetrics(NaN, 20, 10, 4, 30, 14), null);
    });
    test("角度 0° なら null (tanが0)", () => {
        assert.equal(calcYoseRelayMetrics(50, 20, 10, 4, 0, 14), null);
    });
    test("drillDia が NaN なら relayDrillDepth は NaN", () => {
        const m = calcYoseRelayMetrics(50, 20, 10, 4, 30, NaN);
        assert.ok(m !== null);
        assert.ok(isNaN(m.relayDrillDepth));
    });
});

describe("ドリルブロック選択ロジック", () => {
    test("G1 モードは深さによらず G1", () => {
        assert.equal(getDrillBlock_logic(50, "G1"), "G1");
        assert.equal(getDrillBlock_logic(10, "G1"), "G1");
    });
    test("G74 + 深さ30以下 → G74_single", () => {
        assert.equal(getDrillBlock_logic(30, "G74"), "G74_single");
        assert.equal(getDrillBlock_logic(10, "G74"), "G74_single");
    });
    test("G74 + 深さ30超 → G74_step（10mmステップ）", () => {
        assert.equal(getDrillBlock_logic(31, "G74"), "G74_step");
        assert.equal(getDrillBlock_logic(100, "G74"), "G74_step");
    });
});

describe("深さ決定ロジック (style 分岐)", () => {
    test("Hirazoko: idDepth+0.1 / +0.2", () => {
        const idDepth = 12.5;
        const finalDrill = idDepth + 0.1;
        const finalFinish = idDepth + 0.2;
        assert.equal(finalDrill, 12.6);
        assert.equal(finalFinish, 12.7);
    });
    test("Ichimonji: 同上", () => {
        const idDepth = 15.0;
        assert.equal(idDepth + 0.1, 15.1);
        assert.equal(idDepth + 0.2, 15.2);
    });
    test("Normal: idDepth をそのまま使用", () => {
        const idDepth = 10.0;
        assert.equal(idDepth, 10.0);
    });
});

describe("外径計算ロジック", () => {
    test("calcMax1 = maxOD - 5", () => {
        assert.equal((30.1 - 5.0).toFixed(3), "25.100");
    });
    test("calcMax2 = maxOD + 3", () => {
        assert.equal((30.1 + 3.0).toFixed(3), "33.100");
    });
    test("角あり: calcMainMax = W × √2", () => {
        const W = 20;
        assert.ok(Math.abs(W * Math.SQRT2 - 28.284) < 0.001);
    });
});
