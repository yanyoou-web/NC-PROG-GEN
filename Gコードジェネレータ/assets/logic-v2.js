/* NC Program Generator - logic.js
 * Gコード生成に必要な定数・計算・バリデーション・テンプレート解決
 *
 * !! このファイルはアプリ開発者向けです !!
 *    Gコードの数値（F値・Q値など）を変えたい場合は blocks.js を編集してください。
 *    テンプレートの Gコード内容を変えたい場合は テンプレート/ フォルダを編集してください。
 *
 * 依存（読み込み順）:
 *   data.js      … machines / tubeData
 *   blocks.js    … Gコードブロック生成関数
 *   app.js utils … wrapH / ncFormat / escapeHtml / gcodeDisplayHtmlToPlainText
 *   テンプレート群 … template_G78 / template_M40 / ...
 */
/* global wrapH, wrapHCalc, wrapHInput, wrapHMachine, ncFormat, escapeHtml, parseSimpleNumberOrFormula */
/* global gcodeDisplayHtmlToPlainText */
/* global getDrillShiageHGDRBlock, getDrillShiage10mmStepBlock, getIchimonjiBlock */
/* global getIchimonjiHirazokoBlock, getOkuBiteBlock, getOkuBiteBlockG18 */
/* global computeFlatBottomExitLine, combineTubeFlatBottomFinishLine */
/* global _ncDebugLastInput, _ncDebugLastReplaceMap, _ncDebugLastTemplateKeys, _ncDebugLastUnresolved */
/* global _ncDebugLastCalcValues, isDebugModeOn */
/* global $id, currentInternalStyle */
// ========== 生成ロジック ==========
/**
 * logic.js
 * Gコード生成に必要な定数・計算・バリデーション・テンプレート解決
 */

// --- 定数・ワーク定義マップ ---

// ワーク種別ごとの内径大径(D)定義マップ
const WORK_ID_MAP = {
    M40: 22.0,
    M22: 10.0,
    M18: 8.0,
    M15: 6.0,
    M12: 4.0,
    G78: 16.0,
    M40_MH: 22.0,
    M22_MH: 10.0,
    M18_MH: 8.0,
    M15_MH: 6.0,
    M12_MH: 4.0,
    G78_MH: 16.0,
    G18_40: 4.0,
    G18_42: 4.15,
    G18_62: 6.2,
    G18_655: 6.55,
    G18_6175: 6.175,
    G18_40_MH: 4.0,
    G18_42_MH: 4.15,
    G18_62_MH: 6.2,
    G18_655_MH: 6.55,
    G18_6175_MH: 6.175,
    M42X3_25175: 25.175,
    M42X3_25175_20: 20.0,
    M42X3_25175_22: 22.0,
    M42X3_25175_16: 16.0,
    G12B_G_ST_12175_8: 8.0,
    TOMESEN_M16: 8.0,
    TOMESEN_M18: 10.0,
    TOMESEN_M22: 12.0,
    TOMESEN_M24: 16.0,
    TOMESEN_M35: 22.0,
};

/** G18 HGDR 系（φ6.2 / φ6.55 / φ6.175）：同一のスタイル制限・DRILLSHIAGE（G74 仕上げブロック） */
function isG18HgdrSeriesWorkType(wt) {
    return (
        wt === "G18_62" ||
        wt === "G18_655" ||
        wt === "G18_6175" ||
        wt === "G18_62_MH" ||
        wt === "G18_655_MH" ||
        wt === "G18_6175_MH"
    );
}

/** G18系全種: {{DRILL_BLOCK}} を getDrillShiageHGDRBlock("G1") で固定（G74 ステップなし） */
function usesG18DrillShiageG1Block(wt) {
    return (
        wt === "G18_40" || wt === "G18_42" || wt === "G18_40_MH" || wt === "G18_42_MH" || isG18HgdrSeriesWorkType(wt)
    );
}

/** M12/M12_MH の仕上げがHGDRドリルかどうか（m12FinishTypeは "hgdr" と "halfmoon" の
 *  2通りの表記があるため、"hss"/"baito" 以外はすべてHGDR扱いとする）。
 *  HGDRはG18系と同じ物理ドリルのため、G1固定・ペック/ステップなし・刃長制限も共通。 */
function isM12HgdrFinish(wt, m12FinishType) {
    if (wt !== "M12" && wt !== "M12_MH") return false;
    const ft = m12FinishType || "hss";
    return ft !== "hss" && ft !== "baito";
}

/** M42X3-ST-G-25.175 系（ストレート / φ20段付 / φ22段付 / φ16段付） */
function isM42X3_25175WorkType(wt) {
    return wt === "M42X3_25175" || wt === "M42X3_25175_20" || wt === "M42X3_25175_22" || wt === "M42X3_25175_16";
}

/** G12B-G-ST-12.175-8 */
function isG12BWorkType(wt) {
    return wt === "G12B_G_ST_12175_8";
}

/** トメセン系（M16/M18/M22/M24/M35）: 使用可スタイル = Hirazoko / Ichimonji / Normal */
function isTomesenWorkType(wt) {
    return (
        wt === "TOMESEN_M16" ||
        wt === "TOMESEN_M18" ||
        wt === "TOMESEN_M22" ||
        wt === "TOMESEN_M24" ||
        wt === "TOMESEN_M35"
    );
}

/** M8 HSS 系（内径 φ2.1 / φ3.1）: ドリルロジック = getDrillShiage10mmStepBlock
 *  使用可スタイル: 2(一文字DR平底) / 4(ヨセ中継) / 6(交差穴加工径小) */
function isM8WorkType(wt) {
    return wt === "M8_21" || wt === "M8_31";
}

/** J_M8_300 (ASWD系): ドリルロジック = getDrillShiage10mmStepBlock
 *  ドリル深さは ASWD_SHOULDER_MM + CP + 1 で自動計算。CrossSmall スタイル固定 */
function isJM8ASWDWorkType(wt) {
    return wt === "J_M8_300" || wt === "J_M8_200";
}

/** 平底で使う内径ダイヤの公称径（mm）。テンプレの {{内径ダイヤΦ*}} と対応 */
const FLAT_BOTTOM_TOOL_DIA_MM = {
    M40: 16.0,
    M22: 8.0,
    M18: 8.0,
    M15: 6.0,
    G78: 16.0,
    // G18 HGDR 系: 加工径(6.x) とバイト径 4 が異なるため computeFlatBottomExitLine は X4.F.03 に分岐
    G18_62: 4.0,
    G18_655: 4.0,
    G18_6175: 4.0,
    G18_62_MH: 4.0,
    G18_655_MH: 4.0,
    G18_6175_MH: 4.0,
    // G18_40 / G18_42 / MH variants: ドリル仕上げ中心のため本マップに載せない（toolDia 未定義 → defaultLine の U-.2）
    // M42X3_25175 系: 内径ダイヤΦ16 使用。φ16段付のみ toolDia=idDia で U-.2、他は X16.F.03
    M42X3_25175: 16,
    M42X3_25175_20: 16,
    M42X3_25175_22: 16,
    M42X3_25175_16: 16,
    G12B_G_ST_12175_8: 8,
    // トメセン系: M16/M18/M22 → Φ8バイト、M24/M35 → Φ16バイト
    TOMESEN_M16: 8,
    TOMESEN_M18: 8,
    TOMESEN_M22: 8,
    TOMESEN_M24: 16,
    TOMESEN_M35: 16,
};

