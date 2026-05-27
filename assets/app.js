/* NC Program Generator - app.js
 *
 * セクション構成（上から順に依存関係）:
 *   utils          … 汎用ユーティリティ（文字列・数値フォーマット）
 *   Gコードブロック生成 … ドリル・一文字DR・奥バイト・平底など各Gコードブロック生成
 *   生成ロジック    … 定数マップ → 解決ヘルパー → 算出ヘルパー → バリデーション
 *                    → テンプレート解決 → generateGCode（メイン）
 *   ui             … 画面操作・イベント処理
 *
 * 分離ファイル（index.html で app.js の後に読み込む）:
 *   preview.js     … ツールパス描画エンジン
 *   debug.js       … デバッグパネル
 *
 * Do not reorder sections; dependencies follow this order. */
/* global _ncDebugLastInput, _ncDebugLastReplaceMap, _ncDebugLastTemplateKeys, _ncDebugLastUnresolved */
/* global renderDebugPanel, drawPreview, updatePreviewSticky, refreshPreviewUiI18n, isDebugModeOn */
/* global g_flashTimer, g_flashBlink, g_flashLineIdx, g_flashVisible */
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
    if (s.indexOf('.') === -1) {
        return s + ".";
    }
    return s;
}

// ハイライト用ラッパー
function normalizeHighlightAttr(attr) {
    return attr === "input" || attr === "machine" ? attr : "calc";
}

function isMCodeLike(val) {
    const s = String(val == null ? "" : val).trim().toUpperCase();
    // 例: M3 / M19 / M458 / M99P100
    return /^M\d+(?:\.\d+)?(?:P\d+)?$/.test(s);
}

function wrapH(val, attr) {
    if (val === "" || val === undefined) return "";
    if (isMCodeLike(val)) return escapeHtml(val);
    const kind = normalizeHighlightAttr(attr);
    return `<span class="h-val h-val--${kind}" data-hl-attr="${kind}">${escapeHtml(val)}</span>`;
}
function wrapHCalc(val) { return wrapH(val, "calc"); }
function wrapHInput(val) { return wrapH(val, "input"); }
function wrapHMachine(val) { return wrapH(val, "machine"); }

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
        ["machine", "hlMachineToggle"]
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
    const sanitized = str.replace(/[^0-9+\-*/.()]/g, '');
    try {
        // 数式として評価
        const result = new Function('return ' + sanitized)();
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
    return (typeof evaluated === "number" && isFinite(evaluated)) ? evaluated : NaN;
}


// ========== Gコードブロック生成 ==========
/**
 * blocks.js
 * Gコードブロック生成ロジック
 */

function getDrillBlock(depth, mode) {
    if (isNaN(depth)) return "";
    let s = "";
    const d = (val) => wrapH(ncFormat(val.toFixed(2)));
    const d1 = (val) => wrapH(ncFormat(val.toFixed(1)));
    
    depth = Math.abs(depth);

    if (mode === 'G1') {
        s += `G1Z-${d(depth)}F.15\n`;
        s += `G4U.3\n`;
        s += `Z1.F2.5`;
    } else {
        if (depth <= 30) {
             s += `G74R.5\n`;
             s += `G74Z-${d(depth)}Q8000F.25`;
        } else {
            s += `G74R.5\n`;
            s += `G74Z-30.Q3000F.25\n`;
            let currentZ = 30;
            while (currentZ < depth) {
                let nextZ = currentZ + 10;
                if (nextZ >= depth) {
                    s += `\nG1Z-${d1(currentZ - 0.1)}F2.5\n`;
                    s += `Z-${d(depth)}F.25\n`;
                    s += `Z30.F2.5\n\n`;
                    s += `G1Z-${d(depth - 0.1)}F2.5\n`;
                    s += `G4U.3\n`;
                    s += `G1Z30.F2.5`;
                    break;
                }
                s += `\nG1Z-${d1(currentZ - 0.1)}F2.5\n`;
                s += `Z-${d(nextZ)}F.25\n`;
                s += `Z30.F2.5`;
                currentZ = nextZ;
            }
        }
    }
    return s;
}

function getDrillShiageBlock(depth) {
    if (isNaN(depth) || depth <= 0) return "";
    const d  = (val) => wrapH(ncFormat(val.toFixed(2)));
    const d1 = (val) => wrapH(ncFormat(val.toFixed(1)));
    depth = Math.abs(depth);
    let s = "";
    let currentZ = 0;
    while (currentZ < depth) {
        const nextZ = currentZ + 10;
        if (nextZ >= depth) {
            s += `G1Z-${d(depth)}F.1\n`;
            s += `G4U.3\n`;
            s += `G1Z30.F2.5`;
            break;
        }
        s += `G1Z-${d(nextZ)}F.1\n`;
        s += `G1Z30.F2.5\n`;
        s += `G1Z-${d1(nextZ - 1)}F2.5\n`;
        currentZ = nextZ;
    }
    return s;
}

function getIchimonjiBlock(cpStr, machineConfig) {
    const cp = parseFloat(cpStr);
    if (isNaN(cp)) return "(Error: CP Invalid)";

    const zApproach = (cp - 2.0).toFixed(3);
    const zFinish   = (cp + 2.0).toFixed(3);

    const tool = machineConfig["一文字ドリル"];
    if (!tool) return "(ERROR: 機械定義に '一文字ドリル' が設定されていません)";
    const mOn  = machineConfig["M51"] || "";
    const mOff = machineConfig["M59"] || "";
    const H = (v) => wrapH(v); 

    let s = "\n";
    s += `N102(4.0DR-ICHIMONJI-MENTORI)\n`;
    s += `G0G97${H(tool)}S500M3\n`;
    s += `X0.Z30.${H(mOn)}\n`;
    s += `Z3.\n`;
    s += `G1Z-${H(zApproach)}(CP-2.)F1.5\n`;
    s += `Z-${H(zFinish)}(CP+2.)F.1\n`;
    s += `G4U.3\n`;
    s += `Z2.F1.5\n`;
    s += `G0Z30.${H(mOff)}\n`;
    s += `G28U0W0M1\n`;
    return s;
}

function getIchimonjiHirazokoBlock(drawDepth, machineConfig) {
    const zDraw = Math.abs(parseFloat(drawDepth));
    if (isNaN(zDraw)) return "(Error: Depth Invalid)";
    const zApproach = (zDraw - 2.0).toFixed(3);
    const zFinish   = (zDraw + 0.2).toFixed(3);
    const tool = machineConfig["一文字ドリル"];
    if (!tool) return "(ERROR: 機械定義に '一文字ドリル' が設定されていません)";
    const mOn  = machineConfig["M51"] || "";
    const mOff = machineConfig["M59"] || "";
    const H = (v) => wrapH(v);
    let s = "\n";
    s += `N102(4.0DR-ICHIMONJI-HIRAZOKO)\n`;
    s += `G0G97${H(tool)}S500M3\n`;
    s += `X0.Z30.${H(mOn)}\n`;
    s += `Z3.\n`;
    s += `G1Z-${H(zApproach)}(Depth-2.)F1.5\n`;
    s += `Z-${H(zFinish)}(Depth+0.2)F.1\n`;
    s += `G4U.3\n`;
    s += `Z2.F1.5\n`;
    s += `G0Z30.${H(mOff)}\n`;
    s += `G28U0W0M1\n`;
    return s;
}

function getOkuBiteBlock(cpStr, machineConfig) {
    let cp = parseFloat(cpStr);
    if (isNaN(cp)) return "(ERROR: CP_INVALID)";
    
    const z1 = (cp - 0.3).toFixed(2);
    const z2 = (cp - 0.1).toFixed(2);
    const z3 = (cp + 1.0).toFixed(2);
    const z4 = (cp + 0.55).toFixed(2);
    const H = (v) => wrapH(v); 

    const tool = machineConfig["内径ダイヤΦ4"]; 
    if (!tool) return "(ERROR: 機械定義に '内径ダイヤΦ4' が設定されていません)";
    const m51 = machineConfig["M51"] || "";
    const m59 = machineConfig["M59"] || "";
    
    let s = "";
    s += `(OKU-BAIT--MENTORI)(CP=${H(cp.toFixed(3))})\n`;
    s += `G0G97S300${H(tool)}M3\n`;
    s += `X3.7Z30.${wrapH(m51)}\n`;
    s += `Z2.\n`;
    s += `G1Z-${H(z1)}(CP-0.3)F1.5\n`;
    s += `X4.Z-${H(z2)}(CP-0.1)F.04\n`;
    s += `Z-${H(z3)}(CP+1.0)\n`;
    s += `X4.45\n`;
    s += `Z-${H(z4)}(CP+0.55)\n`;
    s += `G4U1.\n`;
    s += `X3.7F.3\n`;
    s += `Z2.F3.\n`;
    s += `G0Z30.${wrapH(m59)}\n`;
    s += `G28U0W0M1`;
    return s;
}

function getOkuBiteBlockG18(cpStr, machineConfig) {
    const cp = parseFloat(cpStr);
    if (isNaN(cp)) return "(ERROR: CP_INVALID)";

    const z1 = (cp - 0.3).toFixed(2);
    const z2 = (cp - 0.1).toFixed(2);
    const z3 = (cp + 1.0).toFixed(2);
    const z4 = (cp + 0.55).toFixed(2);
    const H = (v) => wrapH(v); 

    const tool = machineConfig["内径ダイヤΦ4"]; 
    if (!tool) return "(ERROR: 機械定義に '内径ダイヤΦ4' が設定されていません)";
    const m51 = machineConfig["M51"] || "";
    const m59 = machineConfig["M59"] || "";

    let s = "";
    s += `(OKU-BAIT--MENTORI-G18)(CP=${H(cp.toFixed(3))})\n`;
    s += `G0G97S300${H(tool)}M3\n`;
    s += `X3.7Z30.${wrapH(m51)}\n`;
    s += `Z2.\n`;
    s += `G1Z-${H(z1)}(CP-0.3)F1.5\n`;
    s += `X4.1Z-${H(z2)}(CP-0.1)F.04\n`;
    s += `Z-${H(z3)}(CP+1.0)\n`;
    s += `X4.6\n`;
    s += `Z-${H(z4)}(CP+0.55)\n`;
    s += `G4U1.\n`;
    s += `X3.7F.3\n`;
    s += `Z2.F3.\n`;
    s += `G0Z30.${wrapH(m59)}\n`;
    s += `G28U0W0M1`;
    return s;
}

