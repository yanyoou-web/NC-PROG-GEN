/**
 * scripts/golden/lib/run-case.mjs
 *
 * ゴールデンケース1件を実行し、スナップショット対象の文字列を返す。
 *
 * ケースは `{ machine, wizardState }` の形（wizardState はデフォルト値からの上書き分のみ）。
 * デフォルト値とマージして本物の buildInputFromState() に通すことで、
 * 実際にウィザードを操作した場合と同じ input オブジェクトを再現する。
 */

import { loadAppContext } from "./load-app-context.mjs";

/**
 * @param {{ machine: string, wizardState?: object }} caseDef
 * @returns {{ isError: boolean, snapshotText: string, raw: { displayHtml: string, plainText: string|null } }}
 */
export function runCase(caseDef) {
    const { context, defaultWizardState } = loadAppContext();

    context.wizardState = { ...defaultWizardState, ...(caseDef.wizardState || {}) };
    const input = context.buildInputFromState();

    // 本番の gui-v2.js runGeneration() と同じ手順:
    // generateGCode を呼ぶ直前に currentInternalStyle を同期させる（logic-v2.js が参照するため）。
    context.currentInternalStyle = input.internalStyle || "";

    const raw = context.generateGCode(input, caseDef.machine);
    const isError = raw.plainText === null || raw.plainText === undefined;

    // 生成エラー時は plainText が無いため、displayHtml（エラーメッセージ文言）をゴールデン化する。
    // 先頭に "ERROR:" を付けることで、成功⇔エラーの切り替わり自体もテキスト差分として検知できるようにする。
    const snapshotText = isError ? `ERROR:\n${raw.displayHtml}` : raw.plainText;

    return { isError, snapshotText, raw };
}
