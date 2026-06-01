/* NC Program Generator - app.js
 *
 * セクション構成（このファイルに残るもの）:
 *   utils … 汎用ユーティリティ（文字列・数値フォーマット）
 *   ui    … 画面操作・イベント処理
 *
 * 分離ファイル（index.html で app.js より前に読み込む）:
 *   data.js        … 機械定義・チューブ規格・ワーク定数マップ
 *   blocks.js      … Gコードブロック生成ロジック（Gコード担当者が編集可）
 *   logic.js       … Gコード生成ロジック（開発者向け）
 *
 * 分離ファイル（index.html で app.js の後に読み込む）:
 *   preview.js     … ツールパス描画エンジン
 *   debug.js       … デバッグパネル
 *
 * Do not reorder sections; dependencies follow this order. */
/* global _ncDebugLastInput, _ncDebugLastReplaceMap, _ncDebugLastTemplateKeys, _ncDebugLastUnresolved */
/* global _ncDebugLastCalcValues */
/* global renderDebugPanel, drawPreview, updatePreviewSticky, refreshPreviewUiI18n, isDebugModeOn */
/* global g_flashTimer, g_flashBlink, g_flashLineIdx, g_flashVisible */
/* global WORK_ID_MAP, FLAT_BOTTOM_TOOL_DIA_MM, DRILL_DIA_MAP, ASWD_SHOULDER_MM */
/* global isG18HgdrSeriesWorkType, usesG18DrillShiageG1Block, isM42X3_25175WorkType */
/* global isG12BWorkType, isTomesenWorkType, isM8WorkType, isJM8ASWDWorkType */
/* global isYoseMachiningStyle, isYoseRelayStyle */
/* global resolveWorkBigDiameter, resolveYoseTotalLength, resolveYosePartnerDepth, resolveDrillDia */
/* global calcSpecialDrillZ, calcYoseRelayMetrics, calcCrossSmallFinishDepth */
/* global validateCrossSmallPartnerDia, validateYoseDDiameter, validateYoseDField */
/* global generateGCode */
/* global getDrillShiageHGDRBlock, getDrillShiage10mmStepBlock, getIchimonjiBlock */
/* global getIchimonjiHirazokoBlock, getOkuBiteBlock, getOkuBiteBlockG18 */
/* global computeFlatBottomExitLine, combineTubeFlatBottomFinishLine */
// ========== utils ==========
/**
 * utils.js
 * 汎用ユーティリティ関数群
 */

// 文字列のエスケープ処理
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// NC旋盤用数値フォーマット (整数でも末尾にドットを付与)
function ncFormat(val) {
    if (val === "" || val === null || val === undefined) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";

    let s = num.toString();
    if (s.indexOf(".") === -1) {
        return s + ".";
    }
    return s;
}

// ハイライト用ラッパー
function normalizeHighlightAttr(attr) {
    return attr === "input" || attr === "machine" ? attr : "calc";
}

function isMCodeLike(val) {
    const s = String(val == null ? "" : val)
        .trim()
        .toUpperCase();
    // 例: M3 / M19 / M458 / M99P100
    return /^M\d+(?:\.\d+)?(?:P\d+)?$/.test(s);
}

function wrapH(val, attr) {
    if (val === "" || val === undefined) return "";
    if (isMCodeLike(val)) return escapeHtml(val);
    const kind = normalizeHighlightAttr(attr);
    return `<span class="h-val h-val--${kind}" data-hl-attr="${kind}">${escapeHtml(val)}</span>`;
}
function wrapHCalc(val) {
    return wrapH(val, "calc");
}
function wrapHInput(val) {
    return wrapH(val, "input");
}
function wrapHMachine(val) {
    return wrapH(val, "machine");
}

/**
 * 画面表示用HTML（ハイライトの span 等）から、機械送り・保存用のプレーンテキストへ。
 * タグ・HTMLコメントは出力に含めない。
 */
function gcodeDisplayHtmlToPlainText(htmlStr) {
    if (htmlStr == null || htmlStr === "") return "";
    const d = document.createElement("div");
    d.innerHTML = htmlStr;
    return (d.innerText || "").replace(/\u00a0/g, " ");
}

/** 直近の生成で得た機械送り用プレーンGコード（タグなし）。生成失敗時は null */
var _ncLastPlainGCode = null;
/** ハイライト属性ごとの表示ON/OFF（ON=色付き、OFF=通常文字） */
var _ncHighlightAttrEnabled = { calc: true, input: true, machine: true };

function applyHighlightFilterToResultArea() {
    const area = document.getElementById("resultArea");
    if (!area) return;
    ["calc", "input", "machine"].forEach(function (attr) {
        area.classList.toggle("h-off-" + attr, !_ncHighlightAttrEnabled[attr]);
    });
}

function bindHighlightFilterControls() {
    const pairs = [
        ["calc", "hlCalcToggle"],
        ["input", "hlInputToggle"],
        ["machine", "hlMachineToggle"],
    ];
    pairs.forEach(function (pair) {
        const attr = pair[0];
        const id = pair[1];
        const el = document.getElementById(id);
        if (!el || el.dataset.ncBound) return;
        el.checked = !!_ncHighlightAttrEnabled[attr];
        el.dataset.ncBound = "1";
        el.addEventListener("change", function () {
            _ncHighlightAttrEnabled[attr] = !!el.checked;
            applyHighlightFilterToResultArea();
        });
    });
    applyHighlightFilterToResultArea();
}

// --- 差分：ここから追加 ---
/**
 * 文字列の数式を計算して数値で返す
 */
function evaluateFormula(str) {
    if (!str) return "";
    // 半角数字、四則演算記号、ドット、カッコ以外を排除
    const sanitized = str.replace(/[^0-9+\-*/.()]/g, "");
    try {
        // 数式として評価
        const result = new Function("return " + sanitized)();
        return isNaN(result) ? str : result;
    } catch (e) {
        return str; // 計算できない場合はそのまま返す
    }
}
// --- 差分：ここまで ---

/**
 * 単純な数値、または四則演算式(+ - * / と括弧)を数値へ変換する。
 * 無効な式・文字列は NaN を返す。
 */
function parseSimpleNumberOrFormula(str) {
    if (str === null || str === undefined) return NaN;
    const raw = String(str).trim();
    if (!raw) return NaN;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
        return Number(raw);
    }
    if (!/^[0-9+\-*/().\s]+$/.test(raw)) {
        return NaN;
    }
    const evaluated = evaluateFormula(raw);
    return typeof evaluated === "number" && isFinite(evaluated) ? evaluated : NaN;
}


// ========== ui ==========
/* ui.js: 画面操作・イベント処理 */

const $id = (id) => document.getElementById(id);
const formatNum = (e) => (e.value = e.value.replace(/[^0-9]/g, ""));

// --- パネルノート開閉（HTML の onclick から呼ばれる UI ハンドラ）---

function toggleYoseRelayNote(evt) {
    if (evt) {
        evt.preventDefault();
        evt.stopPropagation();
    }
    const panel = $id("yoseRelayNotePanel");
    const btn = $id("yoseRelayNoteBtn");
    if (!panel || !btn) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}
function closeYoseRelayNote() {
    const panel = $id("yoseRelayNotePanel");
    const btn = $id("yoseRelayNoteBtn");
    if (!panel || !btn) return;
    if (!panel.hidden) panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
}
function toggleStyleNormalNote(evt) {
    if (evt) {
        evt.preventDefault();
        evt.stopPropagation();
    }
    const panel = $id("styleNormalNotePanel");
    const btn = $id("styleNormalNoteBtn");
    if (!panel || !btn) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}
function closeStyleNormalNote() {
    const panel = $id("styleNormalNotePanel");
    const btn = $id("styleNormalNoteBtn");
    if (!panel || !btn) return;
    if (!panel.hidden) panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
}
window.toggleYoseRelayNote = toggleYoseRelayNote;
window.toggleStyleNormalNote = toggleStyleNormalNote;

/**
 * 全角英数字・記号・全角スペース → 半角に変換し、
 * ひらがな・カタカナ・漢字など残る非ASCII文字は除去する
 */
