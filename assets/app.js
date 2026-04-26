/* NC Program Generator - app.js
 *
 * セクション構成（上から順に依存関係）:
 *   utils          … 汎用ユーティリティ（文字列・数値フォーマット）
 *   Gコードブロック生成 … ドリル・一文字DR・奥バイト・平底など各Gコードブロック生成
 *   生成ロジック    … 定数マップ → 解決ヘルパー → 算出ヘルパー → バリデーション
 *                    → テンプレート解決 → generateGCode（メイン）
 *   preview        … ツールパス描画エンジン
 *   ui             … 画面操作・イベント処理
 *
 * Do not reorder sections; dependencies follow this order. */
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
        s += `G1Z-${d(depth)}F0.15\n`;
        s += `G4U0.5\n`;
        s += `Z1.F2.5`;
    } else {
        if (depth <= 30) {
             s += `G74R0.5\n`;
             s += `G74Z-${d(depth)}Q3000F0.25`;
        } else {
            s += `G74R0.5\n`;
            s += `G74Z-30.Q3000F0.25\n`;
            let currentZ = 30;
            while (currentZ < depth) {
                let nextZ = currentZ + 10;
                if (nextZ >= depth) {
                    s += `\nG1Z-${d1(currentZ - 0.1)}F2.5\n`;
                    s += `Z-${d(depth)}F0.25\n`;
                    s += `Z30.F2.5\n\n`;
                    s += `G1Z-${d(depth - 0.1)}F2.5\n`;
                    s += `G4U.5\n`;
                    s += `G1Z30.F2.5`;
                    break;
                }
                s += `\nG1Z-${d1(currentZ - 0.1)}F2.5\n`;
                s += `Z-${d(nextZ)}F0.25\n`;
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
            s += `G4U.5\n`;
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
    const mOn  = machineConfig["集塵機オン"] || "";
    const mOff = machineConfig["集塵機オフ"] || "";
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
    const mOn  = machineConfig["集塵機オン"] || "";
    const mOff = machineConfig["集塵機オフ"] || "";
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
    const m51 = machineConfig["集塵機オン"] || "";
    const m59 = machineConfig["集塵機オフ"] || "";
    
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
    const m51 = machineConfig["集塵機オン"] || "";
    const m59 = machineConfig["集塵機オフ"] || "";

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
        const mOn  = machineConfig["集塵機オン"] || "";
        const mOff = machineConfig["集塵機オフ"] || "";
        
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
const WORK_ID_MAP = { "M40": 22.0, "M22": 10.0, "M18": 8.0, "M15": 6.0, "M12": 4.00, "G78": 16.0, "G18_40": 4.0, "G18_42": 4.15, "G18_62": 6.2 };

/** 平底で使う内径ダイヤの公称径（mm）。テンプレの {{内径ダイヤΦ*}} と対応 */
const FLAT_BOTTOM_TOOL_DIA_MM = {
    M40: 16,
    M22: 8,
    M18: 8,
    M15: 6,
    G78: 16
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
    "G18_62": 5.0,
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
    const drillDia = input.workType === "M12" ? 3.3 : resolveDrillDia(input);
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
                    (style === 'Ichimonji' && input.workType !== 'M12');
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

    if (errors.length > 0) {
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
        if (input.workType === "M12") {
            // M12: 一文字DR平底 → 半月/HSS ドリルで平底仕上げ
            rearChamferEarly = getIchimonjiHirazokoBlock(baseIDDepth, machineConfig);
        } else {
            rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
        }
    } else if ((input.workType === "G18_40" || input.workType === "G18_42") && style === "CrossSmall") {
        const partnerD = parseFloat(input.valPartnerD);
        if (!isNaN(partnerD)) {
            rearChamferEarly = getOkuBiteBlockG18(input.cpVal, machineConfig);
        }
    } else if (
        input.workType === "M12" &&
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
                    const m51 = machineConfig["集塵機オン"] ? wrapH(machineConfig["集塵機オン"]) : "";
                    const m59 = machineConfig["集塵機オフ"] ? wrapH(machineConfig["集塵機オフ"]) : "";
                    
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
        input.workType === "M12" && (input.m12FinishType || "hss") === "baito"
            ? okuBiteMentoriLateBlock
            : rearChamferEarly;

    // --- 5. 置換マップ作成 ---
    const replaceMap = {
        "入力_図番": wrapHInput(fullDrawStr),
        "入力_工程No": wrapHInput(input.processNum),
        "入力_作成者": wrapHInput(input.workerName),
        "入力_アテ長さ": wrapHInput(ncFormat(input.ateLength)),
        "入力_日付": wrapHInput(today),
        "計算_最大径1": wrapHCalc(ncFormat(calcMax1)),
        "計算_最大径": wrapHCalc(ncFormat(calcMainMax)),
        // 外径仕上ブロック（M12/M15/M18/M22/M40/G78/Tube 共通）: 通常・偏心は X…(--X--) の1行のみ（F.3 行は省略）。角ありは従来どおり2段。
        "計算_最大径角": input.calcMode === "corner"
            ? ("X" + wrapHCalc(ncFormat(calcCorner)))
            : ("X" + wrapHCalc(ncFormat(calcMax2)) + "(--X--)"),
        "計算_最大径2": input.calcMode === "corner"
            ? ("X" + wrapHCalc(ncFormat(calcMax2)) + "F.3\n")
            : "",
        "M99P100": wrapHInput(valM99),
        "最大径50": "",
        "入力_内径深さ": wrapHCalc(ncFormat(finalFinishDepth)),
        
        "DRILL_BLOCK": getDrillBlock(finalDrillDepth, input.drillMode),
        "DRILLSHIAGE_BLOCK": (input.workType === "G18_40" || input.workType === "G18_42")
            ? getDrillBlock(finalDrillDepth, "G1")
            : getDrillShiageBlock(finalDrillDepth),
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
             
            replaceMap["OD+11"] = wrapHCalc(ncFormat((OD + 11.0).toFixed(3)));
            replaceMap["L"] = wrapHCalc(ncFormat((-L).toFixed(3)));
            replaceMap["OD+1"] = wrapHCalc(ncFormat((OD + 1.0).toFixed(3)));
            replaceMap["OD+0.1"] = wrapHCalc(ncFormat((OD + 0.1).toFixed(3)));
            replaceMap["Drill-1"] = wrapHCalc(ncFormat((drillVal - 1.0).toFixed(3)));
            replaceMap["ID+0.6"] = wrapHCalc(ncFormat((ID + 0.6).toFixed(3)));
            replaceMap["OD-0.6"] = wrapHCalc(ncFormat((OD - 0.6).toFixed(3)));
            replaceMap["L-R"] = wrapHCalc(ncFormat((- (L - R)).toFixed(3)));
            replaceMap["OD+2R"] = wrapHCalc(ncFormat((OD + R + R).toFixed(3)));
            replaceMap["OD+2R+0.1"] = wrapHCalc(ncFormat((OD + R + R + 0.1).toFixed(3)));
            replaceMap["L-0.5"] = wrapHCalc(ncFormat((-L + 0.5).toFixed(3)));
        }
    } else if (input.workType === "M40") {
        if (typeof template_M40 !== 'undefined') finalCode = template_M40;
        if (input.m99p100) {
            // X50.U8.処理: プレースホルダー代入前にテンプレート内の固定値を置換
            finalCode = finalCode.replace("G71U4.5R.5", "G71U8.0R.5");
            finalCode = finalCode.replace("N22X{{計算_最大径1}}F.35", "N22X56.F.35");
            // 残った {{計算_最大径1}} (line 20) を空にし、{{最大径50}} で "50." を出力
            replaceMap["計算_最大径1"] = "";
            replaceMap["最大径50"] = wrapHCalc("50.");
        }
    }
    else if (input.workType === "M22") { if (typeof template_M22 !== 'undefined') finalCode = template_M22; }
    else if (input.workType === "M18") { if (typeof template_M18 !== 'undefined') finalCode = template_M18; }
    else if (input.workType === "M15") { if (typeof template_M15 !== 'undefined') finalCode = template_M15; }
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
    else { if (typeof template_G78 !== 'undefined') finalCode = template_G78; }

    if (!finalCode) {
        return { displayHtml: "エラー: テンプレートが見つかりません", plainText: null };
    }

    // カバレッジ用: 置換前のテンプレートキーを抽出
    const _templateKeysRaw = [];
    { const _m = finalCode.matchAll(/\{\{([^}]+)\}\}/g); for (const x of _m) _templateKeysRaw.push(x[1]); }
    const _templateKeySet = new Set(_templateKeysRaw);

    Object.keys(replaceMap).forEach(key => {
        finalCode = finalCode.split("{{" + key + "}}").join(replaceMap[key]);
    });

    // 置換後に残った未解決キーを抽出
    const _unresolvedKeys = [];
    { const _m = finalCode.matchAll(/\{\{([^}]+)\}\}/g); for (const x of _m) _unresolvedKeys.push(x[1]); }

    // デバッグ用: 最後の入力・解決結果を保持
    _ncDebugLastInput = input;
    _ncDebugLastReplaceMap = replaceMap;
    _ncDebugLastTemplateKeys = _templateKeySet;
    _ncDebugLastUnresolved = new Set(_unresolvedKeys);

    return {
        displayHtml: finalCode,
        plainText: gcodeDisplayHtmlToPlainText(finalCode)
    };
}

// ========== debug panel ==========
var _ncDebugLastInput = null;
var _ncDebugLastReplaceMap = null;
var _ncDebugLastTemplateKeys = null;
var _ncDebugLastUnresolved = null;

function openDebugPanel() {
    const panel = document.getElementById("debugPanel");
    if (!panel) return;
    renderDebugPanel();
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeDebugPanel() {
    const panel = document.getElementById("debugPanel");
    if (panel) panel.hidden = true;
}

function renderDebugPanel() {
    renderDebugInputPane();
    renderDebugReplacePane();
    renderDebugCoveragePane();
}

function renderDebugInputPane() {
    const el = document.getElementById("debugInputPane");
    if (!el) return;
    if (!_ncDebugLastInput) { el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>'; return; }
    const rows = Object.entries(_ncDebugLastInput).map(([k, v]) => {
        const val = v === null || v === undefined ? "" : String(v);
        const empty = val === "" || val === "false";
        const cls = empty ? "dbg-row dbg-row--empty" : "dbg-row";
        return `<div class="${cls}"><span class="dbg-key">${escapeHtml(k)}</span><span class="dbg-sep">=</span><span class="dbg-val">${escapeHtml(val)}</span></div>`;
    });
    el.innerHTML = rows.join("");
}

function renderDebugCoveragePane() {
    const el = document.getElementById("debugCoveragePane");
    if (!el) return;
    if (!_ncDebugLastTemplateKeys) {
        el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>';
        return;
    }

    const tKeys = _ncDebugLastTemplateKeys;
    const rKeys = new Set(Object.keys(_ncDebugLastReplaceMap || {}));
    const unresolved = _ncDebugLastUnresolved || new Set();

    // ❌ テンプレートにあるが replaceMap にない（未解決）
    const missing = [...tKeys].filter(k => !rKeys.has(k));
    // ✅ テンプレートにあり replaceMap にも存在（解決済み）
    const resolved = [...tKeys].filter(k => rKeys.has(k));
    // ⚠️ replaceMap にあるがテンプレートで未使用
    const unused = [...rKeys].filter(k => !tKeys.has(k));

    const sections = [];

    if (missing.length) {
        sections.push(`<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--miss">❌ 未解決 (テンプレートにあるが replaceMap なし) ${missing.length}件</div>`
            + missing.map(k => `<div class="dbg-row dbg-row--missing"><span class="dbg-key">{{${escapeHtml(k)}}}</span></div>`).join("")
            + `</div>`);
    }

    if (unresolved.size) {
        sections.push(`<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--miss">⚠️ 出力に残存 (置換後も {{}} が残った) ${unresolved.size}件</div>`
            + [...unresolved].map(k => `<div class="dbg-row dbg-row--missing"><span class="dbg-key">{{${escapeHtml(k)}}}</span></div>`).join("")
            + `</div>`);
    }

    sections.push(`<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--ok">✅ 解決済み ${resolved.length}件</div>`
        + resolved.map(k => `<div class="dbg-row"><span class="dbg-key" style="color:#6a9f6a;">{{${escapeHtml(k)}}}</span></div>`).join("")
        + `</div>`);

    sections.push(`<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--unused">💤 未使用 (replaceMap にあるがテンプレート外) ${unused.length}件</div>`
        + unused.map(k => `<div class="dbg-row dbg-row--empty"><span class="dbg-key">{{${escapeHtml(k)}}}</span></div>`).join("")
        + `</div>`);

    el.innerHTML = sections.join("");
}

function renderDebugReplacePane() {
    const el = document.getElementById("debugReplacePane");
    if (!el) return;
    if (!_ncDebugLastReplaceMap) { el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>'; return; }
    const rows = Object.entries(_ncDebugLastReplaceMap).map(([k, v]) => {
        const plain = gcodeDisplayHtmlToPlainText(String(v == null ? "" : v));
        const isEmpty = plain.trim() === "";
        // wrapH の kind を HTML から判定
        let kind = "machine";
        const m = String(v).match(/data-hl-attr="(calc|input|machine)"/);
        if (m) kind = m[1];
        const cls = isEmpty
            ? "dbg-row dbg-row--missing"
            : `dbg-row dbg-row--${kind}`;
        const keyHtml = `<span class="dbg-key">{{${escapeHtml(k)}}}</span>`;
        const valHtml = isEmpty
            ? `<span class="dbg-val dbg-val--empty">(空)</span>`
            : `<span class="dbg-val">${escapeHtml(plain)}</span>`;
        return `<div class="${cls}">${keyHtml}<span class="dbg-sep">→</span>${valHtml}</div>`;
    });
    el.innerHTML = rows.join("");
}


// ========== preview ==========
/**
 * preview.js
 * ツールパス描画エンジン (最適化・スマホ対応・全画面ハイブリッド版)
 * - 画面追従機能 (Sticky)
 * - 全画面拡大 (Fullscreen API + 疑似CSS全画面)
 * - スマホ操作 (ピンチズーム/スワイプ) 対応
 * - 自動フィット削除済み (手動操作優先)
 * - [改修] 軌跡（線分）へのマウス当たり判定
 * - [改修] R描写に関する注意書き追加
 */

// --- グローバル変数 ---
let g_paths = [];
let g_minX = 0, g_maxX = 0, g_minZ = 0, g_maxZ = 0;
let g_scale = 1.0;
/** リセット時のフィットをやや拡大（バウンディング中心は画面中央のまま） */
const PREVIEW_DEFAULT_FIT_ZOOM = 1.28;
let g_offsetX = 0, g_offsetY = 0;
let g_isDragging = false;
let g_lastMouseX = 0, g_lastMouseY = 0;

// フィルタ・表示設定
/** 表示するNブロック＝N番号(コメント)（複数選択可）。空のときは全ブロックを表示 */
let g_nBlockFilterSet = new Set();
let g_showG0 = true; 
let g_showG1 = true; 
let g_stickyPreview = false;
/** 画面追従パネルを見出しからドラッグ移動中（キャンバス上のホバー判定と競合させない） */
let g_stickyPanelDragging = false;
/** 画面追従パネルのリサイズ監視 */
let g_previewStickyResizeObs = null;
let g_stickyBoxPersistTimer = null;
const LS_STICKY_BOX = "ncPreviewStickyBox";

// インスペクタ用
let g_highlightIdx = -1;
let g_mousePos = { x: 0, y: 0 };

// キャンバス要素のキャッシュ
let g_canvas = null;
let g_ctx = null;
let g_debounceTimer = null;

function teardownStickyPreviewResizeObserver() {
    if (g_previewStickyResizeObs) {
        g_previewStickyResizeObs.disconnect();
        g_previewStickyResizeObs = null;
    }
}

/** 画面追従パネルがビューポート内に収まるよう left/top を調整 */
function clampStickyPanelPosition(container) {
    if (!container || !container.classList.contains("preview-sticky")) return;
    const margin = 10;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const r = container.getBoundingClientRect();
    let l = r.left;
    let t = r.top;
    const maxL = Math.max(margin, window.innerWidth - w - margin);
    const maxT = Math.max(margin, window.innerHeight - h - margin);
    l = Math.min(Math.max(margin, l), maxL);
    t = Math.min(Math.max(margin, t), maxT);
    container.style.left = l + "px";
    container.style.top = t + "px";
}

function applyStickyBoxFromStorage(container) {
    if (!container) return;
    try {
        const raw = localStorage.getItem(LS_STICKY_BOX);
        if (!raw) return;
        const box = JSON.parse(raw);
        if (typeof box.w === "number" && typeof box.h === "number" && box.w >= 300 && box.h >= 180) {
            container.style.width = Math.min(box.w, window.innerWidth - 20) + "px";
            container.style.height = Math.min(box.h, window.innerHeight - 20) + "px";
        }
        if (typeof box.left === "number" && typeof box.top === "number") {
            container.style.left = box.left + "px";
            container.style.top = box.top + "px";
        }
        clampStickyPanelPosition(container);
    } catch (e) {}
}

function persistStickyPreviewBox(container) {
    if (!container || !g_stickyPreview) return;
    clearTimeout(g_stickyBoxPersistTimer);
    g_stickyBoxPersistTimer = setTimeout(function () {
        try {
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            if (w < 300 || h < 180) return;
            const r = container.getBoundingClientRect();
            localStorage.setItem(LS_STICKY_BOX, JSON.stringify({
                w: w,
                h: h,
                left: Math.round(r.left),
                top: Math.round(r.top)
            }));
        } catch (err) {}
    }, 400);
}

/** 画面追従時: 見出し・ツールバー分を除いた内側にキャンバス解像度を合わせる */
function syncStickyPreviewCanvasSize() {
    const container = document.getElementById("previewContainer");
    const cv = document.getElementById("simCanvas");
    if (!container || !cv || !g_stickyPreview || !container.classList.contains("preview-sticky")) return false;
    const pad = 20;
    const innerW = Math.max(200, container.clientWidth - pad);
    const heading = container.querySelector(".preview-heading");
    const tb = document.getElementById("toolBtnArea");
    let overhead = 0;
    if (heading) overhead += heading.offsetHeight + 4;
    if (tb) overhead += tb.offsetHeight + 6;
    overhead += pad;
    const innerH = Math.max(100, container.clientHeight - overhead);
    const w = Math.floor(innerW);
    const h = Math.floor(innerH);
    if (w !== cv.width || h !== cv.height) {
        cv.width = w;
        cv.height = h;
        g_canvas = cv;
        return true;
    }
    return false;
}

function setupStickyPreviewResizeObserver() {
    const container = document.getElementById("previewContainer");
    if (!container || !g_stickyPreview) return;
    teardownStickyPreviewResizeObserver();
    g_previewStickyResizeObs = new ResizeObserver(function () {
        const changed = syncStickyPreviewCanvasSize();
        if (changed) drawPreview(true);
        else renderCanvas();
        persistStickyPreviewBox(container);
    });
    g_previewStickyResizeObs.observe(container);
}

/** 見出しドラッグで画面追従パネルを移動（位置は localStorage に保存） */
let g_previewStickyDragInited = false;
function setupPreviewStickyDrag() {
    if (g_previewStickyDragInited) return;
    g_previewStickyDragInited = true;
    document.addEventListener("mousedown", function (e) {
        const heading = e.target.closest(".preview-heading");
        const c = document.getElementById("previewContainer");
        if (!heading || !c || !c.contains(heading) || !c.classList.contains("preview-sticky")) return;
        if (document.fullscreenElement === c || c.classList.contains("pseudo-full")) return;
        e.preventDefault();
        e.stopPropagation();
        const r = c.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const origL = r.left;
        const origT = r.top;
        c.style.left = origL + "px";
        c.style.top = origT + "px";
        g_stickyPanelDragging = true;
        function onMove(ev) {
            const margin = 10;
            const w = c.offsetWidth;
            const h = c.offsetHeight;
            let nl = origL + (ev.clientX - startX);
            let nt = origT + (ev.clientY - startY);
            const maxL = Math.max(margin, window.innerWidth - w - margin);
            const maxT = Math.max(margin, window.innerHeight - h - margin);
            nl = Math.min(Math.max(margin, nl), maxL);
            nt = Math.min(Math.max(margin, nt), maxT);
            c.style.left = nl + "px";
            c.style.top = nt + "px";
        }
        function onUp() {
            g_stickyPanelDragging = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            document.body.style.removeProperty("user-select");
            persistStickyPreviewBox(c);
        }
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    });
}

/** Windows/Chrome では CSS resize が効かないことが多いため、パネル右下グリップで幅・高さを変更（左上基準） */
let g_previewResizeGripInited = false;
function setupPreviewResizeGrip() {
    if (g_previewResizeGripInited) return;
    const grip = document.getElementById("previewResizeGrip");
    if (!grip) return;
    g_previewResizeGripInited = true;
    grip.addEventListener("mousedown", function (e) {
        const c = document.getElementById("previewContainer");
        if (!c || !c.classList.contains("preview-sticky")) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = c.offsetWidth;
        const startH = c.offsetHeight;
        function onMove(ev) {
            const nw = Math.max(300, Math.min(window.innerWidth - 20, startW + ev.clientX - startX));
            const nh = Math.max(200, Math.min(window.innerHeight - 20, startH + ev.clientY - startY));
            c.style.width = nw + "px";
            c.style.height = nh + "px";
            syncStickyPreviewCanvasSize();
            fitToScreen();
            renderCanvas();
        }
        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            document.body.style.removeProperty("user-select");
            persistStickyPreviewBox(c);
        }
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    });
}

/**
 * 画面追従(Sticky)の状態をDOMに反映（左上固定・リサイズ可能・サイズは localStorage に保存）
 */
function updatePreviewSticky() {
    const container = document.getElementById('previewContainer');
    if (!container) return;

    if (document.fullscreenElement || container.classList.contains('pseudo-full')) return;

    if (g_stickyPreview) {
        container.classList.add('preview-sticky');
        container.title = (typeof window.NC_I18N !== "undefined" && window.NC_I18N.t)
            ? window.NC_I18N.t("previewStickyContainerTitle")
            : "パネル右下の斜線をドラッグしてサイズを変えられます（左上位置は固定）。";
        applyStickyBoxFromStorage(container);
        setupPreviewStickyDrag();
        setupPreviewResizeGrip();
        setupStickyPreviewResizeObserver();
        requestAnimationFrame(function () {
            handleResize();
        });
    } else {
        teardownStickyPreviewResizeObserver();
        container.classList.remove('preview-sticky');
        container.title = "";
        container.style.width = "";
        container.style.height = "";
        container.style.left = "";
        container.style.top = "";
        handleResize();
    }
}

/**
 * 全画面切り替え機能
 */
function toggleFullscreen() {
    const container = document.getElementById('previewContainer');
    if (!container) return;

    const isFull = document.fullscreenElement || container.classList.contains('pseudo-full');

    if (!isFull) {
        teardownStickyPreviewResizeObserver();
        container.classList.remove('preview-sticky');
        if (container.requestFullscreen) {
            container.requestFullscreen().catch(() => activatePseudoFull(container));
        } else {
            activatePseudoFull(container);
        }
    } else {
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            deactivatePseudoFull(container);
        }
    }
}

function activatePseudoFull(el) {
    teardownStickyPreviewResizeObserver();
    el.classList.remove('preview-sticky');
    el.classList.add('pseudo-full');
    el.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; background:#1e1e1e; margin:0; padding:0;";
    handleResize();
}

function deactivatePseudoFull(el) {
    el.classList.remove('pseudo-full');
    el.style.cssText = "";
    updatePreviewSticky();
    // updatePreviewSticky 内で handleResize（非追従は同期／追従は rAF）が呼ばれるため二重にしない
}

function handleResize() {
    if (!g_canvas) g_canvas = document.getElementById('simCanvas');
    if (!g_canvas) return;
    const container = document.getElementById('previewContainer');
    const isFull = document.fullscreenElement || (container && container.classList.contains('pseudo-full'));

    if (isFull) {
        g_canvas.width = window.innerWidth;
        // 見出し・ツール列・凡例・下段コントロール分を差し引き、描画域をできるだけ広くする
        const chrome = 120;
        g_canvas.height = Math.max(220, window.innerHeight - chrome);
    } else if (g_stickyPreview && container && container.classList.contains('preview-sticky')) {
        syncStickyPreviewCanvasSize();
    } else {
        g_canvas.width = 800;
        g_canvas.height = 400;
    }
    drawPreview(true);
}

/**
 * メイン描画関数
 */
function drawPreview(forceFit = false) {
    const resultArea = document.getElementById('resultArea');
    if (!resultArea) return;
    // プレビューは機械送りと同じプレーン文字列を優先（ハイライト用 span を経由しない）
    const rawCode =
      typeof _ncLastPlainGCode === "string" && _ncLastPlainGCode.length > 0
        ? _ncLastPlainGCode
        : resultArea.innerText;

    g_canvas = document.getElementById('simCanvas');
    if (!g_canvas) return;
    g_ctx = g_canvas.getContext('2d');
    
    const previewEl = document.getElementById('previewContainer');
    if (previewEl) {
        if (g_stickyPreview && previewEl.classList.contains('preview-sticky')) {
            previewEl.style.display = '';
        } else {
            previewEl.style.display = 'block';
        }
    }

    if (!g_canvas.dataset.init) {
        initEventListeners(g_canvas);
        setupLiveUpdate();
        g_canvas.dataset.init = "true";
    }

    parseGCode(rawCode);

    createPreviewUI();

    const willFit = forceFit || g_scale === 1.0;

    if (willFit) {
        fitToScreen();
    }

    renderCanvas();
    // updatePreviewSticky はチェックボックス変更・全画面終了時のみ。ここで毎回呼ぶと
    // rAF(handleResize)→drawPreview が連鎖し、画面追従オンで常時重くなる。
}

function setupLiveUpdate() {
    const resultArea = document.getElementById('resultArea');
    if (!resultArea) return;
    resultArea.addEventListener('input', () => {
        if (g_debounceTimer) clearTimeout(g_debounceTimer);
        g_debounceTimer = setTimeout(() => drawPreview(false), 300);
    });
}

/**
 * FANUC 系想定: X=直径、Z=長さ、I・K は始点から円弧中心への増分（X は半径方向）。
 * 不正（半径不一致・AI生成の崩れ等）のときは null → 直線フォールバック。
 */
function buildArcPathSegmentsZX(curX, curZ, nextX, nextZ, I, K, isCw, lineIdx, originalText, tool, arcMode, nComment) {
    const r0 = curX / 2, z0 = curZ;
    const r1 = nextX / 2, z1 = nextZ;
    const zc = z0 + K;
    const rc = r0 + I;
    const d0 = Math.hypot(z0 - zc, r0 - rc);
    const d1 = Math.hypot(z1 - zc, r1 - rc);
    if (d0 < 1e-5 || d1 < 1e-5) return null;
    if (Math.abs(d0 - d1) > 0.05 * Math.max(d0, d1, 1)) return null;
    const R = (d0 + d1) / 2;
    let phi0 = Math.atan2(r0 - rc, z0 - zc);
    let phi1 = Math.atan2(r1 - rc, z1 - zc);
    let dPhi = phi1 - phi0;
    while (dPhi > Math.PI) dPhi -= 2 * Math.PI;
    while (dPhi < -Math.PI) dPhi += 2 * Math.PI;
    if (isCw) {
        if (dPhi > 0) dPhi -= 2 * Math.PI;
    } else {
        if (dPhi < 0) dPhi += 2 * Math.PI;
    }
    const N = Math.max(8, Math.min(56, Math.ceil(Math.abs(dPhi) * R / 1.5)));
    const out = [];
    let px = curX, pz = curZ;
    for (let i = 1; i <= N; i++) {
        const phi = phi0 + (dPhi * i) / N;
        const zz = zc + R * Math.cos(phi);
        const rr = rc + R * Math.sin(phi);
        const nx = rr * 2;
        const nz = zz;
        out.push({
            lineIdx: lineIdx,
            originalText: originalText,
            mode: arcMode,
            tool: tool,
            nComment: nComment,
            x1: px, z1: pz, x2: nx, z2: nz
        });
        px = nx; pz = nz;
    }
    return out;
}

function parseGCode(code) {
    g_paths = [];
    const lines = code.split('\n');
    let curX = 100.0, curZ = 50.0;
    let minX = 100, maxX = -100, minZ = 100, maxZ = -100;
    let hasData = false;

    const regexX = /X([-0-9.]+)/, regexZ = /Z([-0-9.]+)/;
    const regexU = /U([-0-9.]+)/, regexW = /W([-0-9.]+)/;
    const regexI = /I([-0-9.]+)/, regexK = /K([-0-9.]+)/;
    const regexT = /T([0-9]{2,4})/, regexG_Num = /G([0-9]+)/g;

    let currentMode = 'G0', currentTool = 'Unknown';
    /** 直近の Nブロック全体の文字列 例 N1(DR14.0)（次の移動に付与。N行のみのときは次行へ継承） */
    let lastNComment = '';

    function expandBounds(ax, az, bx, bz) {
        if (!hasData) {
            minX = Math.min(ax, bx); maxX = Math.max(ax, bx);
            minZ = Math.min(az, bz); maxZ = Math.max(az, bz);
            hasData = true;
        } else {
            minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
            minZ = Math.min(minZ, az, bz); maxZ = Math.max(maxZ, az, bz);
        }
    }

    lines.forEach((line, index) => { 
        const normalizedLine = line.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0)-0xFEE0));
        /** N1(DR14.0) 形式のみ（(M99…) や M1(…) は N番号がないため一致しない） */
        const reNComment = /\bN(\d+)\(([^)]*)\)/g;
        let nm;
        while ((nm = reNComment.exec(normalizedLine)) !== null) {
            lastNComment = "N" + nm[1] + "(" + nm[2].trim() + ")";
        }

        let cleanLine = normalizedLine.split('(')[0].toUpperCase();
        const matchT = cleanLine.match(regexT);
        if (matchT) currentTool = "T" + matchT[1];

        let gNumbers = [], match;
        while ((match = regexG_Num.exec(cleanLine)) !== null) gNumbers.push(parseInt(match[1], 10));
        if (gNumbers.some(n => [4, 10, 28, 50, 65, 70, 71, 72, 73].includes(n))) return;

        if (gNumbers.includes(0)) currentMode = 'G0';
        else if (gNumbers.includes(2)) currentMode = 'G2';
        else if (gNumbers.includes(3)) currentMode = 'G3';
        else if (gNumbers.some(n => [1].includes(n))) currentMode = 'G1';

        let nextX = curX, nextZ = curZ, moved = false;
        const mX = cleanLine.match(regexX), mZ = cleanLine.match(regexZ);
        const mU = cleanLine.match(regexU), mW = cleanLine.match(regexW);

        if (mX) { nextX = parseFloat(mX[1]); moved = true; }
        if (mZ) { nextZ = parseFloat(mZ[1]); moved = true; }
        if (mU) { nextX += parseFloat(mU[1]); moved = true; }
        if (mW) { nextZ += parseFloat(mW[1]); moved = true; }

        if (moved) {
            const skipSegmentForPreview = /\bM(?:51|59|61|408|459)\b/i.test(cleanLine);
            const isG2 = gNumbers.includes(2);
            const isG3 = gNumbers.includes(3);
            const mI = cleanLine.match(regexI), mK = cleanLine.match(regexK);
            let arcPieces = null;
            if (!skipSegmentForPreview && (isG2 || isG3) && mI && mK) {
                const I = parseFloat(mI[1]), K = parseFloat(mK[1]);
                arcPieces = buildArcPathSegmentsZX(
                    curX, curZ, nextX, nextZ, I, K, isG2,
                    index + 1, line.trim(), currentTool, isG2 ? 'G2' : 'G3',
                    lastNComment
                );
            }
            if (!skipSegmentForPreview && arcPieces && arcPieces.length) {
                arcPieces.forEach(function (seg) {
                    g_paths.push(seg);
                    expandBounds(seg.x1, seg.z1, seg.x2, seg.z2);
                });
            } else if (!skipSegmentForPreview) {
                const drawMode = (currentMode === 'G2' || currentMode === 'G3') && (!mI || !mK) ? 'G1' : currentMode;
                g_paths.push({
                    lineIdx: index+1,
                    originalText: line.trim(),
                    mode: drawMode,
                    tool: currentTool,
                    nComment: lastNComment,
                    x1: curX, z1: curZ, x2: nextX, z2: nextZ
                });
                expandBounds(curX, curZ, nextX, nextZ);
            } else {
                expandBounds(curX, curZ, nextX, nextZ);
            }
            curX = nextX; curZ = nextZ;
        }
    });
    // 初期仮想位置(100,50)が min/max に残ると表示が極端に小さくなるため、実軌跡の端点だけで範囲を取り直す
    if (g_paths.length > 0) {
        minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
        g_paths.forEach(p => {
            minX = Math.min(minX, p.x1, p.x2);
            maxX = Math.max(maxX, p.x1, p.x2);
            minZ = Math.min(minZ, p.z1, p.z2);
            maxZ = Math.max(maxZ, p.z1, p.z2);
        });
    }
    g_minX = minX; g_maxX = maxX; g_minZ = minZ; g_maxZ = maxZ;
}