// ★追加: ヨセ生成用関数
// 戻り値: { path: "...", block: "..." }
function getYoseStrings(method, angle, d, machineConfig) {
    // デフォルト戻り値
    let result = { path: "", block: "" };
    
    const valD = parseFloat(d);
    // 相手径が無効なら何もしない、またはエラーを返す
    if (isNaN(valD)) return result;

    const H = (v) => wrapH(ncFormat(v));
    const rawD = ncFormat(valD.toFixed(3)); // 整形済み文字列

    // ① 同時加工 (バイト1本) -> {{ヨセパス}} に追記
    if (method === "1") {
        // 例: X(相手径) または テーパ動作
        // 角度(angle)がある場合は A指令等を入れるのが一般的だが
        // ここでは以前の実装にならい、シンプルに X移動 + コメントを出力
        // 必要に応じて "A" + angle + "." 等を追加してください
        result.path = `\nX${H(rawD)}(YOSE-DOUJI A${angle})`;
        result.block = ""; // ヨセブロックは無し
    } 
    // ② 別工程 (バイト2本) -> {{ヨセブロック}} に独立ブロック出力
    else if (method === "2") {
        result.path = ""; // パスには何も足さない
        
        // 別工程用のブロック生成
        // 工具は暫定で T0707 (machineConfigから取得推奨)
        const tool = machineConfig["内径ダイヤΦ4"];
        if (!tool) return "(ERROR: 機械定義に '内径ダイヤΦ4' が設定されていません)";
        const mOn  = machineConfig["M51"] || "";
        const mOff = machineConfig["M59"] || "";
        
        let s = "\n";
        s += `N103(YOSE-BETSU-KOUTEI)\n`;
        s += `G0G97${wrapH(tool)}S500M3\n`;
        s += `X${H(rawD)}Z30.${wrapH(mOn)}\n`;
        s += `Z1.\n`;
        s += `G1Z-...(YOSE-PROG-HERE)\n`; // 具体的な座標計算ロジックが必要ならここへ
        s += `G0Z30.${wrapH(mOff)}\n`;
        s += `G28U0W0M1\n`;
        
        result.block = s;
    }

    return result;
}

/**
 * 平底ブロック末尾: 図面内径径 ≒ バイト径なら従来の U-.2(…)、異なるなら X[バイト径].F.03
 * （チューブは tubeData.toolDia が無い規格は U-.2 のまま）
 */
function computeFlatBottomExitLine(input) {
    const wt = input.workType;
    const st = input.internalStyle;

    function defaultLine() {
        if (wt === "G78" || wt === "M40") return "U-.2(X16)";
        if (wt === "M22") return "U-.2(X8)";
        return "U-.2";
    }

    // 平底(Hirazoko)以外は id≒toolDia の出し分けをせず defaultLine のみ
    if (st !== "Hirazoko") return defaultLine();

    let idDia = null;
    let toolDia = null;

    if (wt === "Tube" && typeof tubeData !== "undefined" && input.tubeSpec && tubeData[input.tubeSpec]) {
        const t = tubeData[input.tubeSpec];
        idDia = t.id;
        toolDia = t.toolDia;
    } else if (wt === "M12") {
        return "U-.2";
    } else {
        idDia = WORK_ID_MAP[wt];
        toolDia = FLAT_BOTTOM_TOOL_DIA_MM[wt];
    }

    if (idDia == null || toolDia == null || isNaN(idDia) || isNaN(toolDia)) {
        return defaultLine();
    }

    const eps = 0.02;
    if (Math.abs(idDia - toolDia) < eps) return defaultLine();

    return "X" + ncFormat(toolDia) + "F.03";
}

/**
 * チューブ N3: 従来「X6.」行と「U-.2」行を1行にまとめる（例: X6.U-.2）。
 * 平底で X*.F.03 だけ出す場合はその1行に任せる（二重 X を出さない）。
 *
 * 再現例（X6.U-.2 が出るとき）:
 * - 規格に toolDia あり（例: data.js の "8x6 (R0.5)" → toolDia 6）
 * - computeFlatBottomExitLine が U で始まる行（平底で id≒toolDia、または平底以外など → "U-.2"）
 * toolDia が null の規格では結合せず "U-.2" のみ（X 前置きなし）
 */
function combineTubeFlatBottomFinishLine(toolDia, exitLine) {
    const e = String(exitLine || "").trim();
    if (toolDia === null || toolDia === undefined || isNaN(Number(toolDia))) {
        return e;
    }
    const xTool = "X" + ncFormat(Number(toolDia));
    if (e.length > 0 && e.charAt(0) === "U") {
        return xTool + e;
    }
    return e;
}


// ========== 生成ロジック ==========
/**
 * logic.js
 * Gコード生成に必要な定数・計算・バリデーション・テンプレート解決
 */

// --- 定数・ワーク定義マップ ---

// ワーク種別ごとの内径大径(D)定義マップ
const WORK_ID_MAP = { "M40": 22.0, "M22": 10.0, "M18": 8.0, "M15": 6.0, "M12": 4.00, "G78": 16.0, "G18_40": 4.0, "G18_42": 4.15, "G18_62": 6.2, "G18_655": 6.55, "G18_6175": 6.175, "G18_40_MH": 4.0, "G18_42_MH": 4.15, "G18_62_MH": 6.2, "G18_655_MH": 6.55, "G18_6175_MH": 6.175, "M42X3_25175": 25.175, "M42X3_25175_20": 20.0, "M42X3_25175_22": 22.0, "M42X3_25175_16": 16.0 };

/** G18 HGDR 系（φ6.2 / φ6.55 / φ6.175）：同一のスタイル制限・DRILLSHIAGE（G74 仕上げブロック） */
function isG18HgdrSeriesWorkType(wt) {
    return wt === "G18_62" || wt === "G18_655" || wt === "G18_6175"
        || wt === "G18_62_MH" || wt === "G18_655_MH" || wt === "G18_6175_MH";
}

/** 全G18: {{DRILL_BLOCK}} は G1 ドリル仕上げ（G74 ステップ仕上げなし）で統一 */
function usesG18DrillShiageG1Block(wt) {
    return wt === "G18_40" || wt === "G18_42" || wt === "G18_40_MH" || wt === "G18_42_MH"
        || isG18HgdrSeriesWorkType(wt);
}

/** M42X3-ST-G-25.175 系（ストレート / φ20段付 / φ22段付 / φ16段付） */
function isM42X3_25175WorkType(wt) {
    return wt === "M42X3_25175" || wt === "M42X3_25175_20" || wt === "M42X3_25175_22" || wt === "M42X3_25175_16";
}

/** 平底で使う内径ダイヤの公称径（mm）。テンプレの {{内径ダイヤΦ*}} と対応 */
const FLAT_BOTTOM_TOOL_DIA_MM = {
    M40: 16,
    M22: 8,
    M18: 8,
    M15: 6,
    G78: 16,
    // G18 HGDR 系: 加工径(6.x) とバイト径 4 が異なるため computeFlatBottomExitLine は X4.F.03 に分岐
    G18_62: 4,
    G18_655: 4,
    G18_6175: 4,
    G18_62_MH: 4,
    G18_655_MH: 4,
    G18_6175_MH: 4,
    // G18_40 / G18_42 / MH variants: ドリル仕上げ中心のため本マップに載せない（toolDia 未定義 → defaultLine の U-.2）
    // M42X3_25175 系: 内径ダイヤΦ16 使用。φ16段付のみ toolDia=idDia で U-.2、他は X16.F.03
    "M42X3_25175": 16, "M42X3_25175_20": 16, "M42X3_25175_22": 16, "M42X3_25175_16": 16
};

// ドリル径データベース
const DRILL_DIA_MAP = {
    "M40": 14.0,
    "G78": 14.0,
    "M22": 7.0,
    "M18": 7.0,
    "M15": 3.3,
    "M12": 4.05,
    "G18_40": 4.05,
    "G18_42": 4.15,
    "G18_62": 4.15,
    "G18_655": 4.15,
    "G18_6175": 4.15,
    "G18_40_MH": 4.05,
    "G18_42_MH": 4.15,
    "G18_62_MH": 4.15,
    "G18_655_MH": 4.15,
    "G18_6175_MH": 4.15,
    "M42X3_25175": 25.175, "M42X3_25175_20": 20.0, "M42X3_25175_22": 22.0, "M42X3_25175_16": 16.0,
    "Tube": null
};

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
    if (style === 'Yose' || style === 'YoseRelay') {
        result = (0.3 * drillDia) + baseDepth - 0.4;
    }
    // 交差穴の計算式: (0.3 * D) + CP
    else if (style === 'CrossBig' || style === 'CrossSmall') {
        result = (0.3 * drillDia) + baseDepth;
    }

    return result ? result.toFixed(2) : null;
}