function toHankaku(str) {
    if (!str) return str;
    return str
        .replace(/[Ａ-Ｚａ-ｚ０-９！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
        .replace(/　/g, " ")
        .replace(/[^\x20-\x7E\r\n\t]/g, "");
}

function isHalfWidthGuardInput(el) {
    if (!el || el.readOnly || el.disabled) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
        const t = (el.type || "text").toLowerCase();
        return t === "text" || t === "number" || t === "search" || t === "";
    }
    return false;
}

function setupHalfWidthInputGuards() {
    let _converting = false;

    function convertInPlace(el) {
        if (_converting) return;
        const before = el.value;
        const after = toHankaku(before);
        if (after === before) return;
        _converting = true;
        const len = after.length;
        const ss = Math.min(el.selectionStart, len);
        const se = Math.min(el.selectionEnd, len);
        el.value = after;
        try {
            el.setSelectionRange(ss, se);
        } catch (_) {}
        _converting = false;
    }

    // IME確定後（全OS共通）: compositionend の直後にブラウザが value を確定するので
    // setTimeout(0) で1フレーム遅らせてから変換・除去する
    document.addEventListener(
        "compositionend",
        function (ev) {
            const t = ev.target;
            if (!isHalfWidthGuardInput(t)) return;
            setTimeout(function () {
                convertInPlace(t);
            }, 0);
        },
        true
    );

    // ペースト・直接入力: IME変換中 (isComposing=true) はスキップ
    document.addEventListener(
        "input",
        function (ev) {
            const t = ev.target;
            if (!isHalfWidthGuardInput(t)) return;
            if (ev.isComposing) return;
            convertInPlace(t);
        },
        true
    );
}

let currentInternalStyle = "";
let currentCalcMode = "normal";
/** 最後に「適用」ボタンで確定したモード。生成時はこちらを参照する。
 *  currentCalcMode はドロワー内の UI 状態（カード選択中）を表し、
 *  lastAppliedCalcMode は実際に maxOD へ反映したモードを表す。 */
let lastAppliedCalcMode = "normal";
/** 外径ドロワー「入力」: dimensions=モード寸法 / ate=アテ長さ式 */
let maxOdApplySource = "dimensions";
/** 最大径（アテ長さ）式: 上段 15角〜43角 クイック直後に限り true。下段数値・手入力では false。 */
let ateLengthFromKaku = false;
/** アテ長さ: ○○角 自動計算が使える値のセット（datalist の kaku 区分） */
const ATE_LENGTH_KAKU_VALUES = new Set(["42.5", "41", "39.5", "37.5", "33.25", "28.5"]);

function updateWorkTypeSettings() {
    updateWorkTypeDesc();
    resetDrillDepthManualToggle();
    const type = $id("workType").value;
    const normalArea = $id("normalProcessArea");
    const drillMode = $id("drillMode");
    const idDepth = $id("idDepth");

    if (normalArea) normalArea.style.display = "block";

    if (type === "M12" || type === "M12_MH") {
        idDepth.disabled = false;
        idDepth.placeholder = "22.0";
    } else if (usesG18DrillShiageG1Block(type)) {
        idDepth.disabled = false;
        idDepth.placeholder = "22.0";
        if (drillMode) {
            drillMode.value = "G1";
            drillMode.disabled = true;
        }
    } else {
        idDepth.disabled = false;
        idDepth.placeholder = "22.0";
        if (drillMode) {
            drillMode.value = "G74";
            drillMode.disabled = false;
        }
    }

    restrictStyles(type);
    updateTubeVariantUI();
    updateInternalStyleUI();
    calcDrillDepth();
    updateM40M99UI(type);
    updateMHOdToolUI(type);
    updateG12BNoseRUI(type);
}

function updateMHOdToolUI(type) {
    const row = $id("mhOdToolRow");
    if (!row) return;
    const isMH = type && type.endsWith("_MH");
    row.style.display = isMH ? "" : "none";
}
window._ncUpdateMHOdToolUI = function () {
    updateMHOdToolUI($id("workType") ? $id("workType").value : "");
};

function updateG12BNoseRUI(type) {
    const row = $id("g12bNoseRRow");
    if (!row) return;
    row.style.display = isG12BWorkType(type) ? "" : "none";
}
window._ncUpdateG12BNoseRUI = function () {
    updateG12BNoseRUI($id("workType") ? $id("workType").value : "");
};

function updateM40M99UI(type) {
    const resolvedType = type !== undefined ? type : $id("workType") ? $id("workType").value : "";
    const label = $id("lblM99P100");
    const sel = $id("selM99P100");
    if (!label || !sel) return;

    if (resolvedType === "M40") {
        label.textContent = "M99P100 / X50.U8.処理";
        sel.options[0].textContent = "使用しない";
        if (sel.options[1]) sel.options[1].textContent = "M99P100 を使用する";
        // X50.U8.処理 選択肢がなければ追加
        if (!sel.querySelector('option[value="x50u8"]')) {
            const opt = document.createElement("option");
            opt.value = "x50u8";
            opt.textContent = "X50.U8.処理";
            sel.appendChild(opt);
        }
    } else {
        label.textContent = "M99P100";
        sel.options[0].textContent = "使用しない";
        if (sel.options[1]) sel.options[1].textContent = "使用する";
        // M40 以外では x50u8 選択肢を除去
        const x50opt = sel.querySelector('option[value="x50u8"]');
        if (x50opt) {
            if (sel.value === "x50u8") sel.value = "off";
            sel.removeChild(x50opt);
        }
        // MH系ワークタイプはM99P100をデフォルトON
        if (resolvedType && resolvedType.endsWith("_MH") && sel.value === "off") {
            sel.value = "on";
        }
    }
}
window._ncUpdateM40M99UI = function () {
    updateM40M99UI();
};

/**
 * M12: 内径加工スタイル + サブ選択から仕上げタイプ・加工プロファイルを解決する。
 *   Ichimonji → m12DrillType (hss/halfmoon) + profile=drill_ichi_hira
 *   Normal    → finishType=baito + profile=baito_no
 *   CrossSmall→ m12CrossMethod 5択でマッピング
 */
function resolveM12FinishAndProfile() {
    const style = currentInternalStyle;
    if (style === "Ichimonji") {
        const dt = ($id("m12DrillType") && $id("m12DrillType").value) || "hss";
        return { finishType: dt, profile: "drill_ichi_hira" };
    }
    if (style === "Normal") {
        return { finishType: "baito", profile: "baito_no" };
    }
    if (style === "YoseRelay") {
        // ヨセ中継は HGDR 固定（G1 一発、戻りステップなし）
        return { finishType: "halfmoon", profile: "drill_ichi_hira" };
    }
    if (style === "CrossSmall") {
        const cm = ($id("m12CrossMethod") && $id("m12CrossMethod").value) || "hss_oku";
        const map = {
            hss_oku: { finishType: "hss", profile: "cross_oku" },
            hgdr_oku: { finishType: "halfmoon", profile: "cross_oku" },
            hss_men: { finishType: "hss", profile: "drill_ichi_men" },
            hgdr_men: { finishType: "halfmoon", profile: "drill_ichi_men" },
            baito_oku: { finishType: "baito", profile: "baito_oku" },
        };
        return map[cm] || { finishType: "hss", profile: "cross_oku" };
    }
    return { finishType: "hss", profile: "drill_ichi_hira" };
}

/** M12 サブパネルをスタイル選択に応じて表示切替 */
function updateM12SubPanels() {
    const _dbg = typeof isDebugModeOn === "function" && isDebugModeOn();
    const wt = $id("workType") ? $id("workType").value : "";
    const isM12 = wt === "M12" || wt === "M12_MH";
    const ichiPanel = $id("m12IchiPanel");
    const crossPanel = $id("m12CrossPanel");
    const showIchi = isM12 && (currentInternalStyle === "Ichimonji" || _dbg);
    const showCross = isM12 && (currentInternalStyle === "CrossSmall" || _dbg);
    if (ichiPanel) {
        ichiPanel.style.display = showIchi ? "" : "none";
        ichiPanel.setAttribute("aria-hidden", showIchi ? "false" : "true");
    }
    if (crossPanel) {
        crossPanel.style.display = showCross ? "" : "none";
        crossPanel.setAttribute("aria-hidden", showCross ? "false" : "true");
    }
}

/** i18n.js から呼ばれるため互換エイリアスとして残す */
function updateM12CascadeUI() {
    updateM12SubPanels();
}
window.updateM12CascadeUI = updateM12CascadeUI;

/** G18_40/G18_42 CrossSmall: 加工方法セレクトから finishType/profile を解決する */
function resolveG18CrossFinishAndProfile() {
    const cm = ($id("g18CrossMethod") && $id("g18CrossMethod").value) || "hgdr_oku";
    const map = {
        hgdr_oku: { finishType: "halfmoon", profile: "cross_oku" },
        hgdr_men: { finishType: "halfmoon", profile: "drill_ichi_men" },
    };
    return map[cm] || { finishType: "halfmoon", profile: "cross_oku" };
}

/** G18_40/G18_42 サブパネルをスタイル選択に応じて表示切替 */
function updateG18SubPanels() {
    const _dbg = typeof isDebugModeOn === "function" && isDebugModeOn();
    const wt = $id("workType") ? $id("workType").value : "";
    const isG18Small = wt === "G18_40" || wt === "G18_42" || wt === "G18_40_MH" || wt === "G18_42_MH";
    const crossPanel = $id("g18CrossPanel");
    const showCross = isG18Small && (currentInternalStyle === "CrossSmall" || _dbg);
    if (crossPanel) {
        crossPanel.style.display = showCross ? "" : "none";
        crossPanel.setAttribute("aria-hidden", showCross ? "false" : "true");
    }
}

/** M12: ドリル種類ドロップダウン変更 */
function onM12DrillTypeChange() {
    updateInternalStyleUI();
    calcDrillDepth();
}

/** M12: 交差穴加工方法ドロップダウン変更 */
function onM12CrossMethodChange() {
    updateInternalStyleUI();
    calcDrillDepth();
}

/** G18_40/42: 交差穴加工方法ドロップダウン変更 */
function onG18CrossMethodChange() {
    updateInternalStyleUI();
    calcDrillDepth();
}

/** M8: 6.横穴＆中バリ処理 選択時の加工方法 → {profile} を解決する */
function resolveM8CrossFinishAndProfile() {
    const cm = ($id("m8CrossMethod") && $id("m8CrossMethod").value) || "hss_men";
    const map = {
        hss_men: { profile: "drill_ichi_men" },
        // hss_oku (奥バイト面取り) はM8では使用不可
    };
    return map[cm] || { profile: "drill_ichi_men" };
}

/** M8 サブパネルをスタイル選択に応じて表示切替 */
function updateM8SubPanels() {
    const _dbg = typeof isDebugModeOn === "function" && isDebugModeOn();
    const wt = $id("workType") ? $id("workType").value : "";
    const isM8 = isM8WorkType(wt);
    const crossPanel = $id("m8CrossPanel");
    const showCross = isM8 && (currentInternalStyle === "CrossSmall" || _dbg);
    if (crossPanel) {
        crossPanel.style.display = showCross ? "" : "none";
        crossPanel.setAttribute("aria-hidden", showCross ? "false" : "true");
    }
}

/** M8: 横穴加工方法ドロップダウン変更 */
function onM8CrossMethodChange() {
    updateInternalStyleUI();
    calcDrillDepth();
}

/** M12: すべての場合で G1 を返す（G74 プロファイルは廃止） */
function getM12BaitoDrillModeForInput() {
    return "G1";
}

/** 奥バイト面取りを行うか（profile 文字列で判定） */
function m12ProfileImpliesOku(profile) {
    if (!profile) return false;
    return (
        profile === "cross_oku" || profile === "baito_oku" || profile === "baito_g1_oku" || profile === "baito_g74_oku"
    );
}

/**
 * ワーク種別がチューブのときのみ表示（左カラムの group レイアウト）。
 */
function updateTubeVariantUI() {
    const grp = $id("tubeVariantGroup");
    const wt = $id("workType") && $id("workType").value;
    if (!grp) return;
    if (wt === "Tube") {
        grp.style.display = "";
        initTubeSpecs();
    } else {
        grp.style.display = "none";
    }
}

function syncMachineSelectOptions() {
    const machineSelect = $id("machineSelect");
    if (!machineSelect || typeof machines !== "object" || !machines) return;
    const machineNames = Object.keys(machines);
    if (!machineNames.length) return;

    const prev = machineSelect.value;
    machineSelect.innerHTML = "";

    machineNames.forEach((machineName) => {
        const op = document.createElement("option");
        op.value = machineName;
        op.textContent = machineName;
        machineSelect.appendChild(op);
    });

    machineSelect.value = machineNames.includes(prev) ? prev : machineNames[0];
}

function onMachineSelectChange() {
}

function restrictStyles(workType) {
    const internalStyleCardIds = [
        "styleHirazoko",
        "styleIchimonji",
        "styleNormal",
        "styleYoseRelay",
        "styleYose",
        "styleCrossSmall",
    ];

    function setInternalStyleCardsLocked(locked) {
        internalStyleCardIds.forEach((id) => {
            const el = $id(id);
            if (!el) return;
            if (locked) {
                el.style.pointerEvents = "none";
                el.style.opacity = id === "styleNormal" ? "1" : "0.35";
                el.setAttribute("aria-disabled", "true");
            } else {
                el.style.pointerEvents = "auto";
                el.style.opacity = "1";
                el.removeAttribute("aria-disabled");
            }
        });
    }

    // デバッグモード時はすべてのスタイルカードを制限なしで有効化
    if (typeof isDebugModeOn === "function" && isDebugModeOn()) {
        setInternalStyleCardsLocked(false);
        return;
    }

    const styleHirazoko = $id("styleHirazoko");
    const styleIchimonji = $id("styleIchimonji");
    const styleYose = $id("styleYose");
    const styleYoseRelay = $id("styleYoseRelay");
    const styleCrossBig = $id("styleCrossBig");

    // スタイルのリセットと有効化
    if (styleHirazoko) {
        styleHirazoko.style.pointerEvents = "auto";
        styleHirazoko.style.opacity = "1";
    }
    if (styleIchimonji) {
        styleIchimonji.style.pointerEvents = "auto";
        styleIchimonji.style.opacity = "1";
    }
    if (styleYose) {
        styleYose.style.pointerEvents = "auto";
        styleYose.style.opacity = "1";
    }
    if (styleYoseRelay) {
        styleYoseRelay.style.pointerEvents = "auto";
        styleYoseRelay.style.opacity = "1";
    }
    if (styleCrossBig) {
        styleCrossBig.style.pointerEvents = "auto";
        styleCrossBig.style.opacity = "1";
    }

    if (isJM8ASWDWorkType(workType)) {
        // J_M8_300 系: CrossSmall のみ使用可能 → 全カードをロックして強制選択
        setInternalStyleCardsLocked(true);
        if (currentInternalStyle !== "CrossSmall") setInternalStyle("CrossSmall");
    } else if (isM8WorkType(workType)) {
        // 使用可能: 2.一文字DR平底 / 4.ヨセ中継 / 6.横穴＆中バリ処理
        // 使用不可: 1.内径バイト平底 / 3.通常バイト加工 / 5.ヨセ
        ["styleHirazoko", "styleNormal", "styleYose"].forEach((id) => {
            const el = $id(id);
            if (el) {
                el.style.pointerEvents = "none";
                el.style.opacity = "0.3";
            }
        });
        if (!["Ichimonji", "YoseRelay", "CrossSmall"].includes(currentInternalStyle)) {
            setInternalStyle("");
        }
    } else if (workType === "G18_40" || workType === "G18_42" || workType === "G18_40_MH" || workType === "G18_42_MH") {
        ["styleHirazoko", "styleIchimonji", "styleNormal", "styleYose"].forEach((id) => {
            const el = $id(id);
            if (el) {
                el.style.pointerEvents = "none";
                el.style.opacity = "0.3";
            }
        });
        if (!["YoseRelay", "CrossSmall"].includes(currentInternalStyle)) {
            setInternalStyle("");
        }
    } else if (isG18HgdrSeriesWorkType(workType)) {
        ["styleIchimonji", "styleYose", "styleCrossSmall"].forEach((id) => {
            const el = $id(id);
            if (el) {
                el.style.pointerEvents = "none";
                el.style.opacity = "0.3";
            }
        });
        if (!["Hirazoko", "Normal", "YoseRelay"].includes(currentInternalStyle)) {
            setInternalStyle("");
        }
    } else if (isM42X3_25175WorkType(workType)) {
        ["styleIchimonji", "styleCrossSmall", "styleCrossBig"].forEach((id) => {
            const el = $id(id);
            if (el) {
                el.style.pointerEvents = "none";
                el.style.opacity = "0.3";
            }
        });
        if (!["Hirazoko", "Normal", "Yose", "YoseRelay"].includes(currentInternalStyle)) {
            setInternalStyle("");
        }
    } else if (workType === "M12" || workType === "M12_MH") {
        if (styleHirazoko) {
            styleHirazoko.style.pointerEvents = "none";
            styleHirazoko.style.opacity = "0.3";
        }
        if (styleYose) {
            styleYose.style.pointerEvents = "none";
            styleYose.style.opacity = "0.3";
        }
        if (currentInternalStyle === "Hirazoko") {
            setInternalStyle("Ichimonji");
        } else if (currentInternalStyle === "Yose") {
            setInternalStyle("Normal");
        } else if (currentInternalStyle === "CrossBig") {
            setInternalStyle("CrossSmall");
        }
    } else if (isTomesenWorkType(workType)) {
        // 使用可能: Hirazoko / Ichimonji / Normal / YoseRelay / Yose
        // 使用不可: CrossSmall のみ
        const elCross = $id("styleCrossSmall");
        if (elCross) {
            elCross.style.pointerEvents = "none";
            elCross.style.opacity = "0.3";
        }
        if (currentInternalStyle === "CrossSmall") {
            setInternalStyle("Hirazoko");
        }
    } else {
        if (styleIchimonji) {
            styleIchimonji.style.pointerEvents = "none";
            styleIchimonji.style.opacity = "0.3";
        }
        if (currentInternalStyle === "Ichimonji") {
            setInternalStyle("Hirazoko");
        }
    }
}

function initTubeSpecs() {
    const sel = $id("tubeSpecSelect");
    if (sel.options.length > 1) return;
    for (let key in tubeData) {
        let op = document.createElement("option");
        op.value = key;
        op.text = key;
        sel.appendChild(op);
    }
}

function updateTubeLengths() {
    const spec = $id("tubeSpecSelect").value;
    const lenSel = $id("tubeLengthSelect");
    lenSel.innerHTML = "";

    if (tubeData[spec]) {
        tubeData[spec].lengths.forEach((len) => {
            let op = document.createElement("option");
            op.value = len;
            op.text = len + " mm";
            lenSel.appendChild(op);
        });
    }
    calcDrillDepth();
}

let isInternalStyleDrawerOpen = false;
let _prevShowDrawer = false;

function getInternalStyleI18nKey(style) {
    const map = {
        Hirazoko: "style1",
        Ichimonji: "style2",
        Normal: "style3",
        YoseRelay: "style4",
        Yose: "style5Relay",
        CrossSmall: "style6",
        CrossBig: "style5",
    };
    return map[style] || "style1";
}

function updateInternalStyleDrawerLabel() {
    const out = $id("internalStyleCurrentMode");
    if (!out) return;
    const key = currentInternalStyle ? getInternalStyleI18nKey(currentInternalStyle) : "styleUnselected";
    const txt = window.NC_I18N && typeof window.NC_I18N.t === "function" ? window.NC_I18N.t(key) : key;
    out.textContent = String(txt || "").replace(/\n/g, " ");
    // ヒント / 選択済みスタイルの同期
    const toggleBtn = $id("internalStyleDrawerToggle");
    const hint = $id("internalStyleHint");
    const isSelected = !!currentInternalStyle;
    if (toggleBtn) toggleBtn.classList.toggle("style-selected", isSelected);
    if (hint) hint.classList.toggle("hint-hidden", isSelected);
}

function syncInternalStyleDrawerPanel() {
    const panel = $id("internalStyleDrawerPanel");
    const toggle = $id("internalStyleDrawerToggle");
    if (!panel || !toggle) return;
    panel.style.display = isInternalStyleDrawerOpen ? "block" : "none";
    toggle.setAttribute("aria-expanded", isInternalStyleDrawerOpen ? "true" : "false");
}

function toggleInternalStyleDrawer() {
    const host = $id("internalStyleDrawer");
    if (!host || host.style.display === "none") return;
    isInternalStyleDrawerOpen = !isInternalStyleDrawerOpen;
    syncInternalStyleDrawerPanel();
}
window.toggleInternalStyleDrawer = toggleInternalStyleDrawer;
window._ncUpdateInternalStyleDrawerLabel = updateInternalStyleDrawerLabel;

function setInternalStyle(style) {
    if (style !== currentInternalStyle) {
        closeYoseRelayNote();
        closeStyleNormalNote();
        resetDrillDepthManualToggle();
    }
    currentInternalStyle = style;
    const styles = ["Hirazoko", "Ichimonji", "Normal", "YoseRelay", "Yose", "CrossSmall"];
    styles.forEach((s) => {
        const card = $id("style" + s);
        if (card) {
            if (s === style) card.classList.add("active");
            else card.classList.remove("active");
        }
    });
    updateInternalStyleDrawerLabel();
    updateInternalStyleUI();
    calcDrillDepth();
    if (style) {
        // スタイル確定: ドロワーを閉じてボタン・ヒントを選択済み表示にする
        if (isInternalStyleDrawerOpen) {
            isInternalStyleDrawerOpen = false;
            syncInternalStyleDrawerPanel();
        }
        const toggleBtn = $id("internalStyleDrawerToggle");
        if (toggleBtn) toggleBtn.classList.add("style-selected");
        const hint = $id("internalStyleHint");
        if (hint) hint.classList.add("hint-hidden");
    } else {
        // スタイルリセット: ドロワーコンテナが表示中なら自動展開して再選択を促す
        const host = $id("internalStyleDrawer");
        if (host && host.style.display !== "none" && !isInternalStyleDrawerOpen) {
            isInternalStyleDrawerOpen = true;
            syncInternalStyleDrawerPanel();
        }
        // _prevShowDrawer をリセットして次の出現時も自動展開できるようにする
        _prevShowDrawer = false;
    }
}

// ========== プログレッシブ・リビール ==========
/**
 * フォームのプログレッシブ・リビール制御。
 * 各入力ステップの充足状況に応じて、次のセクションを表示/非表示にする。
 *
 * Step 1         : ファイル情報・作成者 (fileInfoCard) — 常時表示
 *                  図番(v1a) + 作成者 入力後 → machineWorkCard を表示
 * Step 2         : 機械・ワーク選択 (machineWorkCard)
 *                  ateLength 入力後 → workType 行を表示
 *                  workType 入力後 → machiningSettingsGroup を表示
 * Step 3         : 加工設定 (machiningSettingsGroup)
 *                  maxOD + selM99P100 入力後 → internalStyleDrawer を表示
 * Step 4 (既存)  : internalStyle 選択後 → style 固有フィールドを表示
 */
function updateProgressiveReveal() {
    // デバッグモード ON 時はすべての隠れているドロワーを強制表示する
    const _dbg = typeof isDebugModeOn === "function" && isDebugModeOn();

    const wtVal     = ($id("workType")    || {}).value || "";
    const ateVal    = (($id("ateLength")  || {}).value || "").trim();
    const ateFilled = ateVal !== "" && !isNaN(parseFloat(ateVal));
    const wnFilled  = (($id("workerName") || {}).value || "").trim() !== "";
    const v1aFilled = (($id("v1a")        || {}).value || "").trim() !== "";
    const maxODVal  = (($id("maxOD")      || {}).value || "").trim();
    const maxODFilled = maxODVal !== "";
    const m99Val    = ($id("selM99P100")  || {}).value || "";
    const m99Filled = m99Val !== "";

    // --- Step1完了: 図番(v1a) + 作成者 → 機械・ワーク選択カードを解禁 ---
    const fileInfoFilled = v1aFilled && wnFilled;
    const machineCard = $id("machineWorkCard");
    if (machineCard) machineCard.style.display = (fileInfoFilled || _dbg) ? "" : "none";

    // --- workType 行はアテ長さ入力後に解禁 ---
    const wtEl  = $id("workType");
    const wtRow = wtEl && wtEl.closest(".row");
    if (wtRow) {
        wtRow.classList.toggle("reveal-section--hidden", !ateFilled && !_dbg);
    }

    // --- 加工設定は Step1完了 + ateLength + workType 入力後 ---
    const showMachining = !!(fileInfoFilled && ateFilled && wtVal) || _dbg;
    const machGrp = $id("machiningSettingsGroup");
    const mainActionRow = $id("mainActionRow");
    const hlFilterRow   = $id("highlightFilterRow");
    if (machGrp)       machGrp.style.display       = showMachining ? ""     : "none";
    if (mainActionRow) mainActionRow.style.display  = showMachining ? "flex" : "none";
    if (hlFilterRow)   hlFilterRow.style.display    = showMachining ? "flex" : "none";

    // --- internalStyleDrawer は maxOD + selM99P100 入力後 (ASWD系は非表示・CrossSmall 強制) ---
    const showDrawer = (!!(wtVal && maxODFilled && m99Filled) && !isJM8ASWDWorkType(wtVal)) || _dbg;
    const styleDrawer = $id("internalStyleDrawer");
    if (styleDrawer) {
        styleDrawer.style.display = showDrawer ? "block" : "none";
        if (!showDrawer && typeof isInternalStyleDrawerOpen !== "undefined") {
            isInternalStyleDrawerOpen = false;
            if (typeof syncInternalStyleDrawerPanel === "function") {
                syncInternalStyleDrawerPanel();
            }
        }
        // ドロワーが新たに表示された（false→true）かつスタイル未選択なら自動展開
        if (showDrawer && !_prevShowDrawer && !currentInternalStyle) {
            isInternalStyleDrawerOpen = true;
            if (typeof syncInternalStyleDrawerPanel === "function") {
                syncInternalStyleDrawerPanel();
            }
        }
    }
    _prevShowDrawer = showDrawer;

    // --- ステップ進捗インジケーター同期 (4ステップ) ---
    // 1:ファイル情報  2:機械・ワーク選択  3:加工設定  4:内径スタイル
    var currentStep;
    if (!fileInfoFilled)           currentStep = 1;
    else if (!ateFilled || !wtVal) currentStep = 2;
    else if (!maxODFilled)         currentStep = 3;
    else                           currentStep = 4;
    _syncStepProgress(currentStep);
}

function _syncStepProgress(currentStep) {
    for (var i = 1; i <= 4; i++) {
        var dot = $id("stepDot" + i);
        if (!dot) continue;
        dot.classList.remove("step-dot--done", "step-dot--current");
        if (i < currentStep)        dot.classList.add("step-dot--done");
        else if (i === currentStep) dot.classList.add("step-dot--current");
    }
    for (var j = 1; j <= 3; j++) {
        var conn = $id("stepConn" + j);
        if (conn) conn.classList.toggle("step-conn--done", j < currentStep);
    }
}

/**
 * 内径加工スタイル・ワーク種別に応じたブロック表示（Enterキーのナビとは独立）
 */
function updateInternalStyleUI() {
    const _dbg = typeof isDebugModeOn === "function" && isDebugModeOn();
    const drillMode = $id("drillMode");
    const cpArea = $id("cpCalcArea");
    const yoseDiv = $id("yoseSettings");
    const yoseMethodRow = $id("yoseMethodRow");
    const yoseTotalLengthRow = $id("yoseTotalLengthRow");
    const yosePartnerDepthRow = $id("yosePartnerDepthRow");
    const yoseOpposedDistanceRow = $id("yoseOpposedDistanceRow");
    const yoseLengthRow = $id("yoseLengthRow");
    const yoseTaiLengthRow = $id("yoseTaiLengthRow");
    const yoseOpposedDistanceInput = $id("yoseOpposedDistance");
    const yoseLengthInput = $id("yoseLength");
    const yoseTaiLengthInput = $id("yoseTaiLength");
    const okuBiteArea = $id("okuBiteArea");
    const workType = $id("workType").value;
    const isTemplateSelected = !!workType;
    const blockMaxDiameterMode = $id("blockMaxDiameterMode");
    const maxOdRow = $id("maxOdRow");
    const idDepthRow = $id("idDepthRow");

    // セクション単位の表示制御はプログレッシブ・リビールに委譲
    updateProgressiveReveal();

    // チューブでも最大径計算モードを選べる（外径最大径はチューブ規格からは自動入力しない）
    if (blockMaxDiameterMode) {
        blockMaxDiameterMode.style.display = "";
    }
    if (maxOdRow) {
        maxOdRow.style.display = isTemplateSelected ? "flex" : "none";
    }

    // ドリル深さUI制御
    // ・Hirazoko / Ichimonji : 自動計算のため非表示
    // ・M8 worktype           : idDepth を使わないため即時表示
    // ・それ以外              : 内径深さ入力後に表示（idDepth に値があるとき）
    const drillDepthInput = $id("drillDepth");
    const drillDepthLabel = $id("drillDepthLabel");
    const drillDepthContainer = $id("drillDepthRow");
    if (isJM8ASWDWorkType(workType)) {
        // ASWD: ドリル深さは CP から自動計算するためユーザー入力不要 → 非表示
        if (drillDepthContainer) drillDepthContainer.style.display = "none";
    } else if ((isTemplateSelected && !!currentInternalStyle) || _dbg) {
        // 内径スタイル選択後に表示（デバッグ時は未選択でも表示）
        if (drillDepthContainer) drillDepthContainer.style.display = "flex";
    } else {
        if (drillDepthContainer) drillDepthContainer.style.display = "none";
    }
    if (idDepthRow) {
        // 6.交差穴加工径小では、見落とし防止のため常に表示を優先
        if (currentInternalStyle === "CrossSmall") {
            idDepthRow.style.display = "flex";
        } else {
            idDepthRow.style.display = isTemplateSelected && (!!currentInternalStyle || _dbg) ? "flex" : "none";
        }
    }

    if (drillDepthInput) {
        const tFn =
            window.NC_I18N && typeof window.NC_I18N.t === "function"
                ? window.NC_I18N.t.bind(window.NC_I18N)
                : function (k) {
                      return k;
                  };
        const isAutoDrillDepthStyle =
            currentInternalStyle === "Hirazoko" ||
            isYoseMachiningStyle(currentInternalStyle) ||
            isYoseRelayStyle(currentInternalStyle) ||
            currentInternalStyle === "CrossSmall";
        drillDepthInput.placeholder = isAutoDrillDepthStyle ? tFn("drillAutoPlaceholder") : "45.0";
    }

    const m12Resolved =
        workType === "M12" || workType === "M12_MH" ? resolveM12FinishAndProfile() : { finishType: "", profile: "" };
    if (drillDepthInput && drillDepthLabel) {
        if (
            (workType === "M12" || workType === "M12_MH") &&
            m12Resolved.finishType === "halfmoon" &&
            currentInternalStyle === "CrossSmall"
        ) {
            drillDepthLabel.setAttribute("data-i18n", "drillDepthHangetsu");
            if (!isDrillDepthManual()) {
                drillDepthInput.readOnly = true;
                drillDepthInput.classList.add("input--readonly-computed");
            }
        } else if ((workType === "M12" || workType === "M12_MH") && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            if (!isDrillDepthManual()) {
                drillDepthInput.readOnly = true;
                drillDepthInput.classList.add("input--readonly-computed");
            }
        } else if (
            (workType === "G18_40" || workType === "G18_42" || workType === "G18_40_MH" || workType === "G18_42_MH") &&
            currentInternalStyle === "CrossSmall"
        ) {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            if (!isDrillDepthManual()) {
                drillDepthInput.readOnly = true;
                drillDepthInput.classList.add("input--readonly-computed");
            }
        } else {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            if (!isDrillDepthManual()) {
                drillDepthInput.readOnly = true;
                drillDepthInput.classList.add("input--readonly-computed");
            }
        }
    }

    if (workType === "M12" || workType === "M12_MH" || usesG18DrillShiageG1Block(workType) || isM8WorkType(workType) || isJM8ASWDWorkType(workType)) {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else if (currentInternalStyle === "Ichimonji") {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else {
        drillMode.disabled = false;
    }

    // M12 / 全G18 ではドリルモードは自動決定するため UI は出さない
    const drillModeRow = $id("drillModeRow");
    if (drillModeRow) {
        const shouldHideDrillMode =
            workType === "M12" || workType === "M12_MH" || usesG18DrillShiageG1Block(workType) || isM8WorkType(workType) || isJM8ASWDWorkType(workType) || (!currentInternalStyle && !_dbg);
        drillModeRow.style.display = shouldHideDrillMode ? "none" : "flex";
    }

    updateM12SubPanels();
    updateG18SubPanels();
    updateM8SubPanels();

    // ヨセ設定（ヨセ / ヨセ中継）
    if (isYoseMachiningStyle(currentInternalStyle) || isYoseRelayStyle(currentInternalStyle)) {
        yoseDiv.style.display = "block";
        if (yoseMethodRow) yoseMethodRow.style.display = isYoseMachiningStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseTotalLengthRow)
            yoseTotalLengthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yosePartnerDepthRow)
            yosePartnerDepthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseOpposedDistanceRow)
            yoseOpposedDistanceRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseLengthRow) yoseLengthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseTaiLengthRow) yoseTaiLengthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
    } else if (_dbg) {
        // デバッグ時はヨセ系フィールドを全表示
        yoseDiv.style.display = "block";
        if (yoseMethodRow)          yoseMethodRow.style.display = "flex";
        if (yoseTotalLengthRow)     yoseTotalLengthRow.style.display = "flex";
        if (yosePartnerDepthRow)    yosePartnerDepthRow.style.display = "flex";
        if (yoseOpposedDistanceRow) yoseOpposedDistanceRow.style.display = "flex";
        if (yoseLengthRow)          yoseLengthRow.style.display = "flex";
        if (yoseTaiLengthRow)       yoseTaiLengthRow.style.display = "flex";
    } else {
        yoseDiv.style.display = "none";
        if (yoseMethodRow) yoseMethodRow.style.display = "none";
        if (yoseTotalLengthRow) yoseTotalLengthRow.style.display = "none";
        if (yosePartnerDepthRow) yosePartnerDepthRow.style.display = "none";
        if (yoseOpposedDistanceRow) yoseOpposedDistanceRow.style.display = "none";
        if (yoseLengthRow) yoseLengthRow.style.display = "none";
        if (yoseTaiLengthRow) yoseTaiLengthRow.style.display = "none";
    }

    // 対向口径距離 / 対ヨセ長さは常に表示専用（ユーザー編集不可）
    if (yoseOpposedDistanceInput) {
        yoseOpposedDistanceInput.readOnly = true;
        yoseOpposedDistanceInput.disabled = true;
        yoseOpposedDistanceInput.classList.add("input--readonly-computed");
    }
    if (yoseLengthInput) {
        yoseLengthInput.readOnly = true;
        yoseLengthInput.disabled = true;
        yoseLengthInput.classList.add("input--readonly-computed");
    }
    if (yoseTaiLengthInput) {
        yoseTaiLengthInput.readOnly = true;
        yoseTaiLengthInput.disabled = true;
        yoseTaiLengthInput.classList.add("input--readonly-computed");
    }

    const idDepthInput = $id("idDepth");
    if (idDepthInput) {
        const lockIdDepth = isYoseRelayStyle(currentInternalStyle);
        idDepthInput.readOnly = lockIdDepth;
        idDepthInput.classList.toggle("input--readonly-computed", lockIdDepth);
    }

    // 交差穴・一文字DR(面取り): CP 入力
    // M12 Ichimonji (一文字DR平底) はドリル深さベースのため CP 不要
    const showCpArea =
        currentInternalStyle === "CrossBig" ||
        currentInternalStyle === "CrossSmall" ||
        (currentInternalStyle === "Ichimonji" && workType !== "M12" && workType !== "M12_MH");
    cpArea.style.display = (showCpArea || _dbg) ? "block" : "none";

    // 奥バイト面取りの有無は M12 の加工プロファイルで決める（チェック欄は使わない）
    if (okuBiteArea) okuBiteArea.style.display = "none";

    const idDepthLabel = $id("idDepthLabel");
    if (idDepthLabel) {
        const useIPDepthLabel = currentInternalStyle === "CrossBig" || currentInternalStyle === "CrossSmall";
        idDepthLabel.setAttribute("data-i18n", useIPDepthLabel ? "idDepthCross" : "idDepth");
    }

    // 交差穴加工径小: 計算済み内径深さ表示行
    const crossSmallFinishRow = $id("crossSmallFinishDepthRow");
    if (crossSmallFinishRow) {
        crossSmallFinishRow.style.display = (currentInternalStyle === "CrossSmall" || _dbg) ? "block" : "none";
    }

    if (window.NC_I18N && typeof window.NC_I18N.applyI18n === "function") {
        window.NC_I18N.applyI18n();
    }

    updateInternalStyleDrawerLabel();
    recalcYoseRelayComputedFields();
    calcAutoCP();
    updateCrossSmallFinishDepthDisplay();
}