function fitToScreen() {
    if (!g_canvas) return;
    const padding = 40;

    // 表示中のパス（工具フィルター＋G0/G1表示フラグ）のみを対象に範囲を算出
    let minX = g_minX, maxX = g_maxX, minZ = g_minZ, maxZ = g_maxZ;
    if (g_paths.length > 0) {
        let fxMin = Infinity, fxMax = -Infinity, fzMin = Infinity, fzMax = -Infinity;
        let hasVisible = false;
        g_paths.forEach(p => {
            if (!toolPathPassesToolFilter(p)) return;
            if (p.mode === "G0" && !g_showG0) return;
            if (isCuttingMoveMode(p.mode) && !g_showG1) return;
            fxMin = Math.min(fxMin, p.x1, p.x2);
            fxMax = Math.max(fxMax, p.x1, p.x2);
            fzMin = Math.min(fzMin, p.z1, p.z2);
            fzMax = Math.max(fzMax, p.z1, p.z2);
            hasVisible = true;
        });
        if (hasVisible) {
            minX = fxMin; maxX = fxMax; minZ = fzMin; maxZ = fzMax;
        }
    }

    const rangeZ = (maxZ - minZ) || 100, rangeX = (maxX - minX) || 50;
    let s = Math.min((g_canvas.width - padding*2) / rangeZ, (g_canvas.height - padding*2) / (rangeX/2 + 10));
    s *= PREVIEW_DEFAULT_FIT_ZOOM;
    g_scale = s;
    g_offsetX = (g_canvas.width/2) - (((minZ + maxZ)/2) * g_scale);
    g_offsetY = (g_canvas.height/2) + (((minX + maxX)/4) * g_scale);
}

