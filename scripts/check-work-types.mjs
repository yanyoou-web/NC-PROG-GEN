/**
 * check-work-types.mjs
 * ワーク種別レジストリ（data-v2.js の workTypeRegistry + 各テンプレートJSの registerWorkType）
 * の整合性を検証する、作る側専用の静的チェック。実際の画面（アプリ本体）の動きには影響しない。
 *
 * 段階移行フェーズ1〜3の完了条件を機械的に守るためのもの。特に重要なのは:
 *   「レジストリから自動生成した径マップが、リファクタ前のハードコード値と完全一致すること」
 * を全ワーク種別（ゴールデン未カバーの種別を含む）について保証する点。
 *
 * 下記 EXPECTED_* は、リファクタ前 logic-v2.js のマップリテラルをそのまま凍結コピーしたもの。
 * 自動生成マップ（レジストリ由来）とこれを突き合わせることで、テンプレート側メタデータの
 * 転記ミスや、createWorkTypeValueMap の不具合を検出する。
 *
 * 使い方:
 *   node scripts/check-work-types.mjs
 * 終了コード:
 *   0 = すべてOK / 1 = 不整合あり
 */

import vm from "node:vm";
import assert from "node:assert/strict";
import { loadAppContext } from "./golden/lib/load-app-context.mjs";

// ─── リファクタ前の凍結コピー（logic-v2.js の元リテラル） ───────────────────────
const EXPECTED_WORK_ID_MAP = {
    M40: 22.0, M22: 10.0, M18: 8.0, M15: 6.0, M12: 4.0, G78: 16.0,
    M40_MH: 22.0, M22_MH: 10.0, M18_MH: 8.0, M15_MH: 6.0, M12_MH: 4.0, G78_MH: 16.0,
    G18_40: 4.0, G18_42: 4.15, G18_62: 6.2, G18_655: 6.55, G18_6175: 6.175,
    G18_40_MH: 4.0, G18_42_MH: 4.15, G18_62_MH: 6.2, G18_655_MH: 6.55, G18_6175_MH: 6.175,
    M42X3_25175: 25.175, M42X3_25175_20: 20.0, M42X3_25175_22: 22.0, M42X3_25175_16: 16.0,
    G12B_G_ST_12175_8: 8.0,
    TOMESEN_M16: 8.0, TOMESEN_M18: 10.0, TOMESEN_M22: 12.0, TOMESEN_M24: 16.0, TOMESEN_M35: 22.0,
    S_G12: 10.0, S_G38: 8.0, S_G78: 16.0, S_M12: 4.4, S_M15: 6.5,
    G78_ST_20175: 20.175, G78_ST_20175_16: 16.0,
};

const EXPECTED_FLAT_BOTTOM_TOOL_DIA_MM = {
    M40: 16.0, M22: 8.0, M18: 8.0, M15: 6.0, G78: 16.0,
    G18_62: 4.0, G18_655: 4.0, G18_6175: 4.0, G18_62_MH: 4.0, G18_655_MH: 4.0, G18_6175_MH: 4.0,
    M42X3_25175: 16, M42X3_25175_20: 16, M42X3_25175_22: 16, M42X3_25175_16: 16,
    G12B_G_ST_12175_8: 8,
    TOMESEN_M16: 8, TOMESEN_M18: 8, TOMESEN_M22: 8, TOMESEN_M24: 16, TOMESEN_M35: 16,
    S_G12: 8, S_G38: 6, S_G78: 16, S_M12: 4, S_M15: 6,
    G78_ST_20175: 16, G78_ST_20175_16: 16,
};

const EXPECTED_DRILL_DIA_MAP = {
    M40: 14.0, G78: 14.0, M22: 7.0, M18: 7.0, M15: 3.3, M12: 4.05,
    M40_MH: 14.0, G78_MH: 14.0, M22_MH: 7.0, M18_MH: 7.0, M15_MH: 3.3, M12_MH: 4.05,
    G18_40: 4.05, G18_42: 4.15, G18_62: 4.15, G18_655: 4.15, G18_6175: 4.15,
    G18_40_MH: 4.05, G18_42_MH: 4.15, G18_62_MH: 4.15, G18_655_MH: 4.15, G18_6175_MH: 4.15,
    M42X3_25175: 25.175, M42X3_25175_20: 20.0, M42X3_25175_22: 22.0, M42X3_25175_16: 16.0,
    M8_21: 2.1, M8_31: 3.0, J_M8_300: 3.0, J_M8_200: 2.0,
    G12B_G_ST_12175_8: 7.0,
    TOMESEN_M16: 7.0, TOMESEN_M18: 7, TOMESEN_M22: 10.7, TOMESEN_M24: 14, TOMESEN_M35: 14,
    S_G12: 7.0, S_G38: 7.0, S_G78: 14.0, S_M12: 3.3, S_M15: 3.3,
    G78_ST_20175: 14.0, G78_ST_20175_16: 14.0,
    Tube: null,
};