function recalcYoseRelayComputedFields() {
    const style = currentInternalStyle;
    const opposedEl = $id("yoseOpposedDistance");
    const yoseLenEl = $id("yoseLength");
    const taiEl = $id("yoseTaiLength");
    const idDepthEl = $id("idDepth");
    const drillDepthEl = $id("drillDepth");
    if (!opposedEl || !yoseLenEl || !taiEl || !idDepthEl || !drillDepthEl) return;
    if (!isYoseRelayStyle(style)) return;

    const relayInput = {
        workType: $id("workType").value,
        tubeSpec: $id("tubeSpecSelect") ? $id("tubeSpecSelect").value : "",
        yoseTotalLength: $id("yoseTotalLength") ? $id("yoseTotalLength").value : "",
        yosePartnerDepth: $id("yosePartnerDepth") ? $id("yosePartnerDepth").value : "",
        yoseD: $id("yoseD") ? $id("yoseD").value : "",
        yoseAngle: $id("yoseAngle") ? $id("yoseAngle").value : "",
    };
    const metrics = calcYoseRelayMetrics(relayInput);
    if (!metrics) {
        opposedEl.value = "";
        yoseLenEl.value = "";
        taiEl.value = "";
        idDepthEl.value = "";
        if (!isDrillDepthManual()) drillDepthEl.value = "";
        return;
    }
    opposedEl.value = metrics.opposedDistance.toFixed(3);
    yoseLenEl.value = metrics.yoseLength.toFixed(3);
    taiEl.value = metrics.taiYoseLength.toFixed(3);
    idDepthEl.value = metrics.relayIdDepth.toFixed(3);
    if (!isDrillDepthManual()) {
        if (!isNaN(metrics.relayDrillDepth) && isFinite(metrics.relayDrillDepth)) {
            drillDepthEl.value = metrics.relayDrillDepth.toFixed(3);
        } else {
            drillDepthEl.value = "";
        }
    }
}

