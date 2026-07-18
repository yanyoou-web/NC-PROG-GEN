/**
 * test-e2e-validation.mjs
 * ウィザード画面(gui-v2.html)の入力チェック機能を、実際のブラウザを
 * 自動操作して検証するE2Eテスト（ブラウザ上での挙動を含む確認）。
 *
 * npm run check には含まれない（別途 Playwright のブラウザ本体が必要なため）。
 * 実行する場合は以下の手順:
 *   1. 初回のみ: npx playwright install chromium
 *   2. npm run test:e2e
 *
 * 各テストは独立した新しいタブ(page)で実行する（画面の入力途中状態が
 * 次のテストに残らないようにするため）。
 *
 * 終了コード:
 *   0 = すべて成功
 *   1 = 失敗あり
 */

import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(__dirname, "..", "Gコードジェネレータ");

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
};

// ─── 簡易静的ファイルサーバー（このテストのためだけに一時起動する） ─────────
function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            try {
                const urlPath = decodeURIComponent(req.url.split("?")[0]);
                const filePath = join(APP_DIR, urlPath);
                if (!filePath.startsWith(APP_DIR) || !existsSync(filePath)) {
                    res.writeHead(404);
                    res.end("Not found");
                    return;
                }
                const body = await readFile(filePath);
                const type = MIME_TYPES[extname(filePath)] || "application/octet-stream";
                res.writeHead(200, { "Content-Type": type });
                res.end(body);
            } catch (e) {
                res.writeHead(500);
                res.end(String(e));
            }
        });
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

// ─── テスト補助 ──────────────────────────────────────────────────────────────

const results = [];
const consoleErrors = [];

async function test(browser, name, fn) {
    const page = await browser.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {})); // beforeunload等のダイアログは自動で閉じる
    page.on("pageerror", (e) => consoleErrors.push(`[${name}] pageerror: ${e.message}`));
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`[${name}] console.error: ${msg.text()}`);
    });
    try {
        await fn(page);
        results.push({ name, ok: true });
        console.log(`✅  ${name}`);
    } catch (e) {
        results.push({ name, ok: false, error: e });
        console.log(`❌  ${name}`);
        console.log(`      ${e.message}`);
    } finally {
        await page.close();
    }
}

async function fillAndBlur(page, selector, value) {
    await page.fill(selector, value);
    await page.locator(selector).blur();
    await page.waitForTimeout(150);
}

// M18・通常スタイルで、アテ長さ→外径最大径→加工深さ の各画面を経由し、
// 図番・作成者入力画面までウィザードを進める
async function navigateToDrawNumScreen(page, baseUrl, { ateLength = "20", maxOD = "30.1", idDepth = "15" } = {}) {
    await page.goto(`${baseUrl}/gui-v2.html`);
    await page.click('[data-action="start"]');
    await page.waitForTimeout(150);
    await page.click('[data-action="select-machine"]');
    await page.waitForTimeout(150);
    await page.click('[data-action="select-worktype"][data-value="M18"]');
    await page.waitForTimeout(150);
    await page.click('[data-action="select-style"][data-value="Normal"]');
    await page.waitForTimeout(150);
    await page.fill("#ate-input", ateLength);
    await page.click('[data-action="next-atelength"]');
    await page.waitForTimeout(150);
    await page.fill("#maxod-direct-input", maxOD);
    await page.click('[data-action="next-maxod"]');
    await page.waitForTimeout(150);
    if (await page.locator("#id-depth").count()) await page.fill("#id-depth", idDepth);
    await page.waitForTimeout(120);
    await page.locator(".wiz-btn-primary[data-action]").first().click();
    await page.waitForTimeout(150);
    await page.waitForSelector("#worker-name", { timeout: 5000 });
}

