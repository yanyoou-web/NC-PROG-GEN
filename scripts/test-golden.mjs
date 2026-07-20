/**
 * test-golden.mjs
 * ゴールデン（スナップショット）テスト。
 *
 * scripts/golden/cases/**\/*.json を1件ずつ実行し、生成された Gコード全文（または
 * バリデーションエラー時のメッセージ）を scripts/golden/__snapshots__/ 配下の対応する
 * .txt ファイルと突き合わせる。generateGCode() は scripts/golden/lib/load-app-context.mjs が
 * 本番と同じスクリプト読み込み順で読み込む実物（本番コードの再実装ではない）。
 *
 * 使い方:
 *   node --test scripts/test-golden.mjs                    # 通常実行（差分があれば失敗）
 *   UPDATE_GOLDEN=1 node --test scripts/test-golden.mjs     # スナップショットを再生成
 *   または: npm run test:golden / UPDATE_GOLDEN=1 npm run test:golden
 *
 * ケースの追加方法は docs/golden-tests.md を参照。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCase } from "./golden/lib/run-case.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, "golden", "cases");
const SNAPSHOTS_DIR = path.join(__dirname, "golden", "__snapshots__");
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

function listCaseFilesRecursive(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listCaseFilesRecursive(full));
        } else if (entry.name.endsWith(".json")) {
            out.push(full);
        }
    }
    return out.sort();
}

const caseFiles = fs.existsSync(CASES_DIR) ? listCaseFilesRecursive(CASES_DIR) : [];

test("golden: ケースが1件以上存在する", () => {
    assert.ok(
        caseFiles.length > 0,
        `ゴールデンケースが1件も見つかりません: ${CASES_DIR}\nディレクトリの取り違え等がないか確認してください。`
    );
});

for (const caseFile of caseFiles) {
    const relPath = path.relative(CASES_DIR, caseFile);
    const snapshotFile = path.join(SNAPSHOTS_DIR, relPath.replace(/\.json$/, ".txt"));
    const snapshotRelPath = path.relative(path.join(__dirname, ".."), snapshotFile);

    test(`golden: ${relPath}`, () => {
        const caseDef = JSON.parse(fs.readFileSync(caseFile, "utf8"));
        assert.ok(caseDef.machine, `ケースファイルに machine がありません: ${relPath}`);

        const { snapshotText } = runCase(caseDef);

        if (UPDATE_GOLDEN) {
            fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
            fs.writeFileSync(snapshotFile, snapshotText, "utf8");
            return;
        }

        assert.ok(
            fs.existsSync(snapshotFile),
            `スナップショットがまだありません: ${snapshotRelPath}\n` +
                `新規ケースの場合は "UPDATE_GOLDEN=1 npm run test:golden" で生成してからレビューしてください。`
        );

        const expected = fs.readFileSync(snapshotFile, "utf8");
        assert.equal(
            snapshotText,
            expected,
            `ゴールデンスナップショットと出力が一致しません: ${snapshotRelPath}\n` +
                `意図した変更であれば "UPDATE_GOLDEN=1 npm run test:golden" で更新し、差分をレビューしてください。`
        );
    });
}