function calcDrillDepth() {
    // 手動入力モード中は自動計算を行わない
    if (isDrillDepthManual()) return;
    const workType = $id("workType").value;
    const style = currentInternalStyle;
    const idDepthVal = parseFloat($id("idDepth").value);
    const cpVal = parseFloat($id("cpVal").value);
    const drillDepthInput = $id("drillDepth");

    if (isYoseRelayStyle(style)) {
        if (drillDepthInput && !isDrillDepthManual()) {
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        }
        recalcYoseRelayComputedFields();
        return;
    }

    if (
        (workType === "M12" ||
            workType === "M12_MH" ||
            workType === "G18_40" ||
            workType === "G18_42" ||
            workType === "G18_40_MH" ||
            workType === "G18_42_MH") &&
        style === "CrossSmall"
    ) {
        if (drillDepthInput) {
            if (!isDrillDepthManual()) {
                drillDepthInput.readOnly = true;
                drillDepthInput.classList.add("input--readonly-computed");
                if (!isNaN(cpVal)) {
                    drillDepthInput.value = (cpVal + 1.2 + 1).toFixed(3);
                } else {
                    drillDepthInput.value = "";
                }
            }
        }
        return;
    }

    let drillDia = 0;
    if (workType === "Tube") {
        const spec = $id("tubeSpecSelect").value;
        if (tubeData[spec] && tubeData[spec].drill) {
            drillDia = parseFloat(tubeData[spec].drill.replace(/[^0-9.]/g, ""));
        }
    } else {
        drillDia = DRILL_DIA_MAP[workType] || 0;
    }
    if (!drillDia) return;

    // ▼▼▼ ここから変更 ▼▼▼
    // 以前の計算式をすべて削除し、logic.js の共通関数を呼び出すだけにする
    let calcZ = null;

    if (isYoseMachiningStyle(style) || isYoseRelayStyle(style)) {
        // ヨセ: 内径深さを基準に計算
        calcZ = calcSpecialDrillZ(style, drillDia, idDepthVal);
    } else if (style === "CrossBig" || style === "CrossSmall") {
        // 交差穴: CPを基準に計算
        calcZ = calcSpecialDrillZ(style, drillDia, cpVal);
    }
    // ▲▲▲ ここまで変更 ▲▲▲

    if (calcZ) {
        drillDepthInput.value = calcZ;
    }
    // 手動モード OFF の場合は常に readonly を保証（updateInternalStyleUI 呼び出し前の保険）
    if (!isDrillDepthManual()) {
        drillDepthInput.readOnly = true;
        drillDepthInput.classList.add("input--readonly-computed");
    }
}

function calcAutoCP() {
    const cpEl = $id("cpVal");
    if (!cpEl) return;
    const style = currentInternalStyle;
    const isCross = style === "CrossBig" || style === "CrossSmall";
    const isIchimonji = style === "Ichimonji";
    if (!isCross && !isIchimonji) {
        cpEl.value = "";
        return;
    }
    // 原点〜相手中心距離（交差穴時は図面上の IP に相当）— idDepth で入力（二重入力なし）
    const dist = parseFloat($id("idDepth").value);
    const pDia = parseFloat($id("valPartnerD").value);
    if (!isNaN(dist) && !isNaN(pDia)) {
        const cp = dist - pDia / 2.0;
        cpEl.value = cp.toFixed(3);
        calcDrillDepth();
    } else {
        cpEl.value = "";
        calcDrillDepth();
    }
    updateCrossSmallFinishDepthDisplay();
}

/**
 * 交差穴加工径小: calcCrossSmallFinishDepth の結果を表示専用テキストボックスに反映する
 * {{入力_内径深さ}} に渡る値をユーザーが確認できるようにする（編集不可）
 */
function updateCrossSmallFinishDepthDisplay() {
    const el = $id("crossSmallFinishDepthVal");
    if (!el) return;
    if (currentInternalStyle !== "CrossSmall") {
        el.value = "";
        return;
    }
    const inp = {
        cpVal: $id("cpVal") ? $id("cpVal").value : "",
        valPartnerD: $id("valPartnerD") ? $id("valPartnerD").value : "",
        workType: $id("workType") ? $id("workType").value : "",
        tubeSpec: $id("tubeSpecSelect") ? $id("tubeSpecSelect").value : "",
    };
    const depth = calcCrossSmallFinishDepth(inp);
    el.value = isNaN(depth) || !isFinite(depth) ? "" : depth.toFixed(3);
}

/** 右上「?」: デバッグをドロップダウンに隠す */
function setupHelpEasterDropdown() {
    const btn = $id("helpEasterBtn");
    const panel = $id("helpEasterDropdown");
    if (!btn || !panel) return;

    function close() {
        if (panel.hidden) return;
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
    }
    function open() {
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (panel.hidden) open();
        else close();
    });
    panel.addEventListener("click", function (e) {
        if (e.target.closest("button.help-easter-menu-item")) close();
    });
    document.addEventListener("click", function (e) {
        if (!panel.hidden && !btn.contains(e.target) && !panel.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") close();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupHalfWidthInputGuards();
    bindHighlightFilterControls();
    syncMachineSelectOptions();

    // 計算機能を適用するIDリスト
    const calcTargets = ["valStockA", "valStockB", "valA", "valB", "drillDepth", "ateLength", "idDepth", "maxOD"];

    calcTargets.forEach((id) => {
        const el = $id(id);
        if (!el) return;

        el.addEventListener("change", (e) => {
            if (id === "ateLength") {
                refreshAteLengthSourceState();
            }
            // 数式を計算
            const result = evaluateFormula(e.target.value);
            if (typeof result === "number") {
                // 小数点第3位までに整形して上書き
                e.target.value = parseFloat(result.toFixed(3));

                if (id === "drillDepth" || id === "idDepth") {
                    calcAutoCP();
                    calcDrillDepth();
                }
            }
        });
    });

    // 既存の入力時連動
    const idDepthEl = $id("idDepth");
    if (idDepthEl) {
        idDepthEl.addEventListener("input", function () {
            calcAutoCP();
            calcDrillDepth();
            updateInternalStyleUI();   // 内径深さ入力 → ドリル深さ欄の表示を更新
        });
    }
    ["yoseTotalLength", "yosePartnerDepth", "yoseD", "yoseAngle", "tubeSpecSelect", "workType"].forEach(function (id) {
        const el = $id(id);
        if (!el) return;
        el.addEventListener("input", recalcYoseRelayComputedFields);
        el.addEventListener("change", recalcYoseRelayComputedFields);
    });

    // yoseD: 入力確定時に内径加工寸法との大小をフィールド脇ポップアップで通知
    const _yoseDEl = $id("yoseD");
    if (_yoseDEl) {
        _yoseDEl.addEventListener("input", function () {
            validateYoseDField(false);
        });
        _yoseDEl.addEventListener("change", function () {
            validateYoseDField(true);
        });
        _yoseDEl.addEventListener("blur", function () {
            validateYoseDField(true);
        });
    }
    const _workTypeEl = $id("workType");
    if (_workTypeEl) {
        _workTypeEl.addEventListener("change", function () {
            validateYoseDField(false);
        });
    }
    const _tubeSpecEl = $id("tubeSpecSelect");
    if (_tubeSpecEl) {
        _tubeSpecEl.addEventListener("change", function () {
            validateYoseDField(false);
        });
    }
    const maxOdEl = $id("maxOD");
    if (maxOdEl && !maxOdEl.dataset.maxOdDrawerBound) {
        maxOdEl.dataset.maxOdDrawerBound = "1";
        maxOdEl.addEventListener("click", openMaxOdCalcDrawer);
        maxOdEl.addEventListener("focus", openMaxOdCalcDrawer);
        maxOdEl.addEventListener("input", function () {
            // 手動編集時は角ありモードを解除して通常モードに戻す
            lastAppliedCalcMode = "normal";
            currentCalcMode = "normal";
        });

        const _maxOdDrawer = $id("maxOdCalcDrawer");
        if (_maxOdDrawer) {
            let _maxOdDrawerMouseDown = false;
            _maxOdDrawer.addEventListener("mousedown", function () {
                _maxOdDrawerMouseDown = true;
                setTimeout(function () { _maxOdDrawerMouseDown = false; }, 200);
            });
            maxOdEl.addEventListener("blur", function (e) {
                if (_maxOdDrawerMouseDown) return;
                if (_maxOdDrawer.hidden) return;
                const rt = e.relatedTarget;
                if (!rt || !_maxOdDrawer.contains(rt)) {
                    closeMaxOdCalcDrawer();
                }
            });
        }
    }

    const _styleToggleBtn = $id("internalStyleDrawerToggle");
    const _styleDrawerHost = $id("internalStyleDrawer");
    if (_styleToggleBtn && _styleDrawerHost && !_styleToggleBtn.dataset.styleDrawerBlurBound) {
        _styleToggleBtn.dataset.styleDrawerBlurBound = "1";
        let _styleDrawerMouseDown = false;
        _styleDrawerHost.addEventListener("mousedown", function () {
            _styleDrawerMouseDown = true;
            setTimeout(function () { _styleDrawerMouseDown = false; }, 200);
        });
        _styleToggleBtn.addEventListener("blur", function (e) {
            if (_styleDrawerMouseDown) return;
            if (!isInternalStyleDrawerOpen) return;
            const rt = e.relatedTarget;
            if (!rt || !_styleDrawerHost.contains(rt)) {
                isInternalStyleDrawerOpen = false;
                syncInternalStyleDrawerPanel();
            }
        });
    }

    setupHelpEasterDropdown();

    // ---- プログレッシブ・リビール: 各入力フィールドの変更時に再評価 ----
    [
        { id: "v1a",         events: ["input", "change"] },
        { id: "ateLength",   events: ["input", "change"] },
        { id: "workType",    events: ["change"] },
        { id: "v2",          events: ["input", "change"] },
        { id: "workerName",  events: ["input", "change"] },
        { id: "maxOD",          events: ["input", "change"] },
        { id: "selM99P100",     events: ["change"] },
        { id: "debugModeToggle", events: ["change"] },
    ].forEach(function (cfg) {
        const el = $id(cfg.id);
        if (!el) return;
        cfg.events.forEach(function (evtName) {
            el.addEventListener(evtName, updateProgressiveReveal);
        });
    });

    // デバッグトグル変更時: スタイルカード制限 + サブパネルも再評価
    const _dbgToggleEl = $id("debugModeToggle");
    if (_dbgToggleEl) {
        _dbgToggleEl.addEventListener("change", function () {
            const wt = ($id("workType") || {}).value || "";
            if (wt) restrictStyles(wt);
            updateM12SubPanels();
            updateG18SubPanels();
            updateM8SubPanels();
            updateInternalStyleUI();
        });
    }

    updateWorkTypeSettings();
    setCalcMode(currentCalcMode);
    refreshAteLengthSourceState();
    // 初期状態を評価（初期値が空の場合に次ステップを非表示にする）
    updateProgressiveReveal();

    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        const d = $id("maxOdCalcDrawer");
        if (d && !d.hidden) closeMaxOdCalcDrawer();
        if (isInternalStyleDrawerOpen) {
            isInternalStyleDrawerOpen = false;
            syncInternalStyleDrawerPanel();
        }
    });

    document.addEventListener("click", function (e) {
        if (!isInternalStyleDrawerOpen) return;
        const host = $id("internalStyleDrawer");
        if (host && host.contains(e.target)) return;
        isInternalStyleDrawerOpen = false;
        syncInternalStyleDrawerPanel();
    });

    document.addEventListener("click", function (e) {
        const panel = $id("yoseRelayNotePanel");
        const btn = $id("yoseRelayNoteBtn");
        if (!panel || !btn || panel.hidden) return;
        if (btn.contains(e.target) || panel.contains(e.target)) return;
        closeYoseRelayNote();
    });
    document.addEventListener("click", function (e) {
        const panel = $id("styleNormalNotePanel");
        const btn = $id("styleNormalNoteBtn");
        if (!panel || !btn || panel.hidden) return;
        if (btn.contains(e.target) || panel.contains(e.target)) return;
        closeStyleNormalNote();
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            closeYoseRelayNote();
            closeStyleNormalNote();
        }
    });

    if (typeof window.NC_I18N !== "undefined") {
        window.NC_I18N.initUiLangFromStorage();
        const uiLang = document.getElementById("uiLang");
        if (uiLang) {
            uiLang.addEventListener("change", function () {
                window.NC_I18N.setLang(this.value);
                window.NC_I18N.applyI18n();
                refreshPreviewUiI18n();
                if (typeof updatePreviewSticky === "function") updatePreviewSticky();
            });
        }
    }
});