function worldToScreen(wx, wz) {
    return { x: (wz * g_scale) + g_offsetX, y: g_offsetY - (wx / 2 * g_scale) };
}

/**
 * プレビュー用：工具色パレット。色相を 360° 均等分割し黄〜黄橙に偏らないようにする。
 * 彩度・明度は行ごとにずらして近接工具でも区別しやすくする。
 */
function buildToolPreviewPalette(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const hue = Math.round((i * 360) / n) % 360;
        const sat = 64 + ((i * 5) % 9) * 2;
        const lig = 48 + ((i * 7) % 7) * 2;
        out.push([hue, sat, lig]);
    }
    return out;
}
const TOOL_PREVIEW_PALETTE = buildToolPreviewPalette(60);

/** T 番号を数値化（4桁 T0101 は先頭2桁＝工具群）。T が無いときは -1 */
function toolKeyNumberForPalette(toolStr) {
    const m = String(toolStr).match(/T(\d+)/i);
    if (!m) return -1;
    const d = m[1];
    if (d.length >= 4) return parseInt(d.slice(0, 2), 10) || 0;
    return parseInt(d, 10) || 0;
}

/**
 * パレット番号。T01 と T02 のように似た文字列でも色が被りにくいよう、
 * 工具番号をビットミックスしてから割る（同一入力では常に同じ＝ランダムに見えるが再現性あり）
 */