// ドリル径データベース
const DRILL_DIA_MAP = {
    M40: 14.0,
    G78: 14.0,
    M22: 7.0,
    M18: 7.0,
    M15: 3.3,
    M12: 4.05,
    M40_MH: 14.0,
    G78_MH: 14.0,
    M22_MH: 7.0,
    M18_MH: 7.0,
    M15_MH: 3.3,
    M12_MH: 4.05,
    G18_40: 4.05,
    G18_42: 4.15,
    G18_62: 4.15,
    G18_655: 4.15,
    G18_6175: 4.15,
    G18_40_MH: 4.05,
    G18_42_MH: 4.15,
    G18_62_MH: 4.15,
    G18_655_MH: 4.15,
    G18_6175_MH: 4.15,
    M42X3_25175: 25.175,
    M42X3_25175_20: 20.0,
    M42X3_25175_22: 22.0,
    M42X3_25175_16: 16.0,
    M8_21: 2.1,
    M8_31: 3.0,
    J_M8_300: 3.0,
    J_M8_200: 2.0,
    G12B_G_ST_12175_8: 7.0,
    TOMESEN_M16: 7.0,
    TOMESEN_M18: 7,
    TOMESEN_M22: 10.7,
    TOMESEN_M24: 14,
    TOMESEN_M35: 14,
    Tube: null,
};

/** ASWD ドリル肩の高さ (mm) — ドリル公称径をキーとする */
const ASWD_SHOULDER_MM = { 4.0: 0.96, 3.0: 0.70, 2.1: 0.50, 2.0: 0.50 };


// --- スタイル判定 ---

function isYoseMachiningStyle(style) {
    return style === "Yose";
}

function isYoseRelayStyle(style) {
    return style === "YoseRelay";
}

// --- 解決ヘルパー ---

function resolveWorkBigDiameter(input) {
    if (input.workType === "Tube" && typeof tubeData !== "undefined" && tubeData[input.tubeSpec]) {
        return parseFloat(tubeData[input.tubeSpec].id);
    }
    if (WORK_ID_MAP[input.workType] != null) {
        return parseFloat(WORK_ID_MAP[input.workType]);
    }
    return NaN;
}

function resolveYoseTotalLength(input) {
    // YoseRelay では専用入力欄のみを全長として扱う。
    return parseFloat(input.yoseTotalLength);
}

function resolveYosePartnerDepth(input) {
    return parseFloat(input.yosePartnerDepth);
}

function resolveDrillDia(input) {
    if (input.workType === "Tube") {
        const spec = input.tubeSpec || "";
        if (typeof tubeData !== "undefined" && tubeData[spec] && tubeData[spec].drill) {
            return parseFloat(String(tubeData[spec].drill).replace(/[^0-9.]/g, ""));
        }
        return NaN;
    }
    return DRILL_DIA_MAP[input.workType] || NaN;
}

// --- 算出ヘルパー ---

/**
 * 特殊加工のドリル深さ(Z)共通計算ロジック
 * @param {string} style - 加工スタイル ('Yose', 'CrossBig', 'CrossSmall' 等)
 * @param {number} drillDia - ドリル径
 * @param {number} baseDepth - 基準となる深さ (内径深さ or CP)
 * @returns {string|null} - 計算されたZ値 (toFixed(2)済み文字列) または null
 */
function calcSpecialDrillZ(style, drillDia, baseDepth) {
    if (!drillDia || isNaN(baseDepth)) return null;

    let result = null;

    // ヨセ加工の計算式: (0.3 * D) + 内径深さ - 0.4
    if (style === "Yose" || style === "YoseRelay") {
        result = 0.3 * drillDia + baseDepth - 0.4;
    }
    // 交差穴の計算式: CP + 1 + (0.3 * D)
    else if (style === "CrossBig" || style === "CrossSmall") {
        result = baseDepth + 1 + 0.3 * drillDia;
    }

    return result ? result.toFixed(2) : null;
}

function calcYoseRelayMetrics(input) {
    const totalLength = resolveYoseTotalLength(input);
    const partnerDepth = resolveYosePartnerDepth(input);
    const partnerDia = parseFloat(input.yoseD);
    const machinedDia = resolveWorkBigDiameter(input);
    const angleDeg = parseFloat(input.yoseAngle);
    // YoseRelay では DRILL_DIA_MAP の実ドリル径で先端長を計算する（M12 は HGDR φ4.05 固定）
    const drillDia = resolveDrillDia(input);
    if (
        [totalLength, partnerDepth, partnerDia, machinedDia, angleDeg].some(function (n) {
            return isNaN(n) || !isFinite(n);
        })
    ) {
        return null;
    }
    const rad = (angleDeg * Math.PI) / 180.0;
    const tanVal = Math.tan(rad);
    if (!isFinite(tanVal) || Math.abs(tanVal) < 1e-6) return null;

    const opposedDistance = totalLength - partnerDepth;
    // ヨセ長さ: (相手径/2 - 加工径/2) / tan(テーパ角度)
    const yoseLength = (partnerDia / 2.0 - machinedDia / 2.0) / tanVal;
    // 対ヨセ長さ: 対向口径距離 - ヨセ長さ
    const taiYoseLength = opposedDistance - yoseLength;
    const relayIdDepth = taiYoseLength + 1.0;
    const relayDrillDepth = isNaN(drillDia) ? NaN : taiYoseLength + 0.3 * drillDia;
    return {
        opposedDistance: opposedDistance,
        yoseLength: yoseLength,
        taiYoseLength: taiYoseLength,
        relayIdDepth: relayIdDepth,
        relayDrillDepth: relayDrillDepth,
    };
}

/**
 * 交差穴(加工径小)の内径深さを算出する。
 * A = sqrt((相手径/2)^2 - (加工径/2)^2)
 * B = 相手径/2 - A
 * 内径深さ = CP + B + 1
 */
function calcCrossSmallFinishDepth(input) {
    const cp = parseFloat(input.cpVal);
    const partnerDia = parseFloat(input.valPartnerD);
    const machinedDia = resolveWorkBigDiameter(input);
    if (
        [cp, partnerDia, machinedDia].some(function (n) {
            return isNaN(n) || !isFinite(n);
        })
    ) {
        return NaN;
    }
    const rPartner = partnerDia / 2.0;
    const rMachined = machinedDia / 2.0;
    const sq = rPartner * rPartner - rMachined * rMachined;
    if (!isFinite(sq) || sq < 0) return NaN;
    const A = Math.sqrt(sq);
    const B = rPartner - A;
    return Number((cp + B + 1.0).toFixed(3));
}

// --- バリデーション ---

/**
 * 横穴＆中バリ処理(CrossSmall)の相手径バリデーション
 * 相手径が加工径の ±0.5 以内の場合は加工不可（通常バイト加工を促す）
 * @returns {{ ok: boolean, msg: string }}
 */
function validateCrossSmallPartnerDia(input) {
    const partnerDia = parseFloat(String((input && input.valPartnerD) != null ? input.valPartnerD : "").replace(/,/g, ""));
    const machinedDia = resolveWorkBigDiameter(input || {});
    if (isNaN(partnerDia) || !isFinite(partnerDia) || isNaN(machinedDia) || !isFinite(machinedDia)) {
        return { ok: true, msg: "" };
    }
    const diff = partnerDia - machinedDia;
    if (Math.abs(diff) <= 0.5) {
        return {
            ok: false,
            msg: `相手径(Φ${partnerDia})と加工径(Φ${machinedDia.toFixed(3)})の差が ±0.5 以内です。通常バイト加工での生成をご利用ください。`,
        };
    }
    return { ok: true, msg: "" };
}