function isAteLengthKakuSelection() {
    const el = $id("ateLength");
    if (!el) return false;
    return ATE_LENGTH_KAKU_VALUES.has(el.value.trim());
}

function refreshAteLengthSourceState() {
    ateLengthFromKaku = isAteLengthKakuSelection();
    syncMaxOdAteModeUi();
}

function onAteLengthSelectChange() {
    refreshAteLengthSourceState();
}

function setActiveBtn(btn) {
    if (!btn) return;
    const parent = btn.parentElement;
    const siblings = parent.getElementsByClassName("qb");
    for (let el of siblings) el.classList.remove("active");
    btn.classList.add("active");
}
function setAuthor(name, btn) {
    $id("workerName").value = name;
    setActiveBtn(btn);
    // クイック選択ボタンはイベントを発火しないため直接呼ぶ
    updateProgressiveReveal();
}

/** ドリル深さ手動入力モード判定 */
function isDrillDepthManual() {
    const el = $id("drillDepthManualToggle");
    return el ? el.checked : false;
}

/** ドリル深さ手動トグルをリセット（ワーク種別・スタイル変更時に呼ぶ） */
function resetDrillDepthManualToggle() {
    const toggle = $id("drillDepthManualToggle");
    const drillInput = $id("drillDepth");
    const btnsRow = $id("drillDepthManualBtnsRow");
    if (toggle) toggle.checked = false;
    if (drillInput) {
        drillInput.value = "";
        drillInput.readOnly = true;
        drillInput.classList.add("input--readonly-computed");
    }
    if (btnsRow) btnsRow.style.display = "none";
}

/** ドリル深さ手動トグル ON/OFF ハンドラ */
function onDrillDepthManualToggle() {
    const isManual = isDrillDepthManual();
    const drillInput = $id("drillDepth");
    const btnsRow = $id("drillDepthManualBtnsRow");
    if (drillInput) {
        drillInput.readOnly = !isManual;
        drillInput.classList.toggle("input--readonly-computed", !isManual);
        if (isManual) drillInput.focus();
    }
    if (btnsRow) {
        btnsRow.style.display = isManual ? "flex" : "none";
    }
    // 手動オフ時は自動計算を再実行
    if (!isManual) calcDrillDepth();
}

/** ドリル深さ クイック入力 */
function setDrillDepthQuick(val) {
    const el = $id("drillDepth");
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateMaxOdFromAteButtonActive() {
    const card = $id("modeAte");
    if (!card) return;
    if (maxOdApplySource === "ate" && ateLengthFromKaku) {
        card.classList.add("active");
    } else {
        card.classList.remove("active");
    }
}

/**
 * 最大径「アテ長さ」カードの有効/無効と、不整合時のモードリセット
 */
function syncMaxOdAteModeUi() {
    const card = $id("modeAte");
    if (card) {
        card.classList.toggle("max-od-mode-ate--disabled", !ateLengthFromKaku);
    }
    if (!ateLengthFromKaku && maxOdApplySource === "ate") {
        setCalcMode(currentCalcMode);
    } else {
        updateMaxOdFromAteButtonActive();
    }
}


function clearMaxOdApplyFromAte() {
    maxOdApplySource = "dimensions";
    updateMaxOdFromAteButtonActive();
}

function selectMaxOdApplyFromAte() {
    if (!ateLengthFromKaku) {
        alert(
            _maxOdApplyAlertMsg(
                "maxOdAteNeedKaku",
                "※ 自動計算:   (50−アテ長さ)×2×√2 　15角〜43角でアテを選んだ場合のみ選択可能"
            )
        );
        return;
    }
    maxOdApplySource = "ate";
    // カード active 切り替え
    ["modeNormal", "modeEccentric", "modeCorner", "modeAte"].forEach(function (id) {
        const el = $id(id);
        if (el) el.classList.remove("active");
    });
    const ateCard = $id("modeAte");
    if (ateCard) ateCard.classList.add("active");
    // 寸法入力を隠してアテ長さモードのヒントを表示
    ["normalStockInputs", "eccentricInputs", "cornerInputs"].forEach(function (id) {
        const el = $id(id);
        if (el) el.style.display = "none";
    });
    const hint = $id("ateInputHint");
    if (hint) hint.style.display = "block";
}


function openMaxOdCalcDrawer() {
    const d = $id("maxOdCalcDrawer");
    if (!d || !d.hidden) return;
    d.hidden = false;
    if (maxOdApplySource === "ate" && ateLengthFromKaku) {
        selectMaxOdApplyFromAte();
    } else {
        setCalcMode(currentCalcMode);
    }
    syncMaxOdAteModeUi();
}

function closeMaxOdCalcDrawer() {
    const d = $id("maxOdCalcDrawer");
    if (d) d.hidden = true;
}

function computeMaxOdFromNormalStockFields() {
    const aEl = $id("valStockA");
    const bEl = $id("valStockB");
    if (!aEl || !bEl) return null;
    const A = parseFloat(String(aEl.value).replace(/,/g, ""));
    const B = parseFloat(String(bEl.value).replace(/,/g, ""));
    if (isNaN(A) || isNaN(B) || !isFinite(A) || !isFinite(B)) return null;
    return Math.sqrt(A * A + B * B).toFixed(3);
}

function computeMaxOdFromEccentricFields() {
    const A = parseFloat(String($id("valA").value).replace(/,/g, ""));
    const B = parseFloat(String($id("valB").value).replace(/,/g, ""));
    if (isNaN(A) || isNaN(B) || !isFinite(A) || !isFinite(B)) return null;
    return Math.sqrt(Math.pow(A * 2, 2) + Math.pow(B * 2, 2)).toFixed(2);
}

function computeMaxOdFromCornerFields() {
    const W = parseFloat(String($id("valCornW").value).replace(/,/g, ""));
    const H = parseFloat(String($id("valCornH").value).replace(/,/g, ""));
    if (isNaN(W) || isNaN(H) || !isFinite(W) || !isFinite(H)) return null;
    const diaY = (W / 2.0 + H) * 2.0;
    const diaX = W;
    return Math.sqrt(Math.pow(diaY, 2) + Math.pow(diaX, 2)).toFixed(2);
}

function computeMaxOdFromAteLengthField() {
    const el = $id("ateLength");
    if (!el) return null;
    const v = parseFloat(String(el.value).replace(/,/g, ""));
    if (isNaN(v) || !isFinite(v)) return null;
    const ans1 = 50 - v;
    const side = ans1 * 2;
    return (side * Math.SQRT2).toFixed(2);
}

function _maxOdApplyAlertMsg(key, jaFallback) {
    if (typeof window.NC_I18N !== "undefined" && window.NC_I18N.t) {
        const t = window.NC_I18N.t(key);
        if (t && t !== key) return t;
    }
    return jaFallback;
}

function applyMaxOdCalcDrawer() {
    if (maxOdApplySource === "ate") {
        if (!ateLengthFromKaku) {
            alert(
                _maxOdApplyAlertMsg(
                    "maxOdAteNeedKaku",
                    "※ 自動計算:   (50−アテ長さ)×2×√2 　15角〜43角でアテを選んだ場合のみ選択可能"
                )
            );
            return;
        }
        const s = computeMaxOdFromAteLengthField();
        if (s == null) {
            alert(_maxOdApplyAlertMsg("maxOdApplyErrAte", "アテ長さを半角数値で入力してください。"));
            return;
        }
        $id("maxOD").value = s;
    } else {
        let s = null;
        if (currentCalcMode === "normal") {
            s = computeMaxOdFromNormalStockFields();
            if (s == null) {
                alert(
                    _maxOdApplyAlertMsg("maxOdApplyErrNormal", "通常モードでは母材 A・B を半角数値で入力してください。")
                );
                return;
            }
        } else if (currentCalcMode === "eccentric") {
            s = computeMaxOdFromEccentricFields();
            if (s == null) {
                alert(
                    _maxOdApplyAlertMsg(
                        "maxOdApplyErrEccentric",
                        "偏心モードでは距離 A・B を半角数値で入力してください。"
                    )
                );
                return;
            }
        } else if (currentCalcMode === "corner") {
            s = computeMaxOdFromCornerFields();
            if (s == null) {
                alert(
                    _maxOdApplyAlertMsg(
                        "maxOdApplyErrCorner",
                        "角ありモードでは母材幅・追加高さを半角数値で入力してください。"
                    )
                );
                return;
            }
        }
        $id("maxOD").value = s;
    }
    // 適用時のモードを確定として記録（生成時に参照）
    lastAppliedCalcMode = maxOdApplySource === "ate" ? "normal" : currentCalcMode;
    clearMaxOdApplyFromAte();
    closeMaxOdCalcDrawer();
    updateProgressiveReveal();
}


/**
 * Enter で次の欄へ進む前の検証。表示中の欄だけ必須とする（非表示はチェックしない）。
 */
function validateEnterNavField(el) {
    if (!el || !el.id) return { ok: true };
    if (!isEnterNavVisible(el)) return { ok: true };

    const wt = ($id("workType") && $id("workType").value) || "";
    const w = (s) => s != null && String(s).trim() !== "";
    const numOk = (s) => {
        const x = parseFloat(String(s).replace(/,/g, ""));
        return !isNaN(x) && isFinite(x);
    };

    const id = el.id;

    switch (id) {
        case "machineSelect":
            return w(el.value) ? { ok: true } : { ok: false, msg: "使用機械を選択してください。" };
        case "workType":
            return w(el.value) ? { ok: true } : { ok: false, msg: "ワーク種別を選択してください。" };
        case "v1a":
            return w(el.value) ? { ok: true } : { ok: false, msg: "図番（PM-の番号）を入力してください。" };
        case "v1b":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "枝番を半角数値で入力してください。" };
        case "v1c":
            return { ok: true };
        case "v2":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "工程No を半角数値で入力してください。" };
        case "ateLength":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "アテ長さを半角数値で入力してください。" };
        case "workerName":
            return w(el.value)
                ? { ok: true }
                : { ok: false, msg: "作成者を入力するか、ショートカットボタンで選んでください。" };
        case "tubeSpecSelect":
            if (wt !== "Tube") return { ok: true };
            return w(el.value) ? { ok: true } : { ok: false, msg: "チューブ規格を選択してください。" };
        case "tubeLengthSelect":
            if (wt !== "Tube") return { ok: true };
            return w(el.value) ? { ok: true } : { ok: false, msg: "チューブ長さ(L)を選択してください。" };
        case "valStockA":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "通常の「母材 A」を半角数値で入力してください。" };
        case "valStockB":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "通常の「母材 B」を半角数値で入力してください。" };
        case "valA":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "偏心の「距離 A (横)」を半角数値で入力してください。" };
        case "valB":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "偏心の「距離 B (縦)」を半角数値で入力してください。" };
        case "valCornW":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "角ありの「母材 幅」を半角数値で入力してください。" };
        case "valCornH":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "角ありの「追加 高さ」を半角数値で入力してください。" };
        case "valPartnerD":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "相手径(Φ)を半角数値で入力してください。" };
        case "yoseMethod":
            return w(el.value) ? { ok: true } : { ok: false, msg: "ヨセの方法を選択してください。" };
        case "yoseAngle":
            return w(el.value) ? { ok: true } : { ok: false, msg: "テーパ角度を選択してください。" };
        case "yoseD": {
            if (!w(el.value) || !numOk(el.value)) {
                return { ok: false, msg: "ヨセの相手径を半角数値で入力してください。" };
            }
            const yoseDCheck = validateYoseDDiameter({
                yoseD: el.value,
                workType: wt,
                tubeSpec: ($id("tubeSpecSelect") || {}).value || "",
                internalStyle: currentInternalStyle,
            });
            if (!yoseDCheck.ok) {
                return { ok: false, msg: yoseDCheck.msg };
            }
            return { ok: true };
        }
        case "yoseTotalLength":
            if (currentInternalStyle !== "YoseRelay") return { ok: true };
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "ヨセ中継の全長を半角数値で入力してください。" };
        case "yosePartnerDepth":
            if (currentInternalStyle !== "YoseRelay") return { ok: true };
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "ヨセ中継の相手径深さを半角数値で入力してください。" };
        case "maxOD": {
            const maxOd = parseSimpleNumberOrFormula(el.value);
            if (!w(el.value) || isNaN(maxOd) || !isFinite(maxOd)) {
                return { ok: false, msg: "外径最大径を半角数値で入力してください。" };
            }
            if (maxOd <= 0) {
                return { ok: false, msg: "外径最大径は 0 より大きい値にしてください。" };
            }
            return { ok: true };
        }
        case "internalStyleDrawerToggle":
            return typeof currentInternalStyle !== "undefined" && w(currentInternalStyle)
                ? { ok: true }
                : { ok: false, msg: "内径加工スタイルを選択してください。（Enter または ▼で開き、カードを選ぶ）" };
        case "drillMode":
            return w(el.value) ? { ok: true } : { ok: false, msg: "ドリルモードを選択してください。" };
        case "drillDepth":
            return w(el.value) && numOk(el.value)
                ? { ok: true }
                : { ok: false, msg: "ドリル深さ(Z)を半角数値で入力してください。" };
        case "idDepth": {
            if (w(el.value) && numOk(el.value)) return { ok: true };
            const usesIpDepth =
                typeof currentInternalStyle !== "undefined" &&
                (currentInternalStyle === "CrossBig" ||
                    currentInternalStyle === "CrossSmall" ||
                    currentInternalStyle === "Ichimonji");
            return {
                ok: false,
                msg: usesIpDepth
                    ? "IP(内径交差点)を半角数値で入力してください。"
                    : "内径深さ(図面値)を半角数値で入力してください。",
            };
        }
        default:
            return { ok: true };
    }
}