function toolPaletteIndex(tool) {
    const s = String(tool || "Unknown");
    const n = toolKeyNumberForPalette(s);
    let h;
    if (n >= 0) {
        h = Math.imul(n + 0x9e3779b1, 0x85ebca6b);
        h ^= h >>> 16;
        h = Math.imul(h ^ (n * 2246822519), 0xc2b2ae35);
        h ^= h >>> 13;
        h ^= Math.imul(s.length + n, 0x27d4eb2f);
    } else {
        h = 2166136261;
        for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return (h >>> 0) % TOOL_PREVIEW_PALETTE.length;
}

function strokeColorForToolpath(p, idx) {
    if (idx === g_highlightIdx) return "#ffff00";
    const t = TOOL_PREVIEW_PALETTE[toolPaletteIndex(p.tool)];
    const hue = t[0], sat = t[1], lig = t[2];
    if (p.mode === "G0") return "hsla(" + hue + "," + sat + "%," + lig + "%,0.42)";
    return "hsl(" + hue + "," + sat + "%," + lig + "%)";
}

function isCuttingMoveMode(mode) {
    return mode === "G1" || mode === "G2" || mode === "G3";
}

function renderCanvas() {
    if (!g_ctx || !g_canvas) return;
    const ctx = g_ctx;

    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, g_canvas.width, g_canvas.height);

    // グリッド軸: 機械座標 X=0, Z=0 を通る線（worldToScreen(0,0) = {x:g_offsetX, y:g_offsetY}）
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, g_offsetY);
    ctx.lineTo(g_canvas.width, g_offsetY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(g_offsetX, 0);
    ctx.lineTo(g_offsetX, g_canvas.height);
    ctx.stroke();
    ctx.restore();

    g_paths.forEach(function(p, idx) {
        if (!toolPathPassesToolFilter(p)) return;
        if (p.mode === "G0" && !g_showG0) return;
        if (isCuttingMoveMode(p.mode) && !g_showG1) return;
        const p1 = worldToScreen(p.x1, p.z1), p2 = worldToScreen(p.x2, p.z2);
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineCap = "round";
        ctx.strokeStyle = strokeColorForToolpath(p, idx);
        ctx.lineWidth = (idx === g_highlightIdx) ? 5 : (p.mode === "G0" ? 1 : 3);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
    });

    drawOriginMarkXZ0();
    if (g_highlightIdx !== -1) drawTooltip(g_paths[g_highlightIdx]);
}