// M18・通常スタイルで、アテ長さ入力画面まで進める（アテ長さ欄そのものを検証する用）
async function navigateToAteLengthScreen(page, baseUrl) {
    await page.goto(`${baseUrl}/gui-v2.html`);
    await page.click('[data-action="start"]');
    await page.waitForTimeout(150);
    await page.click('[data-action="select-machine"]');
    await page.waitForTimeout(150);
    await page.click('[data-action="select-worktype"][data-value="M18"]');
    await page.waitForTimeout(150);
    await page.click('[data-action="select-style"][data-value="Normal"]');
    await page.waitForTimeout(150);
    await page.waitForSelector("#ate-input", { timeout: 5000 });
}

async function main() {
    const server = await startServer();
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH が設定されている場合は、Playwright標準の
    // ブラウザダウンロードを使わず、そのパスのChromiumを直接使う
    // （社内共有PC等、ブラウザ本体が既に別の場所に用意されている環境向け）
    const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {};
    const browser = await chromium.launch(launchOptions);

    await test(browser, "画面読み込み時に共通チェック処理のグローバル関数が定義される", async (page) => {
        await page.goto(`${baseUrl}/gui-v2.html`);
        const globals = await page.evaluate(() => ({
            ncFormat: typeof ncFormat,
            evaluateFormula: typeof evaluateFormula,
            parseSimpleNumberOrFormula: typeof parseSimpleNumberOrFormula,
            stripDisallowedChars: typeof stripDisallowedChars,
            setupEraseGuard: typeof setupEraseGuard,
            generateGCode: typeof generateGCode,
        }));
        for (const [key, type] of Object.entries(globals)) {
            assert.equal(type, "function", `${key} が関数として定義されていること`);
        }
    });

    await test(browser, "数値欄: 全角数字を入力すると即座に消去され、枠線フラッシュのクラスが付く", async (page) => {
        await navigateToAteLengthScreen(page, baseUrl);
        await page.locator("#ate-input").click();
        await page.keyboard.type("２０．５"); // 全角の「20.5」
        await page.waitForTimeout(150);
        const val = await page.inputValue("#ate-input");
        assert.equal(val, "", "全角文字はすべて消去されること");
        const flashed = await page.evaluate(() =>
            document.getElementById("ate-input").classList.contains("wiz-input--hwflash")
        );
        assert.ok(flashed, "枠線フラッシュのクラスが付与されること");
    });

    await test(browser, "桁数値ID欄(v1a): 全角数字・半角英字を入力するとすべて消去される", async (page) => {
        await navigateToDrawNumScreen(page, baseUrl);
        await page.locator("#v1a").click();
        await page.keyboard.type("１２ab３４");
        await page.waitForTimeout(150);
        const val = await page.inputValue("#v1a");
        assert.equal(val, "", "数字（半角）以外はすべて消去されること");
    });

    await test(browser, "自由記述欄(作成者名): 丸カッコを入力すると除去される", async (page) => {
        await navigateToDrawNumScreen(page, baseUrl);
        await page.locator("#worker-name").click();
        await page.keyboard.type("YAMADA(memo)");
        await page.waitForTimeout(150);
        const val = await page.inputValue("#worker-name");
        assert.equal(val, "YAMADAmemo", "丸カッコが除去されること");
    });

    await test(browser, "IME変換中は妨げられず、確定した瞬間にのみ半角チェックが働く", async (page) => {
        await navigateToDrawNumScreen(page, baseUrl);
        await page.evaluate(() => {
            const el = document.getElementById("worker-name");
            el.value = "";
            el.dispatchEvent(new CompositionEvent("compositionstart"));
            el.value = "やまだ";
            el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
        });
        await page.waitForTimeout(100);
        const duringComposition = await page.evaluate(() => document.getElementById("worker-name").value);
        assert.equal(duringComposition, "やまだ", "変換中は値が消されずに残ること");
        await page.evaluate(() => {
            document.getElementById("worker-name").dispatchEvent(new CompositionEvent("compositionend"));
        });
        await page.waitForTimeout(150);
        const afterConfirm = await page.evaluate(() => document.getElementById("worker-name").value);
        assert.equal(afterConfirm, "", "変換確定後は全角文字が消去されること");
    });

    await test(browser, "数値欄: 計算式はフォーカスアウト時に計算結果へ自動的に置き換わる", async (page) => {
        await navigateToAteLengthScreen(page, baseUrl);
        await fillAndBlur(page, "#ate-input", "10.5+2.3");
        const val = await page.inputValue("#ate-input");
        assert.equal(val, "12.8", "計算式が計算結果に置き換わること");
        const invalid = await page.evaluate(() =>
            document.getElementById("ate-input").classList.contains("wiz-input--invalid")
        );
        assert.equal(invalid, false, "正しく計算できた場合はエラー表示にならないこと");
    });

    await test(
        browser,
        "数値欄: 「10//2」はエラーになり、値も書き換わらない（旧実装のコメット誤認識バグの再発防止）",
        async (page) => {
            await navigateToAteLengthScreen(page, baseUrl);
            await fillAndBlur(page, "#ate-input", "10//2");
            const val = await page.inputValue("#ate-input");
            assert.equal(val, "10//2", "無効な式は書き換えられずそのまま残ること");
            const invalid = await page.evaluate(() =>
                document.getElementById("ate-input").classList.contains("wiz-input--invalid")
            );
            assert.ok(invalid, "エラー状態として表示されること");
        }
    );

    await test(browser, "数値欄: ゼロ除算はエラーになる（Infinityが紛れ込まない）", async (page) => {
        await navigateToAteLengthScreen(page, baseUrl);
        await fillAndBlur(page, "#ate-input", "5/0");
        const invalid = await page.evaluate(() =>
            document.getElementById("ate-input").classList.contains("wiz-input--invalid")
        );
        assert.ok(invalid, "ゼロ除算はエラー状態として表示されること");
    });

    await test(
        browser,
        "最終ゲート: 画面のガードを迂回して作成者名に丸カッコを注入しても、生成時に検出され拒否される",
        async (page) => {
            await navigateToDrawNumScreen(page, baseUrl);
            await page.fill("#v1a", "12345");
            await page.evaluate(() => {
                document.getElementById("worker-name").value = "YAMADA)G0X0";
            });
            await page.locator(".wiz-btn-primary[data-action]").first().click();
            await page.waitForTimeout(500);
            const result = await page.evaluate(() => document.getElementById("resultArea")?.innerText || "");
            assert.ok(result.includes("生成エラー"), "生成エラーとして拒否されること");
            assert.ok(result.includes("作成者"), "エラー内容に作成者欄の指摘が含まれること");
        }
    );

    await test(browser, "正常系: 一連の入力でGコードが生成され、末尾に小数点が付与される", async (page) => {
        await navigateToDrawNumScreen(page, baseUrl, { ateLength: "20" });
        await page.fill("#v1a", "12345");
        await page.fill("#worker-name", "YAMADA");
        await page.locator(".wiz-btn-primary[data-action]").first().click();
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => document.getElementById("resultArea")?.innerText || "");
        assert.ok(result.includes("(ATE=20.)"), "整数値のアテ長さに末尾の小数点が付与されること（X10500問題対策）");
        assert.ok(!result.includes("生成エラー"), "正常な入力ではエラーにならないこと");
    });

    await browser.close();
    server.close();

    console.log("\n─────────────────────────────────────");
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length}件中 ${results.length - failed.length}件成功 / ${failed.length}件失敗`);
    if (consoleErrors.length > 0) {
        console.log(`\n⚠ ブラウザ側でエラーが発生していました:\n  ${consoleErrors.join("\n  ")}`);
    }
    if (failed.length > 0 || consoleErrors.length > 0) {
        process.exit(1);
    }
    process.exit(0);
}

main().catch((e) => {
    console.error("テスト実行中に予期しないエラーが発生しました:", e);
    process.exit(1);
});