/**
 * Enter で進む入力欄の順（画面上のセクション順に合わせる）
 * 非表示の欄は isEnterNavVisible でスキップされる
 */
var ENTER_NAV_ORDER = [
    // ── 視覚レイアウト順（カード表示順）──────────────────────
    // カード1: ファイル情報（常時表示）
    "v1a", // 図番
    "v1b", // 枝番
    "v1c", // 改訂
    "v2", // 工程No
    "workerName", // 作成者
    // カード2: 機械・ワーク選択（ファイル情報入力後に表示）
    "machineSelect", // 使用機械
    "ateLength", // アテ長さ
    "workType", // テンプレート
    // カード2 オプション行（テンプレートに応じて表示）
    "mhOdTool", // MH外径バイト
    "g12bNoseRSelect", // G12B: 根本ノーズR
    "tubeSpecSelect", // チューブ規格
    "tubeLengthSelect", //         長さ
    // カード3: 加工設定（テンプレート選択後に表示）
    "maxOD", // 外径最大径
    "selM99P100", // M99P100モード
    "internalStyleDrawerToggle", // 内径加工スタイル（ドロワー切替）
    "idDepth", // 内径深さ
    // ── 任意: 加工寸法（表示されているものだけナビ対象） ──
    "valStockA", // 通常: 外径A
    "valStockB", //       外径B
    "valA", // 偏心: A寸法
    "valB", //       B寸法
    "valCornW", // コーナー: 幅
    "valCornH", //           高さ
    "valPartnerD", // 相手径
    "yoseMethod", // ヨセ: 方法
    "yoseAngle", //       角度
    "yoseD", //       加工径
    "yoseTotalLength", //       全長
    "yosePartnerDepth", //       相手径深さ
    "drillMode", // ドリルモード
    "drillDepth", // ドリル深さ
    "m12DrillType", // M12: ドリル種別
    "m12CrossMethod", //      交差穴方法
    "g18CrossMethod", // G18_40/42: 交差穴方法
    "m8CrossMethod", // M8: 横穴＆中バリ処理 方法
];

function isEnterNavVisible(el) {
    if (!el || !el.classList || !el.classList.contains("enter-target")) return false;
    let n = el;
    while (n && n !== document.documentElement) {
        const cs = window.getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        n = n.parentElement;
    }
    return true;
}

function getNextEnterNavField(fromEl) {
    const ids = ENTER_NAV_ORDER;
    const start = ids.indexOf(fromEl.id);
    if (start === -1) return null;
    for (let i = start + 1; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (el && isEnterNavVisible(el)) return el;
    }
    return null;
}

document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const target = e.target;
    if (!target.classList || !target.classList.contains("enter-target")) return;

    // 内径加工スタイル: ドロワーが閉じているとき Enter で開く（このときは次フィールドへ進まない）
    if (target.id === "internalStyleDrawerToggle") {
        const host = $id("internalStyleDrawer");
        if (host && host.style.display !== "none" && !isInternalStyleDrawerOpen) {
            e.preventDefault();
            isInternalStyleDrawerOpen = true;
            syncInternalStyleDrawerPanel();
            return;
        }
    }

    const chk = validateEnterNavField(target);
    if (!chk.ok) {
        e.preventDefault();
        alert(chk.msg);
        return;
    }

    e.preventDefault();

    let next = getNextEnterNavField(target);
    if (!next) {
        const ids = ENTER_NAV_ORDER;
        const start = ids.indexOf(target.id);
        if (start === -1) {
            const inputs = Array.from(document.querySelectorAll(".enter-target")).filter(isEnterNavVisible);
            const index = inputs.indexOf(target);
            if (index > -1 && index < inputs.length - 1) {
                next = inputs[index + 1];
            }
        } else {
            const genBtn = document.querySelector(".btn-gen");
            if (genBtn) genBtn.focus();
            return;
        }
    }

    if (next) {
        next.focus();
        if (next.tagName === "INPUT") next.select();
    }
});

function runGeneration(fromUserButton = false) {
    const workTypeEl = $id("workType");
    const workTypeVal = workTypeEl ? workTypeEl.value : "G78";

    const chkOkuBite = $id("chkOkuBite");
    const m12Resolved =
        workTypeVal === "M12" || workTypeVal === "M12_MH"
            ? resolveM12FinishAndProfile()
            : { finishType: "hss", profile: "drill_ichi_hira" };
    const _isG18Small =
        workTypeVal === "G18_40" ||
        workTypeVal === "G18_42" ||
        workTypeVal === "G18_40_MH" ||
        workTypeVal === "G18_42_MH";
    const g18Resolved = _isG18Small
        ? resolveG18CrossFinishAndProfile()
        : { finishType: "halfmoon", profile: "cross_oku" };
    const m8Resolved = isM8WorkType(workTypeVal)
        ? resolveM8CrossFinishAndProfile()
        : { profile: "hss_oku" };
    const isOkuBiteEnabled =
        workTypeVal === "M12" || workTypeVal === "M12_MH"
            ? m12ProfileImpliesOku(m12Resolved.profile)
            : chkOkuBite
              ? chkOkuBite.checked
              : false;

    const m99SelEl = $id("selM99P100");
    const m99Mode = m99SelEl ? m99SelEl.value : "";

    const inputData = {
        drawNumA: $id("v1a").value,
        drawNumB: $id("v1b").value,
        drawRev: $id("v1c").value,
        processNum: $id("v2").value,
        workerName: $id("workerName").value,
        ateLength: $id("ateLength").value,
        maxOD: $id("maxOD").value,

        drillDepth: $id("drillDepth").value,
        idDepth: $id("idDepth").value,
        drillMode: $id("drillMode").value,
        workType: workTypeVal,
        m12FinishType: m12Resolved.finishType,
        m12Profile: m12Resolved.profile,
        m12BaitoDrillMode: getM12BaitoDrillModeForInput(),
        g18FinishType: g18Resolved.finishType,
        g18Profile: g18Resolved.profile,
        m8Profile: m8Resolved.profile,
        m99Mode: m99Mode,
        m99p100: m99Mode === "on",

        internalStyle: currentInternalStyle,
        cpVal: $id("cpVal").value,
        valPartnerD: $id("valPartnerD").value,
        okuBiteEnabled: isOkuBiteEnabled,

        // ヨセ関連
        yoseMethod: $id("yoseMethod").value,
        yoseAngle: $id("yoseAngle").value,
        yoseD: $id("yoseD").value,
        yoseTotalLength: $id("yoseTotalLength") ? $id("yoseTotalLength").value : "",
        yosePartnerDepth: $id("yosePartnerDepth") ? $id("yosePartnerDepth").value : "",

        tubeSpec: $id("tubeSpecSelect").value,
        tubeLength: $id("tubeLengthSelect").value,

        calcMode: lastAppliedCalcMode,
        valCornW: $id("valCornW").value,
        valCornH: $id("valCornH").value,

        mhOdTool: $id("mhOdTool") ? $id("mhOdTool").value : "外径荒",
        g12bNoseR: $id("g12bNoseRSelect") ? $id("g12bNoseRSelect").value : "none",
    };

    if (isYoseMachiningStyle(currentInternalStyle) || isYoseRelayStyle(currentInternalStyle)) {
        const yoseDCheck = validateYoseDDiameter(inputData);
        if (!yoseDCheck.ok) {
            if (fromUserButton) {
                const yoseEl = $id("yoseD");
                if (yoseEl) {
                    yoseEl.setCustomValidity(yoseDCheck.msg);
                    yoseEl.reportValidity();
                }
            }
            return;
        }
    }

    // 差分ビュー用: 生成前に前回テキストを退避
    if (_ncLastPlainGCode) _ncPrevPlainGCode = _ncLastPlainGCode;

    const machineName = $id("machineSelect").value;
    const genResult = generateGCode(inputData, machineName);
    const gcodeHtml =
        genResult && typeof genResult === "object" && genResult.displayHtml !== undefined
            ? genResult.displayHtml
            : String(genResult);
    _ncLastPlainGCode =
        genResult && typeof genResult === "object" && genResult.plainText !== undefined ? genResult.plainText : null;

    const isGenError = _ncLastPlainGCode === null;

    // バリデーションエラーはボタン押下時のみ表示する
    if (isGenError && !fromUserButton) {
        return;
    }

    // 新規生成時は逆ハイライトをリセット
    clearTimeout(g_flashTimer);
    clearInterval(g_flashBlink);
    g_flashLineIdx = -1;
    g_flashVisible = true;

    if (!isGenError) {
        // 各行を data-ln でラップしてツールパスからのジャンプを可能にする
        const wrappedHtml = gcodeHtml
            .split("\n")
            .map((l, i) => `<span class="gc-line" data-ln="${i + 1}">${l}</span>`)
            .join("\n");
        $id("resultArea").innerHTML = wrappedHtml;
    } else {
        $id("resultArea").innerHTML = gcodeHtml;
    }
    applyHighlightFilterToResultArea();
    // 生成後は必ずロック状態に戻す
    (function() {
        const area = $id("resultArea");
        const btn  = $id("resultLockBtn");
        if (area) { area.contentEditable = "false"; area.classList.remove("result-editing"); area.classList.add("result-locked"); }
        if (btn)  { btn.textContent = "🔒 編集ロック中"; btn.className = "btn-result-lock btn-result-lock--locked"; btn.title = "クリックすると編集モードに切り替わります"; }
    })();

    // デバッグパネルが開いていれば自動更新
    const _dbgPanel = $id("debugPanel");
    if (_dbgPanel && !_dbgPanel.hidden) renderDebugPanel();

    const saveBtn = $id("saveBtn");
    if (isGenError) {
        saveBtn.style.display = "none";
        saveBtn.disabled = true;
        saveBtn.classList.remove("btn-save--dirty");
    } else {
        saveBtn.style.display = "block";
        saveBtn.disabled = false;
        saveBtn.classList.remove("btn-save--dirty");
        _ncInputDirty = false;
    }

    if (typeof drawPreview === "function") drawPreview(true);

    // 生成成功時のみ履歴に追加 + 差分ビューをリセット
    if (!isGenError) {
        _pushHistory(inputData, machineName, gcodeHtml, _ncLastPlainGCode);
        if (_ncDiffVisible) {
            _ncDiffVisible = false;
            const btn = $id("diffToggleBtn");
            if (btn) { btn.textContent = "前回との差分"; btn.classList.remove("active"); }
        }
        // workType 説明を更新
        updateWorkTypeDesc();
    }
}

// ========== input export / import ==========