// 値が null / undefined のキーを落として比較用に正規化する
// （自動生成マップはそもそも null 値のキーを持たないため、凍結コピー側だけ落とせば揃う）
function dropNulls(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== null && v !== undefined) out[k] = v;
    }
    return out;
}

const problems = [];
function check(cond, msg) {
    if (!cond) problems.push(msg);
}

const { context } = loadAppContext();

// 自動生成マップとレジストリ内容を vm コンテキストから取り出す
const dump = JSON.parse(
    vm.runInContext(
        `JSON.stringify({
            WORK_ID_MAP,
            DRILL_DIA_MAP,
            FLAT_BOTTOM_TOOL_DIA_MM,
            registry: Object.keys(workTypeRegistry).map(function (id) {
                var d = workTypeRegistry[id];
                return { id: id, group: d.ui.group, label: d.ui.label, order: d.ui.order,
                         styles: d.ui.styles || [] };
            }),
            uiIds: WORK_TYPE_GROUPS.reduce(function (a, g) {
                return a.concat(g.items.map(function (it) { return it.value; }));
            }, [])
        })`,
        context
    )
);

// 1) 径マップが凍結コピーと完全一致すること（全ワーク種別・値レベル）
function diffMaps(name, actual, expected) {
    const exp = dropNulls(expected);
    try {
        assert.deepEqual(actual, exp);
    } catch {
        const keys = new Set([...Object.keys(actual), ...Object.keys(exp)]);
        for (const k of keys) {
            if (actual[k] !== exp[k]) {
                check(false, `${name}: ${k} が不一致（生成=${actual[k]} / 期待=${exp[k]}）`);
            }
        }
    }
}
diffMaps("WORK_ID_MAP", dump.WORK_ID_MAP, EXPECTED_WORK_ID_MAP);
diffMaps("DRILL_DIA_MAP", dump.DRILL_DIA_MAP, EXPECTED_DRILL_DIA_MAP);
diffMaps("FLAT_BOTTOM_TOOL_DIA_MM", dump.FLAT_BOTTOM_TOOL_DIA_MM, EXPECTED_FLAT_BOTTOM_TOOL_DIA_MM);

// 2) レジストリ整合性
const idsInRegistry = dump.registry.map((r) => r.id);
check(new Set(idsInRegistry).size === idsInRegistry.length, "registry: workType ID が重複しています");
for (const r of dump.registry) {
    check(Boolean(r.label && r.group), `registry: UI情報が不足（${r.id}）`);
    check(Array.isArray(r.styles) && r.styles.length > 0, `registry: 許可スタイルが未設定（${r.id}）`);
}

// 3) グループ内 order の重複がないこと
const byGroup = {};
for (const r of dump.registry) (byGroup[r.group] = byGroup[r.group] || []).push(r.order);
for (const [g, orders] of Object.entries(byGroup)) {
    check(new Set(orders).size === orders.length, `registry: グループ「${g}」内で order が重複しています`);
}

// 4) UI（WORK_TYPE_GROUPS）に出る全 workType がレジストリに存在し、逆も成り立つ（集合一致）
const regSet = new Set(idsInRegistry);
const uiSet = new Set(dump.uiIds);
for (const id of uiSet) check(regSet.has(id), `UI に出る workType がレジストリ未登録: ${id}`);
for (const id of regSet) check(uiSet.has(id), `レジストリにあるが UI に出ない workType: ${id}`);

// ─── 結果表示 ───────────────────────────────────────────────
console.log("\n=== ワーク種別レジストリ整合性チェック ===\n");
console.log(`登録ワーク種別数: ${idsInRegistry.length}`);
console.log(`WORK_ID_MAP: ${Object.keys(dump.WORK_ID_MAP).length} 件`);
console.log(`DRILL_DIA_MAP: ${Object.keys(dump.DRILL_DIA_MAP).length} 件`);
console.log(`FLAT_BOTTOM_TOOL_DIA_MM: ${Object.keys(dump.FLAT_BOTTOM_TOOL_DIA_MM).length} 件`);

if (problems.length > 0) {
    console.log("\n❌ 不整合が見つかりました:\n");
    problems.forEach((p) => console.log("   - " + p));
    process.exit(1);
}
console.log("\n✅ すべてOK — 自動生成マップはリファクタ前の値と完全一致、レジストリも整合しています。");
process.exit(0);
