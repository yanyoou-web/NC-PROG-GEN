/**
 * scripts/golden/lib/load-app-context.mjs
 *
 * gui-v2.html と同じスクリプト読み込み順で、アプリ本体（assets/*.js とテンプレート群）を
 * 1つの vm コンテキストへロードし、generateGCode を直接呼び出せるようにする。
 * ゴールデンスナップショットテストの共有ハーネス。
 *
 * 読み込み順（.cursor/rules/nc-project-rules.mdc に準拠）:
 *   data-v2.js → i18n-v2.js → テンプレート/*.js → blocks-v2.js →
 *   validators-v2.js → gui-v2.js → logic-v2.js
 * preview-v2.js は generateGCode より後に読み込まれる（＝依存されない）ため対象外。
 *
 * document / window はブラウザ相当のものを用意せず、最小限のスタブのみ渡す。
 * gui-v2.js はトップレベルで document.addEventListener("DOMContentLoaded", ...) を
 * 1箇所だけ呼んでいる（それ以外のDOM操作はすべて関数内）ため、no-opスタブで足りる。
 *
 * 唯一の例外が validators-v2.js の gcodeDisplayHtmlToPlainText()（generateGCode の最終行で
 * displayHtml→plainText 変換に使われる）で、document.createElement("div") に innerHTML を
 * セットして innerText を読む実DOM依存の実装になっている。Chromiumで実測したところ、
 * document に never appendされない（=描画されない）detached な要素では innerText は
 * textContent と完全に一致する（レイアウト計算が発生しないため <br> 等の改行挿入も起きない）。
 * このアプリが実際に生成する displayHtml に現れるタグは <span class="..."> のみ、
 * エンティティは escapeHtml() が出す5種類のみ（コード全文検索で確認済み）なので、
 * その範囲に絞った軽量な代替実装 htmlFragmentToText() で実ブラウザと同じ結果を再現する。
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, "..", "..", "..", "NC-PROG-GEN");
const ASSETS_DIR = path.join(APP_DIR, "assets");
const TEMPLATE_DIR = path.join(APP_DIR, "テンプレート");

function listScriptFilesInLoadOrder() {
    const templateFiles = fs
        .readdirSync(TEMPLATE_DIR)
        .filter((f) => f.endsWith(".js"))
        .sort()
        .map((f) => path.join(TEMPLATE_DIR, f));

    return [
        path.join(ASSETS_DIR, "data-v2.js"),
        path.join(ASSETS_DIR, "i18n-v2.js"),
        ...templateFiles,
        path.join(ASSETS_DIR, "blocks-v2.js"),
        path.join(ASSETS_DIR, "validators-v2.js"),
        path.join(ASSETS_DIR, "gui-v2.js"),
        path.join(ASSETS_DIR, "logic-v2.js"),
    ];
}

/**
 * document.createElement("div").innerHTML = X; の後に .innerText / .textContent を読んだ場合の、
 * detached要素での実ブラウザ挙動（Chromiumで実測確認済み）を再現する:
 * タグを除去し、既知のHTMLエンティティ（escapeHtml() が出す5種類のみ）を復元する。
 * 想定外のエンティティが残った場合は、静かに間違った値を返す代わりに例外で検知する。
 */
function htmlFragmentToText(html) {
    const withoutTags = String(html).replace(/<[^>]*>/g, "");
    const decoded = withoutTags
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&");
    const leftoverEntity = decoded.match(/&#?[a-zA-Z0-9]+;/);
    if (leftoverEntity) {
        throw new Error(
            `htmlFragmentToText: 未対応のHTMLエンティティ ${leftoverEntity[0]} を検出しました。` +
                `load-app-context.mjs の htmlFragmentToText にデコード処理を追加してください。`
        );
    }
    return decoded;
}

function createFakeDivElement() {
    let html = "";
    return {
        set innerHTML(value) {
            html = String(value);
        },
        get innerHTML() {
            return html;
        },
        get innerText() {
            return htmlFragmentToText(html);
        },
        get textContent() {
            return htmlFragmentToText(html);
        },
    };
}

function createDocumentStub() {
    return {
        addEventListener() {},
        getElementById() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        documentElement: {},
        createElement(tagName) {
            if (tagName !== "div") {
                throw new Error(`document.createElement("${tagName}") はテストハーネス未対応です。`);
            }
            return createFakeDivElement();
        },
    };
}

let cached = null;

/**
 * アプリ本体を読み込んだ vm コンテキストを返す（プロセス内でキャッシュし、複数ケースで使い回す）。
 *
 * 戻り値の `defaultWizardState` は、読み込み直後（＝ウィザードを一度も操作していない状態）の
 * `wizardState` のスナップショット。ケースごとに、これへ上書き分だけをマージした
 * オブジェクトを `context.wizardState` に代入してから `context.buildInputFromState()` を呼べば、
 * 本番のウィザード操作で組み立てられるのと同じ input オブジェクトを再現できる
 * （gui-v2.js の runGeneration() と同じ経路）。全フィールドをケース側で手書きしなくて済むため、
 * フィクスチャの記述ミスを減らせる。scripts/golden/lib/run-case.mjs がこの手順をラップしている。
 *
 * 呼び出し側は、generateGCode を呼ぶ直前に必ず
 *   context.currentInternalStyle = input.internalStyle || "";
 * も実行すること（logic-v2.js が参照するグローバル変数で、buildInputFromState には含まれない）。
 */
export function loadAppContext() {
    if (cached) return cached;

    const sandbox = {
        console,
        document: createDocumentStub(),
        window: {},
    };
    const context = vm.createContext(sandbox);

    for (const file of listScriptFilesInLoadOrder()) {
        const code = fs.readFileSync(file, "utf8");
        new vm.Script(code, { filename: file }).runInContext(context);
    }

    // wizardState はフラットなプリミティブ値のみを持つオブジェクトのためシャロークローンで十分。
    const defaultWizardState = { ...context.wizardState };

    cached = { context, defaultWizardState };
    return cached;
}