/** 機械座標 X=0・Z=0 に原点マーク（軸線の交点と同じ位置） */
function drawOriginMarkXZ0() {
    if (!g_ctx || !g_canvas) return;
    // worldToScreen(0, 0) = { x: g_offsetX, y: g_offsetY }
    const o = { x: g_offsetX, y: g_offsetY };
    const pad = 14;
    if (o.x < -pad || o.x > g_canvas.width + pad || o.y < -pad || o.y > g_canvas.height + pad) return;
    const r = 7;
    g_ctx.save();
    g_ctx.strokeStyle = "#ff9800";
    g_ctx.lineWidth = 2;
    g_ctx.beginPath();
    g_ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    g_ctx.stroke();
    g_ctx.beginPath();
    g_ctx.moveTo(o.x - r * 1.35, o.y);
    g_ctx.lineTo(o.x + r * 1.35, o.y);
    g_ctx.moveTo(o.x, o.y - r * 1.35);
    g_ctx.lineTo(o.x, o.y + r * 1.35);
    g_ctx.stroke();
    g_ctx.restore();
}

function drawTooltip(p) {
    const endPos = worldToScreen(p.x2, p.z2);
    g_ctx.fillStyle = '#ffff00'; g_ctx.beginPath(); g_ctx.arc(endPos.x, endPos.y, 4, 0, Math.PI*2); g_ctx.fill();
    const hasN = p.nComment != null && String(p.nComment).length > 0;
    const fmtCoord = v => (Math.round(v * 1000) / 1000).toString();
    const coordStr = `X${fmtCoord(p.x2)}  Z${fmtCoord(p.z2)}`;
    const txt = hasN
        ? [`${p.nComment}`, `${p.mode}  ${coordStr}`, `Line ${p.lineIdx}: ${p.originalText}`]
        : [`${p.mode}  ${coordStr}`, `Line ${p.lineIdx}: ${p.originalText}`];
    g_ctx.font = "12px monospace";
    let bx = g_mousePos.x + 15, by = g_mousePos.y + 15;
    const tw = Math.min(420, Math.max(220, 14 + Math.max.apply(null, txt.map(function (s) { return s.length; })) * 7));
    const th = hasN ? 56 : 40;
    if (bx + tw > g_canvas.width) bx -= tw + 20;
    g_ctx.fillStyle = "rgba(0,0,0,0.9)"; g_ctx.fillRect(bx, by, tw, th);
    g_ctx.fillStyle = "#aaa";
    if (hasN) g_ctx.fillText(txt[0], bx+5, by+15);
    g_ctx.fillStyle = "#fff"; g_ctx.fillText(hasN ? txt[1] : txt[0], bx+5, by + (hasN ? 30 : 15));
    g_ctx.fillStyle = "#ccc"; g_ctx.fillText(hasN ? txt[2] : txt[1], bx+5, by + (hasN ? 45 : 30));
}

