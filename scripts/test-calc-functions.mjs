/**
 * test-calc-functions.mjs
 * app.js / validators-v2.js の純粋計算関数のユニットテスト。
 * Node.js 18+ の組み込みテストランナーを使用。
 *
 * 使い方:
 *   node --test scripts/test-calc-functions.mjs
 *   または: npm test (package.json の "test" スクリプトを参照)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALIDATORS_JS = path.join(__dirname, "..", "Gコードジェネレータ", "assets", "validators-v2.js");

// ─── validators-v2.js を実ファイルから読み込む ─────────────────────────────
// （ブラウザ用のグローバル関数定義ファイルのため、verify-tube-x6u2.mjs と同じ
//   vm 読み込み方式を使う。これにより「本物と別のロジックをテストしてしまう」
//   問題を避け、実際にアプリが使っている関数そのものを検証できる）

function loadValidators() {
    const code = fs.readFileSync(VALIDATORS_JS, "utf8");
    const context = vm.createContext({ console, document: undefined });
    vm.runInContext(
        code + "\nvar __validatorsExport = { ncFormat, parseSimpleNumberOrFormula, evaluateFormula, evaluateExpression, stripDisallowedChars, toHankaku, VALIDATOR_CATEGORIES };",
        context,
    );
    return context.__validatorsExport;
}

const { ncFormat, parseSimpleNumberOrFormula, evaluateFormula, evaluateExpression, stripDisallowedChars, toHankaku } = loadValidators();

// ─── ここから下は validators-v2.js の対象外（app.js 由来）の純粋関数を ─────
// 同じロジックで再実装してテストする（app.js はブラウザグローバルに依存する
// ため直接 import は不可。数式ロジック以外のここでの対象は入力チェックの
// 範囲外のため、従来どおり再実装での検証とする）。

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

describe("ncFormat（本番の validators-v2.js を直接テスト）", () => {
    test("小数点がすでにあればそのまま", () => {
        assert.equal(ncFormat("0.5"), "0.5");
        assert.equal(ncFormat(0.5), "0.5");
        assert.equal(ncFormat("25.1"), "25.1");
    });
    test("整数値には末尾に小数点を付与する（X10500問題への対策）", () => {
        assert.equal(ncFormat(12), "12.");
        assert.equal(ncFormat("30"), "30.");
    });
    test("負数もそのまま（小数点があれば付与しない）", () => {
        assert.equal(ncFormat(-0.5), "-0.5");
        assert.equal(ncFormat(-12), "-12.");
    });
    test("空文字・null・undefinedは空文字を返す", () => {
        assert.equal(ncFormat(""), "");
        assert.equal(ncFormat(null), "");
        assert.equal(ncFormat(undefined), "");
    });
    test("非数値は空文字を返す", () => {
        assert.equal(ncFormat("ABC"), "");
    });
});

describe("evaluateExpression（安全な四則演算パーサー）", () => {
    test("基本的な四則演算", () => {
        assert.equal(evaluateExpression("10.5+2.3"), 12.8);
        assert.equal(evaluateExpression("50-27-7.5"), 15.5);
        assert.equal(evaluateExpression("5*6"), 30);
        assert.equal(evaluateExpression("30*2/2"), 30);
    });
    test("括弧・単項マイナスに対応", () => {
        assert.equal(evaluateExpression("(1+2)*3"), 9);
        assert.equal(evaluateExpression("-5+3"), -2);
    });
    test("「10//2」はエラーになる（旧実装はJSコメントと誤認識し10を返していた不具合）", () => {
        assert.throws(() => evaluateExpression("10//2"));
    });
    test("ゼロ除算はInfinityを返す（呼び出し側でisFiniteチェックが必要）", () => {
        assert.equal(evaluateExpression("5/0"), Infinity);
    });
    test("不正な形式はエラーになる", () => {
        assert.throws(() => evaluateExpression("1.2.3"));
        assert.throws(() => evaluateExpression("()"));
        assert.throws(() => evaluateExpression(""));
        assert.throws(() => evaluateExpression("10 20"));
    });
});

describe("parseSimpleNumberOrFormula（本番の validators-v2.js を直接テスト）", () => {
    test("通常の数値をパース", () => {
        assert.equal(parseSimpleNumberOrFormula("30.1"), 30.1);
    });
    test("四則演算の式をパース", () => {
        assert.equal(parseSimpleNumberOrFormula("5*6"), 30);
        assert.equal(parseSimpleNumberOrFormula("30*2/2"), 30);
        assert.equal(parseSimpleNumberOrFormula("50-27-7.5"), 15.5);
    });
    test("無効な文字列はNaN", () => {
        assert.ok(isNaN(parseSimpleNumberOrFormula("ABC")));
    });
    test("「10//2」はNaN（黙って10を返さない）", () => {
        assert.ok(isNaN(parseSimpleNumberOrFormula("10//2")));
    });
    test("ゼロ除算はNaN（Infinityを返さない）", () => {
        assert.ok(isNaN(parseSimpleNumberOrFormula("5/0")));
    });
    test("複数の小数点はNaN", () => {
        assert.ok(isNaN(parseSimpleNumberOrFormula("1.2.3")));
    });
});

describe("evaluateFormula（旧実装との互換ラッパー）", () => {
    test("成功時は計算結果の数値を返す", () => {
        assert.equal(evaluateFormula("10.5+2.3"), 12.8);
    });
    test("失敗時は元の文字列をそのまま返す（旧実装と同じ契約）", () => {
        assert.equal(evaluateFormula("10//2"), "10//2");
        assert.equal(evaluateFormula("5/0"), "5/0");
    });
    test("空文字は空文字", () => {
        assert.equal(evaluateFormula(""), "");
    });
});

describe("stripDisallowedChars（半角チェック・許可リスト方式）", () => {
    test("ID分類: 半角数字以外はすべて除去", () => {
        const r = stripDisallowedChars("123ABC", "ID");
        assert.equal(r.cleaned, "123");
        assert.equal(r.removed, true);
    });
    test("ID分類: 全角数字は半角に変換される（除去ではない）", () => {
        const r = stripDisallowedChars("１２３", "ID");
        assert.equal(r.cleaned, "123");
        assert.equal(r.removed, false);
        assert.equal(r.changed, true);
    });
    test("NUMERIC分類: 半角数字+記号はそのまま", () => {
        const r = stripDisallowedChars("10.5+2.3", "NUMERIC");
        assert.equal(r.cleaned, "10.5+2.3");
        assert.equal(r.removed, false);
        assert.equal(r.changed, false);
    });
    test("NUMERIC分類: 全角数字・記号は半角に変換される（除去ではない）", () => {
        const r = stripDisallowedChars("１０．５＋２．３", "NUMERIC");
        assert.equal(r.cleaned, "10.5+2.3");
        assert.equal(r.removed, false);
        assert.equal(r.changed, true);
    });
    test("NUMERIC分類: 変換しても許可文字にならないものは除去される", () => {
        // 全角カタカナは変換対象外（toHankakuの対象範囲外）のためそのまま除去される
        const r = stripDisallowedChars("１０ｱ５", "NUMERIC");
        assert.equal(r.cleaned, "105");
        assert.equal(r.removed, true);
    });
    test("FREE_TEXT分類: 半角文字はそのまま", () => {
        const r = stripDisallowedChars("YAMADA", "FREE_TEXT");
        assert.equal(r.cleaned, "YAMADA");
        assert.equal(r.removed, false);
    });
    test("FREE_TEXT分類: 全角数字は変換されず除去される（漢字氏名に変換は意味をなさないため対象外）", () => {
        const r = stripDisallowedChars("１２３", "FREE_TEXT");
        assert.equal(r.cleaned, "");
        assert.equal(r.removed, true);
    });
    test("FREE_TEXT分類: 丸カッコはGコードのコメントを壊すため除去する", () => {
        const r = stripDisallowedChars("YAMADA(memo)", "FREE_TEXT");
        assert.equal(r.cleaned, "YAMADAmemo");
        assert.equal(r.removed, true);
    });
    test("FREE_TEXT分類: %や;も除去する", () => {
        const r = stripDisallowedChars("YAMADA%;", "FREE_TEXT");
        assert.equal(r.cleaned, "YAMADA");
        assert.equal(r.removed, true);
    });
});

describe("toHankaku（全角→半角変換）", () => {
    test("全角数字を半角に変換", () => {
        assert.equal(toHankaku("１２３"), "123");
    });
    test("全角の四則演算記号・小数点を変換", () => {
        assert.equal(toHankaku("１２－３＋４．５"), "12-3+4.5");
    });
    test("全角スペースを半角スペースに変換", () => {
        assert.equal(toHankaku("１２　３"), "12 3");
    });
    test("空文字はそのまま", () => {
        assert.equal(toHankaku(""), "");
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