/** 保存対象フィールド: id → "val"(input/select値) or "chk"(checkbox) or "mode"(特殊) */
const NC_EXPORT_FIELDS = [
    { id: "machineSelect", t: "val" },
    { id: "workType", t: "val" },
    { id: "v1a", t: "val" },
    { id: "v1b", t: "val" },
    { id: "v1c", t: "val" },
    { id: "v2", t: "val" },
    { id: "workerName", t: "val" },
    { id: "ateLength", t: "val" },
    { id: "maxOD", t: "val" },
    { id: "selM99P100", t: "val" },
    { id: "drillMode", t: "val" },
    { id: "drillDepth", t: "val" },
    { id: "idDepth", t: "val" },
    { id: "valStockA", t: "val" },
    { id: "valStockB", t: "val" },
    { id: "valA", t: "val" },
    { id: "valB", t: "val" },
    { id: "valCornW", t: "val" },
    { id: "valCornH", t: "val" },
    { id: "valPartnerD", t: "val" },
    { id: "yoseMethod", t: "val" },
    { id: "yoseAngle", t: "val" },
    { id: "yoseD", t: "val" },
    { id: "yoseTotalLength", t: "val" },
    { id: "yosePartnerDepth", t: "val" },
    { id: "tubeSpecSelect", t: "val" },
    { id: "tubeLengthSelect", t: "val" },
    { id: "m12DrillType", t: "val" },
    { id: "m12CrossMethod", t: "val" },
    { id: "g18CrossMethod", t: "val" },
    { id: "m8CrossMethod", t: "val" },
    { id: "g12bNoseRSelect", t: "val" },
    { id: "chkOkuBite", t: "chk" },
];