function createPreviewUI() {
    const container = document.getElementById('previewContainer');
    if (!container) return;
    let area = document.getElementById('toolBtnArea') || (()=>{
        const a = document.createElement('div');
        a.id = 'toolBtnArea';
        a.className = 'preview-tool-btn-area';
        container.insertBefore(a, g_canvas);
        return a;
    })();
    area.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'preview-toolbar-row';

    const grpNav = document.createElement('div');
    grpNav.className = 'preview-toolbar-group';
    const tUi = (typeof window.NC_I18N !== "undefined" && window.NC_I18N.t) ? window.NC_I18N.t.bind(window.NC_I18N) : function (k) { return k; };
    const btnFit = document.createElement('button');
    btnFit.type = 'button';
    btnFit.innerText = tUi("previewReset");
    btnFit.className = "qb preview-toolbar-btn-main";
    btnFit.onclick = function () {
        drawPreview(true);
    };
    const btnFull = document.createElement('button');
    btnFull.type = 'button';
    btnFull.innerText = tUi("previewFull");
    btnFull.className = "qb preview-toolbar-btn-main";
    btnFull.onclick = toggleFullscreen;
    const btnSticky = document.createElement('button');
    btnSticky.type = 'button';
    btnSticky.innerText = tUi("previewSticky");
    btnSticky.className = "qb preview-toolbar-btn-main" + (g_stickyPreview ? " active" : "");
    btnSticky.onclick = function () {
        g_stickyPreview = !g_stickyPreview;
        updatePreviewSticky();
        createPreviewUI();
    };
    grpNav.appendChild(btnFit);
    grpNav.appendChild(btnFull);
    grpNav.appendChild(btnSticky);

    const grpG = document.createElement('div');
    grpG.className = 'preview-toolbar-group preview-toolbar-group--path-toggles';
    grpG.appendChild(createCheckLabel("G0", g_showG0, e => { g_showG0 = e.target.checked; renderCanvas(); }, "preview-check-label"));
    grpG.appendChild(createCheckLabel(tUi("previewCutting"), g_showG1, e => { g_showG1 = e.target.checked; renderCanvas(); }, "preview-check-label"));

    // N番号(コメント) 付きブロック別フィルター — 全パスから出現順に収集
    const nBlockOrder = [];
    const nBlockSeen = new Set();
    g_paths.forEach(p => {
        if (!p.nComment) return;
        if (!nBlockSeen.has(p.nComment)) {
            nBlockSeen.add(p.nComment);
            nBlockOrder.push(p.nComment);
        }
    });
    if (nBlockOrder.length === 0 && g_nBlockFilterSet.size > 0) {
        g_nBlockFilterSet.clear();
    }

    const grpNBlock = document.createElement('div');
    grpNBlock.className = 'preview-toolbar-group preview-toolbar-group--nblocks';
    if (nBlockOrder.length > 1) {
        grpNBlock.appendChild(createNBlockFilterBtn(tUi("previewAll"), null));
        nBlockOrder.forEach(nb => grpNBlock.appendChild(createNBlockFilterBtn(nb, nb)));
    }

    row.appendChild(grpNav);
    row.appendChild(grpG);
    row.appendChild(grpNBlock);
    area.appendChild(row);

    const orphanBottom = document.getElementById('bottomCtrl');
    if (orphanBottom) orphanBottom.remove();
}

/** 言語切替後にプレビュー工具バーの文言だけ差し替え（動的生成部分） */
function refreshPreviewUiI18n() {
    if (typeof createPreviewUI !== "function") return;
    createPreviewUI();
    if (!g_canvas) g_canvas = document.getElementById("simCanvas");
    if (g_canvas && !g_ctx) g_ctx = g_canvas.getContext("2d");
    if (typeof renderCanvas === "function") renderCanvas();
}

function createCheckLabel(t, c, fn, extraClass) {
    const l = document.createElement('label');
    l.style.cssText = "display:flex; align-items:center; cursor:pointer; color:#fff;";
    if (extraClass) l.className = extraClass;
    const i = document.createElement('input'); i.type = "checkbox"; i.checked = c; i.style.marginRight = "4px"; i.onchange = fn;
    l.append(i, t); return l;
}

function toolPathPassesToolFilter(p) {
    if (g_nBlockFilterSet.size > 0 && !g_nBlockFilterSet.has(p.nComment)) return false;
    return true;
}

function createNBlockFilterBtn(l, id) {
    const b = document.createElement('button');
    b.innerText = l;
    b.className = "qb preview-nblock-filter-btn";
    if (id === null) {
        if (g_nBlockFilterSet.size === 0) b.classList.add('active');
    } else if (g_nBlockFilterSet.has(id)) {
        b.classList.add('active');
    }
    b.onclick = () => {
        if (id === null) {
            g_nBlockFilterSet.clear();
        } else {
            if (g_nBlockFilterSet.has(id)) g_nBlockFilterSet.delete(id);
            else g_nBlockFilterSet.add(id);
        }
        createPreviewUI();
        fitToScreen();
        renderCanvas();
    };
    return b;
}

