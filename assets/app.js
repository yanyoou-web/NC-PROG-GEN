/* NC Program Generator - app.js
 * Load order: utils -> blocks -> logic -> preview -> ui
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
function wrapH(val) {
    if (val === "" || val === undefined) return "";
    return `<span class="h-val">${escapeHtml(val)}</span>`;
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


// ========== blocks ==========
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
    
    let s = "\n";
    s += `N102(OKU-BAIT--MENTORI)\n`;
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
    s += `G28U0W0M1\n`;
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


// ========== logic ==========
/**
 * logic.js
 * 最終更新: 重複定義修正 + Step3バリデーション実装版
 */

// ワーク種別ごとの内径大径(D)定義マップ
const WORK_ID_MAP = { "M40": 22.0, "M22": 10.0, "M18": 8.0, "M15": 6.0, "G78": 16.0, "Tonbo": 22.0 };

/** 平底で使う内径ダイヤの公称径（mm）。テンプレの {{内径ダイヤΦ*}} と対応 */
const FLAT_BOTTOM_TOOL_DIA_MM = {
    M40: 16,
    M22: 8,
    M18: 8,
    M15: 6,
    G78: 16,
    Tonbo: 16
};

/**
 * 平底ブロック末尾: 図面内径径 ≒ バイト径なら従来の U-.2(…)、異なるなら X[バイト径].F.03
 * （チューブは tubeData.toolDia が無い規格は U-.2 のまま）
 */
