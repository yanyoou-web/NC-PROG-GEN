/* =========================================================
   gui-v2.js — NCプログラム作成 ウィザードコントローラー
   ---------------------------------------------------------
   読み込み順: gui-v2.js を logic.js より先に読み込むこと。
   logic.js が Section 1 の utils 関数をグローバルとして使用する。
   ========================================================= */
/* global navigator */
/* global generateGCode */

// ========== Section 1: utils（logic.js が依存するグローバル関数） ==========
// app.js の同名関数と同一。logic.js に依存されているため gui-v2.html では
// app.js を読み込まず、ここで再定義する。

function evaluateFormula(str) {
    if (!str) return "";
    const sanitized = str.replace(/[^0-9+\-*/.()]/g, "");
    try {
        const result = new Function("return " + sanitized)();
        return isNaN(result) ? str : result;
    } catch (e) {
        return str;
    }
}

function parseSimpleNumberOrFormula(str) {
    if (str === null || str === undefined) return NaN;
    const raw = String(str).trim();
    if (!raw) return NaN;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return Number(raw);
    if (!/^[0-9+\-*/().\s]+$/.test(raw)) return NaN;
    const evaluated = evaluateFormula(raw);
    return typeof evaluated === "number" && isFinite(evaluated) ? evaluated : NaN;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function ncFormat(val) {
    if (val === "" || val === null || val === undefined) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";
    const s = num.toString();
    return s.indexOf(".") === -1 ? s + "." : s;
}

function normalizeHighlightAttr(attr) {
    return attr === "input" || attr === "machine" ? attr : "calc";
}

function isMCodeLike(val) {
    const s = String(val == null ? "" : val).trim().toUpperCase();
    return /^M\d+(?:\.\d+)?(?:P\d+)?$/.test(s);
}

function wrapH(val, attr) {
    if (val === "" || val === undefined) return "";
    if (isMCodeLike(val)) return escapeHtml(val);
    const kind = normalizeHighlightAttr(attr);
    return '<span class="h-val h-val--' + kind + '">' + escapeHtml(val) + "</span>";
}
function wrapHCalc(val)    { return wrapH(val, "calc"); }
function wrapHInput(val)   { return wrapH(val, "input"); }
function wrapHMachine(val) { return wrapH(val, "machine"); }

function gcodeDisplayHtmlToPlainText(htmlStr) {
    if (htmlStr == null || htmlStr === "") return "";
    const d = document.createElement("div");
    d.innerHTML = htmlStr;
    return (d.innerText || "").replace(/\u00a0/g, " ");
}

// logic.js が参照するグローバル変数
const $id = function(id) { return document.getElementById(id); };
var currentInternalStyle = "";

// logic.js / debug.js が参照するスタブ
function isDebugModeOn() { return false; }

// ========== Section 2: スタイル制約テーブル ==========
// app.js の restrictStyles ロジックを DOM に依存しない純粋関数として再実装。
// ワーク種別ごとに選択できる加工スタイルの配列を返す。

var STYLE_LABELS = {
    Hirazoko:   "内径バイト平底",
    Ichimonji:  "一文字DR平底",
    Normal:     "通常バイト加工",
    YoseRelay:  "ヨセ中継",
    Yose:       "ヨセ",
    CrossSmall: "交差穴（小径）",
    CrossBig:   "交差穴（大径）",
};

function getAvailableStyles(workType) {
    // J_M8_300: CrossSmall のみ（強制）
    if (workType === "J_M8_300")
        return ["CrossSmall"];
    // M8 系
    if (workType === "M8_21" || workType === "M8_31")
        return ["Ichimonji", "YoseRelay", "CrossSmall"];
    // G18 φ4.0 / φ4.2 系
    if (workType === "G18_40" || workType === "G18_42" ||
        workType === "G18_40_MH" || workType === "G18_42_MH")
        return ["YoseRelay", "CrossSmall"];
    // G18 HGDR 系（φ6.2 / φ6.55 / φ6.175）
    if (workType === "G18_62"    || workType === "G18_655"    || workType === "G18_6175" ||
        workType === "G18_62_MH" || workType === "G18_655_MH" || workType === "G18_6175_MH")
        return ["Hirazoko", "Normal", "YoseRelay"];
    // M42X3 系
    if (workType === "M42X3_25175"    || workType === "M42X3_25175_16" ||
        workType === "M42X3_25175_20" || workType === "M42X3_25175_22")
        return ["Hirazoko", "Normal", "Yose", "YoseRelay"];
    // M12 / M12_MH
    if (workType === "M12" || workType === "M12_MH")
        return ["Ichimonji", "Normal", "YoseRelay", "CrossSmall", "CrossBig"];
    // トメセン系
    if (workType === "TOMESEN_M16" || workType === "TOMESEN_M18" || workType === "TOMESEN_M22" ||
        workType === "TOMESEN_M24" || workType === "TOMESEN_M35")
        return ["Hirazoko", "Ichimonji", "Normal", "YoseRelay", "Yose"];
    // デフォルト: Ichimonji 以外すべて使用可
    return ["Hirazoko", "Normal", "YoseRelay", "Yose", "CrossBig", "CrossSmall"];
}

// ========== Section 3: 定数データ ==========

var WORK_TYPE_GROUPS = [
    {
        label: "ねじ系",
        items: [
            { value: "M12",  label: "M12"  },
            { value: "M15",  label: "M15"  },
            { value: "M18",  label: "M18"  },
            { value: "M22",  label: "M22"  },
            { value: "G78",  label: "G78"  },
            { value: "M40",  label: "M40"  },
        ]
    },
    {
        label: "ねじ系 MH",
        items: [
            { value: "M12_MH", label: "M12-MH" },
            { value: "M15_MH", label: "M15-MH" },
            { value: "M18_MH", label: "M18-MH" },
            { value: "M22_MH", label: "M22-MH" },
            { value: "G78_MH", label: "G78-MH" },
            { value: "M40_MH", label: "M40-MH" },
        ]
    },
    {
        label: "G18系",
        items: [
            { value: "G18_40",      label: "φ4.0"      },
            { value: "G18_42",      label: "φ4.2"      },
            { value: "G18_62",      label: "φ6.2"      },
            { value: "G18_655",     label: "φ6.55"     },
            { value: "G18_6175",    label: "φ6.175"    },
            { value: "G18_40_MH",   label: "φ4.0 MH"  },
            { value: "G18_42_MH",   label: "φ4.2 MH"  },
            { value: "G18_62_MH",   label: "φ6.2 MH"  },
            { value: "G18_655_MH",  label: "φ6.55 MH" },
            { value: "G18_6175_MH", label: "φ6.175 MH"},
        ]
    },
    {
        label: "M42X3系",
        items: [
            { value: "M42X3_25175",    label: "φ25.175 ST"    },
            { value: "M42X3_25175_16", label: "φ25.175→φ16" },
            { value: "M42X3_25175_20", label: "φ25.175→φ20" },
            { value: "M42X3_25175_22", label: "φ25.175→φ22" },
        ]
    },
    {
        label: "M8系",
        items: [
            { value: "M8_21",    label: "M8 φ2.1"       },
            { value: "M8_31",    label: "M8 φ3.1"       },
            { value: "J_M8_300", label: "J-M8-ASWD-300" },
        ]
    },
    {
        label: "トメセン",
        items: [
            { value: "TOMESEN_M16", label: "M16" },
            { value: "TOMESEN_M18", label: "M18" },
            { value: "TOMESEN_M22", label: "M22" },
            { value: "TOMESEN_M24", label: "M24" },
            { value: "TOMESEN_M35", label: "M35" },
        ]
    },
    {
        label: "特殊",
        items: [
            { value: "G12B_G_ST_12175_8", label: "G12B-ST-12.175-8" },
        ]
    },
    {
        label: "チューブ",
        items: [
            { value: "Tube", label: "チューブ" },
        ]
    },
];

var ATE_PRESETS = [
    { value: "42.5",  label: "42.5（15角）"   },
    { value: "41",    label: "41（18角）"      },
    { value: "39.5",  label: "39.5（21角）"   },
    { value: "37.5",  label: "37.5（25角）"   },
    { value: "33.25", label: "33.25（33.5角）"},
    { value: "28.5",  label: "28.5（43角）"   },
    { value: "6.25",  label: "6.25"           },
    { value: "11.25", label: "11.25"          },
    { value: "20",    label: "20"             },
    { value: "24.5",  label: "24.5"           },
    { value: "31.5",  label: "31.5"           },
    { value: "36.75", label: "36.75"          },
];

var AUTHOR_PRESETS = ["YAMADA", "SAWADA", "RIN", "REI", "TANIGUTI", "MURAKAMI"];
var DRAW_REV_OPTIONS = ["NONE", "A", "B", "C", "D", "E"];
var STYLE_NUMS = { Hirazoko:"1", Ichimonji:"2", Normal:"3", YoseRelay:"4", Yose:"5", CrossSmall:"6", CrossBig:"7" };

// ========== Section 4: ウィザード状態 ==========

var wizardState = {
    machine:         null,
    workType:        null,
    tubeSpec:        "",
    tubeLength:      "",
    internalStyle:   null,
    yoseMethod:      "",
    yoseAngle:       "",
    yoseD:           "",
    yoseTotalLength: "",
    yosePartnerDepth:"",
    ateLength:       "",
    maxOD:           "",
    drillDepth:      "",
    idDepth:         "",
    drawNumA:        "",
    drawNumB:        "2",
    drawRev:         "NONE",
    processNum:      "1",
    workerName:      "",
};

// 戻るボタン用の画面スタック
var screenStack = [];

// ========== Section 5: 画面遷移ロジック ==========

// 現在の画面IDから次の画面IDを返す
function getNextScreen(currentId) {
    if (currentId === "start")         return "q-machine";
    if (currentId === "q-machine")     return "q-worktype";
    if (currentId === "q-worktype") {
        if (wizardState.workType === "Tube") return "q-tube-spec";
        return "q-style";
    }
    if (currentId === "q-tube-spec")   return "q-tube-length";
    if (currentId === "q-tube-length") return "q-atelength";
    if (currentId === "q-style") {
        if (wizardState.internalStyle === "YoseRelay" || wizardState.internalStyle === "Yose")
            return "q-yose-detail";
        return "q-atelength";
    }
    if (currentId === "q-yose-detail") return "q-atelength";
    if (currentId === "q-atelength")   return "q-maxod";
    if (currentId === "q-maxod")       return "q-depths";
    if (currentId === "q-depths")      return "q-drawnum";
    if (currentId === "q-drawnum")     return "result";
    return null;
}

// 進捗バー表示用の情報（Tubeとヨセの分岐画面はカウント外）
function getStepInfo(screenId) {
    var main = ["q-machine","q-worktype","q-style","q-atelength","q-maxod","q-depths","q-drawnum"];
    var idx = main.indexOf(screenId);
    if (idx >= 0) return { current: idx + 1, total: main.length };
    if (screenId === "q-tube-spec" || screenId === "q-tube-length")
        return { current: 2, total: main.length };
    if (screenId === "q-yose-detail")
        return { current: 3, total: main.length };
    return null;
}

// ========== Section 6: 画面レンダラー ==========

function advance(currentId) {
    var nextId = getNextScreen(currentId);
    if (!nextId) return;
    screenStack.push(currentId);
    renderScreen(nextId);
}

function goBack() {
    if (screenStack.length === 0) return;
    var prev = screenStack.pop();
    if (prev) renderScreen(prev);
}

function renderScreen(screenId) {
    var main    = document.getElementById("wiz-main");
    var footer  = document.getElementById("wiz-footer");
    var progBar = document.getElementById("wiz-progress-bar");
    if (!main) return;

    // フェードアウト → HTML更新 → フェードイン
    main.classList.add("wiz-exit");
    setTimeout(function() {
        main.innerHTML = buildScreenHTML(screenId);
        main.classList.remove("wiz-exit");
        main.classList.add("wiz-enter");
        setTimeout(function() { main.classList.remove("wiz-enter"); }, 220);

        // 進捗バー
        var info = getStepInfo(screenId);
        if (info) {
            progBar.hidden = false;
            progBar.innerHTML = buildProgressHTML(info.current, info.total);
        } else {
            progBar.hidden = true;
        }

        // 戻るボタン（スタートとスタック空のときは非表示）
        footer.hidden = (screenId === "start" || screenStack.length === 0);

        // 結果画面はGコード生成を遅延実行
        if (screenId === "result") {
            setTimeout(runGeneration, 80);
        }
    }, 130);
}

function buildProgressHTML(current, total) {
    var html = '<div class="wiz-prog-steps">';
    for (var i = 1; i <= total; i++) {
        var cls = i < current ? "done" : i === current ? "active" : "";
        html += '<div class="wiz-prog-dot ' + cls + '"></div>';
        if (i < total)
            html += '<div class="wiz-prog-line' + (i < current ? " done" : "") + '"></div>';
    }
    html += '</div>';
    html += '<div class="wiz-prog-label">ステップ ' + current + ' / ' + total + '</div>';
    return html;
}

// ========== Section 7: 各画面の HTML ビルダー ==========

function buildScreenHTML(screenId) {
    switch (screenId) {
        case "start":          return buildStartScreen();
        case "q-machine":      return buildMachineScreen();
        case "q-worktype":     return buildWorkTypeScreen();
        case "q-tube-spec":    return buildTubeSpecScreen();
        case "q-tube-length":  return buildTubeLengthScreen();
        case "q-style":        return buildStyleScreen();
        case "q-yose-detail":  return buildYoseDetailScreen();
        case "q-atelength":    return buildAteLengthScreen();
        case "q-maxod":        return buildMaxODScreen();
        case "q-depths":       return buildDepthsScreen();
        case "q-drawnum":      return buildDrawNumScreen();
        case "result":         return buildResultScreen();
        default: return "<p>不明な画面</p>";
    }
}

/* ---- スタート画面 ---- */
function buildStartScreen() {
    return '<div class="wiz-start">'
        + '<img src="assets/icon.svg" alt="NC" class="wiz-start__icon" />'
        + '<h1 class="wiz-start__title">NCプログラム作成</h1>'
        + '<p class="wiz-start__desc">加工条件を順番に選んで<br>Gコードを自動生成します</p>'
        + '<button class="wiz-btn-primary wiz-start__btn" data-action="start">開始する</button>'
        + '</div>';
}

/* ---- Q1: 機械選択 ---- */
function buildMachineScreen() {
    var names = (typeof machines !== "undefined") ? Object.keys(machines) : ["NCL044","NCL015","NCL085","NCL012"];
    var cards = names.map(function(name) {
        return '<button class="wiz-card' + (wizardState.machine === name ? " selected" : "") + '"'
            + ' data-action="select-machine" data-value="' + escapeHtml(name) + '">'
            + '<span class="wiz-card__label">' + escapeHtml(name) + '</span>'
            + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">使用機械を選んでください</h2>'
        + '<div class="wiz-grid wiz-grid--4">' + cards + '</div>'
        + '</div>';
}

/* ---- Q2: ワーク種別 ---- */
function buildWorkTypeScreen() {
    var groups = WORK_TYPE_GROUPS.map(function(g) {
        var items = g.items.map(function(item) {
            return '<button class="wiz-card wiz-card--sm' + (wizardState.workType === item.value ? " selected" : "") + '"'
                + ' data-action="select-worktype" data-value="' + escapeHtml(item.value) + '">'
                + '<span class="wiz-card__label">' + escapeHtml(item.label) + '</span>'
                + '</button>';
        }).join("");
        return '<div class="wiz-group">'
            + '<div class="wiz-group__lbl">' + escapeHtml(g.label) + '</div>'
            + '<div class="wiz-grid">' + items + '</div>'
            + '</div>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">ワーク種別を選んでください</h2>'
        + groups
        + '</div>';
}

/* ---- Q2a: チューブ規格 ---- */
function buildTubeSpecScreen() {
    var specs = (typeof tubeData !== "undefined") ? Object.keys(tubeData) : [];
    var cards = specs.map(function(spec) {
        return '<button class="wiz-card' + (wizardState.tubeSpec === spec ? " selected" : "") + '"'
            + ' data-action="select-tube-spec" data-value="' + escapeHtml(spec) + '">'
            + '<span class="wiz-card__label">' + escapeHtml(spec) + '</span>'
            + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">チューブ規格を選んでください</h2>'
        + '<div class="wiz-grid">' + cards + '</div>'
        + '</div>';
}

/* ---- Q2b: チューブ長さ ---- */
function buildTubeLengthScreen() {
    var spec = wizardState.tubeSpec;
    var lengths = (typeof tubeData !== "undefined" && tubeData[spec] && tubeData[spec].lengths)
        ? tubeData[spec].lengths : [];
    var cards = lengths.map(function(len) {
        var v = String(len);
        return '<button class="wiz-card' + (wizardState.tubeLength === v ? " selected" : "") + '"'
            + ' data-action="select-tube-length" data-value="' + escapeHtml(v) + '">'
            + '<span class="wiz-card__label">' + escapeHtml(v) + ' mm</span>'
            + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">長さを選んでください</h2>'
        + '<p class="wiz-q-sub">規格: ' + escapeHtml(spec) + '</p>'
        + '<div class="wiz-grid">' + cards + '</div>'
        + '</div>';
}

/* ---- Q3: 内径スタイル ---- */
function buildStyleScreen() {
    var available = getAvailableStyles(wizardState.workType);
    var forced = available.length === 1;
    var cards = available.map(function(s) {
        return '<button class="wiz-card wiz-card--style' + (wizardState.internalStyle === s ? " selected" : "") + '"'
            + ' data-action="select-style" data-value="' + escapeHtml(s) + '">'
            + '<span class="wiz-card__num">' + (STYLE_NUMS[s] || "") + '</span>'
            + '<span class="wiz-card__label">' + escapeHtml(STYLE_LABELS[s] || s) + '</span>'
            + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">加工スタイルを選んでください</h2>'
        + (forced ? '<p class="wiz-q-sub">このワーク種別はスタイルが自動で決まります</p>' : "")
        + '<div class="wiz-grid wiz-grid--2">' + cards + '</div>'
        + '</div>';
}

/* ---- Q3a: ヨセ詳細 ---- */
function buildYoseDetailScreen() {
    var isRelay = wizardState.internalStyle === "YoseRelay";
    var relayFields = isRelay
        ? '<label class="wiz-lbl" for="yose-total-len">全長 (mm)</label>'
          + '<input class="wiz-input" id="yose-total-len" type="text" inputmode="decimal"'
          + ' value="' + escapeHtml(wizardState.yoseTotalLength) + '" placeholder="例: 85" />'
          + '<label class="wiz-lbl" for="yose-partner-depth">相手深さ (mm)</label>'
          + '<input class="wiz-input" id="yose-partner-depth" type="text" inputmode="decimal"'
          + ' value="' + escapeHtml(wizardState.yosePartnerDepth) + '" placeholder="例: 12" />'
        : "";
    var methodCards = ["nut", "screw"].map(function(v) {
        var lbl = v === "nut" ? "ナット締め" : "ねじ込み";
        return '<button class="wiz-card wiz-card--sm wiz-card--method' + (wizardState.yoseMethod === v ? " selected" : "") + '"'
            + ' data-action="select-yose-method" data-value="' + v + '">' + lbl + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">' + (isRelay ? "ヨセ中継" : "ヨセ") + ' の詳細を入力してください</h2>'
        + '<div class="wiz-form">'
        + '<label class="wiz-lbl">ヨセ方法</label>'
        + '<div class="wiz-grid wiz-grid--2">' + methodCards + '</div>'
        + '<label class="wiz-lbl" for="yose-angle">ヨセ角度 (°)</label>'
        + '<input class="wiz-input" id="yose-angle" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.yoseAngle) + '" placeholder="例: 30" />'
        + '<label class="wiz-lbl" for="yose-d">ヨセD径 (mm)</label>'
        + '<input class="wiz-input" id="yose-d" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.yoseD) + '" placeholder="例: 14" />'
        + relayFields
        + '</div>'
        + '<button class="wiz-btn-primary" data-action="next-yose">次へ →</button>'
        + '</div>';
}

/* ---- Q4: アテ長さ ---- */
function buildAteLengthScreen() {
    var presets = ATE_PRESETS.map(function(p) {
        return '<button class="wiz-preset' + (wizardState.ateLength === p.value ? " selected" : "") + '"'
            + ' data-action="preset-atelength" data-value="' + escapeHtml(p.value) + '">'
            + escapeHtml(p.label)
            + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">アテ長さを入力してください</h2>'
        + '<div class="wiz-presets">' + presets + '</div>'
        + '<div class="wiz-form">'
        + '<label class="wiz-lbl" for="ate-input">直接入力 (mm)</label>'
        + '<input class="wiz-input wiz-input--lg" id="ate-input" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.ateLength) + '" placeholder="例: 42.5" />'
        + '</div>'
        + '<button class="wiz-btn-primary" data-action="next-atelength">次へ →</button>'
        + '</div>';
}

/* ---- Q5: 外径最大径 ---- */
function buildMaxODScreen() {
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">外径最大径を入力してください</h2>'
        + '<p class="wiz-q-sub">ワーク外径の最大値 (mm)</p>'
        + '<div class="wiz-form">'
        + '<input class="wiz-input wiz-input--hero" id="maxod-input" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.maxOD) + '" placeholder="例: 30.5" autofocus />'
        + '</div>'
        + '<button class="wiz-btn-primary" data-action="next-maxod">次へ →</button>'
        + '</div>';
}

/* ---- Q6: 加工深さ ---- */
function buildDepthsScreen() {
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">加工深さを入力してください</h2>'
        + '<div class="wiz-form">'
        + '<label class="wiz-lbl" for="drill-depth">ドリル深さ (mm)</label>'
        + '<input class="wiz-input" id="drill-depth" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.drillDepth) + '" placeholder="例: 18" />'
        + '<label class="wiz-lbl" for="id-depth">内径深さ (mm)</label>'
        + '<input class="wiz-input" id="id-depth" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.idDepth) + '" placeholder="例: 15" />'
        + '</div>'
        + '<button class="wiz-btn-primary" data-action="next-depths">次へ →</button>'
        + '</div>';
}

/* ---- Q7: 図番・作成者 ---- */
function buildDrawNumScreen() {
    var revOpts = DRAW_REV_OPTIONS.map(function(v) {
        return '<option value="' + v + '"' + (wizardState.drawRev === v ? " selected" : "") + '>'
            + (v === "NONE" ? "なし" : v) + '</option>';
    }).join("");
    var authorBtns = AUTHOR_PRESETS.map(function(name) {
        return '<button class="wiz-author-btn" data-action="set-author" data-value="' + escapeHtml(name) + '">'
            + escapeHtml(name) + '</button>';
    }).join("");
    return '<div class="wiz-question">'
        + '<h2 class="wiz-q-title">図番・作成者を入力してください</h2>'
        + '<div class="wiz-form">'
        + '<label class="wiz-lbl">図番</label>'
        + '<div class="wiz-drawnum-row">'
        + '<span class="wiz-fix">PM-</span>'
        + '<input class="wiz-input wiz-input--sm" id="v1a" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.drawNumA) + '" placeholder="12345" />'
        + '<span class="wiz-fix">-</span>'
        + '<input class="wiz-input wiz-input--xs" id="v1b" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.drawNumB) + '" />'
        + '<select class="wiz-select" id="v1c">' + revOpts + '</select>'
        + '<span class="wiz-fix">=No,</span>'
        + '<input class="wiz-input wiz-input--xs" id="v2" type="text" inputmode="decimal"'
        + ' value="' + escapeHtml(wizardState.processNum) + '" />'
        + '</div>'
        + '<label class="wiz-lbl" for="worker-name">作成者</label>'
        + '<input class="wiz-input" id="worker-name" type="text"'
        + ' value="' + escapeHtml(wizardState.workerName) + '" placeholder="半角英数字" />'
        + '<div class="wiz-author-presets">' + authorBtns + '</div>'
        + '</div>'
        + '<button class="wiz-btn-primary" data-action="next-drawnum">Gコードを生成する →</button>'
        + '</div>';
}

/* ---- 結果画面 ---- */
function buildResultScreen() {
    return '<div class="wiz-result" id="result-wrap">'
        + '<p class="wiz-generating">Gコードを生成中...</p>'
        + '</div>';
}

// ========== Section 8: イベント処理 ==========

function handleAction(action, value) {
    switch (action) {
        case "start":
            screenStack = [];
            advance("start");
            break;

        case "select-machine":
            wizardState.machine = value;
            advance("q-machine");
            break;

        case "select-worktype":
            wizardState.workType = value;
            // J_M8_300 はスタイルが固定なので事前にセット
            wizardState.internalStyle = (value === "J_M8_300") ? "CrossSmall" : null;
            advance("q-worktype");
            break;

        case "select-tube-spec":
            wizardState.tubeSpec   = value;
            wizardState.tubeLength = "";
            advance("q-tube-spec");
            break;

        case "select-tube-length":
            wizardState.tubeLength = value;
            advance("q-tube-length");
            break;

        case "select-style":
            wizardState.internalStyle = value;
            advance("q-style");
            break;

        case "select-yose-method":
            wizardState.yoseMethod = value;
            // カード選択状態を即時反映
            document.querySelectorAll("[data-action='select-yose-method']").forEach(function(b) {
                b.classList.toggle("selected", b.dataset.value === value);
            });
            break;

        case "preset-atelength":
            wizardState.ateLength = value;
            var ateInp = document.getElementById("ate-input");
            if (ateInp) ateInp.value = value;
            document.querySelectorAll("[data-action='preset-atelength']").forEach(function(b) {
                b.classList.toggle("selected", b.dataset.value === value);
            });
            break;

        case "set-author":
            wizardState.workerName = value;
            var workerInp = document.getElementById("worker-name");
            if (workerInp) workerInp.value = value;
            break;

        case "next-yose":
            wizardState.yoseAngle        = (document.getElementById("yose-angle")        || {value:""}).value.trim();
            wizardState.yoseD            = (document.getElementById("yose-d")            || {value:""}).value.trim();
            wizardState.yoseTotalLength  = (document.getElementById("yose-total-len")    || {value:""}).value.trim();
            wizardState.yosePartnerDepth = (document.getElementById("yose-partner-depth")|| {value:""}).value.trim();
            advance("q-yose-detail");
            break;

        case "next-atelength":
            wizardState.ateLength = (document.getElementById("ate-input") || {value:""}).value.trim();
            if (!wizardState.ateLength) { showToast("アテ長さを入力してください"); return; }
            advance("q-atelength");
            break;

        case "next-maxod":
            wizardState.maxOD = (document.getElementById("maxod-input") || {value:""}).value.trim();
            if (!wizardState.maxOD) { showToast("外径最大径を入力してください"); return; }
            advance("q-maxod");
            break;

        case "next-depths":
            wizardState.drillDepth = (document.getElementById("drill-depth") || {value:""}).value.trim();
            wizardState.idDepth    = (document.getElementById("id-depth")    || {value:""}).value.trim();
            advance("q-depths");
            break;

        case "next-drawnum":
            wizardState.drawNumA   = (document.getElementById("v1a")        || {value:""}).value.trim();
            wizardState.drawNumB   = (document.getElementById("v1b")        || {value:"2"}).value.trim();
            wizardState.drawRev    = (document.getElementById("v1c")        || {value:"NONE"}).value;
            wizardState.processNum = (document.getElementById("v2")         || {value:"1"}).value.trim();
            wizardState.workerName = (document.getElementById("worker-name")|| {value:""}).value.trim();
            if (!wizardState.drawNumA)   { showToast("図番を入力してください");   return; }
            if (!wizardState.workerName) { showToast("作成者を入力してください"); return; }
            advance("q-drawnum");
            break;

        case "copy-gcode": {
            var el = document.getElementById("gcode-plain");
            var txt = el ? (el.dataset.plain || el.textContent) : "";
            navigator.clipboard.writeText(txt).then(function() {
                showToast("コピーしました ✓");
            }).catch(function() {
                showToast("コピーに失敗しました");
            });
            break;
        }

        case "save-gcode": {
            var saveEl = document.getElementById("gcode-plain");
            var saveText = saveEl ? (saveEl.dataset.plain || saveEl.textContent) : "";
            var blob = new Blob([saveText], { type: "text/plain" });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement("a");
            a.href     = url;
            a.download = buildFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            break;
        }

        case "restart":
            wizardState = {
                machine:"", workType:"", tubeSpec:"", tubeLength:"",
                internalStyle:null, yoseMethod:"", yoseAngle:"", yoseD:"",
                yoseTotalLength:"", yosePartnerDepth:"",
                ateLength:"", maxOD:"", drillDepth:"", idDepth:"",
                drawNumA:"", drawNumB:"2", drawRev:"NONE",
                processNum:"1", workerName:"",
            };
            screenStack = [];
            renderScreen("start");
            break;
    }
}

function showToast(msg) {
    var old = document.querySelector(".wiz-toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "wiz-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add("wiz-toast--show"); }, 10);
    setTimeout(function() {
        t.classList.remove("wiz-toast--show");
        setTimeout(function() { t.remove(); }, 300);
    }, 2500);
}

// ========== Section 9: Gコード生成 ==========

function buildInputFromState() {
    return {
        drawNumA:        wizardState.drawNumA,
        drawNumB:        wizardState.drawNumB,
        drawRev:         wizardState.drawRev,
        processNum:      wizardState.processNum,
        workerName:      wizardState.workerName,
        ateLength:       wizardState.ateLength,
        maxOD:           wizardState.maxOD,
        drillDepth:      wizardState.drillDepth,
        idDepth:         wizardState.idDepth,
        drillMode:       "normal",
        workType:        wizardState.workType,
        internalStyle:   wizardState.internalStyle || "",
        m99Mode:         "off",
        m99p100:         false,
        mhOdTool:        "外径荒",
        g12bNoseR:       "none",
        m12FinishType:   "hss",
        m12Profile:      "drill_ichi_hira",
        m12BaitoDrillMode: "HGDR",
        g18FinishType:   "halfmoon",
        g18Profile:      "cross_oku",
        m8Profile:       "hss_oku",
        cpVal:           "",
        valPartnerD:     "",
        okuBiteEnabled:  false,
        yoseMethod:      wizardState.yoseMethod,
        yoseAngle:       wizardState.yoseAngle,
        yoseD:           wizardState.yoseD,
        yoseTotalLength: wizardState.yoseTotalLength,
        yosePartnerDepth:wizardState.yosePartnerDepth,
        tubeSpec:        wizardState.tubeSpec,
        tubeLength:      wizardState.tubeLength,
        calcMode:        "normal",
        lastAppliedCalcMode: "normal",
        valCornW:        "",
        valCornH:        "",
    };
}

function buildFileName() {
    var a = wizardState.drawNumA || "XXX";
    var b = wizardState.drawNumB || "2";
    var c = (wizardState.drawRev !== "NONE") ? wizardState.drawRev : "";
    var n = wizardState.processNum || "1";
    var w = wizardState.workerName || "";
    return "PM-" + a + "-" + b + c + "=No," + n + "_" + w + ".txt";
}

function runGeneration() {
    currentInternalStyle = wizardState.internalStyle || "";
    var input  = buildInputFromState();
    var result = generateGCode(input, wizardState.machine);
    var wrap   = document.getElementById("result-wrap");
    if (!wrap) return;

    var plain = result.plainText || "";

    // 入力サマリー
    var summaryRows = [
        ["機械",       wizardState.machine],
        ["ワーク種別",  wizardState.workType],
        ["加工スタイル",
            wizardState.workType === "Tube"
                ? "（チューブ）"
                : (STYLE_LABELS[wizardState.internalStyle] || wizardState.internalStyle || "")
        ],
        ["アテ長さ",   wizardState.ateLength + " mm"],
        ["外径最大径", wizardState.maxOD + " mm"],
        ["ドリル深さ", wizardState.drillDepth + " mm"],
        ["内径深さ",   wizardState.idDepth + " mm"],
        ["図番",
            "PM-" + (wizardState.drawNumA || "")
            + "-" + (wizardState.drawNumB || "")
            + (wizardState.drawRev !== "NONE" ? wizardState.drawRev : "")
            + " =No," + (wizardState.processNum || "")
        ],
        ["作成者", wizardState.workerName],
    ].map(function(row) {
        return '<div class="wiz-sum-row">'
            + '<span class="wiz-sum-key">' + escapeHtml(row[0]) + '</span>'
            + '<span class="wiz-sum-val">' + escapeHtml(row[1] || "") + '</span>'
            + '</div>';
    }).join("");

    wrap.innerHTML =
        '<details class="wiz-summary"><summary>入力内容を確認</summary>'
        + summaryRows + '</details>'
        + '<div class="wiz-gcode-wrap">'
        + '<pre class="wiz-gcode" id="gcode-plain" data-plain="' + escapeHtml(plain) + '">'
        + (result.displayHtml || escapeHtml(plain))
        + '</pre>'
        + '</div>'
        + '<div class="wiz-result-actions">'
        + '<button class="wiz-btn-secondary" data-action="copy-gcode">コピー</button>'
        + '<button class="wiz-btn-secondary" data-action="save-gcode">テキスト保存</button>'
        + '<button class="wiz-btn-outline"    data-action="restart">最初からやり直す</button>'
        + '</div>';
}

// ========== Section 10: 初期化 ==========

document.addEventListener("DOMContentLoaded", function() {
    // 戻るボタン
    var backBtn = document.getElementById("wiz-back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", goBack);
    }

    // 全 data-action クリックを document で一括捕捉
    document.addEventListener("click", function(e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        handleAction(btn.dataset.action, btn.dataset.value);
    });

    renderScreen("start");
});