function validateYoseDDiameter(input) {
    const partnerDia = parseFloat(String((input && input.yoseD) != null ? input.yoseD : "").replace(/,/g, ""));
    const machinedDia = resolveWorkBigDiameter(input || {});
    const style = input && input.internalStyle;
    if (isNaN(partnerDia) || !isFinite(partnerDia) || isNaN(machinedDia) || !isFinite(machinedDia)) {
        return { ok: true, partnerDia: partnerDia, machinedDia: machinedDia, msg: "" };
    }
    // ヨセ中継: 相手径は内径加工寸法より大きいこと（従来どおり）
    if (isYoseRelayStyle(style)) {
        if (partnerDia <= machinedDia) {
            return {
                ok: false,
                partnerDia: partnerDia,
                machinedDia: machinedDia,
                msg: `相手径(Φd)はテンプレートの内径加工寸法(Φ${machinedDia.toFixed(3)})より大きい値にしてください。`,
            };
        }
    } else if (isYoseMachiningStyle(style)) {
        // ヨセ: 3 < Φd < 内径加工寸法
        if (partnerDia <= 3 || partnerDia >= machinedDia) {
            return {
                ok: false,
                partnerDia: partnerDia,
                machinedDia: machinedDia,
                msg: `相手径(Φd)は 3 より大きく、かつ内径加工寸法(Φ${machinedDia.toFixed(3)})より小さい値にしてください。`,
            };
        }
    }
    return { ok: true, partnerDia: partnerDia, machinedDia: machinedDia, msg: "" };
}

function validateYoseDField(showPopup) {
    const yoseEl = $id("yoseD");
    if (!yoseEl) return true;
    if (!isYoseMachiningStyle(currentInternalStyle) && !isYoseRelayStyle(currentInternalStyle)) {
        yoseEl.setCustomValidity("");
        return true;
    }
    const result = validateYoseDDiameter({
        yoseD: yoseEl.value,
        workType: ($id("workType") || {}).value || "",
        tubeSpec: ($id("tubeSpecSelect") || {}).value || "",
        internalStyle: currentInternalStyle,
    });
    yoseEl.setCustomValidity(result.ok ? "" : result.msg);
    if (!result.ok && showPopup) yoseEl.reportValidity();
    return result.ok;
}

// --- Gコード生成（メイン）---