function computeFlatBottomExitLine(input) {
    const wt = input.workType;
    const st = input.internalStyle;

    function defaultLine() {
        if (wt === "G78" || wt === "M40" || wt === "Tonbo") return "U-.2(X16)";
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

/**
 * ★追加: 特殊加工のドリル深さ(Z)共通計算ロジック
 * @param {string} style - 加工スタイル ('Yose', 'CrossBig', 'CrossSmall' 等)
 * @param {number} drillDia - ドリル径
 * @param {number} baseDepth - 基準となる深さ (内径深さ or CP)
 * @returns {string|null} - 計算されたZ値 (toFixed(2)済み文字列) または null
 */
function calcSpecialDrillZ(style, drillDia, baseDepth) {
    if (!drillDia || isNaN(baseDepth)) return null;

    let result = null;

    // ヨセ加工の計算式: (0.3 * D) + 内径深さ - 0.4
    if (style === 'Yose') {
        result = (0.3 * drillDia) + baseDepth - 0.4;
    } 
    // 交差穴の計算式: (0.3 * D) + CP
    else if (style === 'CrossBig' || style === 'CrossSmall') {
        result = (0.3 * drillDia) + baseDepth;
    }

    return result ? result.toFixed(2) : null;
}

/**
 * トンボ雛形テンプレを解決する。
 * NCL085（NLX）: G78-PP1 / M40X2-PP の2参考ファイル。
 * NCL044（CL）: ・トンボ加工（雛型）フォルダの6参考ファイル。
 */
/**
 * トンボワークかつ M99P100 チェック ON のときのみ適用: SUB1/SUB2 とも外周荒（G71〜N22）を同一にし、
 * 仕上げ呼び出し行は G70P21Q22 を出さず (--DELETE--) の1行に置き換える。(M99P100) 行は別途削除。
 */
function applyTonboStandardRoughing(code) {
    const block =
        "G71U8.0R.5\n" +
        "G71P21Q22U0W0F.08\n" +
        "N21G0X28.1(C=0.9)\n" +
        "G1Z.1F.08\n" +
        "X30.1Z-.9\n" +
        "Z-17.54\n" +
        "X31.8Z-18.03F.15\n" +
        "Z-21.7\n" +
        "N22X55.81.F.35\n" +
        "(--DELETE--)";
    const re = /G71U[^\r\n]+\r?\nG71P21Q22[^\r\n]+\r?\n[\s\S]*?\r?\n(?:N100\r?\n)?G70P21Q22(?:\(--DELETE--\))?\r?\n/g;
    return code.replace(re, block + "\n");
}

/** トンボ+M99 後処理: 残った単独行の G70P21Q22 を (--DELETE--) に統一 */
function replaceTonboG70DeleteLines(code) {
    return code.replace(/^[ \t]*G70P21Q22(?:\(--DELETE--\))?[ \t]*$/gm, "(--DELETE--)");
}

function resolveTonboTemplate(machineName, tonboVariant) {
    const v = tonboVariant || "";
    if (machineName === "NCL085") {
        if (v === "nlx_m40" && typeof template_Tonbo_NLX_M40 !== "undefined") {
            return template_Tonbo_NLX_M40;
        }
        if (typeof template_Tonbo_NLX_G78 !== "undefined") {
            return template_Tonbo_NLX_G78;
        }
    } else if (machineName === "NCL044") {
        const map = {
            cl_g78: typeof template_Tonbo_CL_G78 !== "undefined" ? template_Tonbo_CL_G78 : null,
            cl_m40: typeof template_Tonbo_CL_M40 !== "undefined" ? template_Tonbo_CL_M40 : null,
            cl_m22: typeof template_Tonbo_CL_M22 !== "undefined" ? template_Tonbo_CL_M22 : null,
            cl_m18: typeof template_Tonbo_CL_M18 !== "undefined" ? template_Tonbo_CL_M18 : null,
            cl_m15: typeof template_Tonbo_CL_M15 !== "undefined" ? template_Tonbo_CL_M15 : null,
            cl_m12: typeof template_Tonbo_CL_M12 !== "undefined" ? template_Tonbo_CL_M12 : null,
        };
        const chosen = map[v] || map.cl_m40;
        if (chosen) {
            return chosen;
        }
    }
    return null;
}

function generateGCode(input, machineName) {
    // 1. ガード節: 機械定義チェック
    const machineConfig = machines[machineName];
    if (!machineConfig) {
        return {
            displayHtml: `<span style="color:red; font-weight:bold;">エラー: 機械定義 "${machineName}" が見つかりません。</span>`,
            plainText: null
        };
    }

    // ▼▼▼ 追加: 数値入力バリデーション (Step 3) ▼▼▼
    const errors = [];

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
        } else if (isNaN(parseFloat(val))) {
            errors.push(`[${item.name}] が数値として読めません。カンマや全角数字は使わず、例「30.1」のように半角で入力してください。`);
        }
    });

    // チューブ以外: 外径最大径は正の値であること（0 や負は無効）
    if (input.workType !== "Tube") {
        const maxOdNum = parseFloat(input.maxOD);
        if (!isNaN(maxOdNum) && maxOdNum <= 0) {
            errors.push('[外径最大径] は 0 より大きい必要があります。アテ長さボタンで再計算するか、図面の値を確認してください。');
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
        }
        if (hStr === "" || hStr === undefined || isNaN(h) || !isFinite(h)) {
            errors.push('[角あり] 「追加 高さ (H)」に半角数値を入力してください。（外径最大径の自動計算に必要です）');
        }
    }

    // 2. 条件付き項目のチェック (加工スタイルごとの必須値)
    const style = input.internalStyle;

    // ヨセ加工の場合の必須チェック
    if (style === 'Yose') {
        if (isNaN(parseFloat(input.yoseD))) errors.push("[ヨセ: 相手径] が入力されていません。");
        if (isNaN(parseFloat(input.yoseAngle))) errors.push("[ヨセ: テーパ角度] が入力されていません。");
        // チューブでなく、かつ内径深さもない場合はエラー
        if (input.workType !== 'Tube' && isNaN(parseFloat(input.idDepth))) {
            errors.push("[内径深さ] が入力されていません（ヨセ加工計算に必要）。");
        }
    }

    // 交差穴・一文字DR(面取り)の場合の必須チェック
    if (style === 'CrossBig' || style === 'CrossSmall' || style === 'Ichimonji') {
        if (isNaN(parseFloat(input.cpVal))) errors.push("[CP (交差穴位置)] が計算されていません。");
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
    const valMaxOD = parseFloat(input.maxOD);
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

    // M99P100：トンボかつチェック ON のときは外周荒統一処理で本文に M99P100 を付けない（(M99P100) 行は後で削除）
    let valM99 = input.m99p100 ? " M99P100" : "";
    if (input.workType === "Tonbo" && input.m99p100) {
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

    // --- 3. 奥バイト / 一文字：テンプレート注入（EARLY=ドリル直後、LATE=バイト仕上げ後は BAITO のみ）---
    let rearChamferEarly = "";
    let rearChamferLate = "";
    if (style === "Ichimonji") {
        rearChamferEarly = getIchimonjiBlock(input.cpVal, machineConfig);
    } else if (style === "Hirazoko" && input.m12Profile === "drill_ichi_hira") {
        rearChamferEarly = getIchimonjiHirazokoBlock(baseIDDepth, machineConfig);
    } else if (
        input.workType === "M12" &&
        (style === "CrossSmall" || style === "CrossBig")
    ) {
        const partnerD = parseFloat(input.valPartnerD);
        if (input.okuBiteEnabled && !isNaN(partnerD) && partnerD >= 6.0) {
            const oku = getOkuBiteBlock(input.cpVal, machineConfig);
            const ft = input.m12FinishType || "hss";
            if (ft === "baito") rearChamferLate = oku;
            else rearChamferEarly = oku;
        }
    }

    const flatBottomExitLine = computeFlatBottomExitLine(input);

    // --- 4. ヨセ加工（テーパ）ロジック ---
    let yosePath = "";   
    let yoseBlock = ""; 

    if (style === 'Yose') {
        // 大径(D)の決定
        let bigD = null;
        if (input.workType === "Tube" && typeof tubeData !== 'undefined' && tubeData[input.tubeSpec]) {
            bigD = tubeData[input.tubeSpec].id;
        } else if (WORK_ID_MAP[input.workType]) {
            bigD = WORK_ID_MAP[input.workType];
        }

        const smallD = parseFloat(input.yoseD); // 小径 d
        const angle = parseFloat(input.yoseAngle);
        const depth = parseFloat(input.idDepth); // 通常ワークの内径深さ

        if (bigD !== null && !isNaN(smallD) && !isNaN(angle)) {
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
                const H_depth = wrapH(ncFormat(effectiveDepth)); 

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

    // 変数A (角ありモード用)
    let valVariableA = ""; 
    if (input.calcMode === 'corner') {
        const w = parseFloat(input.valCornW);
        if (!isNaN(w)) valVariableA = "(W=" + ncFormat(w) + ")"; 
    }

    // --- 5. 置換マップ作成 ---
    const replaceMap = {
        "入力_図番": wrapH(fullDrawStr),
        "入力_工程No": wrapH(input.processNum),
        "入力_作成者": wrapH(input.workerName),
        "入力_アテ長さ": wrapH(ncFormat(input.ateLength)),
        "入力_日付": wrapH(today),        
        "計算_最大径1": wrapH(ncFormat(calcMax1)), 
        "計算_最大径2": wrapH(ncFormat(calcMax2)), 
        "計算_最大径": wrapH(ncFormat(calcMainMax)),
        "計算_角": wrapH(ncFormat(calcCorner)),
        // 外径仕上ブロック（M12/M15/M18/M22/M40/G78/Tube 共通）: 通常・偏心は X…(--X--) の1行のみ（F.3 行は省略）。角ありは従来どおり2段。
        "仕上_ラピッドX": input.calcMode === "corner"
            ? ("X" + wrapH(ncFormat(calcCorner)))
            : ("X" + wrapH(ncFormat(calcMax2)) + "(--X--)"),
        "仕上_中間F3行": input.calcMode === "corner"
            ? ("X" + wrapH(ncFormat(calcMax2)) + "F.3\n")
            : "",
        "変数A": wrapH(valVariableA),
        "M99P100": wrapH(valM99),
        "入力_内径深さ": wrapH(ncFormat(finalFinishDepth)),
        
        "DRILL_BLOCK": getDrillBlock(finalDrillDepth, input.drillMode),
        "DRILLSHIAGE_BLOCK": getDrillShiageBlock(finalDrillDepth),
        "REAR_CHAMFER_EARLY": rearChamferEarly,
        "REAR_CHAMFER_LATE": rearChamferLate,
        "奥バイト面取りブロック": "",

        // M12 BAITO 内径加工定数（現在は固定値。後工程で入力化可能）
        "BAITO_IN_S":         wrapH("500"),
        "BAITO_IN_APX":       wrapH("5."),
        "BAITO_IN_X":         wrapH("4."),
        "BAITO_IN_CHAMFER_Z": wrapH("3."),
        "BAITO_IN_MID_Z":     wrapH("7.5"),

        "平底_内径仕上出口": flatBottomExitLine,
        
        // ヨセ変数
        "ヨセパス": yosePath,
        "ヨセブロック": yoseBlock,
        
        "M8": "", 
        "M9": "",
        "トンボ_G55G56コメント": wrapH("(G55=Z0.0/G56=Z-1.)")
    };

    // 機械変数のマッピング
    for (let key in machineConfig) {
        replaceMap[key] = machineConfig[key] ? wrapH(machineConfig[key]) : "";
    }

    // --- 6. テンプレート選択・生成 ---
    let finalCode = "";
    // トンボテンプレはワーク種別「トンボ」のみ（内径スタイルのトンボだけでは出さない）
    const useTonboTemplate = input.workType === "Tonbo";

    if (useTonboTemplate) {
        const tTombo = resolveTonboTemplate(machineName, input.tonboVariant);
        if (tTombo) {
            finalCode = tTombo;
        } else {
            return {
                displayHtml: `<span style="color:red; font-weight:bold;">トンボ加工は「NCL044（CL-2000-1 系）」または「NCL085（NLX 系）」を選び、雛形テンプレが読み込まれていることを確認してください。NCL012 用は未対応です。</span>`,
                plainText: null
            };
        }
    } else if (input.workType === "Tube") {
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
             replaceMap["チューブ内径バイト"] = wrapH(toolT);


             replaceMap["チューブ_平底_仕上一行"] = wrapH(
                 combineTubeFlatBottomFinishLine(tSpec.toolDia, flatBottomExitLine)
             );
             
             const OD = tSpec.od;
             const ID = tSpec.id;
             const R = tSpec.r;
             const D_Drill_Str = tSpec.drill;
             replaceMap["入力_外径"] = wrapH(ncFormat(OD));
             replaceMap["入力_内径"] = wrapH(ncFormat(ID));
             replaceMap["入力_長さ"] = wrapH(ncFormat(L));
             replaceMap["入力_R"] = wrapH(ncFormat(R));
             replaceMap["ドリル"] = wrapH(D_Drill_Str); 
             
             let drillVal = 0;
             if(D_Drill_Str && D_Drill_Str.startsWith("DR")) drillVal = parseFloat(D_Drill_Str.replace("DR", ""));
             
             replaceMap["OD+11"] = wrapH(ncFormat((OD + 11.0).toFixed(3))); 
             replaceMap["L"] = wrapH(ncFormat((-L).toFixed(3)));
             replaceMap["OD+1"] = wrapH(ncFormat((OD + 1.0).toFixed(3)));
             replaceMap["OD+0.1"] = wrapH(ncFormat((OD + 0.1).toFixed(3))); 
             replaceMap["Drill-1"] = wrapH(ncFormat((drillVal - 1.0).toFixed(3)));
             replaceMap["ID+0.6"] = wrapH(ncFormat((ID + 0.6).toFixed(3)));
             replaceMap["OD-0.6"] = wrapH(ncFormat((OD - 0.6).toFixed(3)));
             replaceMap["L-R"] = wrapH(ncFormat((- (L - R)).toFixed(3))); 
             replaceMap["OD+2R"] = wrapH(ncFormat((OD + R + R).toFixed(3)));
             replaceMap["OD+2R+0.1"] = wrapH(ncFormat((OD + R + R + 0.1).toFixed(3)));
             replaceMap["L-0.5"] = wrapH(ncFormat((-L + 0.5).toFixed(3)));
        }
    } else if (input.workType === "M40") { if (typeof template_M40 !== 'undefined') finalCode = template_M40; }
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
    else { if (typeof template_G78 !== 'undefined') finalCode = template_G78; }

    if (!finalCode) {
        return { displayHtml: "エラー: テンプレートが見つかりません", plainText: null };
    }

    // ★追加: 置換処理をスッキリさせる
    // すべてのキーに対して置換を実行
    Object.keys(replaceMap).forEach(key => {
        // split-joinテクニックはそのまま採用（シンプルで確実なため）
        // プレースホルダー {{key}} を value に全置換
        finalCode = finalCode.split("{{" + key + "}}").join(replaceMap[key]);
    });

    if (input.workType === "Tonbo" && input.m99p100) {
        finalCode = applyTonboStandardRoughing(finalCode);
        finalCode = replaceTonboG70DeleteLines(finalCode);
        finalCode = finalCode.replace(/^\(M99P100\)\s*$/gm, "");
    }

    return {
        displayHtml: finalCode,
        plainText: gcodeDisplayHtmlToPlainText(finalCode)
    };
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
/** 表示する工具番号（複数選択可）。空のときは全工具を表示 */
let g_toolFilterSet = new Set();
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
            const skipSegmentForPreview = /\bM(?:51|59|61|408)\b/i.test(cleanLine);
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
    const rangeZ = (g_maxZ - g_minZ) || 100, rangeX = (g_maxX - g_minX) || 50;
    let s = Math.min((g_canvas.width - padding*2) / rangeZ, (g_canvas.height - padding*2) / (rangeX/2 + 10));
    s *= PREVIEW_DEFAULT_FIT_ZOOM;
    g_scale = s;
    g_offsetX = (g_canvas.width/2) - (((g_minZ + g_maxZ)/2) * g_scale);
    g_offsetY = (g_canvas.height/2) + (((g_minX + g_maxX)/4) * g_scale);
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
    const txt = hasN
        ? [`${p.nComment}`, `${p.mode}`, `Line ${p.lineIdx}: ${p.originalText}`]
        : [`${p.mode}`, `Line ${p.lineIdx}: ${p.originalText}`];
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

    /** Gコード上で工具が初めて使われる順（番号の大小ではない） */
    const toolOrder = [];
    const toolSeen = new Set();
    g_paths.forEach(p => {
        if (!toolSeen.has(p.tool)) {
            toolSeen.add(p.tool);
            toolOrder.push(p.tool);
        }
    });

    const grpTools = document.createElement('div');
    grpTools.className = 'preview-toolbar-group preview-toolbar-group--tools';
    grpTools.appendChild(createFilterBtn(tUi("previewAll"), null));
    toolOrder.forEach(t => grpTools.appendChild(createFilterBtn(t, t)));

    row.appendChild(grpNav);
    row.appendChild(grpG);
    row.appendChild(grpTools);
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
    if (g_toolFilterSet.size === 0) return true;
    return g_toolFilterSet.has(p.tool);
}

function createFilterBtn(l, id) {
    const b = document.createElement('button');
    b.innerText = l;
    b.className = "qb preview-tool-filter-btn";
    if (id === null) {
        if (g_toolFilterSet.size === 0) b.style.background = '#4da6ff';
    } else if (g_toolFilterSet.has(id)) {
        b.style.background = '#4da6ff';
    }
    b.onclick = () => {
        if (id === null) {
            g_toolFilterSet.clear();
        } else {
            if (g_toolFilterSet.has(id)) g_toolFilterSet.delete(id);
            else g_toolFilterSet.add(id);
        }
        createPreviewUI();
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

    // マウスドラッグ & 移動判定
    canvas.addEventListener('mousedown', e => { g_isDragging = true; g_lastMouseX = e.clientX; g_lastMouseY = e.clientY; canvas.style.cursor = 'grabbing'; });
    
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

    window.addEventListener('mouseup', () => { 
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

function isHalfWidthGuardInput(el) {
    return (
        el &&
        el.tagName === "INPUT" &&
        el.type === "text" &&
        !el.readOnly &&
        !el.disabled &&
        el.classList.contains("enter-target")
    );
}

function flashHalfwidthReject(el) {
    if (!el) return;
    el.classList.add("input--halfwidth-reject");
    window.setTimeout(function () {
        el.classList.remove("input--halfwidth-reject");
    }, 350);
}

function setupHalfWidthInputGuards() {
    document.addEventListener(
        "focusin",
        function (ev) {
            const t = ev.target;
            if (!isHalfWidthGuardInput(t)) return;
            t._ncHwSnap = t.value;
        },
        true
    );

    document.addEventListener(
        "beforeinput",
        function (ev) {
            const t = ev.target;
            if (!isHalfWidthGuardInput(t)) return;
            const it = ev.inputType;
            if (
                it !== "insertText" &&
                it !== "insertFromPaste" &&
                it !== "insertReplacementText" &&
                it !== "insertCompositionText"
            ) {
                return;
            }
            const data = ev.data;
            if (data != null && data !== "" && containsFullWidthFormChars(data)) {
                ev.preventDefault();
                flashHalfwidthReject(t);
            }
        },
        true
    );

    document.addEventListener(
        "compositionend",
        function (ev) {
            const t = ev.target;
            if (!isHalfWidthGuardInput(t)) return;
            if (!containsFullWidthFormChars(t.value)) {
                t._ncHwSnap = t.value;
                return;
            }
            t.value = t._ncHwSnap !== undefined ? t._ncHwSnap : "";
            flashHalfwidthReject(t);
            t.dispatchEvent(new Event("input", { bubbles: true }));
        },
        true
    );

    document.addEventListener(
        "input",
        function (ev) {
            const t = ev.target;
            if (!isHalfWidthGuardInput(t)) return;
            if (!containsFullWidthFormChars(t.value)) {
                t._ncHwSnap = t.value;
                return;
            }
            t.value = t._ncHwSnap !== undefined ? t._ncHwSnap : "";
            flashHalfwidthReject(t);
            t.dispatchEvent(new Event("input", { bubbles: true }));
        },
        true
    );
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

    const presetHost = $id("debugPresetMenu");
    if (presetHost) {
        presetHost.hidden = !dev;
        presetHost.setAttribute("aria-hidden", dev ? "false" : "true");
    }

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
    const opt = sel.querySelector('option[value="Tonbo"]');
    if (!opt) return;
    opt.disabled = !dev;
    const t = (typeof window.NC_I18N !== "undefined" && window.NC_I18N.t)
        ? window.NC_I18N.t.bind(window.NC_I18N)
        : function (k) { return k; };
    opt.textContent = dev ? t("workTypeTonbo") : t("workTypeTonboDisabled");
    opt.title = dev ? "" : t("workTypeTonboDisabledHint");
    if (!dev && sel.value === "Tonbo") {
        sel.value = "G78";
        updateWorkTypeSettings();
    }
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

let currentInternalStyle = 'Hirazoko'; 
let currentCalcMode = 'normal'; 

// ドリル径データベース
const DRILL_DIA_MAP = {
    "M40": 14.0,
    "Tonbo": 14.0,
    "G78": 14.0,
    "M22": 7.0,
    "M18": 7.0,
    "M15": 3.3,
    "M12": 4.05,
    "Tube": null 
};

function updateWorkTypeSettings() {
  const type = $id('workType').value;
  const normalArea = $id('normalProcessArea');
  const drillMode = $id('drillMode');
  const idDepth = $id('idDepth');

  if (normalArea) normalArea.style.display = 'block';

  if (type === 'M12') {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
  } else {
      idDepth.disabled = false;
      idDepth.placeholder = "22.0";
      if (drillMode) drillMode.value = "G74";
  }

  restrictStyles(type);
  updateTubeVariantUI();
  updateM12CascadeUI();
  if (type === "M12") {
    syncM12CascadeToInternalStyle();
  } else {
    updateInternalStyleUI();
    calcDrillDepth();
  }
  updateTonboVariantUI();
}

/**
 * M12: カスケード UI（仕上げタイプ → 加工プロファイル）。オプション文言は i18n キー経由。
 */
function populateM12ProfileOptions(preserveSelection) {
  const sel = $id("m12Profile");
  const ftEl = $id("m12FinishType");
  if (!sel || !ftEl) return;
  const ft = ftEl.value;
  const prev = preserveSelection ? sel.value : "";
  const tFn =
    window.NC_I18N && typeof window.NC_I18N.t === "function"
      ? window.NC_I18N.t.bind(window.NC_I18N)
      : function (k) {
          return k;
        };
  const drillGroup = [
    { v: "drill_ichi_men", key: "m12ProfDrillIchiMen" },
    { v: "drill_ichi_hira", key: "m12ProfDrillIchiHira" },
    { v: "cross_oku", key: "m12ProfCrossNoIchiOku" },
    { v: "cross_no", key: "m12ProfCrossNoIchiNo" },
  ];
  const baitoGroup = [
    { v: "baito_oku", key: "m12ProfBaitoOku" },
    { v: "baito_no", key: "m12ProfBaitoNo" },
  ];
  const list = ft === "baito" ? baitoGroup : drillGroup;
  sel.innerHTML = "";
  list.forEach(function (o) {
    const op = document.createElement("option");
    op.value = o.v;
    op.textContent = tFn(o.key);
    sel.appendChild(op);
  });
  const valid = prev && list.some(function (o) {
    return o.v === prev;
  });
  sel.value = valid ? prev : list[0].v;
}

window._ncPopulateM12ProfileOptions = populateM12ProfileOptions;

function updateM12CascadeUI() {
  const grp = $id("m12CascadeGroup");
  const wt = $id("workType") && $id("workType").value;
  if (!grp) return;
  if (wt === "M12") {
    grp.style.display = "";
    populateM12ProfileOptions(true);
    const pProf = $id("m12PanelProfile");
    if (pProf) pProf.style.display = "";
  } else {
    grp.style.display = "none";
  }
}

/**
 * カスケード選択に応じて内径スタイル・ドリルモードを同期（generateGCode と一致させる）
 */
function syncM12CascadeToInternalStyle() {
  if ($id("workType").value !== "M12") return;
  const ft = $id("m12FinishType").value;
  const profEl = $id("m12Profile");
  const prof = profEl ? profEl.value : "drill_ichi_men";
  const dm = $id("drillMode");

  if (ft === "halfmoon") {
    if (dm) {
      dm.value = "G1";
      dm.disabled = true;
    }
    if (prof === "drill_ichi_men") setInternalStyle("Ichimonji");
    else if (prof === "drill_ichi_hira") setInternalStyle("Hirazoko");
    else if (prof === "cross_oku" || prof === "cross_no") setInternalStyle("CrossSmall");
    else setInternalStyle("CrossSmall");
  } else if (ft === "baito") {
    if (prof !== "baito_no") setInternalStyle("Normal");
    if (dm) {
      if (prof && prof.indexOf("g74") !== -1) dm.value = "G74";
      else dm.value = "G1";
      dm.disabled = true;
    }
  } else {
    // hss（ハイスのドリル仕上げ）: ラベルどおり単動 G1 固定
    if (dm) {
      dm.value = "G1";
      dm.disabled = true;
    }
    if (prof === "drill_ichi_men") setInternalStyle("Ichimonji");
    else if (prof === "drill_ichi_hira") setInternalStyle("Hirazoko");
    else if (prof === "cross_oku" || prof === "cross_no") setInternalStyle("CrossSmall");
    else setInternalStyle("Hirazoko");
  }

  // baito+baito_no など setInternalStyle を呼ばない分岐でも、内径スタイルカード表示などを更新する
  updateInternalStyleUI();
  calcDrillDepth();
}

function onM12FinishTypeChange() {
  populateM12ProfileOptions(true);
  syncM12CascadeToInternalStyle();
  runGeneration();
}

function onM12ProfileChange() {
  syncM12CascadeToInternalStyle();
  runGeneration();
}

/** M12 加工プロファイルからバイト仕上げのドリルモード（入力オブジェクト用）。G74 は旧プロファイル値のみ。 */
function getM12BaitoDrillModeForInput() {
  const p = $id("m12Profile") && $id("m12Profile").value;
  if (!p || p.indexOf("baito_") !== 0) return "G1";
  return p.indexOf("g74") !== -1 ? "G74" : "G1";
}

/** 奥バイト面取りを行うか（M12 はチェック欄ではなくプロファイルで決める） */
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
 * ワーク種別がチューブのときのみ表示（トンボのトンボワーク種別と同じ左カラム・group レイアウト）。
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

/**
 * ワーク種別がトンボのときのみ表示。機械（NLX/CL）に応じてトンボワーク種別を選ぶ。
 */
function updateTonboVariantUI() {
  const grp = $id("tonboVariantGroup");
  const sel = $id("tonboVariant");
  const wt = $id("workType") && $id("workType").value;
  const machine = $id("machineSelect") && $id("machineSelect").value;
  if (!grp || !sel) return;

  const wantTonbo = wt === "Tonbo";
  const supported = machine === "NCL044" || machine === "NCL085";
  if (!wantTonbo || !supported) {
    grp.style.display = "none";
    return;
  }
  grp.style.display = "";

  const prev = sel.value;
  sel.innerHTML = "";
  const opts =
    machine === "NCL085"
      ? [
          { v: "nlx_g78", t: "G78-PP1" },
          { v: "nlx_m40", t: "M40X2-PP" },
        ]
      : [
          { v: "cl_g78", t: "G78-PP" },
          { v: "cl_m40", t: "M40X2-PP" },
          { v: "cl_m22", t: "M22X1.5-PP" },
          { v: "cl_m18", t: "M18X1.5-PP" },
          { v: "cl_m15", t: "M15X1.25-PP" },
          { v: "cl_m12", t: "M12X1-P ほか" },
        ];
  opts.forEach((o) => {
    const op = document.createElement("option");
    op.value = o.v;
    op.textContent = o.t;
    sel.appendChild(op);
  });
  const valid = opts.some((o) => o.v === prev);
  sel.value = valid ? prev : opts[0].v;
}

function onMachineSelectChange() {
  updateTonboVariantUI();
  runGeneration();
}

function restrictStyles(workType) {
    const tonboStyleCardIds = [
        'styleHirazoko',
        'styleIchimonji',
        'styleNormal',
        'styleYose',
        'styleCrossSmall',
        'styleCrossBig'
    ];

    function setTonboInternalStyleLock(locked) {
        tonboStyleCardIds.forEach((id) => {
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

    // トンボワーク: 雛形はワーク種別で決まるため、内径スタイルは「通常」のみ固定（選択不可）
    if (workType === 'Tonbo') {
        setInternalStyle('Normal');
        setTonboInternalStyleLock(true);
        return;
    }

    setTonboInternalStyleLock(false);

    const styleHirazoko = $id('styleHirazoko');
    const styleIchimonji = $id('styleIchimonji');
    const styleYose = $id('styleYose');
    const styleCrossBig = $id('styleCrossBig');

    // スタイルのリセットと有効化
    if(styleHirazoko) { styleHirazoko.style.pointerEvents = 'auto'; styleHirazoko.style.opacity = '1'; }
    if(styleIchimonji) { styleIchimonji.style.pointerEvents = 'auto'; styleIchimonji.style.opacity = '1'; }
    if(styleYose) { styleYose.style.pointerEvents = 'auto'; styleYose.style.opacity = '1'; }
    if(styleCrossBig) { styleCrossBig.style.pointerEvents = 'auto'; styleCrossBig.style.opacity = '1'; }

    if (workType === 'M12') {
        if(styleHirazoko) {
            styleHirazoko.style.pointerEvents = 'none';
            styleHirazoko.style.opacity = '0.3';
        }
        if (styleYose) {
            styleYose.style.pointerEvents = 'none';
            styleYose.style.opacity = '0.3';
        }
        if (styleCrossBig) {
            styleCrossBig.style.pointerEvents = 'none';
            styleCrossBig.style.opacity = '0.3';
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

function setInternalStyle(style) {
    currentInternalStyle = style;
    const styles = ['Hirazoko', 'Ichimonji', 'Normal', 'Yose', 'CrossBig', 'CrossSmall'];
    styles.forEach(s => {
        const card = $id('style' + s);
        if(card) {
            if(s === style) card.classList.add('active');
            else card.classList.remove('active');
        }
    });
    updateInternalStyleUI();
    calcDrillDepth();
}

/**
 * 内径加工スタイル・ワーク種別に応じたブロック表示（Enterキーのナビとは独立）
 */
function updateInternalStyleUI() {
    const drillMode = $id('drillMode');
    const cpArea = $id('cpCalcArea');
    const yoseDiv = $id('yoseSettings');
    const okuBiteArea = $id('okuBiteArea');
    const workType = $id('workType').value;
    const blockMaxDiameterMode = $id('blockMaxDiameterMode');

    const styleCardsSection = document.querySelector(".machining-card-section--styles");
    if (styleCardsSection) {
        const showM12Styles = workType === "M12" &&
            $id("m12FinishType") && $id("m12FinishType").value === "baito" &&
            $id("m12Profile") && $id("m12Profile").value === "baito_no";
        styleCardsSection.style.display = (workType === "M12" && !showM12Styles) ? "none" : "block";
    }

    // チューブでも最大径計算モードを選べる（外径最大径はチューブ規格からは自動入力しない）
    if (blockMaxDiameterMode) {
        blockMaxDiameterMode.style.display = '';
    }

    // ドリル深さUI制御（平底・一文字は図面の内径深さから自動計算するため入力欄を隠す）
    const drillDepthInput = $id('drillDepth');
    const drillDepthLabel = $id('drillDepthLabel');
    const drillDepthContainer = drillDepthInput && drillDepthInput.parentElement;
    if (currentInternalStyle === 'Hirazoko' || currentInternalStyle === 'Ichimonji') {
        if(drillDepthContainer) drillDepthContainer.style.display = 'none';
    } else {
        if(drillDepthContainer) drillDepthContainer.style.display = 'flex';
    }

    const m12Ft = workType === "M12" && $id("m12FinishType") ? $id("m12FinishType").value : "";
    if (drillDepthInput && drillDepthLabel) {
        if (workType === "M12" && m12Ft === "halfmoon" && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillDepthHangetsu");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else if (workType === "M12" && currentInternalStyle === "CrossSmall") {
            drillDepthLabel.setAttribute("data-i18n", "drillZ");
            drillDepthInput.readOnly = true;
            drillDepthInput.classList.add("input--readonly-computed");
        } else {
            drillDepthLabel.setAttribute('data-i18n', 'drillZ');
            drillDepthInput.readOnly = false;
            drillDepthInput.classList.remove('input--readonly-computed');
        }
    }

    if (workType === "M12" && m12Ft === "halfmoon") {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else if (workType === "M12" && m12Ft === "baito") {
        const prof = $id("m12Profile") && $id("m12Profile").value;
        if (prof && prof.indexOf("g74") !== -1) drillMode.value = "G74";
        else drillMode.value = "G1";
        drillMode.disabled = true;
    } else if (workType === "M12" && m12Ft === "hss") {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else if (currentInternalStyle === "Ichimonji") {
        drillMode.value = "G1";
        drillMode.disabled = true;
    } else {
        drillMode.disabled = false;
    }

    // M12 ではドリルモードは仕上げタイプ／加工プロファイルで決まるため UI は出さない（値は上で同期済み）
    const drillModeRow = $id("drillModeRow");
    if (drillModeRow) {
        drillModeRow.style.display = workType === "M12" ? "none" : "flex";
    }

    // ヨセ設定（スタイル＝ヨセのときのみ）
    if (currentInternalStyle === 'Yose') {
        yoseDiv.style.display = "block";
    } else {
        yoseDiv.style.display = "none";
    }

    // 交差穴・一文字DR(面取り): CP 入力
    if (currentInternalStyle === 'CrossBig' || currentInternalStyle === 'CrossSmall' || currentInternalStyle === 'Ichimonji') {
        cpArea.style.display = "block";
    } else {
        cpArea.style.display = "none";
    }

    // 奥バイト面取りの有無は M12 の加工プロファイルで決める（チェック欄は使わない）
    if (okuBiteArea) okuBiteArea.style.display = "none";

    const idDepthLabel = $id("idDepthLabel");
    if (idDepthLabel) {
        let useIPDepthLabel =
            currentInternalStyle === "CrossBig" || currentInternalStyle === "CrossSmall";
        if (workType === "M12") {
            const mp = $id("m12Profile") && $id("m12Profile").value;
            useIPDepthLabel = mp === "cross_oku" || mp === "cross_no" || mp === "drill_ichi_men";
        }
        if (useIPDepthLabel) {
            idDepthLabel.setAttribute("data-i18n", "idDepthCross");
        } else {
            idDepthLabel.setAttribute("data-i18n", "idDepth");
        }
    }

    if (window.NC_I18N && typeof window.NC_I18N.applyI18n === "function") {
        window.NC_I18N.applyI18n();
    }

    calcAutoCP();
}

function calcDrillDepth() {
    const workType = $id('workType').value;
    const style = currentInternalStyle;
    const idDepthVal = parseFloat($id('idDepth').value);
    const cpVal = parseFloat($id('cpVal').value);
    const drillDepthInput = $id('drillDepth');

    if (workType === 'M12' && style === 'CrossSmall') {
        if (drillDepthInput) {
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

    if (style === 'Yose') {
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

    // 計算機能を適用するIDリスト
    const calcTargets = ['valA', 'valB', 'drillDepth', 'ateLength', 'idDepth'];

    calcTargets.forEach(id => {
        const el = $id(id);
        if (!el) return;

        el.addEventListener('change', (e) => {
            // 数式を計算
            const result = evaluateFormula(e.target.value);
            if (typeof result === 'number') {
                // 小数点第3位までに整形して上書き
                e.target.value = parseFloat(result.toFixed(3));

                // 関連する自動計算を再実行
                if (id === 'valA' || id === 'valB') calcEccentric();
                if (id === 'drillDepth' || id === 'idDepth') {
                    calcAutoCP();
                    calcDrillDepth();
                }
                // アテ長さに関連する最大径計算（ボタンと同じ処理）を実行したい場合
                if (id === 'ateLength') {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) {
                        const ans1 = 50 - v;
                        $id('maxOD').value = (ans1 * 2 * Math.SQRT2).toFixed(2);
                    }
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

    setupHelpEasterDropdown();

    const devBtn = $id("devModeToggleBtn");
    if (devBtn && !devBtn.dataset.ncBound) {
        devBtn.dataset.ncBound = "1";
        devBtn.addEventListener("click", function () {
            setDeveloperMode(!isDeveloperMode());
        });
    }

    updateWorkTypeSettings();

    if (typeof buildDebugPresetMenu === "function") buildDebugPresetMenu();

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


/** アテ長さの上下段をまとめて1つの選択とみなす（最後に押したボタンだけ active） */
function clearAteLengthQuickBtnsActive() {
    const w = $id("ateLengthQuickBtns");
    if (!w) return;
    w.querySelectorAll(".qb").forEach(function (el) {
        el.classList.remove("active");
    });
}
function setAteLengthQuickBtnActive(btn) {
    clearAteLengthQuickBtnsActive();
    if (btn) btn.classList.add("active");
}

function _dbgStdFile() {
    $id("v1a").value = "12345";
    $id("v1b").value = "2";
    $id("v1c").value = "A";
    $id("v2").value = "1";
}
function _dbgWorkerYamada() {
    $id("workerName").value = "YAMADA";
    const pn = $id("workerName");
    if (!pn || !pn.parentElement) return;
    const row = pn.parentElement.previousElementSibling;
    if (!row) return;
    row.querySelectorAll(".qb").forEach(function (b) {
        b.classList.remove("active");
        if (b.textContent.trim() === "YAMADA") b.classList.add("active");
    });
}
/** ラベルに含む文字でアテ長さクイックをクリック（setAteCalc/Only と連動） */
function _dbgClickAteByLabel(substr) {
    const w = $id("ateLengthQuickBtns");
    if (!w) return;
    w.querySelectorAll(".qb").forEach(function (b) {
        if (b.textContent.indexOf(substr) !== -1) b.click();
    });
}

/**
 * [DEBUG] プリセット一覧（各 id は固定。ボタンごと毎回同じ入力）
 * title: 短い見出し / desc: 入力内容の極小説明
 */
var NC_DEBUG_PRESETS = [
    { id: "p01", title: "[P01] M40標準", desc: "NCL044・M40・通常・43角・M99・G74" },
    { id: "p02", title: "[P02] チューブ偏心", desc: "NCL085・19×15.8・31mm・偏心A/B・G1" },
    { id: "p03", title: "[P03] NCL012・M12バイト", desc: "PM-12-12A=No,12・15角・YAMADA" },
];

function runDebugPreset(id) {
    if (!isDeveloperMode()) return;
    _ncBypassEnterFieldValidation = true;
    try {
        _dbgStdFile();
        _dbgWorkerYamada();

        if (id === "p01") {
            $id("machineSelect").value = "NCL044";
            _dbgClickAteByLabel("43角");
            $id("workType").value = "M40";
            updateWorkTypeSettings();
            setCalcMode("normal");
            setInternalStyle("Normal");
            $id("maxOD").value = "60.81";
            $id("chkM99P100").checked = true;
            $id("drillMode").value = "G74";
            $id("drillDepth").value = "30";
            $id("idDepth").value = "30";
        } else if (id === "p02") {
            $id("machineSelect").value = "NCL085";
            $id("ateLength").value = "33.25";
            _dbgClickAteByLabel("33.5");
            $id("workType").value = "Tube";
            updateWorkTypeSettings();
            $id("tubeSpecSelect").value = "19x15.8 (R1)";
            updateTubeLengths();
            $id("tubeLengthSelect").value = "31";
            setCalcMode("eccentric");
            $id("valA").value = "28";
            $id("valB").value = "21.5";
            calcEccentric();
            setInternalStyle("Normal");
            $id("drillMode").value = "G1";
            $id("drillDepth").value = "200";
            $id("idDepth").value = "100";
            $id("chkM99P100").checked = false;
            calcDrillDepth();
        } else if (id === "p03") {
            $id("v1a").value = "12";
            $id("v1b").value = "12";
            $id("v1c").value = "A";
            $id("v2").value = "12";
            $id("machineSelect").value = "NCL012";
            $id("workType").value = "M12";
            updateWorkTypeSettings();
            if ($id("m12FinishType")) $id("m12FinishType").value = "baito";
            populateM12ProfileOptions(true);
            if ($id("m12Profile")) $id("m12Profile").value = "baito_no";
            syncM12CascadeToInternalStyle();
            setCalcMode("normal");
            _dbgClickAteByLabel("15角");
            $id("idDepth").value = "31.5";
            calcDrillDepth();
            if ($id("drillDepth")) $id("drillDepth").value = "30";
        } else {
            return;
        }

        runGeneration();
    } finally {
        _ncBypassEnterFieldValidation = false;
    }
}

function buildDebugPresetMenu() {
    const host = $id("debugPresetMenu");
    if (!host || !NC_DEBUG_PRESETS) return;
    host.innerHTML = "";
    NC_DEBUG_PRESETS.forEach(function (p) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "debug-btn debug-preset-btn help-easter-menu-item";
        b.addEventListener("click", function () {
            runDebugPreset(p.id);
        });
        const t = document.createElement("span");
        t.className = "debug-preset-title";
        t.textContent = p.title;
        const d = document.createElement("span");
        d.className = "debug-preset-desc";
        d.textContent = p.desc;
        b.appendChild(t);
        b.appendChild(d);
        host.appendChild(b);
    });
}

function debugAutoFill() {
    runDebugPreset("p01");
}

function debugAutoFillNcl085TubeEccentric() {
    runDebugPreset("p02");
}

function setActiveBtn(btn) {
    if (!btn) return;
    const parent = btn.parentElement;
    const siblings = parent.getElementsByClassName('qb');
    for (let el of siblings) el.classList.remove('active');
    btn.classList.add('active');
}
function setAuthor(name, btn) { $id('workerName').value = name; setActiveBtn(btn); }
function setAteOnly(val, btn) {
    $id('ateLength').value = val;
    setAteLengthQuickBtnActive(btn);
}
function setAteCalc(val, btn) {
    $id('ateLength').value = val;
    setAteLengthQuickBtnActive(btn);
    const v = parseFloat(val);
    if (!isNaN(v)) {
        const ans1 = 50 - v;
        const side = ans1 * 2;
        const diag = side * Math.SQRT2;
        $id('maxOD').value = diag.toFixed(2);
    }
}

/** Enter での「次へ」時に入力チェックをスキップする（デバッグ一括入力など） */
var _ncBypassEnterFieldValidation = false;

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
    case "yoseD":
      return w(el.value) && numOk(el.value)
        ? { ok: true }
        : { ok: false, msg: "ヨセの相手径を半角数値で入力してください。" };
    case "maxOD":
      if (!w(el.value) || !numOk(el.value)) {
        return { ok: false, msg: "外径最大径を半角数値で入力してください。" };
      }
      if (parseFloat(el.value) <= 0) {
        return { ok: false, msg: "外径最大径は 0 より大きい値にしてください。" };
      }
      return { ok: true };
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
  "machineSelect",
  "workType",
  "m12FinishType",
  "m12Profile",
  "v1a",
  "v1b",
  "v1c",
  "v2",
  "ateLength",
  "workerName",
  "tubeSpecSelect",
  "tubeLengthSelect",
  "valA",
  "valB",
  "valCornW",
  "valCornH",
  "valPartnerD",
  "yoseMethod",
  "yoseAngle",
  "yoseD",
  "maxOD",
  "drillMode",
  "drillDepth",
  "idDepth"
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

  if (!_ncBypassEnterFieldValidation) {
    const chk = validateEnterNavField(target);
    if (!chk.ok) {
      e.preventDefault();
      alert(chk.msg);
      return;
    }
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

function runGeneration() {
  const workTypeEl = $id('workType');
  const workTypeVal = workTypeEl ? workTypeEl.value : 'G78';
  
  const chkOkuBite = $id('chkOkuBite');
  const m12ProfRun = $id('m12Profile') && $id('m12Profile').value;
  const isOkuBiteEnabled =
    workTypeVal === 'M12'
      ? m12ProfileImpliesOku(m12ProfRun)
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
    m12FinishType: $id('m12FinishType') ? $id('m12FinishType').value : 'hss',
    m12Profile: $id('m12Profile') ? $id('m12Profile').value : 'drill_ichi_men',
    m12BaitoDrillMode: getM12BaitoDrillModeForInput(),
    m99p100: $id('chkM99P100').checked,
    tonboVariant: $id('tonboVariant') ? $id('tonboVariant').value : 'nlx_g78',

    internalStyle: currentInternalStyle,
    cpVal: $id('cpVal').value,
    valPartnerD: $id('valPartnerD').value,
    okuBiteEnabled: isOkuBiteEnabled,
    
    // ヨセ関連の変数はIDが変わっていないため正常に取得できています
    yoseMethod: $id('yoseMethod').value,
    yoseAngle: $id('yoseAngle').value,
    yoseD: $id('yoseD').value,

    tubeSpec: $id('tubeSpecSelect').value,
    tubeLength: $id('tubeLengthSelect').value,

    calcMode: currentCalcMode,
    valCornW: $id('valCornW').value,
    valCornH: $id('valCornH').value
  };

  const machineName = $id('machineSelect').value;
  const genResult = generateGCode(inputData, machineName);
  const gcodeHtml = genResult && typeof genResult === "object" && genResult.displayHtml !== undefined
    ? genResult.displayHtml
    : String(genResult);
  _ncLastPlainGCode = genResult && typeof genResult === "object" && genResult.plainText !== undefined
    ? genResult.plainText
    : null;

  const isGenError = _ncLastPlainGCode === null;

  $id('resultArea').innerHTML = gcodeHtml;

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
    document.querySelectorAll('.select-card').forEach(el => {
        if(el.id.startsWith('mode')) el.classList.remove('active');
    });
    let targetCard = null;
    if (mode === 'normal') targetCard = $id('modeNormal');
    else if (mode === 'eccentric') targetCard = $id('modeEccentric');
    else if (mode === 'corner') targetCard = $id('modeCorner');
    if(targetCard) targetCard.classList.add('active');
    document.querySelectorAll('.calc-inputs').forEach(el => {
        if(el.id !== 'cpCalcArea' && el.id !== 'okuBiteArea') el.style.display = 'none'; 
    });
    if (mode === 'eccentric') $id('eccentricInputs').style.display = 'block';
    else if (mode === 'corner') $id('cornerInputs').style.display = 'block';
}

function calcEccentric() {
    const A = parseFloat($id('valA').value);
    const B = parseFloat($id('valB').value);
    if (isNaN(A) || isNaN(B)) { $id('maxOD').value = ""; return; }
    const diaA = A * 2; const diaB = B * 2;
    const maxOD = Math.sqrt(Math.pow(diaA, 2) + Math.pow(diaB, 2));
    $id('maxOD').value = maxOD.toFixed(2);
}

function calcCorner() {
    const W = parseFloat($id('valCornW').value);
    const H = parseFloat($id('valCornH').value);
    if (isNaN(W) || isNaN(H)) { $id('maxOD').value = ""; return; }
    const diaY = (W / 2.0 + H) * 2.0; const diaX = W;
    const maxOD = Math.sqrt(Math.pow(diaY, 2) + Math.pow(diaX, 2));
    $id('maxOD').value = maxOD.toFixed(2);
}