function calcYoseRelayMetrics(input) {
    const totalLength = resolveYoseTotalLength(input);
    const partnerDepth = resolveYosePartnerDepth(input);
    const partnerDia = parseFloat(input.yoseD);
    const machinedDia = resolveWorkBigDiameter(input);
    const angleDeg = parseFloat(input.yoseAngle);
    // YoseRelay では、M12のみ実加工の前提径(φ3.3)で先端長を計算する
    // それ以外のワーク種別は従来どおり DRILL_DIA_MAP を使う
    const drillDia = (input.workType === "M12" || input.workType === "M12_MH") ? 3.3 : resolveDrillDia(input);
    if ([totalLength, partnerDepth, partnerDia, machinedDia, angleDeg].some(function (n) { return isNaN(n) || !isFinite(n); })) {
        return null;
    }
    const rad = angleDeg * Math.PI / 180.0;
    const tanVal = Math.tan(rad);
    if (!isFinite(tanVal) || Math.abs(tanVal) < 1e-6) return null;

    const opposedDistance = totalLength - partnerDepth;
    // ヨセ長さ: (相手径/2 - 加工径/2) / tan(テーパ角度)
    const yoseLength = ((partnerDia / 2.0) - (machinedDia / 2.0)) / tanVal;
    // 対ヨセ長さ: 対向口径距離 - ヨセ長さ
    const taiYoseLength = opposedDistance - yoseLength;
    const relayIdDepth = taiYoseLength + 1.0;
    const relayDrillDepth = isNaN(drillDia) ? NaN : taiYoseLength + (0.3 * drillDia);
    return {
        opposedDistance: opposedDistance,
        yoseLength: yoseLength,
        taiYoseLength: taiYoseLength,
        relayIdDepth: relayIdDepth,
        relayDrillDepth: relayDrillDepth
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
    if ([cp, partnerDia, machinedDia].some(function (n) { return isNaN(n) || !isFinite(n); })) {
        return NaN;
    }
    const rPartner = partnerDia / 2.0;
    const rMachined = machinedDia / 2.0;
    const sq = (rPartner * rPartner) - (rMachined * rMachined);
    if (!isFinite(sq) || sq < 0) return NaN;
    const A = Math.sqrt(sq);
    const B = rPartner - A;
    return Number((cp + B + 1.0).toFixed(3));
}

// --- バリデーション ---

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
                msg: `相手径(Φd)はテンプレートの内径加工寸法(Φ${machinedDia.toFixed(3)})より大きい値にしてください。`
            };
        }
    } else if (isYoseMachiningStyle(style)) {
        // ヨセ: 3 < Φd < 内径加工寸法
        if (partnerDia <= 3 || partnerDia >= machinedDia) {
            return {
                ok: false,
                partnerDia: partnerDia,
                machinedDia: machinedDia,
                msg: `相手径(Φd)は 3 より大きく、かつ内径加工寸法(Φ${machinedDia.toFixed(3)})より小さい値にしてください。`
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
        internalStyle: currentInternalStyle
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
            plainText: null
        };
    }

    if (input.workType === "Tonbo") {
        return {
            displayHtml:
                '<span style="color:red; font-weight:bold;">トンボテンプレートは廃止されました（実装中止）。テンプレートを M12〜M40・G78・チューブから選んでください。</span>',
            plainText: null
        };
    }

    // ▼▼▼ 追加: 数値入力バリデーション (Step 3) ▼▼▼
    const errors = [];

    // ── テンプレート（ワーク種別）未選択チェック ──
    if (!input.workType) {
        errors.push('[テンプレート] が選択されていません。「テンプレート」欄からワーク種別を選択してください。');
    }

    // ── 加工スタイル未選択チェック（チューブは不要） ──
    if (input.workType && input.workType !== 'Tube') {
        if (!input.internalStyle) {
            errors.push('[加工スタイル] が選択されていません。内径スタイルドロワーから加工スタイルを選択してください。');
        }
    }

    // ── M99P100 / X50.U8.処理（チューブは対象外） ──
    if (input.workType && input.workType !== 'Tube') {
        const m99Mode = input.m99Mode;
        if (m99Mode !== "on" && m99Mode !== "off") {
            errors.push(
                input.workType === "M40"
                    ? '[X50.U8.処理] が未選択です。「使用しない」または「X50.U8.処理」をプルダウンから選んでください。'
                    : '[M99P100] が未選択です。「使用しない」または「M99P100」をプルダウンから選んでください。'
            );
        }
    }

    // ── 図番・作成者の必須チェック ──
    if (!input.drawNumA || String(input.drawNumA).trim() === '') {
        errors.push('[図番] が入力されていません。「PM-」の後の数字を入力してください。');
    }
    if (!input.workerName || String(input.workerName).trim() === '') {
        errors.push('[作成者] が入力されていません。作成者名を入力してください。');
    }

    // チェック対象リスト: { キー名, 表示名, 必須かどうか(省略可ならfalse) }
    const checkList = [
        { key: 'maxOD',      name: '外径最大径' },
        { key: 'ateLength',  name: 'アテ長さ' },
        { key: 'processNum', name: '工程No' }
    ];

    // 1. 共通項目のチェック（どの欄を直せばよいか明示）
    checkList.forEach(item => {
        const val = input[item.key];
        if (val === "" || val === undefined || val === null) {
            errors.push(`[${item.name}] が未入力です。画面上の「${item.name}」欄に半角数値を入力してください。`);
        } else {
            const parsed = item.key === "maxOD"
                ? parseSimpleNumberOrFormula(val)
                : parseFloat(val);
            if (isNaN(parsed) || !isFinite(parsed)) {
            errors.push(`[${item.name}] が数値として読めません。カンマや全角数字は使わず、例「30.1」のように半角で入力してください。`);
            }
        }
    });

    // チューブ以外: 外径最大径は正の値であること（0 や負は無効）
    if (input.workType !== "Tube") {
        const maxOdNum = parseSimpleNumberOrFormula(input.maxOD);
        if (!isNaN(maxOdNum) && maxOdNum <= 0) {
            errors.push('[外径最大径] は 0 より大きい必要があります。アテ長さボタンで再計算するか、図面の値を確認してください。');
        }
    }

    // アテ長さは正の値であること（0 や負は加工長さとして無効）
    {
        const ateLenNum = parseFloat(input.ateLength);
        if (!isNaN(ateLenNum) && ateLenNum <= 0) {
            errors.push('[アテ長さ] は 0 より大きい値を入力してください。');
        }
    }

    // 角あり: Gコード側で W（と外径）から角の径を計算するため、W・H 両方が必須
    if (input.calcMode === "corner") {
        const wStr = input.valCornW;
        const hStr = input.valCornH;
        const w = parseFloat(wStr);
        const h = parseFloat(hStr);
        if (wStr === "" || wStr === undefined || isNaN(w) || !isFinite(w)) {
            errors.push('[角あり] 「母材 幅 (W)」に半角数値を入力してください。（未入力だと角の径が計算されません）');
        } else if (w <= 0) {
            errors.push('[角あり] 「母材 幅 (W)」は 0 より大きい値を入力してください。');
        }
        if (hStr === "" || hStr === undefined || isNaN(h) || !isFinite(h)) {
            errors.push('[角あり] 「追加 高さ (H)」に半角数値を入力してください。（外径最大径の自動計算に必要です）');
        } else if (h <= 0) {
            errors.push('[角あり] 「追加 高さ (H)」は 0 より大きい値を入力してください。');
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
        if (!isYoseRelayStyle(style) && input.workType !== 'Tube' && isNaN(parseFloat(input.idDepth))) {
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
            if (!isNaN(angle) && Math.abs(Math.tan(angle * Math.PI / 180.0)) < 1e-6) {
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
    const needsCp = style === 'CrossBig' || style === 'CrossSmall' ||
                    (style === 'Ichimonji' && input.workType !== 'M12' && input.workType !== 'M12_MH');
    if (needsCp) {
        if (isNaN(parseFloat(input.cpVal))) errors.push("[CP (交差穴位置)] が計算されていません。");
    }
    if (style === "CrossSmall") {
        if (isNaN(parseFloat(input.valPartnerD))) {
            errors.push("[相手径 (Φ)] が入力されていません。");
        }
        const crossSmallDepth = calcCrossSmallFinishDepth(input);
        if (isNaN(crossSmallDepth) || !isFinite(crossSmallDepth)) {
            errors.push("[交差穴加工径小] 内径深さを計算できません。相手径/加工径/CP を確認してください。");
        }
    }

    // Normal / Hirazoko / Ichimonji / CrossBig スタイルでは内径深さ必須かつ 7 超
    // （YoseRelay は自動計算・CrossSmall は交差穴CP から自動計算・Tube はチューブ長さを使用）
    if (style && !isYoseMachiningStyle(style) && !isYoseRelayStyle(style)
            && style !== 'CrossSmall' && input.workType !== 'Tube') {
        const idDepthNum = parseFloat(input.idDepth);
        if (isNaN(idDepthNum)) {
            errors.push("[内径深さ] が入力されていません。");
        } else if (idDepthNum <= 7) {
            errors.push("[内径深さ] は 7 より大きい値を入力してください。");
        }
    }
    // Yose スタイル（非 Tube）でも内径深さが入力されていれば 7 超チェックを適用
    if (isYoseMachiningStyle(style) && input.workType !== 'Tube') {
        const idDepthNum = parseFloat(input.idDepth);
        if (!isNaN(idDepthNum) && idDepthNum <= 7) {
            errors.push("[内径深さ] は 7 より大きい値を入力してください。");
        }
    }

    // チューブ加工の場合の必須チェック（未選択／未定義データ／一覧に無い規格はここで止め、{{…}} 残りを防ぐ）
    if (input.workType === 'Tube') {
        const spec = (input.tubeSpec || '').trim();
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

    const _isDbgMode = (typeof isDebugModeOn === 'function') && isDebugModeOn();
    let _debugValidationWarning = "";
    if (errors.length > 0) {
        if (!_isDbgMode) {
            // ▼ styleに column-span: all; を追加して、2段組みを貫通させる
            return {
                displayHtml: `
                <div style="background:#330000; border:2px solid #ff4444; padding:15px; color:#ffcccc; border-radius:6px; column-span: all;">
                    <h3 style="margin-top:0; color:#ff4444;">⚠ 生成エラー (入力値を確認してください)</h3>
                    <ul style="padding-left:20px; line-height:1.6;">
                        ${errors.map(msg => `<li>${msg}</li>`).join('')}
                    </ul>
                </div>
            `,
                plainText: null
            };
        }
        _debugValidationWarning = `<div style="background:#332200; border:2px solid #ffaa00; padding:10px; color:#ffeecc; border-radius:6px; margin-bottom:6px; column-span:all; font-size:0.85em;"><strong>🛠 デバッグモード: 未入力項目あり（強制出力）</strong><ul style="padding-left:18px; margin:4px 0 0 0; line-height:1.5;">${errors.map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></div>`;
    }
    // ▲▲▲ バリデーションここまで ▲▲▲

    // 2. 共通変数の準備
    const dt = new Date();
    const today = `${dt.getFullYear()}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getDate().toString().padStart(2,'0')}`;
    
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

        if (input.calcMode === 'corner') {
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
    if(input.drawNumB) fullDrawStr += "-" + input.drawNumB;
    if(input.drawRev && input.drawRev !== "NONE") fullDrawStr += input.drawRev;

    // M99P100：M40 の X50.U8.処理 ON のときは本文に M99P100 を付けない（(M99P100) 行は空欄）
    let valM99 = input.m99p100 ? " M99P100" : "";
    if (input.workType === "M40" && input.m99p100) {
        valM99 = "";
    }
    
    // --- 2. ドリル深さ決定ロジック ---
    // const style = input.internalStyle; // 上で定義済み
    const baseIDDepth = parseFloat(input.idDepth);
    let finalDrillDepth = parseFloat(input.drillDepth);

    if ((style === 'Hirazoko' || style === 'Ichimonji') && !isNaN(baseIDDepth)) {
        finalDrillDepth = baseIDDepth + 0.1;
    } else if (isNaN(finalDrillDepth) && !isNaN(baseIDDepth)) {
        finalDrillDepth = baseIDDepth;
    }

    let finalFinishDepth = baseIDDepth;
    if ((style === 'Hirazoko' || style === 'Ichimonji') && !isNaN(baseIDDepth)) {
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

    // --- 3. 奥バイト / 一文字：テンプレート注入（EARLY=ドリル直後、LATE=バイト仕上げ後・BAITO のみ）---
    let rearChamferEarly = "";
    let okuBiteMentoriLateBlock = "";
    if (style === "Ichimonji") {
        if (input.workType === "M12" || input.workType === "M12_MH") {
            // M12: 一文字DR平底 → 半月/HSS ドリルで平底仕上げ
            rearChamferEarly = getIchimonjiHirazokoBlock(baseIDDepth, machineConfig);
        } else {
            rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
        }
    } else if ((input.workType === "G18_40" || input.workType === "G18_42" || input.workType === "G18_40_MH" || input.workType === "G18_42_MH") && style === "CrossSmall") {
        const partnerD = parseFloat(input.valPartnerD);
        if (!isNaN(partnerD)) {
            rearChamferEarly = getOkuBiteBlockG18(input.cpVal, machineConfig);
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
                const rad = angle * Math.PI / 180;
                const zAdd = rDiff / Math.tan(rad);
                const zEnd = effectiveDepth + zAdd;
                const zInter = zEnd - 0.4;

                const Fmt = (n) => wrapH(ncFormat(n.toFixed(3)));
                const yoseBaseDepth = effectiveDepth;
                const H_depth = wrapH(ncFormat(yoseBaseDepth)); 

                // 共通パス
                const commonPath = 
                    `X${Fmt(xEnd)}(d-0.4)Z-${Fmt(zInter)}F.08\n` +
                    `Z-${Fmt(zEnd)}F.2\n` +
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
                        `\nN32(IN-OKU)\n` +
                        `G0G97${toolName}S350M3\n` +
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
    const replaceMap = {
        "入力_図番": wrapHInput(fullDrawStr),
        "入力_工程No": wrapHInput(input.processNum),
        "入力_作成者": wrapHInput(input.workerName),
        "入力_アテ長さ": wrapHInput(ncFormat(input.ateLength)),
        "入力_日付": wrapHInput(today),
        "最大径-5": wrapHCalc(ncFormat(calcMax1)),
        // 外径仕上ブロック（M12/M15/M18/M22/M40/G78/Tube 共通）: 通常・偏心は X…(--X--) の1行のみ（F.3 行は省略）。角ありは従来どおり2段。
        "最大径+角": input.calcMode === "corner"
            ? ("X" + wrapHCalc(ncFormat(calcCorner)))
            : ("X" + wrapHCalc(ncFormat(calcMax2)) + "(--X--)"),
        "最大径+3": input.calcMode === "corner"
            ? ("X" + wrapHCalc(ncFormat(calcMax2)) + "F.3\n")
            : "",
        "M99P100": wrapHInput(valM99),
        "最大径50": "",
        "入力_内径深さ": wrapHCalc(ncFormat(finalFinishDepth)),
        
        "DRILL_BLOCK": usesG18DrillShiageG1Block(input.workType)
            ? getDrillBlock(finalDrillDepth, "G1")
            : ((input.workType === "M12" || input.workType === "M12_MH") && (input.m12FinishType || "hss") === "hss")
                ? getDrillShiageBlock(finalDrillDepth)
                : getDrillBlock(finalDrillDepth, input.drillMode),
        "奥バイト面取り": okuBiteMentoriBlock,

        "BAITO_IN_S":         wrapHMachine("500"),
        "BAITO_IN_APX":       wrapHMachine("5."),
        "BAITO_IN_X":         wrapHMachine("4."),
        "BAITO_IN_CHAMFER_Z": wrapHMachine("3."),
        "BAITO_IN_MID_Z":     wrapHMachine("7.5"),

        "平底_内径仕上出口": flatBottomExitLine,
        
        // ヨセ変数
        "ヨセパス": yosePath,
        "ヨセブロック": yoseBlock,
        
    };

    // 機械変数のマッピング
    for (let key in machineConfig) {
        replaceMap[key] = machineConfig[key] ? wrapHMachine(machineConfig[key]) : "";
    }

    // MH外径荒: MH系テンプレートで外径荒/外径溝を切り替えるプレースホルダー
    {
        const _isMH = input.workType && input.workType.endsWith("_MH");
        const _mhToolKey = (input.mhOdTool && _isMH) ? input.mhOdTool : "外径荒";
        replaceMap["MH外径荒"] = _isMH
            ? (machineConfig[_mhToolKey] ? wrapHMachine(machineConfig[_mhToolKey]) : "")
            : "";
    }

    // --- 6. テンプレート選択・生成 ---
    let finalCode = "";

    if (input.workType === "Tube") {
        if (typeof template_Tube !== 'undefined') finalCode = template_Tube;
        if(typeof tubeData !== 'undefined' && tubeData[input.tubeSpec]) {
             const tSpec = tubeData[input.tubeSpec];
             const L = parseFloat(input.tubeLength);
             // 規格に toolKey がない場合は、標準的な "内径ダイヤΦ4" をデフォルトにします
             const toolKey = tSpec.toolKey || "内径ダイヤΦ4";
             const toolT = machineConfig[toolKey];
             
             if (!toolT) {
                 return {
                     displayHtml: `<span style="color:red; font-weight:bold;">エラー: 機械定義に Tube加工用の工具 "${toolKey}" が見つかりません。</span>`,
                     plainText: null
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
             if(D_Drill_Str && D_Drill_Str.startsWith("DR")) drillVal = parseFloat(D_Drill_Str.replace("DR", ""));
             
            replaceMap["L"] = wrapHCalc(ncFormat((L).toFixed(3)));
            replaceMap["母材幅"] = wrapHCalc(ncFormat((OD / Math.SQRT2).toFixed(3)));
            replaceMap["チューブ_外径荒加工径"] = wrapHCalc(ncFormat((OD + R + R + 2.6).toFixed(3)));
            replaceMap["チューブ_端面始点"] = input.m99p100 ? "" : wrapHCalc(ncFormat((OD + R + R + 4.6).toFixed(3)));
            const _mcNum = parseFloat(tSpec.MC);
            replaceMap["MC丸"] = input.m99p100
                ? (!isNaN(_mcNum) ? wrapHCalc(ncFormat((_mcNum).toFixed(3))) : "テンプレート未設定")
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
        if (typeof template_M40 !== 'undefined') finalCode = template_M40;
        if (input.m99p100) {
            // X50.U8.処理: プレースホルダー代入前にテンプレート内の固定値を置換
            finalCode = finalCode.replace("G71U4.5R.5", "G71U8.0R.5");
            finalCode = finalCode.replace("N22X{{最大径-5}}F.35", "N22X56.F.35");
            // 残った {{最大径-5}} (line 20) を空にし、{{最大径50}} で "50." を出力
            replaceMap["最大径-5"] = "";
            replaceMap["最大径50"] = wrapHCalc("50.");
        }
    }
    else if (input.workType === "M22") { if (typeof template_M22 !== 'undefined') finalCode = template_M22; }
    else if (input.workType === "M18") { if (typeof template_M18 !== 'undefined') finalCode = template_M18; }
    else if (input.workType === "M15") { if (typeof template_M15 !== 'undefined') finalCode = template_M15; }
    else if (input.workType === "M40_MH") { if (typeof template_M40_MH !== 'undefined') finalCode = template_M40_MH; }
    else if (input.workType === "M22_MH") { if (typeof template_M22_MH !== 'undefined') finalCode = template_M22_MH; }
    else if (input.workType === "M18_MH") { if (typeof template_M18_MH !== 'undefined') finalCode = template_M18_MH; }
    else if (input.workType === "M15_MH") { if (typeof template_M15_MH !== 'undefined') finalCode = template_M15_MH; }
    else if (input.workType === "M12_MH") {
        const ft = input.m12FinishType || "hss";
        const m12mhv = ft === "baito" ? template_M12BAITO_MH
                     : ft === "hss"   ? template_M12HSS_MH
                     : template_M12HGDR_MH;
        if (typeof m12mhv !== "undefined") finalCode = m12mhv;
    }
    else if (input.workType === "G78_MH") { if (typeof template_G78_MH !== 'undefined') finalCode = template_G78_MH; }
    else if (input.workType === "M12") {
        const ft = input.m12FinishType || "hss";
        const m12v = ft === "baito" ? template_M12BAITO
                   : ft === "hss"   ? template_M12HSS
                   : template_M12HGDR;
        if (typeof m12v !== "undefined") finalCode = m12v;
    }
    else if (input.workType === "G18_40") { if (typeof template_G18_40 !== 'undefined') finalCode = template_G18_40; }
    else if (input.workType === "G18_42") { if (typeof template_G18_42 !== 'undefined') finalCode = template_G18_42; }
    else if (input.workType === "G18_62") { if (typeof template_G18_62 !== 'undefined') finalCode = template_G18_62; }
    else if (input.workType === "G18_655") { if (typeof template_G18_655 !== 'undefined') finalCode = template_G18_655; }
    else if (input.workType === "G18_6175") { if (typeof template_G18_6175 !== 'undefined') finalCode = template_G18_6175; }
    else if (input.workType === "G18_40_MH") { if (typeof template_G18_40_MH !== 'undefined') finalCode = template_G18_40_MH; }
    else if (input.workType === "G18_42_MH") { if (typeof template_G18_42_MH !== 'undefined') finalCode = template_G18_42_MH; }
    else if (input.workType === "G18_62_MH") { if (typeof template_G18_62_MH !== 'undefined') finalCode = template_G18_62_MH; }
    else if (input.workType === "G18_655_MH") { if (typeof template_G18_655_MH !== 'undefined') finalCode = template_G18_655_MH; }
    else if (input.workType === "G18_6175_MH") { if (typeof template_G18_6175_MH !== 'undefined') finalCode = template_G18_6175_MH; }
    else if (input.workType === "M42X3_25175")    { if (typeof template_M42X3_25175    !== 'undefined') finalCode = template_M42X3_25175; }
    else if (input.workType === "M42X3_25175_20") { if (typeof template_M42X3_25175_20 !== 'undefined') finalCode = template_M42X3_25175_20; }
    else if (input.workType === "M42X3_25175_22") { if (typeof template_M42X3_25175_22 !== 'undefined') finalCode = template_M42X3_25175_22; }
    else if (input.workType === "M42X3_25175_16") { if (typeof template_M42X3_25175_16 !== 'undefined') finalCode = template_M42X3_25175_16; }
    else { if (typeof template_G78 !== 'undefined') finalCode = template_G78; }

    if (!finalCode) {
        return { displayHtml: "エラー: テンプレートが見つかりません", plainText: null };
    }

    // カバレッジ用: 置換前のテンプレートキーを抽出
    const _templateKeysRaw = [];
    { const _m = finalCode.matchAll(/\{\{([^}]+)\}\}/g); for (const x of _m) _templateKeysRaw.push(x[1]); }
    const _templateKeySet = new Set(_templateKeysRaw);

    // デバッグモード時にプレースホルダーとして残す対象: ユーザー数値入力から導出されるキーのみ
    // 設計上の空値（{{扉閉じ}}・{{ヨセパス}}・{{最大径+3}} 等）はスキップしない
    const _debugUserInputKeys = new Set([
        "最大径-5", "最大径+角",
        "入力_内径深さ", "入力_図番", "入力_工程No", "入力_作成者", "入力_アテ長さ",
        // Tube 系
        "入力_外径", "入力_内径", "入力_長さ", "入力_R",
        "L", "L-R", "L-0.3", "L-0.5",
        "OD+2R", "OD+2R+0.1", "OD+0.1", "OD-0.6", "ID+0.6", "Drill-1", "母材幅", "MC丸",
    ]);

    Object.keys(replaceMap).forEach(key => {
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
    { const _m = finalCode.matchAll(/\{\{([^}]+)\}\}/g); for (const x of _m) _unresolvedKeys.push(x[1]); }

    // 未解決プレースホルダーを赤太字で強調
    if (_unresolvedKeys.length > 0) {
        finalCode = finalCode.replace(/\{\{([^}]+)\}\}/g,
            (_, k) => `<span class="h-val h-val--unresolved">{{${escapeHtml(k)}}}</span>`
        );
    }

    // デバッグ用: 最後の入力・解決結果を保持
    _ncDebugLastInput = input;
    _ncDebugLastReplaceMap = replaceMap;
    _ncDebugLastTemplateKeys = _templateKeySet;
    _ncDebugLastUnresolved = new Set(_unresolvedKeys);

    return {
        displayHtml: _debugValidationWarning + finalCode,
        plainText: gcodeDisplayHtmlToPlainText(finalCode)
    };
}

// ========== ui ==========
/* ui.js: 画面操作・イベント処理 */

const $id = (id) => document.getElementById(id);
const formatNum = (e) => e.value = e.value.replace(/[^0-9]/g,'');

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
 * 全角英数字・全角記号（Unicode 全角形ブロックの主範囲）・和文スペース(U+3000)を検出。
 * 半角カナ(FF65–FF9F)・半角記号(FF61–FF64)は許可。
 */
function containsFullWidthFormChars(s) {
    if (!s) return false;
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp === 0x3000) return true;
        if (cp >= 0xff01 && cp <= 0xff60) return true;
        if (cp >= 0xffe0 && cp <= 0xffe6) return true;
    }
    return false;
}

/**
 * 全角英数字・記号・全角スペース → 半角に変換し、
 * ひらがな・カタカナ・漢字など残る非ASCII文字は除去する
 */
function toHankaku(str) {
    if (!str) return str;
    return str
        .replace(/[Ａ-Ｚａ-ｚ０-９！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, ' ')
        .replace(/[^\x20-\x7E\r\n\t]/g, '');
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
        try { el.setSelectionRange(ss, se); } catch (_) {}
        _converting = false;
    }

    // IME確定後（全OS共通）: compositionend の直後にブラウザが value を確定するので
    // setTimeout(0) で1フレーム遅らせてから変換・除去する
    document.addEventListener("compositionend", function (ev) {
        const t = ev.target;
        if (!isHalfWidthGuardInput(t)) return;
        setTimeout(function () { convertInPlace(t); }, 0);
    }, true);

    // ペースト・直接入力: IME変換中 (isComposing=true) はスキップ
    document.addEventListener("input", function (ev) {
        const t = ev.target;
        if (!isHalfWidthGuardInput(t)) return;
        if (ev.isComposing) return;
        convertInPlace(t);
    }, true);
}

let currentInternalStyle = '';
let currentCalcMode = 'normal';
/** 外径ドロワー「入力」: dimensions=モード寸法 / ate=アテ長さ式 */
let maxOdApplySource = "dimensions";
/** 最大径（アテ長さ）式: 上段 15角〜43角 クイック直後に限り true。下段数値・手入力では false。 */
let ateLengthFromKaku = false;
/** アテ長さ: ○○角 自動計算が使える値のセット（datalist の kaku 区分） */
const ATE_LENGTH_KAKU_VALUES = new Set(["42.5", "41", "39.5", "37.5", "33.25", "28.5"]);

function updateWorkTypeSettings() {
  const type = $id('workType').value;
  const normalArea = $id('normalProcessArea');
  const drillMode = $id('drillMode');
  const idDepth = $id('idDepth');

  if (normalArea) normalArea.style.display = 'block';

  if (type === 'M12' || type === 'M12_MH') {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
  } else if (usesG18DrillShiageG1Block(type)) {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
      if (drillMode) { drillMode.value = "G1"; drillMode.disabled = true; }
  } else {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
      if (drillMode) { drillMode.value = "G74"; drillMode.disabled = false; }
  }

  restrictStyles(type);
  updateTubeVariantUI();
  updateInternalStyleUI();
  calcDrillDepth();
  updateM40M99UI(type);
  updateMHOdToolUI(type);
}

function updateMHOdToolUI(type) {
  const row = $id('mhOdToolRow');
  if (!row) return;
  const isMH = type && type.endsWith('_MH');
  row.style.display = isMH ? '' : 'none';
}
window._ncUpdateMHOdToolUI = function () { updateMHOdToolUI($id('workType') ? $id('workType').value : ''); };

function updateM40M99UI(type) {
    const resolvedType = type !== undefined
        ? type
        : ($id('workType') ? $id('workType').value : '');
    const label = $id('lblM99P100');
    const sel = $id('selM99P100');
    if (!label || !sel || sel.options.length < 3) return;
    if (resolvedType === 'M40') {
        label.textContent = 'X50.U8.処理';
        sel.options[0].textContent = '未選択';
        sel.options[1].textContent = '使用しない';
        sel.options[2].textContent = 'X50.U8.処理';
    } else {
        label.textContent = 'M99P100';
        sel.options[0].textContent = '未選択';
        sel.options[1].textContent = '使用しない';
        sel.options[2].textContent = 'M99P100';
    }
}
window._ncUpdateM40M99UI = function () { updateM40M99UI(); };

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
  if (style === "CrossSmall") {
    const cm = ($id("m12CrossMethod") && $id("m12CrossMethod").value) || "hss_oku";
    const map = {
      "hss_oku":   { finishType: "hss",      profile: "cross_oku" },
      "hgdr_oku":  { finishType: "halfmoon", profile: "cross_oku" },
      "hss_men":   { finishType: "hss",      profile: "drill_ichi_men" },
      "hgdr_men":  { finishType: "halfmoon", profile: "drill_ichi_men" },
      "baito_oku": { finishType: "baito",    profile: "baito_oku" },
    };
    return map[cm] || { finishType: "hss", profile: "cross_oku" };
  }
  return { finishType: "hss", profile: "drill_ichi_hira" };
}

/** M12 サブパネルをスタイル選択に応じて表示切替 */
function updateM12SubPanels() {
  const wt = $id("workType") ? $id("workType").value : "";
  const isM12 = wt === "M12" || wt === "M12_MH";
  const ichiPanel  = $id("m12IchiPanel");
  const crossPanel = $id("m12CrossPanel");
  const showIchi  = isM12 && currentInternalStyle === "Ichimonji";
  const showCross = isM12 && currentInternalStyle === "CrossSmall";
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
function updateM12CascadeUI() { updateM12SubPanels(); }
window.updateM12CascadeUI = updateM12CascadeUI;

/** M12: ドリル種類ドロップダウン変更 */
function onM12DrillTypeChange() {
  updateInternalStyleUI();
  calcDrillDepth();
  runGeneration();
}

/** M12: 交差穴加工方法ドロップダウン変更 */
function onM12CrossMethodChange() {
  updateInternalStyleUI();
  calcDrillDepth();
  runGeneration();
}

/** M12: すべての場合で G1 を返す（G74 プロファイルは廃止） */
function getM12BaitoDrillModeForInput() {
  return "G1";
}

/** 奥バイト面取りを行うか（profile 文字列で判定） */
function m12ProfileImpliesOku(profile) {
  if (!profile) return false;
  return (
    profile === "cross_oku" ||
    profile === "baito_oku" ||
    profile === "baito_g1_oku" ||
    profile === "baito_g74_oku"
  );
}

/**
 * ワーク種別がチューブのときのみ表示（左カラムの group レイアウト）。
 */
function updateTubeVariantUI() {
  const grp = $id('tubeVariantGroup');
  const wt = $id('workType') && $id('workType').value;
  if (!grp) return;
  if (wt === 'Tube') {
    grp.style.display = '';
    initTubeSpecs();
  } else {
    grp.style.display = 'none';
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
  runGeneration();
}

function restrictStyles(workType) {
    const internalStyleCardIds = [
        'styleHirazoko',
        'styleIchimonji',
        'styleNormal',
        'styleYoseRelay',
        'styleYose',
        'styleCrossSmall'
    ];

    function setInternalStyleCardsLocked(locked) {
        internalStyleCardIds.forEach((id) => {
            const el = $id(id);
            if (!el) return;
            if (locked) {
                el.style.pointerEvents = 'none';
                el.style.opacity = id === 'styleNormal' ? '1' : '0.35';
                el.setAttribute('aria-disabled', 'true');
            } else {
                el.style.pointerEvents = 'auto';
                el.style.opacity = '1';
                el.removeAttribute('aria-disabled');
            }
        });
    }

    setInternalStyleCardsLocked(false);

    const styleHirazoko = $id('styleHirazoko');
    const styleIchimonji = $id('styleIchimonji');
    const styleYose = $id('styleYose');
    const styleYoseRelay = $id('styleYoseRelay');
    const styleCrossBig = $id('styleCrossBig');

    // スタイルのリセットと有効化
    if(styleHirazoko) { styleHirazoko.style.pointerEvents = 'auto'; styleHirazoko.style.opacity = '1'; }
    if(styleIchimonji) { styleIchimonji.style.pointerEvents = 'auto'; styleIchimonji.style.opacity = '1'; }
    if(styleYose) { styleYose.style.pointerEvents = 'auto'; styleYose.style.opacity = '1'; }
    if(styleYoseRelay) { styleYoseRelay.style.pointerEvents = 'auto'; styleYoseRelay.style.opacity = '1'; }
    if(styleCrossBig) { styleCrossBig.style.pointerEvents = 'auto'; styleCrossBig.style.opacity = '1'; }

    if (workType === 'G18_40' || workType === 'G18_42' || workType === 'G18_40_MH' || workType === 'G18_42_MH') {
        ['styleHirazoko', 'styleIchimonji', 'styleNormal', 'styleYose'].forEach(id => {
            const el = $id(id);
            if (el) { el.style.pointerEvents = 'none'; el.style.opacity = '0.3'; }
        });
        if (!['YoseRelay', 'CrossSmall'].includes(currentInternalStyle)) {
            setInternalStyle('');
        }
    } else if (isG18HgdrSeriesWorkType(workType)) {
        ['styleIchimonji', 'styleYose', 'styleCrossSmall'].forEach(id => {
            const el = $id(id);
            if (el) { el.style.pointerEvents = 'none'; el.style.opacity = '0.3'; }
        });
        if (!['Hirazoko', 'Normal', 'YoseRelay'].includes(currentInternalStyle)) {
            setInternalStyle('');
        }
    } else if (isM42X3_25175WorkType(workType)) {
        ['styleIchimonji', 'styleCrossSmall', 'styleCrossBig'].forEach(id => {
            const el = $id(id);
            if (el) { el.style.pointerEvents = 'none'; el.style.opacity = '0.3'; }
        });
        if (!['Hirazoko', 'Normal', 'Yose', 'YoseRelay'].includes(currentInternalStyle)) {
            setInternalStyle('');
        }
    } else if (workType === 'M12' || workType === 'M12_MH') {
        if(styleHirazoko) {
            styleHirazoko.style.pointerEvents = 'none';
            styleHirazoko.style.opacity = '0.3';
        }
        if (styleYose) {
            styleYose.style.pointerEvents = 'none';
            styleYose.style.opacity = '0.3';
        }
        if (currentInternalStyle === 'Hirazoko') {
            setInternalStyle('Ichimonji');
        } else if (currentInternalStyle === 'Yose') {
            setInternalStyle('Normal');
        } else if (currentInternalStyle === 'CrossBig') {
            setInternalStyle('CrossSmall');
        }
    } else {
        if(styleIchimonji) {
            styleIchimonji.style.pointerEvents = 'none';
            styleIchimonji.style.opacity = '0.3';
        }
        if (currentInternalStyle === 'Ichimonji') {
            setInternalStyle('Hirazoko');
        }
    }
}

function initTubeSpecs() {
  const sel = $id('tubeSpecSelect');
  if (sel.options.length > 1) return; 
  for (let key in tubeData) {
      let op = document.createElement('option');
      op.value = key;
      op.text = key;
      sel.appendChild(op);
  }
}

function updateTubeLengths() {
  const spec = $id('tubeSpecSelect').value;
  const lenSel = $id('tubeLengthSelect');
  lenSel.innerHTML = ""; 
  
  if (tubeData[spec]) {
      tubeData[spec].lengths.forEach(len => {
          let op = document.createElement('option');
          op.value = len;
          op.text = len + " mm";
          lenSel.appendChild(op);
      });
  }
  calcDrillDepth();
}

let isInternalStyleDrawerOpen = false;

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
  const txt =
    window.NC_I18N && typeof window.NC_I18N.t === "function"
      ? window.NC_I18N.t(key)
      : key;
  out.textContent = String(txt || "").replace(/\n/g, " ");
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
    }
    currentInternalStyle = style;
    const styles = ['Hirazoko', 'Ichimonji', 'Normal', 'YoseRelay', 'Yose', 'CrossSmall'];
    styles.forEach(s => {
        const card = $id('style' + s);
        if(card) {
            if(s === style) card.classList.add('active');
            else card.classList.remove('active');
        }
    });
    updateInternalStyleDrawerLabel();
    updateInternalStyleUI();
    calcDrillDepth();
    // スタイルカード選択後にドロワーを閉じる
    if (isInternalStyleDrawerOpen) {
        isInternalStyleDrawerOpen = false;
        syncInternalStyleDrawerPanel();
    }
}

/**
 * 内径加工スタイル・ワーク種別に応じたブロック表示（Enterキーのナビとは独立）
 */
function updateInternalStyleUI() {
    const drillMode = $id('drillMode');
    const cpArea = $id('cpCalcArea');
    const yoseDiv = $id('yoseSettings');
    const yoseMethodRow = $id('yoseMethodRow');
    const yoseTotalLengthRow = $id('yoseTotalLengthRow');
    const yosePartnerDepthRow = $id('yosePartnerDepthRow');
    const yoseOpposedDistanceRow = $id('yoseOpposedDistanceRow');
    const yoseLengthRow = $id('yoseLengthRow');
    const yoseTaiLengthRow = $id('yoseTaiLengthRow');
    const yoseOpposedDistanceInput = $id('yoseOpposedDistance');
    const yoseLengthInput = $id('yoseLength');
    const yoseTaiLengthInput = $id('yoseTaiLength');
    const okuBiteArea = $id('okuBiteArea');
    const workType = $id('workType').value;
    const isTemplateSelected = !!workType;
    const machiningSettingsGroup = $id('machiningSettingsGroup');
    const mainActionRow = $id('mainActionRow');
    const highlightFilterRow = $id('highlightFilterRow');
    const blockMaxDiameterMode = $id('blockMaxDiameterMode');
    const maxOdRow = $id('maxOdRow');
    const idDepthRow = $id('idDepthRow');

    // 外径最大径と同様に、テンプレート未選択時は加工設定と生成ボタンを隠す
    if (machiningSettingsGroup) {
        machiningSettingsGroup.style.display = isTemplateSelected ? "" : "none";
    }
    if (mainActionRow) {
        mainActionRow.style.display = isTemplateSelected ? "flex" : "none";
    }
    if (highlightFilterRow) {
        highlightFilterRow.style.display = isTemplateSelected ? "flex" : "none";
    }

    const styleDrawer = $id("internalStyleDrawer");
    if (styleDrawer) {
        // M12 でも内径加工スタイル分岐を使うため、テンプレート選択時は常に表示
        const showDrawer = isTemplateSelected;
        styleDrawer.style.display = showDrawer ? "block" : "none";
        if (!showDrawer) {
            isInternalStyleDrawerOpen = false;
        }
        syncInternalStyleDrawerPanel();
    }

    // チューブでも最大径計算モードを選べる（外径最大径はチューブ規格からは自動入力しない）
    if (blockMaxDiameterMode) {
        blockMaxDiameterMode.style.display = '';
    }
    if (maxOdRow) {
        maxOdRow.style.display = isTemplateSelected ? "flex" : "none";
    }

    // ドリル深さUI制御（平底・一文字は図面の内径深さから自動計算するため入力欄を隠す）
    const drillDepthInput = $id('drillDepth');
    const drillDepthLabel = $id('drillDepthLabel');
    const drillDepthContainer = drillDepthInput && drillDepthInput.parentElement;
    if (!currentInternalStyle || currentInternalStyle === 'Hirazoko' || currentInternalStyle === 'Ichimonji') {
        if(drillDepthContainer) drillDepthContainer.style.display = 'none';
    } else {
        if(drillDepthContainer) drillDepthContainer.style.display = 'flex';
    }
    if (idDepthRow) {
        // 6.交差穴加工径小では、見落とし防止のため常に表示を優先
        if (currentInternalStyle === "CrossSmall") {
            idDepthRow.style.display = "flex";
        } else {
            idDepthRow.style.display = isTemplateSelected && !!currentInternalStyle ? "flex" : "none";
        }
    }

    if (drillDepthInput) {
        const tFn =
            window.NC_I18N && typeof window.NC_I18N.t === "function"
                ? window.NC_I18N.t.bind(window.NC_I18N)
                : function (k) { return k; };
        const isAutoDrillDepthStyle =
            currentInternalStyle === "Hirazoko" ||
            isYoseMachiningStyle(currentInternalStyle) ||
            isYoseRelayStyle(currentInternalStyle) ||
            currentInternalStyle === "CrossSmall";
        drillDepthInput.placeholder = isAutoDrillDepthStyle
            ? tFn("drillAutoPlaceholder")
            : "45.0";
    }

    const m12Resolved = (workType === "M12" || workType === "M12_MH") ? resolveM12FinishAndProfile() : { finishType: "", profile: "" };
    if (drillDepthInput && drillDepthLabel) {
        if ((workType === "M12" || workType === "M12_MH") && m12Resolved.finishType === "halfmoon" && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillDepthHangetsu");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else if ((workType === "M12" || workType === "M12_MH") && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else if ((workType === "G18_40" || workType === "G18_42" || workType === "G18_40_MH" || workType === "G18_42_MH") && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = false;
            drillDepthInput.classList.remove("input--readonly-computed");
        }
    }

    if (workType === "M12" || workType === "M12_MH" || usesG18DrillShiageG1Block(workType)) {
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
        const shouldHideDrillMode = workType === "M12" || workType === "M12_MH" || usesG18DrillShiageG1Block(workType) || !currentInternalStyle;
        drillModeRow.style.display = shouldHideDrillMode ? "none" : "flex";
    }

    updateM12SubPanels();

    // ヨセ設定（ヨセ / ヨセ中継）
    if (isYoseMachiningStyle(currentInternalStyle) || isYoseRelayStyle(currentInternalStyle)) {
        yoseDiv.style.display = "block";
        if (yoseMethodRow) yoseMethodRow.style.display = isYoseMachiningStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseTotalLengthRow) yoseTotalLengthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yosePartnerDepthRow) yosePartnerDepthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseOpposedDistanceRow) yoseOpposedDistanceRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseLengthRow) yoseLengthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
        if (yoseTaiLengthRow) yoseTaiLengthRow.style.display = isYoseRelayStyle(currentInternalStyle) ? "flex" : "none";
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

    const idDepthInput = $id('idDepth');
    if (idDepthInput) {
        const lockIdDepth = isYoseRelayStyle(currentInternalStyle);
        idDepthInput.readOnly = lockIdDepth;
        idDepthInput.classList.toggle("input--readonly-computed", lockIdDepth);
    }

    // 交差穴・一文字DR(面取り): CP 入力
    // M12 Ichimonji (一文字DR平底) はドリル深さベースのため CP 不要
    const showCpArea = currentInternalStyle === 'CrossBig' || currentInternalStyle === 'CrossSmall' ||
                       (currentInternalStyle === 'Ichimonji' && workType !== 'M12' && workType !== 'M12_MH');
    cpArea.style.display = showCpArea ? "block" : "none";

    // 奥バイト面取りの有無は M12 の加工プロファイルで決める（チェック欄は使わない）
    if (okuBiteArea) okuBiteArea.style.display = "none";

    const idDepthLabel = $id("idDepthLabel");
    if (idDepthLabel) {
        const useIPDepthLabel =
            currentInternalStyle === "CrossBig" || currentInternalStyle === "CrossSmall";
        idDepthLabel.setAttribute("data-i18n", useIPDepthLabel ? "idDepthCross" : "idDepth");
    }

    // 交差穴加工径小: 計算済み内径深さ表示行
    const crossSmallFinishRow = $id('crossSmallFinishDepthRow');
    if (crossSmallFinishRow) {
        crossSmallFinishRow.style.display = currentInternalStyle === 'CrossSmall' ? 'block' : 'none';
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
        workType: $id('workType').value,
        tubeSpec: $id('tubeSpecSelect') ? $id('tubeSpecSelect').value : "",
        yoseTotalLength: $id('yoseTotalLength') ? $id('yoseTotalLength').value : "",
        yosePartnerDepth: $id('yosePartnerDepth') ? $id('yosePartnerDepth').value : "",
        yoseD: $id('yoseD') ? $id('yoseD').value : "",
        yoseAngle: $id('yoseAngle') ? $id('yoseAngle').value : ""
    };
    const metrics = calcYoseRelayMetrics(relayInput);
    if (!metrics) {
        opposedEl.value = "";
        yoseLenEl.value = "";
        taiEl.value = "";
        idDepthEl.value = "";
        drillDepthEl.value = "";
        return;
    }
    opposedEl.value = metrics.opposedDistance.toFixed(3);
    yoseLenEl.value = metrics.yoseLength.toFixed(3);
    taiEl.value = metrics.taiYoseLength.toFixed(3);
    idDepthEl.value = metrics.relayIdDepth.toFixed(3);
    if (!isNaN(metrics.relayDrillDepth) && isFinite(metrics.relayDrillDepth)) {
        drillDepthEl.value = metrics.relayDrillDepth.toFixed(3);
    } else {
        drillDepthEl.value = "";
    }
}

function calcDrillDepth() {
    const workType = $id('workType').value;
    const style = currentInternalStyle;
    const idDepthVal = parseFloat($id('idDepth').value);
    const cpVal = parseFloat($id('cpVal').value);
    const drillDepthInput = $id('drillDepth');

    if (isYoseRelayStyle(style)) {
        if (drillDepthInput) {
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        }
        recalcYoseRelayComputedFields();
        return;
    }

    if ((workType === 'M12' || workType === 'M12_MH' || workType === 'G18_40' || workType === 'G18_42' || workType === 'G18_40_MH' || workType === 'G18_42_MH') && style === 'CrossSmall') {
        if (drillDepthInput) {
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
            if (!isNaN(cpVal)) {
                drillDepthInput.value = (cpVal + 1.2 + 1).toFixed(3);
            } else {
                drillDepthInput.value = "";
            }
        }
        return;
    }

    let drillDia = 0;
    if (workType === 'Tube') {
        const spec = $id('tubeSpecSelect').value;
        if (tubeData[spec] && tubeData[spec].drill) {
            drillDia = parseFloat(tubeData[spec].drill.replace(/[^0-9.]/g, ''));
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
    }
    else if (style === 'CrossBig' || style === 'CrossSmall') {
        // 交差穴: CPを基準に計算
        calcZ = calcSpecialDrillZ(style, drillDia, cpVal);
    }
    // ▲▲▲ ここまで変更 ▲▲▲

    if (calcZ) {
        drillDepthInput.value = calcZ;
    }
}


function calcAutoCP() {
    const cpEl = $id('cpVal');
    if (!cpEl) return;
    const style = currentInternalStyle;
    const isCross = style === 'CrossBig' || style === 'CrossSmall';
    const isIchimonji = style === 'Ichimonji';
    if (!isCross && !isIchimonji) {
        cpEl.value = "";
        return;
    }
    // 原点〜相手中心距離（交差穴時は図面上の IP に相当）— idDepth で入力（二重入力なし）
    const dist = parseFloat($id('idDepth').value);
    const pDia = parseFloat($id('valPartnerD').value);
    if (!isNaN(dist) && !isNaN(pDia)) {
        const cp = dist - (pDia / 2.0);
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
    const el = $id('crossSmallFinishDepthVal');
    if (!el) return;
    if (currentInternalStyle !== 'CrossSmall') {
        el.value = '';
        return;
    }
    const inp = {
        cpVal:      $id('cpVal')        ? $id('cpVal').value        : '',
        valPartnerD: $id('valPartnerD') ? $id('valPartnerD').value  : '',
        workType:   $id('workType')     ? $id('workType').value      : '',
        tubeSpec:   $id('tubeSpecSelect') ? $id('tubeSpecSelect').value : '',
    };
    const depth = calcCrossSmallFinishDepth(inp);
    el.value = (isNaN(depth) || !isFinite(depth)) ? '' : depth.toFixed(3);
}

/** 右上「?」: デバッグをドロップダウンに隠す */
function setupHelpEasterDropdown() {
    const btn = $id('helpEasterBtn');
    const panel = $id('helpEasterDropdown');
    if (!btn || !panel) return;

    function close() {
        if (panel.hidden) return;
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    }
    function open() {
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (panel.hidden) open();
        else close();
    });
    panel.addEventListener('click', function (e) {
        if (e.target.closest('button.help-easter-menu-item')) close();
    });
    document.addEventListener('click', function (e) {
        if (!panel.hidden && !btn.contains(e.target) && !panel.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupHalfWidthInputGuards();
    bindHighlightFilterControls();
    syncMachineSelectOptions();

    // 計算機能を適用するIDリスト
    const calcTargets = ['valStockA', 'valStockB', 'valA', 'valB', 'drillDepth', 'ateLength', 'idDepth', 'maxOD'];

    calcTargets.forEach(id => {
        const el = $id(id);
        if (!el) return;

        el.addEventListener('change', (e) => {
            if (id === 'ateLength') {
                refreshAteLengthSourceState();
            }
            // 数式を計算
            const result = evaluateFormula(e.target.value);
            if (typeof result === 'number') {
                // 小数点第3位までに整形して上書き
                e.target.value = parseFloat(result.toFixed(3));

                if (id === 'drillDepth' || id === 'idDepth') {
                    calcAutoCP();
                    calcDrillDepth();
                }
            }
        });
    });

    // 既存の入力時連動
    const idDepthEl = $id('idDepth');
    if (idDepthEl) {
        idDepthEl.addEventListener('input', function () {
            calcAutoCP();
            calcDrillDepth();
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
        _yoseDEl.addEventListener("input", function () { validateYoseDField(false); });
        _yoseDEl.addEventListener("change", function () { validateYoseDField(true); });
        _yoseDEl.addEventListener("blur", function () { validateYoseDField(true); });
    }
    const _workTypeEl = $id("workType");
    if (_workTypeEl) {
        _workTypeEl.addEventListener("change", function () { validateYoseDField(false); });
    }
    const _tubeSpecEl = $id("tubeSpecSelect");
    if (_tubeSpecEl) {
        _tubeSpecEl.addEventListener("change", function () { validateYoseDField(false); });
    }
    const maxOdEl = $id("maxOD");
    if (maxOdEl && !maxOdEl.dataset.maxOdDrawerBound) {
        maxOdEl.dataset.maxOdDrawerBound = "1";
        maxOdEl.addEventListener("click", openMaxOdCalcDrawer);
        maxOdEl.addEventListener("focus", openMaxOdCalcDrawer);
    }

    setupHelpEasterDropdown();

    updateWorkTypeSettings();
    setCalcMode(currentCalcMode);
    refreshAteLengthSourceState();

    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        const d = $id("maxOdCalcDrawer");
        if (d && !d.hidden) closeMaxOdCalcDrawer();
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


function getAteLengthSelectedOption() {
    // コンボボックス化により廃止。isAteLengthKakuSelection() を使用
    return null;
}

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
    const siblings = parent.getElementsByClassName('qb');
    for (let el of siblings) el.classList.remove('active');
    btn.classList.add('active');
}
function setAuthor(name, btn) { $id('workerName').value = name; setActiveBtn(btn); }
function setAteOnly(val) {
    const sel = $id('ateLength');
    if (sel) sel.value = String(val);
    ateLengthFromKaku = false;
    syncMaxOdAteModeUi();
}
function setAteCalc(val) {
    const sel = $id('ateLength');
    if (sel) sel.value = String(val);
    /** 上段 15角〜43角 クイック: 外径（アテ長さ）式に利用可 */
    refreshAteLengthSourceState();
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

/** 手入力・下段数値等でアテ欄を書き換えたとき: 上段角と連動しなくなった扱い */
function onAteLengthFieldInput() {
  refreshAteLengthSourceState();
}

function clearMaxOdApplyFromAte() {
    maxOdApplySource = "dimensions";
    updateMaxOdFromAteButtonActive();
}

function selectMaxOdApplyFromAte() {
    if (!ateLengthFromKaku) {
        alert(_maxOdApplyAlertMsg("maxOdAteNeedKaku", "※ 自動計算:   (50−アテ長さ)×2×√2 　15角〜43角でアテを選んだ場合のみ選択可能"));
        return;
    }
    maxOdApplySource = "ate";
    // カード active 切り替え
    ['modeNormal','modeEccentric','modeCorner','modeAte'].forEach(function(id) {
        const el = $id(id);
        if (el) el.classList.remove('active');
    });
    const ateCard = $id('modeAte');
    if (ateCard) ateCard.classList.add('active');
    // 寸法入力を隠してアテ長さモードのヒントを表示
    ['normalStockInputs','eccentricInputs','cornerInputs'].forEach(function(id) {
        const el = $id(id);
        if (el) el.style.display = 'none';
    });
    const hint = $id('ateInputHint');
    if (hint) hint.style.display = 'block';
}

function toggleMaxOdCalcDrawer() {
    const d = $id("maxOdCalcDrawer");
    if (!d) return;
    d.hidden = !d.hidden;
    if (!d.hidden) {
        /** 開くとき: アテ式選択中は setCalcMode しない（ dimensions リセットを避ける） */
        if (maxOdApplySource === "ate" && ateLengthFromKaku) {
            selectMaxOdApplyFromAte();
        } else {
            setCalcMode(currentCalcMode);
        }
        syncMaxOdAteModeUi();
    }
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
            alert(_maxOdApplyAlertMsg("maxOdAteNeedKaku", "※ 自動計算:   (50−アテ長さ)×2×√2 　15角〜43角でアテを選んだ場合のみ選択可能"));
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
                alert(_maxOdApplyAlertMsg("maxOdApplyErrNormal", "通常モードでは母材 A・B を半角数値で入力してください。"));
                return;
            }
        } else if (currentCalcMode === "eccentric") {
            s = computeMaxOdFromEccentricFields();
            if (s == null) {
                alert(_maxOdApplyAlertMsg("maxOdApplyErrEccentric", "偏心モードでは距離 A・B を半角数値で入力してください。"));
                return;
            }
        } else if (currentCalcMode === "corner") {
            s = computeMaxOdFromCornerFields();
            if (s == null) {
                alert(_maxOdApplyAlertMsg("maxOdApplyErrCorner", "角ありモードでは母材幅・追加高さを半角数値で入力してください。"));
                return;
            }
        }
        $id("maxOD").value = s;
    }
    clearMaxOdApplyFromAte();
    closeMaxOdCalcDrawer();
}

function materializeMaxOdFromCurrentDimensionFields() {
    let s = null;
    if (currentCalcMode === "normal") s = computeMaxOdFromNormalStockFields();
    else if (currentCalcMode === "eccentric") s = computeMaxOdFromEccentricFields();
    else if (currentCalcMode === "corner") s = computeMaxOdFromCornerFields();
    if (s != null) $id("maxOD").value = s;
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
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "使用機械を選択してください。" };
    case "workType":
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "ワーク種別を選択してください。" };
    case "v1a":
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "図番（PM-の番号）を入力してください。" };
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
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "チューブ規格を選択してください。" };
    case "tubeLengthSelect":
      if (wt !== "Tube") return { ok: true };
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "チューブ長さ(L)を選択してください。" };
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
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "ヨセの方法を選択してください。" };
    case "yoseAngle":
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "テーパ角度を選択してください。" };
    case "yoseD": {
      if (!w(el.value) || !numOk(el.value)) {
        return { ok: false, msg: "ヨセの相手径を半角数値で入力してください。" };
      }
      const yoseDCheck = validateYoseDDiameter({
        yoseD: el.value,
        workType: wt,
        tubeSpec: ($id("tubeSpecSelect") || {}).value || "",
        internalStyle: currentInternalStyle
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
      return w(el.value)
        ? { ok: true }
        : { ok: false, msg: "ドリルモードを選択してください。" };
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
  // ── ユーザー指定順 ──────────────────────
  "machineSelect",    // 使用機械
  "ateLength",        // アテ長さ
  "workType",         // テンプレート
  "v1a",              // ファイル情報: 図番
  "v1b",              //             枝番
  "v1c",              //             改訂
  "v2",               //             工程No
  "workerName",       // 作成者
  "maxOD",            // 外径最大径
  "selM99P100",       // M99P100モード
  "internalStyleDrawerToggle", // 内径加工スタイル（ドロワー切替）
  "idDepth",          // 内径深さ
  // ── 任意: 加工寸法（表示されているものだけナビ対象） ──
  "valStockA",        // 通常: 外径A
  "valStockB",        //       外径B
  "valA",             // 偏心: A寸法
  "valB",             //       B寸法
  "valCornW",         // コーナー: 幅
  "valCornH",         //           高さ
  "valPartnerD",      // 相手径
  "yoseMethod",       // ヨセ: 方法
  "yoseAngle",        //       角度
  "yoseD",            //       加工径
  "yoseTotalLength",  //       全長
  "yosePartnerDepth", //       相手径深さ
  "drillMode",        // ドリルモード
  "drillDepth",       // ドリル深さ
  "tubeSpecSelect",   // チューブ規格
  "tubeLengthSelect", //         長さ
  "m12DrillType",     // M12: ドリル種別
  "m12CrossMethod",   //      交差穴方法
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
  const workTypeEl = $id('workType');
  const workTypeVal = workTypeEl ? workTypeEl.value : 'G78';
  
  const chkOkuBite = $id('chkOkuBite');
  const m12Resolved = (workTypeVal === 'M12' || workTypeVal === 'M12_MH') ? resolveM12FinishAndProfile() : { finishType: 'hss', profile: 'drill_ichi_hira' };
  const isOkuBiteEnabled =
    (workTypeVal === 'M12' || workTypeVal === 'M12_MH')
      ? m12ProfileImpliesOku(m12Resolved.profile)
      : chkOkuBite
        ? chkOkuBite.checked
        : false;

  const m99SelEl = $id("selM99P100");
  const m99Mode = m99SelEl ? m99SelEl.value : "";

  const inputData = {
    drawNumA: $id('v1a').value,   
    drawNumB: $id('v1b').value,   
    drawRev:  $id('v1c').value,   
    processNum: $id('v2').value,  
    workerName: $id('workerName').value,
    ateLength: $id('ateLength').value,
    maxOD: $id('maxOD').value,
    
    drillDepth: $id('drillDepth').value,
    idDepth: $id('idDepth').value,
    drillMode: $id('drillMode').value,
    workType: workTypeVal,
    m12FinishType: m12Resolved.finishType,
    m12Profile: m12Resolved.profile,
    m12BaitoDrillMode: getM12BaitoDrillModeForInput(),
    m99Mode: m99Mode,
    m99p100: m99Mode === "on",

    internalStyle: currentInternalStyle,
    cpVal: $id('cpVal').value,
    valPartnerD: $id('valPartnerD').value,
    okuBiteEnabled: isOkuBiteEnabled,
    
    // ヨセ関連
    yoseMethod: $id('yoseMethod').value,
    yoseAngle: $id('yoseAngle').value,
    yoseD: $id('yoseD').value,
    yoseTotalLength: $id('yoseTotalLength') ? $id('yoseTotalLength').value : "",
    yosePartnerDepth: $id('yosePartnerDepth') ? $id('yosePartnerDepth').value : "",

    tubeSpec: $id('tubeSpecSelect').value,
    tubeLength: $id('tubeLengthSelect').value,

    calcMode: currentCalcMode,
    valCornW: $id('valCornW').value,
    valCornH: $id('valCornH').value,

    mhOdTool: ($id('mhOdTool') ? $id('mhOdTool').value : "外径荒")
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

  const machineName = $id('machineSelect').value;
  const genResult = generateGCode(inputData, machineName);
  const gcodeHtml = genResult && typeof genResult === "object" && genResult.displayHtml !== undefined
    ? genResult.displayHtml
    : String(genResult);
  _ncLastPlainGCode = genResult && typeof genResult === "object" && genResult.plainText !== undefined
    ? genResult.plainText
    : null;

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
      const wrappedHtml = gcodeHtml.split('\n')
          .map((l, i) => `<span class="gc-line" data-ln="${i + 1}">${l}</span>`)
          .join('\n');
      $id('resultArea').innerHTML = wrappedHtml;
  } else {
      $id('resultArea').innerHTML = gcodeHtml;
  }
  applyHighlightFilterToResultArea();

  // デバッグパネルが開いていれば自動更新
  const _dbgPanel = $id("debugPanel");
  if (_dbgPanel && !_dbgPanel.hidden) renderDebugPanel();

  const saveBtn = $id("saveBtn");
  if (isGenError) {
    saveBtn.style.display = "none";
    saveBtn.disabled = true;
  } else {
    saveBtn.style.display = "block";
    saveBtn.disabled = false;
  }

  if (typeof drawPreview === "function") drawPreview(true);
}

// ========== input export / import ==========

/** 保存対象フィールド: id → "val"(input/select値) or "chk"(checkbox) or "mode"(特殊) */
const NC_EXPORT_FIELDS = [
    { id: "machineSelect", t: "val" },
    { id: "workType",      t: "val" },
    { id: "v1a",           t: "val" },
    { id: "v1b",           t: "val" },
    { id: "v1c",           t: "val" },
    { id: "v2",            t: "val" },
    { id: "workerName",    t: "val" },
    { id: "ateLength",     t: "val" },
    { id: "maxOD",         t: "val" },
    { id: "selM99P100",    t: "val" },
    { id: "drillMode",     t: "val" },
    { id: "drillDepth",    t: "val" },
    { id: "idDepth",       t: "val" },
    { id: "valStockA",     t: "val" },
    { id: "valStockB",     t: "val" },
    { id: "valA",          t: "val" },
    { id: "valB",          t: "val" },
    { id: "valCornW",      t: "val" },
    { id: "valCornH",      t: "val" },
    { id: "valPartnerD",   t: "val" },
    { id: "yoseMethod",    t: "val" },
    { id: "yoseAngle",     t: "val" },
    { id: "yoseD",         t: "val" },
    { id: "yoseTotalLength", t: "val" },
    { id: "yosePartnerDepth", t: "val" },
    { id: "tubeSpecSelect",   t: "val" },
    { id: "tubeLengthSelect", t: "val" },
    { id: "m12DrillType",     t: "val" },
    { id: "m12CrossMethod",   t: "val" },
    { id: "chkOkuBite",       t: "chk" },
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
    let v1c = $id("v1c").value; if (v1c === "NONE") v1c = "";
    const dt = new Date();
    const dateStr = `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,"0")}${String(dt.getDate()).padStart(2,"0")}`;
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
        t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;" +
            "background:#1a2a1a;border:1px solid #4caf50;color:#a5d6a7;padding:10px 20px;" +
            "border-radius:6px;font-family:monospace;font-size:13px;white-space:nowrap;" +
            "box-shadow:0 4px 16px rgba(0,0,0,0.6);transition:opacity 0.4s;";
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = "0"; }, 3500);
}

function downloadFile() {
  const content = _ncLastPlainGCode;
  if (content == null || content === "") {
    const msg = (typeof window.NC_I18N !== "undefined" && window.NC_I18N.t)
      ? window.NC_I18N.t("saveError")
      : "保存できるプレーンテキストがありません。先に Gコード生成を成功させてください。";
    alert(msg);
    return;
  }
  let v1a = $id('v1a').value;
  if (!v1a) v1a = "noname";
  const v1b = $id('v1b').value;
  let v1c = $id('v1c').value;
  if(v1c === "NONE") v1c = "";
  const v2 = $id('v2').value;
  const wtEl = $id("workType");
  const workType = wtEl && wtEl.value ? wtEl.value : "UNKNOWN";
  // =Q は本アプリで生成した保存プログラムであることを示す固定サフィックス。末尾はワーク種別(#workType の value)
  const fileName = `PM-${v1a}-${v1b}${v1c}=No,${v2}=Q=${workType}.txt`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], {type: "text/plain"}));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function setCalcMode(mode) {
    currentCalcMode = mode;
    maxOdApplySource = "dimensions";
    // カード active 切り替え（mode* + modeAte）
    ['modeNormal','modeEccentric','modeCorner','modeAte'].forEach(function(id) {
        const el = $id(id);
        if (el) el.classList.remove('active');
    });
    const modeCardMap = { normal: 'modeNormal', eccentric: 'modeEccentric', corner: 'modeCorner' };
    const targetCard = $id(modeCardMap[mode]);
    if (targetCard) targetCard.classList.add('active');
    // 寸法入力パネル表示切り替え
    document.querySelectorAll('.calc-inputs').forEach(function(el) {
        if (el.id !== 'cpCalcArea' && el.id !== 'okuBiteArea') el.style.display = 'none';
    });
    if (mode === 'normal' && $id('normalStockInputs')) {
        $id('normalStockInputs').style.display = 'flex';
    } else if (mode === 'eccentric' && $id('eccentricInputs')) {
        $id('eccentricInputs').style.display = 'flex';
    } else if (mode === 'corner' && $id('cornerInputs')) {
        $id('cornerInputs').style.display = 'flex';
    }
    const hint = $id('ateInputHint');
    if (hint) hint.style.display = 'none';
}

