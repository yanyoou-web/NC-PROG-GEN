/**
 * check-referenced-files-exist.mjs
 * index.html / gui-v2.html が <script src="..."> / <link href="..."> で
 * 読み込むよう指定しているファイルが、実際にその場所に存在するかを検証する。
 *
 * 「保存してブラウザで確認する」作業のたびに、ファイルの追加漏れ・名前の
 * 設定ミスをその場で検出できるようにするための、作る側専用のチェック。
 * 実際にお使いになる画面（アプリ本体）の動きには一切影響しない。
 *
 * 使い方:
 *   node scripts/check-referenced-files-exist.mjs
 *
 * 終了コード:
 *   0 = 参照先ファイルはすべて存在する
 *   1 = 存在しないファイルへの参照あり
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APP_DIR = join(ROOT, "Gコードジェネレータ");

const HTML_FILES = ["index.html", "gui-v2.html"];

// <script src="..."> / <link ... href="..."> の参照パスを抽出する
// （外部URL(http://等)は対象外。ローカル相対パスのみを対象とする）
function extractReferencedPaths(html) {
    const paths = [];
    const scriptRe = /<script\s+[^>]*src\s*=\s*"([^"]+)"/gi;
    const linkRe = /<link\s+[^>]*href\s*=\s*"([^"]+)"/gi;
    let m;
    while ((m = scriptRe.exec(html)) !== null) paths.push(m[1]);
    while ((m = linkRe.exec(html)) !== null) paths.push(m[1]);
    return paths.filter((p) => !/^https?:\/\//i.test(p));
}

let hasError = false;
let totalChecked = 0;

console.log("\n=== 参照ファイル存在チェック結果 ===\n");

for (const htmlFile of HTML_FILES) {
    const htmlPath = join(APP_DIR, htmlFile);
    if (!existsSync(htmlPath)) {
        console.log(`❌  ${htmlFile}  (ファイル自体が見つかりません)`);
        hasError = true;
        continue;
    }
    const html = readFileSync(htmlPath, "utf8");
    const refs = extractReferencedPaths(html);
    const missing = refs.filter((rel) => {
        // HTML内のパス区切りは "/" 固定なので posix.normalize で正規化してから結合する
        const normalized = posix.normalize(rel);
        return !existsSync(join(APP_DIR, ...normalized.split("/")));
    });
    totalChecked += refs.length;

    if (missing.length > 0) {
        hasError = true;
        console.log(`❌  ${htmlFile}  (${refs.length}件中${missing.length}件見つからず)`);
        missing.forEach((p) => console.log(`      見つからないファイル: ${p}`));
    } else {
        console.log(`✅  ${htmlFile}  (${refs.length}件すべて確認できました)`);
    }
}

console.log("\n─────────────────────────────────────");
if (hasError) {
    console.log(
        "\n⚠  参照先が見つからないファイルがあります。ファイル名の設定やファイルの追加漏れを確認してください。"
    );
    process.exit(1);
} else {
    console.log(`\n✅ 全参照ファイルOK（計${totalChecked}件）— 見つからないファイルはありません。`);
    process.exit(0);
}