function generateGCode(input, machineName) {
    // 1. ガード節: 機械定義チェック
    const machineConfig = machines[machineName];
    if (!machineConfig) {
        return {
            displayHtml: `<span style="color:red; font-weight:bold;">エラー: 機械定義 "${machineName}" が見つかりません。</span>`,
            plainText: null,
        };
    }

    if (input.workType === "Tonbo") {
        return {
            displayHtml:
                '<span style="color:red; font-weight:bold;">トンボテンプレートは廃止されました（実装中止）。テンプレートを M12〜M40・G78・チューブから選んでください。</span>',
            plainText: null,
        };
    }

    // ▼▼▼ 追加: 数値入力バリデーション (Step 3) ▼▼▼
    const errors = [];

    // ── テンプレート（ワーク種別）未選択チェック ──
    if (!input.workType) {
        errors.push("[テンプレート] が選択されていません。「テンプレート」欄からワーク種別を選択してください。");
    }

    // ── 加工スタイル未選択チェック（チューブは不要） ──
    if (input.workType && input.workType !== "Tube") {
        if (!input.internalStyle) {
            errors.push(
                "[加工スタイル] が選択されていません。内径スタイルドロワーから加工スタイルを選択してください。"
            );
        }
    }

    // ── M99P100 / X50.U8.処理（チューブは対象外。MH系はテンプレートに固定済みのため対象外） ──
    if (input.workType && input.workType !== "Tube" && !isMHWorkType(input.workType)) {
        const m99Mode = input.m99Mode;
        const validM99Modes = input.workType === "M40" ? ["on", "off", "x50u8"] : ["on", "off"];
        if (!validM99Modes.includes(m99Mode)) {
            errors.push(
                input.workType === "M40"
                    ? "[M99P100 / X50.U8.処理] が未選択です。プルダウンから選んでください。"
                    : "[M99P100] が未選択です。「使用しない」または「使用する」を選んでください。"
            );
        }
    }

    // ── 図番・作成者の必須チェック ──
    if (!input.drawNumA || String(input.drawNumA).trim() === "") {
        errors.push("[図番] が入力されていません。「PM-」の後の数字を入力してください。");
    }
    if (!input.workerName || String(input.workerName).trim() === "") {
        errors.push("[作成者] が入力されていません。作成者名を入力してください。");
    }

    // チェック対象リスト: { キー名, 表示名, 必須かどうか(省略可ならfalse) }
    const checkList = [
        { key: "maxOD", name: "外径最大径" },
        { key: "ateLength", name: "アテ長さ" },
        { key: "processNum", name: "工程No" },
    ];

    // 1. 共通項目のチェック（どの欄を直せばよいか明示）
    checkList.forEach((item) => {
        // MH系は外径最大径をテンプレート固定値で処理するため検証をスキップ
        if (item.key === "maxOD" && isMHWorkType(input.workType)) return;
        const val = input[item.key];
        if (val === "" || val === undefined || val === null) {
            errors.push(`[${item.name}] が未入力です。画面上の「${item.name}」欄に半角数値を入力してください。`);
        } else {
            const parsed = item.key === "maxOD" ? parseSimpleNumberOrFormula(val) : parseFloat(val);
            if (isNaN(parsed) || !isFinite(parsed)) {
                errors.push(
                    `[${item.name}] が数値として読めません。カンマや全角数字は使わず、例「30.1」のように半角で入力してください。`
                );
            }
        }
    });

    // チューブ以外（MH系を除く）: 外径最大径は正の値であること（0 や負は無効）
    if (input.workType !== "Tube" && !isMHWorkType(input.workType)) {
        const maxOdNum = parseSimpleNumberOrFormula(input.maxOD);
        if (!isNaN(maxOdNum) && maxOdNum <= 0) {
            errors.push(
                "[外径最大径] は 0 より大きい必要があります。アテ長さボタンで再計算するか、図面の値を確認してください。"
            );
        }
    }

    // アテ長さは正の値であること（0 や負は加工長さとして無効）
    {
        const ateLenNum = parseFloat(input.ateLength);
        if (!isNaN(ateLenNum) && ateLenNum <= 0) {
            errors.push("[アテ長さ] は 0 より大きい値を入力してください。");
        }
    }

    // 角あり: Gコード側で W（と外径）から角の径を計算するため、W・H 両方が必須
    if (input.calcMode === "corner") {
        const wStr = input.valCornW;
        const hStr = input.valCornH;
        const w = parseFloat(wStr);
        const h = parseFloat(hStr);
        if (wStr === "" || wStr === undefined || isNaN(w) || !isFinite(w)) {
            errors.push("[角あり] 「母材 幅 (W)」に半角数値を入力してください。（未入力だと角の径が計算されません）");
        } else if (w <= 0) {
            errors.push("[角あり] 「母材 幅 (W)」は 0 より大きい値を入力してください。");
        }
        if (hStr === "" || hStr === undefined || isNaN(h) || !isFinite(h)) {
            errors.push("[角あり] 「追加 高さ (H)」に半角数値を入力してください。（外径最大径の自動計算に必要です）");
        } else if (h <= 0) {
            errors.push("[角あり] 「追加 高さ (H)」は 0 より大きい値を入力してください。");
        }
    }

    // 2. 条件付き項目のチェック (加工スタイルごとの必須値)
    const style = input.internalStyle;

    // ヨセ加工の場合の必須チェック
    if (isYoseMachiningStyle(style) || isYoseRelayStyle(style)) {
        const styleLabel = isYoseRelayStyle(style) ? "ヨセ中継" : "ヨセ";
        if (isNaN(parseFloat(input.yoseD))) errors.push(`[${styleLabel}: 相手径] が入力されていません。`);
        if (isNaN(parseFloat(input.yoseAngle))) errors.push(`[${styleLabel}: テーパ角度] が入力されていません。`);
        const yoseDCheck = validateYoseDDiameter(input);
        if (!yoseDCheck.ok) {
            errors.push(`[${styleLabel}: 相手径(Φd)] ${yoseDCheck.msg}`);
        }
        // YoseRelay は内径深さを自動計算するため手入力必須にしない
        if (!isYoseRelayStyle(style) && input.workType !== "Tube" && isNaN(parseFloat(input.idDepth))) {
            errors.push(`[内径深さ] が入力されていません（${styleLabel}計算に必要）。`);
        }
        if (isYoseRelayStyle(style)) {
            if (isNaN(parseFloat(input.yosePartnerDepth))) {
                errors.push("[ヨセ中継: 相手径深さ] が入力されていません。");
            }
            const totalLen = resolveYoseTotalLength(input);
            if (isNaN(totalLen)) errors.push("[ヨセ中継: 全長] が数値で必要です。");
            const machinedDia = resolveWorkBigDiameter(input);
            if (isNaN(machinedDia)) errors.push("[加工径] が特定できません。ワーク種別と規格を確認してください。");
            const angle = parseFloat(input.yoseAngle);
            if (!isNaN(angle) && Math.abs(Math.tan((angle * Math.PI) / 180.0)) < 1e-6) {
                errors.push("[ヨセ: テーパ角度] が不正です（tanが0になる角度は使用不可）。");
            }
            const relayMetrics = calcYoseRelayMetrics(input);
            if (!relayMetrics) {
                errors.push("[ヨセ中継] 入力値から対向口径距離/対ヨセ長さを計算できません。");
            }
        }
    }

    // 交差穴・一文字DR(面取り)の場合の必須チェック
    // M12 Ichimonji (一文字DR平底) はドリル深さベースのため CP 不要
    const needsCp =
        style === "CrossBig" ||
        style === "CrossSmall" ||
        (style === "Ichimonji" && input.workType !== "M12" && input.workType !== "M12_MH" && !isM8WorkType(input.workType));
    if (needsCp) {
        if (isNaN(parseFloat(input.cpVal))) errors.push("[CP (交差穴位置)] が計算されていません。");
    }
    if (style === "CrossSmall") {
        if (isNaN(parseFloat(input.valPartnerD))) {
            errors.push("[相手径 (Φ)] が入力されていません。");
        } else {
            const crossSmallCheck = validateCrossSmallPartnerDia(input);
            if (!crossSmallCheck.ok) {
                errors.push(`[横穴＆中バリ処理: 相手径] ${crossSmallCheck.msg}`);
            }
        }
        // M8 系（M8_21 / M8_31）および ASWD 系（J_M8_300 等）は CrossSmall でも
        // calcCrossSmallFinishDepth を使わないため内径深さ自動計算チェックをスキップする
        if (!isM8WorkType(input.workType) && !isJM8ASWDWorkType(input.workType)) {
            const crossSmallDepth = calcCrossSmallFinishDepth(input);
            if (isNaN(crossSmallDepth) || !isFinite(crossSmallDepth)) {
                errors.push("[交差穴加工径小] 内径深さを計算できません。相手径/加工径/CP を確認してください。");
            }
        }
    }

    // Normal / Hirazoko / Ichimonji / CrossBig スタイルでは内径深さ必須かつ 7 超
    // （YoseRelay は自動計算・CrossSmall は交差穴CP から自動計算・Tube はチューブ長さを使用）
    if (
        style &&
        !isYoseMachiningStyle(style) &&
        !isYoseRelayStyle(style) &&
        style !== "CrossSmall" &&
        input.workType !== "Tube"
    ) {
        const idDepthNum = parseFloat(input.idDepth);
        if (isNaN(idDepthNum)) {
            errors.push("[内径深さ] が入力されていません。");
        } else if (idDepthNum <= 7) {
            errors.push("[内径深さ] は 7 より大きい値を入力してください。");
        }
    }
    // Yose スタイル（非 Tube）でも内径深さが入力されていれば 7 超チェックを適用
    if (isYoseMachiningStyle(style) && input.workType !== "Tube") {
        const idDepthNum = parseFloat(input.idDepth);
        if (!isNaN(idDepthNum) && idDepthNum <= 7) {
            errors.push("[内径深さ] は 7 より大きい値を入力してください。");
        }
    }

    // チューブ加工の場合の必須チェック（未選択／未定義データ／一覧に無い規格はここで止め、{{…}} 残りを防ぐ）
    if (input.workType === "Tube") {
        const spec = (input.tubeSpec || "").trim();
        if (!spec) {
            errors.push("[チューブ規格] を選択してください。");
        } else if (typeof tubeData === "undefined") {
            errors.push("[チューブ規格データ] が読み込まれていません。ページを再読み込みしてください。");
        } else if (!tubeData[spec]) {
            errors.push("[チューブ規格] が不正です。一覧から選び直してください。");
        }
        const lenStr = input.tubeLength;
        if (lenStr === "" || lenStr === undefined || isNaN(parseFloat(lenStr))) {
            errors.push("[チューブ長さ(L)] を選択してください。");
        }
    }

    const _isDbgMode = typeof isDebugModeOn === "function" && isDebugModeOn();
    let _debugValidationWarning = "";
    if (errors.length > 0) {
        if (!_isDbgMode) {
            // ▼ styleに column-span: all; を追加して、2段組みを貫通させる
            return {
                displayHtml: `
                <div style="background:#330000; border:2px solid #ff4444; padding:15px; color:#ffcccc; border-radius:6px; column-span: all;">
                    <h3 style="margin-top:0; color:#ff4444;">⚠ 生成エラー (入力値を確認してください)</h3>
                    <ul style="padding-left:20px; line-height:1.6;">
                        ${errors.map((msg) => `<li>${msg}</li>`).join("")}
                    </ul>
                </div>
            `,
                plainText: null,
            };
        }
        _debugValidationWarning = `<div style="background:#332200; border:2px solid #ffaa00; padding:10px; color:#ffeecc; border-radius:6px; margin-bottom:6px; column-span:all; font-size:0.85em;"><strong>🛠 デバッグモード: 未入力項目あり（強制出力）</strong><ul style="padding-left:18px; margin:4px 0 0 0; line-height:1.5;">${errors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}</ul></div>`;
    }
    // ▲▲▲ バリデーションここまで ▲▲▲

    // 2. 共通変数の準備
    const dt = new Date();
    const today = `${dt.getFullYear()}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getDate().toString().padStart(2, "0")}`;

    // ハイライト表示用ヘルパー
    // (utils.jsのwrapH等を想定)

    // --- 1. 数値計算 (最大径など) ---
    const valMaxOD = parseSimpleNumberOrFormula(input.maxOD);
    let calcMax1 = "";
    let calcMax2 = "";
    let calcCorner = "";
    let calcMainMax = "";

    if (!isNaN(valMaxOD)) {
        calcMax1 = (valMaxOD - 5.0).toFixed(3);
        const rawMax2 = valMaxOD + 3.0;
        calcMax2 = rawMax2.toFixed(3);

        calcMainMax = valMaxOD.toFixed(3);
        calcCorner = calcMax2;

        if (input.calcMode === "corner") {
            const W = parseFloat(input.valCornW);
            if (!isNaN(W)) {
                const diag = W * Math.SQRT2;
                calcMainMax = diag.toFixed(3);
                calcCorner = valMaxOD.toFixed(3);
                calcMax2 = (diag + 3.0).toFixed(3);
                calcMax1 = (diag - 5.0).toFixed(3);
            }
        }
    }

    // 図番結合
    let fullDrawStr = input.drawNumA;
    if (input.drawNumB) fullDrawStr += "-" + input.drawNumB;
    if (input.drawRev && input.drawRev !== "NONE") fullDrawStr += input.drawRev;

    // M99P100 出力制御:
    //   m99Mode "on"    → M99P100 を出力（全ワーク共通）
    //   m99Mode "x50u8" → X50.U8.処理 を適用（M40専用、M99P100 は出力しない）
    //   m99Mode "off"   → 何も出力しない
    let valM99 = input.m99Mode === "on" ? " M99P100" : "";

    // --- 2. ドリル深さ決定ロジック ---
    // const style = input.internalStyle; // 上で定義済み
    const baseIDDepth = parseFloat(input.idDepth);
    let finalDrillDepth = parseFloat(input.drillDepth);

    if ((style === "Hirazoko" || style === "Ichimonji") && !isNaN(baseIDDepth)) {
        finalDrillDepth = baseIDDepth + 0.1;
    } else if (isNaN(finalDrillDepth) && !isNaN(baseIDDepth)) {
        finalDrillDepth = baseIDDepth;
    }

    let finalFinishDepth = baseIDDepth;
    if ((style === "Hirazoko" || style === "Ichimonji") && !isNaN(baseIDDepth)) {
        finalFinishDepth = baseIDDepth + 0.2;
    }
    if (style === "CrossSmall") {
        const crossSmallDepth = calcCrossSmallFinishDepth(input);
        if (!isNaN(crossSmallDepth) && isFinite(crossSmallDepth)) {
            finalFinishDepth = crossSmallDepth;
        }
    }
    if (isYoseRelayStyle(style)) {
        const relayMetrics = calcYoseRelayMetrics(input);
        if (relayMetrics) {
            finalFinishDepth = relayMetrics.relayIdDepth;
            if (!isNaN(relayMetrics.relayDrillDepth) && isFinite(relayMetrics.relayDrillDepth)) {
                finalDrillDepth = relayMetrics.relayDrillDepth;
            }
        }
    }

    // ASWD テンプレートはドリル深さ = 肩高さ + CP + 1 で自動計算（ユーザー入力値を上書き）
    if (isJM8ASWDWorkType(input.workType)) {
        const drillDia = DRILL_DIA_MAP[input.workType];
        const cpNum = parseFloat(input.cpVal);
        finalDrillDepth = (ASWD_SHOULDER_MM[drillDia] || 0) + (isNaN(cpNum) ? 0 : cpNum) + 1;
    }

    // --- 3. 奥バイト / 一文字：テンプレート注入（EARLY=ドリル直後、LATE=バイト仕上げ後・BAITO のみ）---
    let rearChamferEarly = "";
    let okuBiteMentoriLateBlock = "";
    if (isJM8ASWDWorkType(input.workType)) {
        // ASWD ドリルは抜けバリを自動処理するため {{内バリ処理}} は常に空
        rearChamferEarly = "";
    } else if (style === "Ichimonji") {
        if (input.workType === "M12" || input.workType === "M12_MH" || isM8WorkType(input.workType)) {
            // M12/M8: 一文字DR平底 → 内径深さ基準で平底仕上げ
            rearChamferEarly = getIchimonjiHirazokoBlock(baseIDDepth, machineConfig);
        } else {
            rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
        }
    } else if (
        (input.workType === "G18_40" ||
            input.workType === "G18_42" ||
            input.workType === "G18_40_MH" ||
            input.workType === "G18_42_MH") &&
        style === "CrossSmall"
    ) {
        const partnerD = parseFloat(input.valPartnerD);
        if (!isNaN(partnerD)) {
            if (input.g18Profile === "drill_ichi_men") {
                // 一文字面取り → 一文字バリ取りブロック
                rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
            } else {
                // hgdr_oku → 奥バイトブロック（前置き）
                rearChamferEarly = getOkuBiteBlockG18(input.cpVal, machineConfig);
            }
        }
    } else if (
        (input.workType === "M12" || input.workType === "M12_MH") &&
        (style === "CrossSmall" || style === "CrossBig")
    ) {
        if (input.m12Profile === "drill_ichi_men") {
            // 一文字面取り (drill_ichi_men) → 一文字バリ取りブロック
            rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
        } else {
            // 奥バイト面取り (cross_oku / baito_oku)
            const partnerD = parseFloat(input.valPartnerD);
            if (input.okuBiteEnabled && !isNaN(partnerD) && partnerD >= 6.0) {
                const oku = getOkuBiteBlock(input.cpVal, machineConfig);
                const ft = input.m12FinishType || "hss";
                if (ft === "baito") okuBiteMentoriLateBlock = oku;
                else rearChamferEarly = oku;
            }
        }
    } else if (isM8WorkType(input.workType) && style === "CrossSmall") {
        const partnerD = parseFloat(input.valPartnerD);
        if (!isNaN(partnerD)) {
            if (input.m8Profile === "drill_ichi_men") {
                // 一文字面取り → 一文字バリ取りブロック
                rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
            } else {
                // hss_oku (奥バイト面取り) は M8 では使用不可 — resolveM8CrossFinishAndProfile が常に drill_ichi_men を返すため到達しない (予約)
                rearChamferEarly = getOkuBiteBlock(input.cpVal, machineConfig);
            }
        }
    }

    const flatBottomExitLine = computeFlatBottomExitLine(input);

    // --- 4. ヨセ加工（テーパ）ロジック ---
    let yosePath = "";
    let yoseBlock = "";

    if (isYoseMachiningStyle(style)) {
        // 大径(D)の決定
        const bigD = resolveWorkBigDiameter(input);

        const smallD = parseFloat(input.yoseD); // 小径 d
        const angle = parseFloat(input.yoseAngle);
        const depth = parseFloat(input.idDepth); // 通常ワークの内径深さ

        if (!isNaN(bigD) && !isNaN(smallD) && !isNaN(angle)) {
            // チューブの場合、深さが未入力なら長さを代用
            let effectiveDepth = depth;
            if (input.workType === "Tube" && isNaN(effectiveDepth)) {
                effectiveDepth = parseFloat(input.tubeLength);
            }

            if (!isNaN(effectiveDepth)) {
                // 計算ロジック
                const xEnd = smallD - 0.4;
                const rDiff = (bigD - xEnd) / 2.0;
                const rad = (angle * Math.PI) / 180;
                const zAdd = rDiff / Math.tan(rad);
                const zEnd = effectiveDepth + zAdd;
                const zInter = zEnd - 0.4;

                const Fmt = (n) => wrapH(ncFormat(n.toFixed(3)));
                const yoseBaseDepth = effectiveDepth;
                const H_depth = wrapH(ncFormat(yoseBaseDepth));

                // 共通パス
                const commonPath =
                    `X${Fmt(xEnd)}(d-0.4)Z-${Fmt(zInter)}(Zend-0.4)F.08\n` +
                    `Z-${Fmt(zEnd)}(Zend)F.2\n` +
                    `X${Fmt(bigD)}Z-${H_depth}S250F.03(STRAIGHT)\n` +
                    `W.1`;

                if (input.yoseMethod === "1") {
                    // ① バイト1本 (同時)
                    yosePath = `\n${commonPath}`;
                } else {
                    // ② バイト2本 (別工程)
                    const toolKey = "内径ダイヤΦ4";
                    const toolName = machineConfig[toolKey] ? wrapH(machineConfig[toolKey]) : "T0707";
                    const m51 = machineConfig["M51"] ? wrapH(machineConfig["M51"]) : "";
                    const m59 = machineConfig["M59"] ? wrapH(machineConfig["M59"]) : "";

                    const startX = (bigD - 1.0).toFixed(0) + ".";
                    const approachZ = (effectiveDepth - 1.0).toFixed(0) + ".";

                    yoseBlock =
                        `N102(IN-OKU)\n` +
                        `G0G40G97S350M3${toolName}\n` +
                        `X${startX}Z30.\n` +
                        `Z1.${m51}\n` +
                        `G1Z-${approachZ}F4.(STRAIGHT-1.0)\n` +
                        `X${Fmt(bigD)}Z-${H_depth}F.1(STRAIGHT)\n` +
                        `${commonPath}\n` +
                        `${flatBottomExitLine}\n` +
                        `G0Z30.${m59}\n` +
                        `G28U0W0M1`;
                }
            }
        }
    }

    const okuBiteMentoriBlock =
        (input.workType === "M12" || input.workType === "M12_MH") && (input.m12FinishType || "hss") === "baito"
            ? okuBiteMentoriLateBlock
            : rearChamferEarly;

    // --- 5. 置換マップ作成 ---
    // 置換キーの符号ルール（テンプレート追加時の運用規約）
    // 1) replaceMap は原則として「正値の意味値」を保持する（符号はテンプレート側で明示）。
    //    例: Z-{{入力_内径深さ}} / X{{入力_外径}}
    // 2) どうしても符号込みの計算値を渡す必要がある場合だけ、キー名で明示する。
    //    - *_ABS : 正値（絶対値ベース）
    //    - *_ZNEG: Zマイナス方向が確定した値（例: -31.0）
    // 3) 既存の互換キー（L, L-R, L-0.5 など）は当面維持し、新規テンプレから本規約を適用する。
    // ── 外径仕上ブロック（M12/M15/M18/M22/M40/G78/Tube 共通）
    //    通常・偏心 : X…(-X-) の1行のみ（F.3 行は省略）
    //    角あり     : 従来どおり2段
    const isCorner = input.calcMode === "corner";

    // ── ドリルブロック選択チェーン
    //   1) G18系・M12×HGDR  → getDrillShiageHGDRBlock("G1")  [同一物理ドリルのためG74なし固定]
    //   2) ASWD / M8系      → getDrillShiage10mmStepBlock()  [10mm 刻みステップ]
    //   3) M12/M12_MH × HSS → getDrillShiage10mmStepBlock()  [10mm 刻みステップ]
    //   4) それ以外（M12×バイト含む）→ getDrillShiageHGDRBlock(drillMode) [G74/G1 ユーザー選択]
    const drillBlockValue =
        usesG18DrillShiageG1Block(input.workType) || isM12HgdrFinish(input.workType, input.m12FinishType)
            ? getDrillShiageHGDRBlock(finalDrillDepth, "G1")
        : isJM8ASWDWorkType(input.workType) || isM8WorkType(input.workType)
            ? getDrillShiage10mmStepBlock(finalDrillDepth)
        : (input.workType === "M12" || input.workType === "M12_MH") && (input.m12FinishType || "hss") === "hss"
            ? getDrillShiage10mmStepBlock(finalDrillDepth)
        :   getDrillShiageHGDRBlock(finalDrillDepth, input.drillMode);

    const replaceMap = {
        // ── 入力ヘッダ情報
        入力_図番: wrapHInput(fullDrawStr),
        入力_工程No: wrapHInput(input.processNum),
        入力_作成者: wrapHInput(input.workerName),
        入力_アテ長さ: wrapHInput(ncFormat(input.ateLength)),
        入力_日付: wrapHInput(today),

        // ── 外径仕上
        "最大径-5": wrapHCalc(ncFormat(calcMax1)),
        "最大径+角": isCorner ? "X" + wrapHCalc(ncFormat(calcCorner)) : "X" + wrapHCalc(ncFormat(calcMax2)) + "(-X-)",
        "最大径+3": isCorner ? "X" + wrapHCalc(ncFormat(calcMax2)) + "F.3\n" : "",
        最大径50: "",

        // ── 内径
        入力_内径深さ: wrapHCalc(ncFormat(finalFinishDepth)),
        DRILL_BLOCK: drillBlockValue,
        内バリ処理: okuBiteMentoriBlock,

        // ── 内径バイト固定値
        BAITO_IN_S: wrapHMachine("500"),
        BAITO_IN_APX: wrapHMachine("5."),
        BAITO_IN_X: wrapHMachine("4."),
        BAITO_IN_CHAMFER_Z: wrapHMachine("3."),
        BAITO_IN_MID_Z: wrapHMachine("7.5"),

        // ── 平底
        平底_内径仕上出口: flatBottomExitLine,

        // ── その他
        M99P100: wrapHInput(valM99),

        // ── ヨセ
        ヨセパス: yosePath,
        ヨセブロック: yoseBlock,
    };

    // 機械変数のマッピング
    for (let key in machineConfig) {
        replaceMap[key] = machineConfig[key] ? wrapHMachine(machineConfig[key]) : "";
    }

    // MH外径荒: MH系テンプレートで外径荒/外径溝を切り替えるプレースホルダー
    {
        const _isMH = input.workType && input.workType.endsWith("_MH");
        const _mhToolKey = input.mhOdTool && _isMH ? input.mhOdTool : "外径荒";
        replaceMap["MH外径荒"] = _isMH
            ? machineConfig[_mhToolKey]
                ? wrapHMachine(machineConfig[_mhToolKey])
                : ""
            : "";
    }



    // --- 6. テンプレート選択・生成 ---
    let finalCode = "";

    if (input.workType === "Tube") {
        if (typeof template_Tube !== "undefined") finalCode = template_Tube;
        if (typeof tubeData !== "undefined" && tubeData[input.tubeSpec]) {
            const tSpec = tubeData[input.tubeSpec];
            const L = parseFloat(input.tubeLength);
            // 規格に toolKey がない場合は、標準的な "内径ダイヤΦ4" をデフォルトにします
            const toolKey = tSpec.toolKey || "内径ダイヤΦ4";
            const toolT = machineConfig[toolKey];

            if (!toolT) {
                return {
                    displayHtml: `<span style="color:red; font-weight:bold;">エラー: 機械定義に Tube加工用の工具 "${toolKey}" が見つかりません。</span>`,
                    plainText: null,
                };
            }
            replaceMap["チューブ内径バイト"] = wrapHMachine(toolT);

            replaceMap["チューブ_平底_仕上一行"] = wrapHCalc(
                combineTubeFlatBottomFinishLine(tSpec.toolDia, flatBottomExitLine)
            );

            const OD = tSpec.od;
            const ID = tSpec.id;
            const R = tSpec.r;
            const D_Drill_Str = tSpec.drill;
            replaceMap["入力_外径"] = wrapHInput(ncFormat(OD));
            replaceMap["入力_内径"] = wrapHInput(ncFormat(ID));
            replaceMap["入力_長さ"] = wrapHInput(ncFormat(L));
            replaceMap["入力_R"] = wrapHInput(ncFormat(R));
            replaceMap["ドリル"] = wrapHInput(D_Drill_Str);

            let drillVal = 0;
            if (D_Drill_Str && D_Drill_Str.startsWith("DR")) drillVal = parseFloat(D_Drill_Str.replace("DR", ""));

            replaceMap["L"] = wrapHCalc(ncFormat(L.toFixed(3)));
            replaceMap["母材幅"] = wrapHCalc(ncFormat((OD / Math.SQRT2).toFixed(3)));
            replaceMap["チューブ_外径荒加工径"] = wrapHCalc(ncFormat((OD + R + R + 2.6).toFixed(3)));
            replaceMap["チューブ_端面始点"] = input.m99p100 ? "" : wrapHCalc(ncFormat((OD + R + R + 4.6).toFixed(3)));
            const _mcNum = parseFloat(tSpec.MC);
            replaceMap["MC丸"] = input.m99p100
                ? !isNaN(_mcNum)
                    ? wrapHCalc(ncFormat(_mcNum.toFixed(3)))
                    : "テンプレート未設定"
                : "";
            replaceMap["OD+0.1"] = wrapHCalc(ncFormat((OD + 0.1).toFixed(3)));
            replaceMap["Drill-1"] = wrapHCalc(ncFormat((drillVal - 1.0).toFixed(3)));
            replaceMap["ID+0.6"] = wrapHCalc(ncFormat((ID + 0.6).toFixed(3)));
            replaceMap["OD-0.6"] = wrapHCalc(ncFormat((OD - 0.6).toFixed(3)));
            replaceMap["L-R"] = wrapHCalc(ncFormat((L - R).toFixed(3)));
            replaceMap["L-0.3"] = wrapHCalc(ncFormat((L - 0.3).toFixed(3)));
            replaceMap["L-0.5"] = wrapHCalc(ncFormat((L - 0.5).toFixed(3)));
            replaceMap["OD+2R"] = wrapHCalc(ncFormat((OD + R + R).toFixed(3)));
            replaceMap["OD+2R+0.1"] = wrapHCalc(ncFormat((OD + R + R + 0.1).toFixed(3)));
        }
    } else if (input.workType === "M40") {
        if (typeof template_M40 !== "undefined") finalCode = template_M40;
        if (input.m99Mode === "x50u8") {
            // X50.U8.処理: プレースホルダー代入前にテンプレート内の固定値を置換
            finalCode = finalCode.replace("G71U4.5R.5", "G71U8.0R.5");
            finalCode = finalCode.replace("N22X{{最大径-5}}F.35", "N22X56.F.35");
            // 残った {{最大径-5}} (line 20) を空にし、{{最大径50}} で "50." を出力
            replaceMap["最大径-5"] = "";
            replaceMap["最大径50"] = wrapHCalc("50.");
        }
    } else if (input.workType === "M22") {
        if (typeof template_M22 !== "undefined") finalCode = template_M22;
    } else if (input.workType === "M18") {
        if (typeof template_M18 !== "undefined") finalCode = template_M18;
    } else if (input.workType === "G12B_G_ST_12175_8") {
        if (typeof template_G12B_G_ST_12175_8 !== "undefined") finalCode = template_G12B_G_ST_12175_8;
        // 根本ノーズR あり/なし 分岐
        if (input.g12bNoseR === "r05") {
            replaceMap["G12B_ノーズRZ"]   = "Z-14.5\nG2X22.Z-15.R.5";
            replaceMap["G12B_ノーズRN22"] = "G1";
            replaceMap["G12B_ノーズRX"]   = "22.1";
        } else {
            replaceMap["G12B_ノーズRZ"]   = "Z-15.";
            replaceMap["G12B_ノーズRN22"] = "";
            replaceMap["G12B_ノーズRX"]   = "21.1";
        }
    } else if (input.workType === "M15") {
        if (typeof template_M15 !== "undefined") finalCode = template_M15;
    } else if (input.workType === "M8_21") {
        if (typeof template_M8_21 !== "undefined") finalCode = template_M8_21;
    } else if (input.workType === "M8_31") {
        if (typeof template_M8_31 !== "undefined") finalCode = template_M8_31;
    } else if (input.workType === "J_M8_300") {
        if (typeof template_J_M8_300 !== "undefined") finalCode = template_J_M8_300;
    } else if (input.workType === "J_M8_200") {
        if (typeof template_J_M8_200 !== "undefined") finalCode = template_J_M8_200;
    } else if (input.workType === "M40_MH") {
        if (typeof template_M40_MH !== "undefined") finalCode = template_M40_MH;
    } else if (input.workType === "M22_MH") {
        if (typeof template_M22_MH !== "undefined") finalCode = template_M22_MH;
    } else if (input.workType === "M18_MH") {
        if (typeof template_M18_MH !== "undefined") finalCode = template_M18_MH;
    } else if (input.workType === "M15_MH") {
        if (typeof template_M15_MH !== "undefined") finalCode = template_M15_MH;
    } else if (input.workType === "M12_MH") {
        const ft = input.m12FinishType || "hss";
        const m12mhv = ft === "baito" ? template_M12BAITO_MH : ft === "hss" ? template_M12HSS_MH : template_M12HGDR_MH;
        if (typeof m12mhv !== "undefined") finalCode = m12mhv;
    } else if (input.workType === "G78_MH") {
        if (typeof template_G78_MH !== "undefined") finalCode = template_G78_MH;
    } else if (input.workType === "M12") {
        const ft = input.m12FinishType || "hss";
        const m12v = ft === "baito" ? template_M12BAITO : ft === "hss" ? template_M12HSS : template_M12HGDR;
        if (typeof m12v !== "undefined") finalCode = m12v;
    } else if (input.workType === "G18_40") {
        if (typeof template_G18_40 !== "undefined") finalCode = template_G18_40;
    } else if (input.workType === "G18_42") {
        if (typeof template_G18_42 !== "undefined") finalCode = template_G18_42;
    } else if (input.workType === "G18_62") {
        if (typeof template_G18_62 !== "undefined") finalCode = template_G18_62;
    } else if (input.workType === "G18_655") {
        if (typeof template_G18_655 !== "undefined") finalCode = template_G18_655;
    } else if (input.workType === "G18_6175") {
        if (typeof template_G18_6175 !== "undefined") finalCode = template_G18_6175;
    } else if (input.workType === "G18_40_MH") {
        if (typeof template_G18_40_MH !== "undefined") finalCode = template_G18_40_MH;
    } else if (input.workType === "G18_42_MH") {
        if (typeof template_G18_42_MH !== "undefined") finalCode = template_G18_42_MH;
    } else if (input.workType === "G18_62_MH") {
        if (typeof template_G18_62_MH !== "undefined") finalCode = template_G18_62_MH;
    } else if (input.workType === "G18_655_MH") {
        if (typeof template_G18_655_MH !== "undefined") finalCode = template_G18_655_MH;
    } else if (input.workType === "G18_6175_MH") {
        if (typeof template_G18_6175_MH !== "undefined") finalCode = template_G18_6175_MH;
    } else if (input.workType === "M42X3_25175") {
        if (typeof template_M42X3_25175 !== "undefined") finalCode = template_M42X3_25175;
    } else if (input.workType === "M42X3_25175_20") {
        if (typeof template_M42X3_25175_20 !== "undefined") finalCode = template_M42X3_25175_20;
    } else if (input.workType === "M42X3_25175_22") {
        if (typeof template_M42X3_25175_22 !== "undefined") finalCode = template_M42X3_25175_22;
    } else if (input.workType === "M42X3_25175_16") {
        if (typeof template_M42X3_25175_16 !== "undefined") finalCode = template_M42X3_25175_16;
    } else if (input.workType === "TOMESEN_M16") {
        if (typeof template_TOMESEN_M16 !== "undefined") finalCode = template_TOMESEN_M16;
    } else if (input.workType === "TOMESEN_M18") {
        if (typeof template_TOMESEN_M18 !== "undefined") finalCode = template_TOMESEN_M18;
    } else if (input.workType === "TOMESEN_M22") {
        if (typeof template_TOMESEN_M22 !== "undefined") finalCode = template_TOMESEN_M22;
    } else if (input.workType === "TOMESEN_M24") {
        if (typeof template_TOMESEN_M24 !== "undefined") finalCode = template_TOMESEN_M24;
    } else if (input.workType === "TOMESEN_M35") {
        if (typeof template_TOMESEN_M35 !== "undefined") finalCode = template_TOMESEN_M35;
    } else {
        if (typeof template_G78 !== "undefined") finalCode = template_G78;
    }

    if (!finalCode) {
        return { displayHtml: "エラー: テンプレートが見つかりません", plainText: null };
    }

    // カバレッジ用: 置換前のテンプレートキーを抽出
    const _templateKeysRaw = [];
    {
        const _m = finalCode.matchAll(/\{\{([^}]+)\}\}/g);
        for (const x of _m) _templateKeysRaw.push(x[1]);
    }
    const _templateKeySet = new Set(_templateKeysRaw);

    // デバッグモード時にプレースホルダーとして残す対象: ユーザー数値入力から導出されるキーのみ
    // 設計上の空値（{{扉閉じ}}・{{ヨセパス}}・{{最大径+3}} 等）はスキップしない
    const _debugUserInputKeys = new Set([
        "最大径-5",
        "最大径+角",
        "入力_内径深さ",
        "入力_図番",
        "入力_工程No",
        "入力_作成者",
        "入力_アテ長さ",
        // Tube 系
        "入力_外径",
        "入力_内径",
        "入力_長さ",
        "入力_R",
        "L",
        "L-R",
        "L-0.3",
        "L-0.5",
        "OD+2R",
        "OD+2R+0.1",
        "OD+0.1",
        "OD-0.6",
        "ID+0.6",
        "Drill-1",
        "母材幅",
        "MC丸",
    ]);

    Object.keys(replaceMap).forEach((key) => {
        const val = replaceMap[key];
        // デバッグモード時: ユーザー入力由来のキーに限り、空値への置換をスキップして {{key}} を残す
        if (_isDbgMode && _debugUserInputKeys.has(key)) {
            const plain = gcodeDisplayHtmlToPlainText(String(val == null ? "" : val)).trim();
            if (plain === "") return;
        }
        finalCode = finalCode.split("{{" + key + "}}").join(val);
    });

    // 置換後に残った未解決キーを抽出
    const _unresolvedKeys = [];
    {
        const _m = finalCode.matchAll(/\{\{([^}]+)\}\}/g);
        for (const x of _m) _unresolvedKeys.push(x[1]);
    }

    // 未解決プレースホルダーを赤太字で強調
    if (_unresolvedKeys.length > 0) {
        finalCode = finalCode.replace(
            /\{\{([^}]+)\}\}/g,
            (_, k) => `<span class="h-val h-val--unresolved">{{${escapeHtml(k)}}}</span>`
        );
    }

    // デバッグ用: 最後の入力・解決結果を保持
    _ncDebugLastInput = input;
    _ncDebugLastReplaceMap = replaceMap;
    _ncDebugLastTemplateKeys = _templateKeySet;
    _ncDebugLastUnresolved = new Set(_unresolvedKeys);

    // デバッグ用: 中間算出値を保持
    {
        const _bigD = resolveWorkBigDiameter(input);
        const _drillDia = resolveDrillDia(input);
        const _yoseMetrics = isYoseRelayStyle(style) ? calcYoseRelayMetrics(input) : null;
        const _crossSmallDepth =
            style === "CrossSmall" && !isM8WorkType(input.workType) ? calcCrossSmallFinishDepth(input) : null;
        const _ft = input.m12FinishType || "hss";
        let _templateName = "template_" + input.workType;
        if (input.workType === "M12") {
            _templateName = "template_M12" + (_ft === "baito" ? "BAITO" : _ft === "hss" ? "HSS" : "HGDR");
        } else if (input.workType === "M12_MH") {
            _templateName = "template_M12" + (_ft === "baito" ? "BAITO" : _ft === "hss" ? "HSS" : "HGDR") + "_MH";
        }
        const _drillBlockKind = usesG18DrillShiageG1Block(input.workType) || isM12HgdrFinish(input.workType, input.m12FinishType)
            ? "getDrillShiageHGDRBlock(G1)"
            : isJM8ASWDWorkType(input.workType) || isM8WorkType(input.workType)
                ? "getDrillShiage10mmStepBlock"
            : (input.workType === "M12" || input.workType === "M12_MH") && _ft === "hss"
                ? "getDrillShiage10mmStepBlock"
                : "getDrillShiageHGDRBlock(" + (input.drillMode || "G74") + ")";
        _ncDebugLastCalcValues = {
            machineName,
            style,
            templateName: _templateName,
            calcMode: input.calcMode,
            drillBlockKind: _drillBlockKind,
            // 外径
            valMaxOD: isNaN(valMaxOD) ? null : valMaxOD,
            calcMax1,
            calcMax2,
            calcMainMax,
            calcCorner,
            isCorner: input.calcMode === "corner",
            // 深さ
            baseIDDepth: isNaN(baseIDDepth) ? null : baseIDDepth,
            finalDrillDepth: isNaN(finalDrillDepth) ? null : finalDrillDepth,
            finalFinishDepth: isNaN(finalFinishDepth) ? null : finalFinishDepth,
            // ワーク固有
            bigD: isNaN(_bigD) ? null : _bigD,
            drillDia: isNaN(_drillDia) ? null : _drillDia,
            crossSmallDepth: _crossSmallDepth != null && !isNaN(_crossSmallDepth) ? _crossSmallDepth : null,
            yoseRelayMetrics: _yoseMetrics,
            // その他
            fullDrawStr,
            valM99,
        };
    }

    return {
        displayHtml: _debugValidationWarning + finalCode,
        plainText: gcodeDisplayHtmlToPlainText(finalCode),
    };
}