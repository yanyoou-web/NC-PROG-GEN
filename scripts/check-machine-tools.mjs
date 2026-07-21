/**
 * check-machine-tools.mjs
 * テンプレートが使う「機械変数（工具キー・機械ブロック等）」のプレースホルダーが、
 * 全機種の機械定義（data-v2.js の machines）に存在するかを検証する、作る側専用の静的チェック。
 * 実際の画面（アプリ本体）の動きには一切影響しない。
 *
 * 検出したい危険:
 *   ある機械キーを NCL044 にだけ定義し、他機種へ追加し忘れると、その機種でテンプレの
 *   {{キー}} が未解決のまま残る（過去に {{スーパー}} でヒヤリとした事例）。
 *
 * 判定ルール（重要 — 設備差の扱い）:
 *   - キーが機械定義に「存在する」なら OK。値が空 "" でも OK。
 *     空 "" は「その設備に対応するコードが無い」ための意図的な設定であり、正常。
 *     （テンプレ側では {{キー}} が空文字に解決され、その工程が出力されないのが意図した挙動）
 *   - キーが機械定義に「存在しない（未定義）」場合のみエラー。
 *     意図的に無効化したいなら、その機種にも空 "" のキーを明示的に持たせること。
 *
 * 使い方:
 *   node scripts/check-machine-tools.mjs
 * 終了コード:
 *   0 = 全機械キーがすべての機種に存在 / 1 = いずれかの機種で未定義
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadAppContext } from "./golden/lib/load-app-context.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "..", "NC-PROG-GEN", "テンプレート");

const { context } = loadAppContext();
const machines = JSON.parse(vm.runInContext("JSON.stringify(machines)", context));
const machineNames = Object.keys(machines);

// 全機種のキーの和集合（＝機械変数の全体像）。テンプレの placeholder がこの集合に
// 含まれれば「機械変数のプレースホルダー」と判定する。
const allMachineKeys = new Set();
for (const m of machineNames) for (const k of Object.keys(machines[m])) allMachineKeys.add(k);

// 全テンプレの {{placeholder}} を走査し、機械変数キーだけを集める（key -> 使用テンプレ集合）
const usedMachineKeys = new Map();
for (const f of fs.readdirSync(TEMPLATE_DIR).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(TEMPLATE_DIR, f), "utf8");
    for (const m of src.matchAll(/\{\{([^}]+)\}\}/g)) {
        const key = m[1];
        if (allMachineKeys.has(key)) {
            if (!usedMachineKeys.has(key)) usedMachineKeys.set(key, new Set());
            usedMachineKeys.get(key).add(f);
        }
    }
}

const errors = [];
let intentionalEmptyCount = 0;
for (const [key, files] of [...usedMachineKeys.entries()].sort()) {
    const absent = machineNames.filter((m) => !(key in machines[m]));
    const empty = machineNames.filter((m) => key in machines[m] && machines[m][key] === "");
    if (empty.length) intentionalEmptyCount++;
    if (absent.length) {
        errors.push({ key, absent, files: [...files].sort() });
    }
}

console.log("\n=== 機械キー充足チェック ===\n");
console.log(`機種: ${machineNames.join(", ")}`);
console.log(`テンプレが使う機械キー: ${usedMachineKeys.size} 件`);
console.log(`うち一部機種で空 "" のキー（意図的・設備差）: ${intentionalEmptyCount} 件（正常）`);

if (errors.length > 0) {
    console.log("\n❌ 未定義の機械キーがあります（その機種で {{キー}} が未解決になります）:\n");
    for (const e of errors) {
        console.log(`   ■ ${e.key}`);
        console.log(`      未定義の機種: ${e.absent.join(", ")}`);
        console.log(`      使用テンプレ: ${e.files.join(", ")}`);
        console.log(
            `      → 対処: 上記機種の機械定義にキー "${e.key}" を追加（無効化したい機種は値を空 "" にする）`
        );
    }
    process.exit(1);
}

console.log("\n✅ すべてOK — テンプレが使う機械キーは全機種に存在します（空 \"\" は設備差による意図的設定）。");
process.exit(0);
