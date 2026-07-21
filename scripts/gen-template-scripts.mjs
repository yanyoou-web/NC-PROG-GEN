/**
 * gen-template-scripts.mjs
 * gui-v2.html のテンプレート <script> タグ群を、テンプレート/*.js の実ファイルから
 * 自動生成（同期）する、作る側専用のツール。
 *
 * gui-v2.html 内の下記マーカー行の「あいだ」を、テンプレートディレクトリの .js ファイル名
 * （ファイル名昇順。ゴールデンテストのハーネス load-app-context.mjs と同じ順）から生成した
 * <script src="テンプレート/xxx.js"></script> 群で置き換える:
 *
 *   <!-- TEMPLATE_SCRIPTS:START ... -->
 *   ...(ここが自動生成)...
 *   <!-- TEMPLATE_SCRIPTS:END -->
 *
 * これにより、新しいテンプレJSを追加したら本スクリプトを実行するだけで <script> 追加が済み、
 * 「HTMLへの追加忘れ（読込漏れ）」が構造的に起きなくなる。
 *
 * 使い方:
 *   node scripts/gen-template-scripts.mjs           # gui-v2.html を書き換える（同期）
 *   node scripts/gen-template-scripts.mjs --check    # 同期済みか検証のみ（差分あれば exit 1）
 *
 * テンプレの読み込み順序は互いに独立（各ファイルが自己完結し、registerWorkType の順序に
 * 依存しない）ため、ファイル名昇順で並べても生成結果は変わらない。
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(__dirname, "..", "NC-PROG-GEN");
const HTML_PATH = join(APP_DIR, "gui-v2.html");
const TEMPLATE_DIR = join(APP_DIR, "テンプレート");

const START = "<!-- TEMPLATE_SCRIPTS:START";
const END = "<!-- TEMPLATE_SCRIPTS:END";
const INDENT = "        "; // gui-v2.html の <script> と同じ 8 スペース

const checkOnly = process.argv.includes("--check");

const html = readFileSync(HTML_PATH, "utf8");
const lines = html.split("\n");

const startIdx = lines.findIndex((l) => l.includes(START));
const endIdx = lines.findIndex((l) => l.includes(END));

if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.error(
        `❌ gui-v2.html にマーカーが見つかりません（START/END）。\n` +
            `   テンプレート <script> 群を次のマーカーで囲ってください:\n` +
            `   ${INDENT}${START} ... -->\n${INDENT}${END} -->`
    );
    process.exit(1);
}

// テンプレート/*.js をファイル名昇順で
const templateFiles = readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

const generated = templateFiles.map((f) => `${INDENT}<script src="テンプレート/${f}"></script>`);

const current = lines.slice(startIdx + 1, endIdx);

const inSync = current.length === generated.length && current.every((l, i) => l === generated[i]);

if (checkOnly) {
    console.log("\n=== テンプレ <script> 同期チェック ===\n");
    if (inSync) {
        console.log(`✅ 同期済み — gui-v2.html のテンプレ <script> は ${generated.length} 件で一致しています。`);
        process.exit(0);
    }
    const cur = new Set(current.map((l) => l.trim()));
    const gen = new Set(generated.map((l) => l.trim()));
    const missing = [...gen].filter((l) => !cur.has(l));
    const extra = [...cur].filter((l) => !gen.has(l));
    console.log("❌ gui-v2.html のテンプレ <script> が実ファイルと同期していません。");
    if (missing.length) console.log("   追加が必要:\n" + missing.map((l) => "     " + l).join("\n"));
    if (extra.length) console.log("   余分（実ファイルなし/順序違い）:\n" + extra.map((l) => "     " + l).join("\n"));
    if (!missing.length && !extra.length) console.log("   （並び順が異なります）");
    console.log("\n   → `node scripts/gen-template-scripts.mjs` を実行して同期してください。");
    process.exit(1);
}

if (inSync) {
    console.log(`✅ 変更なし — 既に同期済み（${generated.length} 件）。`);
    process.exit(0);
}

const newLines = [...lines.slice(0, startIdx + 1), ...generated, ...lines.slice(endIdx)];
writeFileSync(HTML_PATH, newLines.join("\n"));
console.log(`✅ gui-v2.html を同期しました（テンプレ <script> ${generated.length} 件）。`);
process.exit(0);
