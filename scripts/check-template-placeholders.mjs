/**
 * check-template-placeholders.mjs
 * 全テンプレートの {{placeholder}} キーが replaceMap に定義されているかを静的検証するスクリプト。
 *
 * 使い方:
 *   node scripts/check-template-placeholders.mjs
 *
 * 終了コード:
 *   0 = 全テンプレートOK
 *   1 = 未解決キーあり（警告あり）
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── app.js から replaceMap のキーセットを抽出 ───────────────────────────────
// app.js を文字列として読み込み、replaceMap = { ... } 内のキーを正規表現で収集する
const appSrc = readFileSync(join(ROOT, "assets", "app.js"), "utf8");

// 1) 固定キー: replaceMap セクションを抽出してキーを収集
const replaceMapSectionRe = /const replaceMap\s*=\s*\{([\s\S]*?)\};/;
const rmMatch = appSrc.match(replaceMapSectionRe);
const staticKeys = new Set();

if (rmMatch) {
    const rmSection = rmMatch[1];
    // キー名パターン: 識別子または文字列
    const keyRe = /^\s*(?:([A-Za-z_\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F\uFF00-\uFFEF\u4E00-\u9FAF][A-Za-z0-9_\-\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F\uFF00-\uFFEF\u4E00-\u9FAF]*)|"([^"]+)")\s*:/gm;
    let m;
    while ((m = keyRe.exec(rmSection)) !== null) {
        staticKeys.add(m[1] || m[2]);
    }
}

// 2) 動的キー: replaceMap[key] = ... で追加されるもの（機械変数・Tube変数など）
//    data.js から機械定義のキーを抽出
const dataSrc = readFileSync(join(ROOT, "assets", "data.js"), "utf8");
const machineKeys = new Set();
// NCL044 ブロック内のキーを取得（最初の機械定義のキーを代表として使用）
const ncl044Match = dataSrc.match(/NCL044\s*:\s*\{([\s\S]*?)\},/);
if (ncl044Match) {
    const block = ncl044Match[1];
    const kr = /^\s+([A-Za-z_\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F\uFF00-\uFFEF\u4E00-\u9FAF][^:"\n]*?)\s*:/gm;
    let km;
    while ((km = kr.exec(block)) !== null) {
        machineKeys.add(km[1].trim().replace(/^"|"$/g, ""));
    }
}

// 3) Tube 動的キー（app.js のコードから直接収集）
const tubeKeys = new Set([
    "チューブ内径バイト",
    "チューブ_平底_仕上一行",
    "入力_外径",
    "入力_内径",
    "入力_長さ",
    "入力_R",
    "ドリル",
    "L",
    "母材幅",
    "チューブ_外径荒加工径",
    "チューブ_端面始点",
    "MC丸",
    "OD+0.1",
    "Drill-1",
    "ID+0.6",
    "OD-0.6",
    "L-R",
    "L-0.3",
    "L-0.5",
    "OD+2R",
    "OD+2R+0.1",
]);

// MH外径荒
staticKeys.add("MH外径荒");
// G12B ノーズR 分岐（workType G12B_G_ST_12175_8 で動的代入）
["G12B_ノーズRZ", "G12B_ノーズRN22", "G12B_ノーズRX"].forEach((k) => staticKeys.add(k));
tubeKeys.forEach((k) => staticKeys.add(k));
machineKeys.forEach((k) => staticKeys.add(k));

// M53/M61/M408 のようなスラッシュ入りキーを追加
staticKeys.add("M53/M61/M408");

// ─── 全テンプレートのプレースホルダーを抽出 ─────────────────────────────────
const templateDir = join(ROOT, "テンプレート");
const templateFiles = readdirSync(templateDir).filter((f) => f.endsWith(".js"));

let totalIssues = 0;
const results = [];

for (const file of templateFiles.sort()) {
    const src = readFileSync(join(templateDir, file), "utf8");
    const placeholders = [...src.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
    const unique = [...new Set(placeholders)];

    const missing = unique.filter((k) => !staticKeys.has(k));

    results.push({ file, total: unique.length, missing });
    totalIssues += missing.length;
}

// ─── レポート出力 ────────────────────────────────────────────────────────────
console.log("\n=== テンプレート整合チェック結果 ===\n");
console.log(`既知の replaceMap キー数 : ${staticKeys.size}`);
console.log(`チェック対象テンプレート : ${templateFiles.length}件\n`);

let hasError = false;
for (const r of results) {
    if (r.missing.length > 0) {
        hasError = true;
        console.log(`❌  ${r.file}`);
        r.missing.forEach((k) => console.log(`      未定義キー: {{${k}}}`));
    } else {
        console.log(`✅  ${r.file}  (${r.total}キー)`);
    }
}

console.log("\n─────────────────────────────────────");
if (hasError) {
    console.log(`\n⚠  未解決プレースホルダーがあります (計${totalIssues}件)。app.js の replaceMap を確認してください。`);
    process.exit(1);
} else {
    console.log("\n✅ 全テンプレート OK — 未解決プレースホルダーはありません。");
    process.exit(0);
}
