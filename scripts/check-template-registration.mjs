/**
 * check-template-registration.mjs
 * テンプレートJSの「結線漏れ」を検出する、作る側専用の静的チェック。
 * 実際の画面（アプリ本体）の動きには一切影響しない。
 *
 * 検証する2点:
 *   (A) 読込漏れ … テンプレート/*.js が gui-v2.html の <script> で読み込まれているか。
 *       追加したのに <script> 追加を忘れると、そのテンプレは実行時に未定義になる。
 *   (B) 孤立テンプレ … 各 `const template_XXX` がどこかから参照されているか。
 *       registerWorkType(template: …) にも behavior（logic-v2.js）にも使われていない
 *       テンプレは「ファイルはあるが workType 登録も結線も無い」宙に浮いた状態。
 *
 * ※ 草稿の `.nc` ファイルは対象外（<script> 未登録が正常）。ここでは `.js` のみを見る。
 *
 * 使い方:
 *   node scripts/check-template-registration.mjs
 * 終了コード:
 *   0 = すべて結線済み / 1 = 読込漏れまたは孤立テンプレあり
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APP_DIR = join(ROOT, "NC-PROG-GEN");
const ASSETS_DIR = join(APP_DIR, "assets");
const TEMPLATE_DIR = join(APP_DIR, "テンプレート");

const problems = [];

// テンプレート .js ファイル一覧
const templateFiles = readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith(".js"));

// ─── (A) gui-v2.html の <script src="テンプレート/xxx.js"> を抽出して突き合わせ ──
const html = readFileSync(join(APP_DIR, "gui-v2.html"), "utf8");
const referenced = new Set();
for (const m of html.matchAll(/<script\s+[^>]*src\s*=\s*"テンプレート\/([^"]+)"/g)) {
    referenced.add(m[1]);
}
for (const f of templateFiles.sort()) {
    if (!referenced.has(f)) {
        problems.push(`読込漏れ: テンプレート/${f} が gui-v2.html の <script> に未登録です`);
    }
}

// ─── (B) const template_XXX の参照有無（宣言以外に参照があるか） ──────────────
// assets/*.js とテンプレート/*.js を全結合して参照回数を数える
const scanFiles = [
    ...readdirSync(ASSETS_DIR)
        .filter((f) => f.endsWith(".js"))
        .map((f) => join(ASSETS_DIR, f)),
    ...templateFiles.map((f) => join(TEMPLATE_DIR, f)),
];
const combined = scanFiles.map((p) => readFileSync(p, "utf8")).join("\n");

// テンプレJS 内の全 `const template_XXX` を収集（var 名 -> 宣言ファイル）
const declared = new Map();
for (const f of templateFiles) {
    const src = readFileSync(join(TEMPLATE_DIR, f), "utf8");
    for (const m of src.matchAll(/\bconst\s+(template_\w+)/g)) {
        declared.set(m[1], f);
    }
}

for (const [varName, file] of [...declared.entries()].sort()) {
    const total = (combined.match(new RegExp("\\b" + varName + "\\b", "g")) || []).length;
    const decls = (combined.match(new RegExp("\\bconst\\s+" + varName + "\\b", "g")) || []).length;
    const used = total - decls;
    if (used <= 0) {
        problems.push(
            `孤立テンプレ: ${varName}（${file}）が宣言のみで未参照です。` +
                `registerWorkType(template: ${varName}) を追加するか、behavior から参照してください`
        );
    }
}

// ─── 結果表示 ───────────────────────────────────────────────
console.log("\n=== テンプレート結線チェック ===\n");
console.log(`テンプレート .js: ${templateFiles.length} 件 / gui-v2.html 参照: ${referenced.size} 件`);
console.log(`宣言された template 変数: ${declared.size} 件`);

if (problems.length > 0) {
    console.log("\n❌ 結線漏れが見つかりました:\n");
    problems.forEach((p) => console.log("   - " + p));
    process.exit(1);
}
console.log("\n✅ すべてOK — テンプレは全て読み込まれ、宙に浮いた template 変数はありません。");
process.exit(0);