function onPreviewFullscreenLayoutChange() {
    const c = document.getElementById('previewContainer');
    if (document.fullscreenElement === c) {
        teardownStickyPreviewResizeObserver();
        if (c) c.classList.remove('preview-sticky');
    } else if (c && g_stickyPreview && !c.classList.contains('pseudo-full')) {
        c.classList.add('preview-sticky');
        applyStickyBoxFromStorage(c);
        setupStickyPreviewResizeObserver();
    }
    handleResize();
}

function scrollToGCodeLine(lineIdx) {
    const el = document.querySelector(`#resultArea .gc-line[data-ln="${lineIdx}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('gc-line-blink');
    void el.offsetWidth;
    el.classList.add('gc-line-blink');
    el.addEventListener('animationend', () => el.classList.remove('gc-line-blink'), { once: true });
}

function initEventListeners(canvas) {
    document.addEventListener('fullscreenchange', onPreviewFullscreenLayoutChange);
    window.addEventListener('resize', function () {
        if (!g_stickyPreview) return;
        const c = document.getElementById('previewContainer');
        if (!c || !c.classList.contains('preview-sticky')) return;
        const mw = window.innerWidth - 20;
        const mh = window.innerHeight - 20;
        if (c.offsetWidth > mw) c.style.width = mw + 'px';
        if (c.offsetHeight > mh) c.style.height = mh + 'px';
        clampStickyPanelPosition(c);
        handleResize();
    });
    
    // マウスホイール
    canvas.addEventListener('wheel', e => {
        e.preventDefault(); const d = e.deltaY > 0 ? 0.9 : 1.1; const r = canvas.getBoundingClientRect();
        g_offsetX -= (e.clientX - r.left - g_offsetX) * (d - 1); g_offsetY -= (e.clientY - r.top - g_offsetY) * (d - 1);
        g_scale *= d; renderCanvas();
    }, { passive: false });

    // 左ダブルクリック: ツールパス上→Gコード行ジャンプ、空白→全画面ON/OFF
    canvas.addEventListener('dblclick', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (g_highlightIdx !== -1 && !document.fullscreenElement) {
            scrollToGCodeLine(g_paths[g_highlightIdx].lineIdx);
            return;
        }
        toggleFullscreen();
    });

    // ホイールボタンダブルクリック判定（ブラウザ標準では中ボタン dblclick が安定しないため自前判定）
    let middleLastDownAt = 0;
    const MIDDLE_DBLCLICK_MS = 320;

    // パン開始: ホイールボタンドラッグのみ
    canvas.addEventListener('mousedown', e => {
        if (e.button !== 1) return;
        const now = Date.now();
        if (now - middleLastDownAt <= MIDDLE_DBLCLICK_MS) {
            middleLastDownAt = 0;
            e.preventDefault();
            fitToScreen();
            renderCanvas();
            return;
        }
        middleLastDownAt = now;
        e.preventDefault(); // 中クリックの自動スクロールを抑止
        g_isDragging = true;
        g_lastMouseX = e.clientX;
        g_lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
    });
    
    window.addEventListener('mousemove', e => {
        if (g_stickyPanelDragging) return;
        const r = canvas.getBoundingClientRect(); 
        g_mousePos.x = e.clientX - r.left; 
        g_mousePos.y = e.clientY - r.top;

        if (g_isDragging) { 
            g_offsetX += e.clientX - g_lastMouseX; 
            g_offsetY += e.clientY - g_lastMouseY; 
            g_lastMouseX = e.clientX; 
            g_lastMouseY = e.clientY; 
            renderCanvas(); 
            return; 
        }

        // --- 軌跡（線分）への当たり判定ロジック ---
        let bestDist = 20, bestIdx = -1;
        g_paths.forEach((p, idx) => {
            if (!toolPathPassesToolFilter(p)) return;
            if (p.mode === "G0" && !g_showG0) return;
            if (isCuttingMoveMode(p.mode) && !g_showG1) return;
            
            const s1 = worldToScreen(p.x1, p.z1);
            const s2 = worldToScreen(p.x2, p.z2);
            const m = g_mousePos;
            
            const A = m.x - s1.x; const B = m.y - s1.y;
            const C = s2.x - s1.x; const D = s2.y - s1.y;
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = (lenSq !== 0) ? dot / lenSq : -1;

            let dx, dy;
            if (param < 0) { dx = m.x - s1.x; dy = m.y - s1.y; }
            else if (param > 1) { dx = m.x - s2.x; dy = m.y - s2.y; }
            else { dx = m.x - (s1.x + param * C); dy = m.y - (s1.y + param * D); }
            
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
        });

        if (bestIdx !== g_highlightIdx) {
            g_highlightIdx = bestIdx;
            renderCanvas();
        }
    });

    window.addEventListener('mouseup', e => {
        if (e.button !== 1 && !g_isDragging) return;
        g_isDragging = false;
        canvas.style.cursor = 'crosshair';
    });

    // スマホ タッチ操作
    let startDist = 0;
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            startDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        } else if (e.touches.length === 1) {
            g_isDragging = true;
            g_lastMouseX = e.touches[0].clientX;
            g_lastMouseY = e.touches[0].clientY;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            if (startDist > 0) {
                g_scale *= (d / startDist);
                startDist = d;
                renderCanvas();
            }
        } else if (e.touches.length === 1 && g_isDragging) {
            g_offsetX += e.touches[0].clientX - g_lastMouseX;
            g_offsetY += e.touches[0].clientY - g_lastMouseY;
            g_lastMouseX = e.touches[0].clientX;
            g_lastMouseY = e.touches[0].clientY;
            renderCanvas();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { 
        g_isDragging = false; 
    });
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

const LS_NC_DEV_MODE = "ncDeveloperMode";

function isDeveloperMode() {
    try {
        return localStorage.getItem(LS_NC_DEV_MODE) === "1";
    } catch (e) {
        return false;
    }
}

function applyDeveloperModeUi() {
    const sel = $id("workType");
    const dev = isDeveloperMode();

    const cpEl = $id("cpVal");
    if (cpEl) {
        if (dev) {
            cpEl.readOnly = false;
            cpEl.style.background = "";
            cpEl.style.color = "";
            cpEl.style.fontWeight = "";
            cpEl.style.border = "";
        } else {
            cpEl.readOnly = true;
            cpEl.style.background = "#333";
            cpEl.style.color = "#aaa";
            cpEl.style.fontWeight = "bold";
            cpEl.style.border = "1px solid #555";
        }
    }

    if (!sel) return;
}

function syncDeveloperModeToggleButton() {
    const btn = $id("devModeToggleBtn");
    if (!btn) return;
    const dev = isDeveloperMode();
    const t = (typeof window.NC_I18N !== "undefined" && window.NC_I18N.t)
        ? window.NC_I18N.t.bind(window.NC_I18N)
        : function (k) { return k; };
    btn.setAttribute("aria-pressed", dev ? "true" : "false");
    btn.textContent = dev ? t("devModeBtnOn") : t("devModeBtnOff");
    btn.classList.toggle("help-easter-dev-btn--on", dev);
}

function setDeveloperMode(on) {
    try {
        localStorage.setItem(LS_NC_DEV_MODE, on ? "1" : "0");
    } catch (e) {}
    applyDeveloperModeUi();
    syncDeveloperModeToggleButton();
}

window._ncApplyDeveloperModeUi = applyDeveloperModeUi;
window._ncSyncDeveloperModeToggleButton = syncDeveloperModeToggleButton;

// ========== dev easter eggs ==========

/** ☀️ ライトモード: ダーク/ライト切替 */
let _devLightModeOn = false;
function devLightMode() {
    _devLightModeOn = !_devLightModeOn;
    document.body.classList.toggle("dev-light-mode", _devLightModeOn);
}

/** 🎲 作成者ランダム */
function devRandomAuthor() {
    const btns = document.querySelectorAll('.btns button[onclick^="setAuthor"]');
    if (!btns.length) return;
    const pick = btns[Math.floor(Math.random() * btns.length)];
    pick.click();
    pick.style.transition = "transform 0.15s";
    pick.style.transform = "scale(1.35)";
    setTimeout(() => { pick.style.transform = ""; }, 200);
}

/** 📊 Gコード統計 */
function devShowStats() {
    const plain = _ncLastPlainGCode;
    const lines = plain ? plain.split("\n") : [];
    const nBlocks = lines.filter(l => /^N\d+/.test(l.trim())).length;
    const gCodes  = plain ? (plain.match(/G\d+/g) || []).length : 0;
    const mCodes  = plain ? (plain.match(/M\d+/g) || []).length : 0;
    const chars   = plain ? plain.length : 0;

    const msg = plain
        ? `📊 Gコード統計 ／ 総行数: ${lines.length} 行　Nブロック: ${nBlocks}　Gコード: ${gCodes}　Mコード: ${mCodes}　文字数: ${chars.toLocaleString()}`
        : "📊 先にGコードを生成してください";

    let toast = document.getElementById("devStatsToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "devStatsToast";
        toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;" +
            "background:#1a2a1a;border:1px solid #4caf50;color:#a5d6a7;padding:10px 20px;" +
            "border-radius:6px;font-family:monospace;font-size:13px;white-space:nowrap;" +
            "box-shadow:0 4px 16px rgba(0,0,0,0.6);transition:opacity 0.4s;";
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = "0"; }, 4000);
}

/** 🌈 レインボーモード: ハイライト値が虹色でアニメーション */
let _devRainbowOn = false;
let _devRainbowTimer = null;
function devRainbow() {
    _devRainbowOn = !_devRainbowOn;
    if (_devRainbowOn) {
        let hue = 0;
        _devRainbowTimer = setInterval(() => {
            hue = (hue + 3) % 360;
            document.querySelectorAll(".h-val").forEach((el, i) => {
                el.style.color = `hsl(${(hue + i * 22) % 360}, 100%, 65%)`;
                el.style.textShadow = `0 0 6px hsl(${(hue + i * 22) % 360}, 100%, 65%)`;
            });
        }, 40);
    } else {
        clearInterval(_devRainbowTimer);
        document.querySelectorAll(".h-val").forEach(el => {
            el.style.color = "";
            el.style.textShadow = "";
        });
    }
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

  if (type === 'M12') {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
  } else if (type === 'G18_40' || type === 'G18_42') {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
      if (drillMode) { drillMode.value = "G1"; drillMode.disabled = true; }
  } else {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
      if (drillMode) { drillMode.value = "G74"; drillMode.disabled = false; }
  }

  // ワーク種別変更時: スタイルが変わらなくても加工寸法はワーク種別依存のためクリア
  // （idDepth の有効範囲はワーク内径で決まり、前のワーク値をそのまま使うと誤ったGコードになる）
  ['idDepth', 'drillDepth', 'cpVal', 'crossSmallFinishDepthVal', 'valPartnerD'].forEach(function(fieldId) {
      const el = $id(fieldId);
      if (el) el.value = '';
  });

  restrictStyles(type);
  updateTubeVariantUI();
  updateInternalStyleUI();
  calcDrillDepth();
  updateM40M99UI(type);
}

function updateM40M99UI(type) {
    const resolvedType = type !== undefined
        ? type
        : ($id('workType') ? $id('workType').value : '');
    const label = $id('lblM99P100');
    const sel = $id('selM99P100');
    if (!label || !sel) return;
    if (resolvedType === 'M40') {
        label.textContent = 'X50.U8.処理';
        sel.options[0].textContent = '使用しない';
        sel.options[1].textContent = 'X50.U8.処理';
    } else {
        label.textContent = 'M99P100';
        sel.options[0].textContent = '使用しない';
        sel.options[1].textContent = 'M99P100';
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
  const isM12 = wt === "M12";
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
        'styleYose',
        'styleYoseRelay',
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

    if (workType === 'G18_40' || workType === 'G18_42') {
        ['styleHirazoko', 'styleIchimonji', 'styleNormal', 'styleYose'].forEach(id => {
            const el = $id(id);
            if (el) { el.style.pointerEvents = 'none'; el.style.opacity = '0.3'; }
        });
        if (!['YoseRelay', 'CrossSmall'].includes(currentInternalStyle)) {
            setInternalStyle('');
        }
    } else if (workType === 'G18_62') {
        ['styleIchimonji', 'styleYose', 'styleCrossSmall'].forEach(id => {
            const el = $id(id);
            if (el) { el.style.pointerEvents = 'none'; el.style.opacity = '0.3'; }
        });
        if (!['Hirazoko', 'Normal', 'YoseRelay'].includes(currentInternalStyle)) {
            setInternalStyle('');
        }
    } else if (workType === 'M12') {
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
    Yose: "style4",
    YoseRelay: "style5Relay",
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
        // スタイル切り替え時: 入力フィールドをクリア
        ['idDepth', 'valPartnerD', 'yoseD', 'yoseTotalLength', 'yosePartnerDepth',
         'cpVal', 'crossSmallFinishDepthVal'].forEach(function(id) {
            const el = $id(id);
            if (el) el.value = '';
        });
    }
    currentInternalStyle = style;
    const styles = ['Hirazoko', 'Ichimonji', 'Normal', 'Yose', 'YoseRelay', 'CrossSmall'];
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

    const m12Resolved = workType === "M12" ? resolveM12FinishAndProfile() : { finishType: "", profile: "" };
    if (drillDepthInput && drillDepthLabel) {
        if (workType === "M12" && m12Resolved.finishType === "halfmoon" && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillDepthHangetsu");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else if (workType === "M12" && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else if ((workType === "G18_40" || workType === "G18_42") && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = false;
            drillDepthInput.classList.remove("input--readonly-computed");
        }
    }

    if (workType === "M12" || workType === "G18_40" || workType === "G18_42") {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else if (currentInternalStyle === "Ichimonji") {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else {
        drillMode.disabled = false;
    }

    // M12 / G18_40 / G18_42 ではドリルモードは自動決定するため UI は出さない
    const drillModeRow = $id("drillModeRow");
    if (drillModeRow) {
        const shouldHideDrillMode = workType === "M12" || workType === "G18_40" || workType === "G18_42" || !currentInternalStyle;
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
                       (currentInternalStyle === 'Ichimonji' && workType !== 'M12');
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

    if ((workType === 'M12' || workType === 'G18_40' || workType === 'G18_42') && style === 'CrossSmall') {
        if (drillDepthInput) {
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
            if (!isNaN(cpVal)) {
                drillDepthInput.value = (cpVal + 1.2).toFixed(3);
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

    const devBtn = $id("devModeToggleBtn");
    if (devBtn && !devBtn.dataset.ncBound) {
        devBtn.dataset.ncBound = "1";
        devBtn.addEventListener("click", function () {
            setDeveloperMode(!isDeveloperMode());
        });
    }

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
  const m12Resolved = workTypeVal === 'M12' ? resolveM12FinishAndProfile() : { finishType: 'hss', profile: 'drill_ichi_hira' };
  const isOkuBiteEnabled =
    workTypeVal === 'M12'
      ? m12ProfileImpliesOku(m12Resolved.profile)
      : chkOkuBite
        ? chkOkuBite.checked
        : false;

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
    m99p100: (($id('selM99P100') && $id('selM99P100').value) || 'off') === 'on',

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
    valCornH: $id('valCornH').value
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