function exportInputJson() {
    const data = { _version: 1, _exported: new Date().toISOString() };
    NC_EXPORT_FIELDS.forEach(({ id, t }) => {
        const el = $id(id);
        if (!el) return;
        data[id] = t === "chk" ? el.checked : el.value;
    });
    data._calcMode = currentCalcMode;
    data._internalStyle = currentInternalStyle;

    const v1a = $id("v1a").value || "noname";
    const v1b = $id("v1b").value || "";
    let v1c = $id("v1c").value;
    if (v1c === "NONE") v1c = "";
    const dt = new Date();
    const dateStr = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
    const fileName = `NC-INPUT_PM-${v1a}-${v1b}${v1c}_${dateStr}.json`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function importInputJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = function () {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || data._version !== 1) {
                    alert("このファイルはNC入力JSONではありません。");
                    return;
                }
                if (data.workType === "Tonbo") {
                    data.workType = "";
                }
                // calcMode / internalStyle を先に復元（UI更新の前提）
                if (data._calcMode) {
                    setCalcMode(data._calcMode);
                }
                // フィールド復元
                NC_EXPORT_FIELDS.forEach(({ id, t }) => {
                    const el = $id(id);
                    if (!el || !(id in data)) return;
                    if (t === "chk") {
                        el.checked = !!data[id];
                    } else {
                        el.value = data[id];
                    }
                });
                // workType変更後のUI更新
                updateWorkTypeSettings();
                // internalStyle 復元
                if (data._internalStyle) {
                    setInternalStyle(data._internalStyle);
                }
                // チューブ: 規格 → 長さを再構築してから長さ値を再セット
                if (data.tubeSpecSelect) {
                    updateTubeLengths();
                    const tl = $id("tubeLengthSelect");
                    if (tl && data.tubeLengthSelect) tl.value = data.tubeLengthSelect;
                }
                // 全フィールド復元後にプログレッシブ・リビールを再評価（全セクション表示）
                updateProgressiveReveal();
                runGeneration(false);
                _showImportToast(`✅ インポート完了: ${file.name}`);
            } catch (err) {
                alert("JSON 読み込みに失敗しました: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}

function _showImportToast(msg) {
    let t = document.getElementById("ncImportToast");
    if (!t) {
        t = document.createElement("div");
        t.id = "ncImportToast";
        t.style.cssText =
            "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;" +
            "background:#1a2a1a;border:1px solid #4caf50;color:#a5d6a7;padding:10px 20px;" +
            "border-radius:6px;font-family:monospace;font-size:13px;white-space:nowrap;" +
            "box-shadow:0 4px 16px rgba(0,0,0,0.6);transition:opacity 0.4s;";
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
        t.style.opacity = "0";
    }, 3500);
}

function downloadFile() {
    const content = _ncLastPlainGCode;
    if (content == null || content === "") {
        const msg =
            typeof window.NC_I18N !== "undefined" && window.NC_I18N.t
                ? window.NC_I18N.t("saveError")
                : "保存できるプレーンテキストがありません。先に Gコード生成を成功させてください。";
        alert(msg);
        return;
    }
    let v1a = $id("v1a").value;
    if (!v1a) v1a = "noname";
    const v1b = $id("v1b").value;
    let v1c = $id("v1c").value;
    if (v1c === "NONE") v1c = "";
    const v2 = $id("v2").value;
    const wtEl = $id("workType");
    const workType = wtEl && wtEl.value ? wtEl.value : "UNKNOWN";
    // =Q は本アプリで生成した保存プログラムであることを示す固定サフィックス。末尾はワーク種別(#workType の value)
    const fileName = `PM-${v1a}-${v1b}${v1c}=No,${v2}=Q=${workType}.txt`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    exportInputJson();
}

// ========== F6: workType 説明 ==========

const WORK_TYPE_DESCRIPTIONS = {
    M12:            "M12 — 内径 Φ4.0 / HGDR φ4.05 / 仕上げ: HSS・HGDR・バイト選択",
    M15:            "M15 — 内径 Φ6.0 / ドリル φ3.3",
    M18:            "M18 — 内径 Φ8.0 / ドリル φ7.0",
    M22:            "M22 — 内径 Φ10.0 / ドリル φ7.0",
    G78:            "G78 — 内径 Φ16.0 / ドリル φ14.0",
    M40:            "M40 — 内径 Φ22.0 / ドリル φ14.0 /",
    M12_MH:         "M12-MH — 内径 Φ4.0 / ドリル φ4.05 /",
    M15_MH:         "M15-MH — 内径 Φ6.0 / ドリル φ3.3 /",
    M18_MH:         "M18-MH — 内径 Φ8.0 / ドリル φ7.0 /",
    M22_MH:         "M22-MH — 内径 Φ10.0 / ドリル φ7.0 /",
    G78_MH:         "G78-MH — 内径 Φ16.0 / ドリル φ14.0 /",
    M40_MH:         "M40-MH — 内径 Φ22.0 / ドリル φ14.0 /",
    M42X3_25175:    "M42×3 Φ25.175 ストレート — 内径 Φ25.175 / 内径バイト Φ16",
    M42X3_25175_16: "M42×3 Φ25.175→Φ16 段付き — 内径 Φ16 / 内径バイト Φ16",
    M42X3_25175_20: "M42×3 Φ25.175→Φ20 段付き — 内径 Φ20 / 内径バイト Φ16",
    M42X3_25175_22: "M42×3 Φ25.175→Φ22 段付き — 内径 Φ22 / 内径バイト Φ16",
    M8_21:          "M8(φ2.1) — 内径 Φ2.1 / ドリル φ2.2",
    M8_31:          "M8(φ3.1) — 内径 Φ3.1 / ドリル φ3.2",
    J_M8_300:       "J-M8-ASWD-300 — ドリル φ3.0(ASWD) / スタイル固定: CrossSmall / 深さ自動計算",
    G18_40:         "G18(φ4.0) — 内径 Φ4.0 / HGDR φ4.05 / ",
    G18_42:         "G18(φ4.2) — 内径 Φ4.2 / HGDR φ4.15 / ",
    G18_62:         "G18(φ6.2) — 内径 Φ6.2 / HGDR φ4.15 / HGDR下穴",
    G18_655:        "G18(φ6.55) — 内径 Φ6.55 / HGDRφ4.15 / HGDR下穴",
    G18_6175:       "G18(φ6.175) — 内径 Φ6.175 / HGDRφ4.15 / HGDR下穴",
    G18_40_MH:      "G18(φ4.0)-MH — 内径 Φ4.0 / HGDRφ4.05 /",
    G18_42_MH:      "G18(φ4.2)-MH — 内径 Φ4.2 / HGDRφ4.15 /",
    G18_62_MH:      "G18(φ6.2)-MH — 内径 Φ6.2 / HGDRφ4.15 /HGDR下穴",
    G18_655_MH:     "G18(φ6.55)-MH — 内径 Φ6.55 / HGDRφ4.15 /HGDR下穴",
    G18_6175_MH:    "G18(φ6.175)-MH — 内径 Φ6.175 / HGDRφ4.15 /HGDR下穴",
    G12B_G_ST_12175_8: "G12B-G-ST-12.175-8 — 内径 Φ8 / ドリル φ7.0 / 内径バイト Φ8",
    TOMESEN_M16: "トメセン M16 — 内径 Φ8.0 / ドリル φ7.0 / バイト Φ8",
    TOMESEN_M18: "トメセン M18 — 内径 Φ10 / ドリル φ7 / バイト Φ8",
    TOMESEN_M22: "トメセン M22 — 内径 Φ12 / ドリル φ10.7 / バイト Φ8",
    TOMESEN_M24: "トメセン M24 — 内径 Φ16 / ドリル φ14 / バイト Φ16",
    TOMESEN_M35: "トメセン M35 — 内径 Φ22 / ドリル φ14 / バイト Φ16",
    Tube:           "チューブ 規格とチューブ長さを選択して使用",
};

function updateWorkTypeDesc() {
    const sel = $id("workType");
    const desc = $id("workTypeDesc");
    if (!sel || !desc) return;
    const txt = WORK_TYPE_DESCRIPTIONS[sel.value];
    if (txt) {
        desc.textContent = txt;
        desc.hidden = false;
    } else {
        desc.hidden = true;
    }
}

// ========== F5: バリデーションリアルタイム化 ==========

function _setFieldError(fieldId, msg) {
    const el = $id(fieldId);
    if (!el) return;
    let hint = el.parentElement && el.parentElement.querySelector(".field-inline-error");
    if (!hint) {
        hint = document.createElement("div");
        hint.className = "field-inline-error";
        (el.parentElement || el).appendChild(hint);
    }
    if (msg) {
        hint.textContent = msg;
        hint.hidden = false;
        el.classList.add("field-error");
    } else {
        hint.textContent = "";
        hint.hidden = true;
        el.classList.remove("field-error");
    }
}

function _validateFieldOnBlur(fieldId) {
    const el = $id(fieldId);
    if (!el) return;
    const val = el.value.trim();

    if (fieldId === "idDepth") {
        if (val === "") { _setFieldError(fieldId, null); return; }
        const n = parseFloat(val);
        if (isNaN(n)) { _setFieldError(fieldId, "数値で入力してください"); return; }
        const style = typeof currentInternalStyle !== "undefined" ? currentInternalStyle : "";
        const skipCheck = style === "CrossSmall" || style === "Yose" || style === "YoseRelay" || style === "Tube";
        if (!skipCheck && n <= 7) { _setFieldError(fieldId, "7より大きい値が必要です"); return; }
        _setFieldError(fieldId, null);
        return;
    }
    if (fieldId === "ateLength") {
        if (val === "") { _setFieldError(fieldId, null); return; }
        const n = parseFloat(val);
        if (isNaN(n)) { _setFieldError(fieldId, "数値で入力してください"); return; }
        if (n <= 0) { _setFieldError(fieldId, "0より大きい値が必要です"); return; }
        _setFieldError(fieldId, null);
        return;
    }
    if (fieldId === "maxOD") {
        if (val === "") { _setFieldError(fieldId, null); return; }
        const n = parseSimpleNumberOrFormula(val);
        if (isNaN(n) || !isFinite(n)) { _setFieldError(fieldId, "数値または計算式を入力してください"); return; }
        if (n <= 0) { _setFieldError(fieldId, "正の値が必要です"); return; }
        _setFieldError(fieldId, null);
        return;
    }
    if (fieldId === "cpVal") {
        if (val === "") { _setFieldError(fieldId, null); return; }
        const n = parseFloat(val);
        if (isNaN(n)) { _setFieldError(fieldId, "数値で入力してください"); return; }
        _setFieldError(fieldId, null);
        return;
    }
    if (fieldId === "valPartnerD") {
        if (val === "") { _setFieldError(fieldId, null); return; }
        const n = parseFloat(val);
        if (isNaN(n)) { _setFieldError(fieldId, "数値で入力してください"); return; }
        if (n <= 0) { _setFieldError(fieldId, "正の値が必要です"); return; }
        if (typeof currentInternalStyle !== "undefined" && currentInternalStyle === "CrossSmall") {
            const wt = $id("workType") ? $id("workType").value : "";
            const ts = $id("tubeSpecSelect") ? $id("tubeSpecSelect").value : "";
            const csCheck = validateCrossSmallPartnerDia({ valPartnerD: val, workType: wt, tubeSpec: ts });
            if (!csCheck.ok) { _setFieldError(fieldId, csCheck.msg); return; }
        }
        _setFieldError(fieldId, null);
        return;
    }
    if (fieldId === "yoseD") {
        if (val === "") { _setFieldError(fieldId, null); return; }
        const wt = $id("workType") ? $id("workType").value : "";
        const res = validateYoseDDiameter({
            yoseD: val,
            workType: wt,
            tubeSpec: $id("tubeSpecSelect") ? $id("tubeSpecSelect").value : "",
            internalStyle: typeof currentInternalStyle !== "undefined" ? currentInternalStyle : "",
        });
        _setFieldError(fieldId, res.ok ? null : res.msg);
        return;
    }
}

function initRealTimeValidation() {
    ["idDepth", "ateLength", "maxOD", "cpVal", "valPartnerD", "yoseD"].forEach((id) => {
        const el = $id(id);
        if (el) {
            el.addEventListener("blur", () => _validateFieldOnBlur(id));
        }
    });
}

// ========== F1: 生成履歴 / Undo ==========

const _NC_HISTORY_MAX = 10;
var _ncHistory = [];

function _pushHistory(inputData, machineName, gcodeHtml, plainText) {
    const dt = new Date();
    const label =
        (inputData.workType || "?") +
        " — " +
        machineName +
        " — " +
        (inputData.drawNumA || "未設定") +
        " — " +
        dt.toLocaleTimeString("ja-JP");
    _ncHistory.unshift({ id: dt.getTime(), label, inputData, machineName, gcodeHtml, plainText });
    if (_ncHistory.length > _NC_HISTORY_MAX) _ncHistory.pop();
    _renderHistoryPanel();
}

function _renderHistoryPanel() {
    const list = $id("historyList");
    if (!list) return;
    if (_ncHistory.length === 0) {
        list.innerHTML = '<div class="history-empty">まだ生成履歴はありません</div>';
        return;
    }
    list.innerHTML = _ncHistory
        .map(
            (entry, idx) =>
                `<div class="history-item" onclick="_restoreHistory(${idx})">` +
                `<span class="history-item__label">${escapeHtml(entry.label)}</span>` +
                `</div>`
        )
        .join("");
}

function _restoreHistory(idx) {
    const entry = _ncHistory[idx];
    if (!entry) return;

    // 入力値を復元（既存の importInputJson と同じ流れ）
    const inp = entry.inputData;

    if (inp._calcMode || inp.calcMode) setCalcMode(inp._calcMode || inp.calcMode);

    // フィールドを直接セット
    const fieldMap = {
        machineSelect: entry.machineName,
        workType: inp.workType,
        v1a: inp.drawNumA,
        v1b: inp.drawNumB,
        v1c: inp.drawRev,
        v2: inp.processNum,
        workerName: inp.workerName,
        ateLength: inp.ateLength,
        maxOD: inp.maxOD,
        drillDepth: inp.drillDepth,
        idDepth: inp.idDepth,
        drillMode: inp.drillMode,
        cpVal: inp.cpVal,
        valPartnerD: inp.valPartnerD,
        yoseMethod: inp.yoseMethod,
        yoseAngle: inp.yoseAngle,
        yoseD: inp.yoseD,
        yoseTotalLength: inp.yoseTotalLength,
        yosePartnerDepth: inp.yosePartnerDepth,
        valCornW: inp.valCornW,
        valCornH: inp.valCornH,
    };
    for (const [id, val] of Object.entries(fieldMap)) {
        const el = $id(id);
        if (el && val != null) el.value = val;
    }
    if (inp.m99Mode) { const sel = $id("selM99P100"); if (sel) sel.value = inp.m99Mode; }

    updateWorkTypeSettings();
    if (inp.internalStyle) setInternalStyle(inp.internalStyle);
    if (inp.tubeSpec) {
        const ts = $id("tubeSpecSelect");
        if (ts) { ts.value = inp.tubeSpec; updateTubeLengths(); }
    }
    if (inp.tubeLength) { const tl = $id("tubeLengthSelect"); if (tl) tl.value = inp.tubeLength; }

    // 出力を直接復元
    const resultArea = $id("resultArea");
    if (resultArea && entry.gcodeHtml) resultArea.innerHTML = entry.gcodeHtml;
    if (entry.plainText) _ncLastPlainGCode = entry.plainText;

    updateProgressiveReveal();
    applyHighlightFilterToResultArea();
    if (typeof drawPreview === "function") drawPreview(true);

    toggleHistoryPanel();
    _showImportToast("⏱ 履歴復元: " + entry.label);
}

function toggleHistoryPanel() {
    const panel = $id("historyPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) _renderHistoryPanel();
}

// ========== F4: 生成差分ビュー ==========

var _ncPrevPlainGCode = null;
var _ncDiffVisible = false;

// LCS ベースの行差分計算
function _computeLineDiff(oldText, newText) {
    if (!oldText || !newText) return null;
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");

    // 短い方を最大 500 行に制限してパフォーマンス確保
    if (oldLines.length > 500 || newLines.length > 500) {
        return { oldLines, newLines, ops: null }; // diff 不可
    }

    const m = oldLines.length;
    const n = newLines.length;

    // LCS テーブル
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // バックトラック
    const ops = []; // { type: 'keep'|'add'|'remove', line }
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            ops.unshift({ type: "keep", line: newLines[j - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.unshift({ type: "add", line: newLines[j - 1] });
            j--;
        } else {
            ops.unshift({ type: "remove", line: oldLines[i - 1] });
            i--;
        }
    }
    return { oldLines, newLines, ops };
}

function toggleDiffView() {
    if (!_ncPrevPlainGCode) {
        _showImportToast("⚠ 前回の生成結果がありません。2回以上生成してから差分を確認してください。");
        return;
    }
    _ncDiffVisible = !_ncDiffVisible;
    _renderDiffOrNormal();
    const btn = $id("diffToggleBtn");
    if (btn) {
        btn.textContent = _ncDiffVisible ? "差分を隠す" : "前回との差分";
        btn.classList.toggle("active", _ncDiffVisible);
    }
}

function _renderDiffOrNormal() {
    const resultArea = $id("resultArea");
    if (!resultArea) return;
    if (!_ncDiffVisible || !_ncPrevPlainGCode || !_ncLastPlainGCode) {
        // 通常表示に戻す
        runGeneration(false);
        return;
    }

    const diff = _computeLineDiff(_ncPrevPlainGCode, _ncLastPlainGCode);
    if (!diff || !diff.ops) {
        resultArea.innerHTML =
            '<span style="color:#ffaa44;">差分計算スキップ (行数が多すぎます)</span>' +
            (_ncLastPlainGCode || "").split("\n").map((l) => escapeHtml(l)).join("\n");
        return;
    }

    const html = diff.ops
        .map((op) => {
            const escaped = escapeHtml(op.line);
            if (op.type === "add") {
                return `<span class="diff-add">+ ${escaped}</span>`;
            } else if (op.type === "remove") {
                return `<span class="diff-remove">- ${escaped}</span>`;
            } else {
                return `<span class="diff-keep">  ${escaped}</span>`;
            }
        })
        .join("");

    const addCount = diff.ops.filter((o) => o.type === "add").length;
    const rmCount = diff.ops.filter((o) => o.type === "remove").length;
    const header = `<span class="diff-header">差分: +${addCount}行 / -${rmCount}行</span>`;
    resultArea.innerHTML = header + html;
}

// ========== 初期化 ==========

document.addEventListener("DOMContentLoaded", function () {
    initRealTimeValidation();
    updateWorkTypeDesc();
    _setupClearButtons();
    _setupNumpad();

    // ダーティ追跡: フォーム内の任意の入力変化で保存ボタンを無効化
    const _formRoot = document.querySelector(".nc-container") || document.body;
    _formRoot.addEventListener("input", function (e) {
        if (e.target.closest("#resultArea")) return; // 結果エリアの編集は除外
        _markInputDirty();
    });
    _formRoot.addEventListener("change", function (e) {
        if (e.target.closest("#resultArea")) return;
        _markInputDirty();
    });
});

function setCalcMode(mode) {
    currentCalcMode = mode;
    maxOdApplySource = "dimensions";
    // カード active 切り替え（mode* + modeAte）
    ["modeNormal", "modeEccentric", "modeCorner", "modeAte"].forEach(function (id) {
        const el = $id(id);
        if (el) el.classList.remove("active");
    });
    const modeCardMap = { normal: "modeNormal", eccentric: "modeEccentric", corner: "modeCorner" };
    const targetCard = $id(modeCardMap[mode]);
    if (targetCard) targetCard.classList.add("active");
    // 寸法入力パネル表示切り替え
    document.querySelectorAll(".calc-inputs").forEach(function (el) {
        if (el.id !== "cpCalcArea" && el.id !== "okuBiteArea") el.style.display = "none";
    });
    if (mode === "normal" && $id("normalStockInputs")) {
        $id("normalStockInputs").style.display = "flex";
    } else if (mode === "eccentric" && $id("eccentricInputs")) {
        $id("eccentricInputs").style.display = "flex";
    } else if (mode === "corner" && $id("cornerInputs")) {
        $id("cornerInputs").style.display = "flex";
    }
    const hint = $id("ateInputHint");
    if (hint) hint.style.display = "none";
}

// ===== 入力ダーティ追跡 =====
var _ncInputDirty = false;

function _markInputDirty() {
    if (_ncInputDirty) return;
    const saveBtn = $id("saveBtn");
    if (!saveBtn || saveBtn.disabled) return; // 未生成・エラー時は何もしない
    _ncInputDirty = true;
    saveBtn.disabled = true;
    saveBtn.classList.add("btn-save--dirty");
}

// ===== × クリアボタン =====
function _setupClearButtons() {
    document.querySelectorAll('input[type="text"]:not([readonly])').forEach(function (input) {
        if (input.dataset.clearBound) return;
        input.dataset.clearBound = "1";

        const wrap = document.createElement("span");
        wrap.className = "input-clear-wrap";
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "input-clear-btn";
        btn.textContent = "×";
        btn.setAttribute("tabindex", "-1");
        btn.setAttribute("aria-label", "クリア");
        btn.addEventListener("mousedown", function (e) {
            e.preventDefault(); // フォーカスを奪わない
        });
        btn.addEventListener("click", function () {
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.focus();
        });
        wrap.appendChild(btn);
    });
}

// ===== オンスクリーンテンキー =====
function _setupNumpad() {
    if ($id("ncNumpad")) return;

    const pad = document.createElement("div");
    pad.id = "ncNumpad";
    pad.className = "nc-numpad";
    pad.style.display = "none";
    pad.innerHTML =
        '<div class="nc-numpad__header">' +
        '  <span>テンキー</span>' +
        '  <button class="nc-numpad__close" tabindex="-1">✕</button>' +
        '</div>' +
        '<div class="nc-numpad__grid">' +
        '  <button data-val="7" tabindex="-1">7</button>' +
        '  <button data-val="8" tabindex="-1">8</button>' +
        '  <button data-val="9" tabindex="-1">9</button>' +
        '  <button data-val="+" tabindex="-1" class="nc-numpad__op">+</button>' +
        '  <button data-val="4" tabindex="-1">4</button>' +
        '  <button data-val="5" tabindex="-1">5</button>' +
        '  <button data-val="6" tabindex="-1">6</button>' +
        '  <button data-val="-" tabindex="-1" class="nc-numpad__op">−</button>' +
        '  <button data-val="1" tabindex="-1">1</button>' +
        '  <button data-val="2" tabindex="-1">2</button>' +
        '  <button data-val="3" tabindex="-1">3</button>' +
        '  <button data-val="*" tabindex="-1" class="nc-numpad__op">×</button>' +
        '  <button data-val="." tabindex="-1">.</button>' +
        '  <button data-val="0" tabindex="-1">0</button>' +
        '  <button data-action="back" tabindex="-1">⌫</button>' +
        '  <button data-val="/" tabindex="-1" class="nc-numpad__op">÷</button>' +
        '  <button data-action="minus" tabindex="-1">±</button>' +
        '  <button data-action="clear" tabindex="-1">C</button>' +
        '  <button data-action="enter" tabindex="-1" class="nc-numpad__enter">↵</button>' +
        '</div>';
    document.body.appendChild(pad);

    var _numpadTarget = null;

    function _numpadShow(input) {
        _numpadTarget = input;
        pad.style.display = "block";
    }
    function _numpadHide() {
        pad.style.display = "none";
        _numpadTarget = null;
    }

    pad.querySelector(".nc-numpad__grid").addEventListener("mousedown", function (e) {
        e.preventDefault();
        const btn = e.target.closest("button");
        if (!btn || !_numpadTarget) return;

        const start = _numpadTarget.selectionStart;
        const end   = _numpadTarget.selectionEnd;
        const val   = _numpadTarget.value;

        if (btn.dataset.val !== undefined) {
            _numpadTarget.value = val.slice(0, start) + btn.dataset.val + val.slice(end);
            const pos = start + btn.dataset.val.length;
            _numpadTarget.setSelectionRange(pos, pos);
            _numpadTarget.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (btn.dataset.action === "back") {
            if (start !== end) {
                _numpadTarget.value = val.slice(0, start) + val.slice(end);
                _numpadTarget.setSelectionRange(start, start);
            } else if (start > 0) {
                _numpadTarget.value = val.slice(0, start - 1) + val.slice(start);
                _numpadTarget.setSelectionRange(start - 1, start - 1);
            }
            _numpadTarget.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (btn.dataset.action === "clear") {
            _numpadTarget.value = "";
            _numpadTarget.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (btn.dataset.action === "minus") {
            _numpadTarget.value = val.startsWith("-") ? val.slice(1) : "-" + val;
            _numpadTarget.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (btn.dataset.action === "enter") {
            _numpadTarget.dispatchEvent(new Event("change", { bubbles: true }));
            _numpadHide();
        }
    });

    pad.querySelector(".nc-numpad__close").addEventListener("mousedown", function (e) {
        e.preventDefault();
        _numpadHide();
    });

    // テンキー対象: inputmode="decimal" の入力欄 + アテ長さ
    function _bindNumpadInputs() {
        document.querySelectorAll('input[inputmode="decimal"]:not([readonly]), #ateLength').forEach(function (input) {
            if (input.dataset.numpadBound) return;
            input.dataset.numpadBound = "1";
            input.addEventListener("focus", function () { _numpadShow(input); });
        });
    }
    _bindNumpadInputs();

    // フォーカスが入力欄でもテンキーでもない場所に移ったら閉じる
    document.addEventListener("focusin", function (e) {
        if (pad.contains(e.target)) return;
        if (e.target.matches('input[inputmode="decimal"]:not([readonly]), #ateLength')) return;
        _numpadHide();
    });

    // Escape で閉じる
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && pad.style.display !== "none") _numpadHide();
    });
}

// ===== resultArea ロック / 編集トグル =====
function toggleResultLock() {
    const area = $id("resultArea");
    const btn  = $id("resultLockBtn");
    if (!area || !btn) return;
    const isLocked = area.contentEditable !== "true";
    if (isLocked) {
        area.contentEditable = "true";
        area.classList.remove("result-locked");
        area.classList.add("result-editing");
        btn.textContent = "✏ 編集モード中";
        btn.classList.remove("btn-result-lock--locked");
        btn.classList.add("btn-result-lock--editing");
        btn.title = "クリックすると編集ロックに戻ります";
        area.focus();
    } else {
        area.contentEditable = "false";
        area.classList.remove("result-editing");
        area.classList.add("result-locked");
        btn.textContent = "🔒 編集ロック中";
        btn.classList.remove("btn-result-lock--editing");
        btn.classList.add("btn-result-lock--locked");
        btn.title = "クリックすると編集モードに切り替わります";
    }
}
window.toggleResultLock = toggleResultLock;
