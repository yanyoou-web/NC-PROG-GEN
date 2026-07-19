/**
 * Gコードブロック定義ファイル — NC Program Generator
 *
 * ═══════════════════════════════════════════════════════════
 *  このファイルはGコード担当者が直接編集できます
 *  （アプリ本体の改修は不要）
 * ═══════════════════════════════════════════════════════════
 *
 * 【安全な編集範囲】
 *   ○ 各ブロック内の「数値」（F値・Q値・G4U秒数・ステップ量）
 *   ○ コメント文字列（括弧の中の説明文など）
 *
 * 【変更禁止】
 *   × function名（getDrillShiageHGDRBlock など）
 *       → テンプレートファイルや画面と紐付いています
 *   × JavaScript の構文記号（{ } ( ) => , ; など）
 *   × wrapH / ncFormat の呼び出し行（画面表示用のエスケープ処理）
 *
 * ── ブロック一覧 ────────────────────────────────────────────
 *  getDrillShiageHGDRBlock      汎用ドリル仕上げ（G74 ペック / G1 単動）
 *                               対象: M40 / M22 / M18 / M15 / G78 / G18系 / Tube など
 *  getDrillShiage10mmStepBlock  M12 HSS・M8・ASWD 専用（10mm ステップバック方式）
 *  getIchimonjiBlock            一文字ドリル 面取り（バリ取り）ブロック
 *  getIchimonjiHirazokoBlock    一文字ドリル 平底仕上げブロック
 *  getOkuBiteBlock              奥バイト 面取りブロック（M12 / M12_MH 用）
 *  getOkuBiteBlockG18           奥バイト 面取りブロック（G18_40 / G18_42 系用）
 *  computeFlatBottomExitLine    平底ブロック末尾行の計算（内径径 ≒ バイト径の判定）
 *  combineTubeFlatBottomFinishLine  チューブ N3 平底仕上げ行の結合
 * ────────────────────────────────────────────────────────────
 *
 * 読み込み順（gui-v2.html）: data-v2.js → i18n-v2.js → テンプレート群
 *                            → blocks-v2.js ← ここ → validators-v2.js
 *                            → gui-v2.js → logic-v2.js → preview-v2.js
 */

/* global wrapH, ncFormat */              // アプリ内部の数値フォーマット関数（変更不要）
/* global WORK_ID_MAP, FLAT_BOTTOM_TOOL_DIA_MM */  // ワーク定数マップ（logic.js 定義）


// ========== Gコードブロック生成 ==========

/**
 * 汎用ドリル仕上げブロック — M40 / M22 / M18 / M15 / G78 / G18系 / Tube など共通
 *
 *   mode="G74" : G74 ペックサイクル
 *                  深さ ≦ 30mm → 一発切り込み
 *                  深さ > 30mm → 最初に 30mm まで G74、以降 10mm ステップで送る
 *   mode="G1"  : G1 単動 1発
 *                  G18系・M12 HGDR/バイト/YoseRelay・一文字スタイル固定時
 */
function getDrillShiageHGDRBlock(depth, mode) {
    if (isNaN(depth)) return "";
    let s = "";
    const d  = (val) => wrapH(ncFormat(val.toFixed(3)));
    const d1 = (val) => wrapH(ncFormat(val.toFixed(3)));

    depth = Math.abs(depth);

    if (mode === "G1") {
        // ── G1 単動モード ──────────────────────────────────
        s += `G1Z-${d(depth)}F.15\n`;   // ← 切削送り速度（F値）
        s += `G4U.3\n`;                  // ← ドウェル秒数（G4U の数値）
        s += `Z1.F2.5`;                  // ← 引き戻し速度（F値）
    } else {
        if (depth <= 30) {
            // ── G74 ペックサイクル（深さ 30mm 以内）一発切り込み ──
            s += `G74R.5\n`;                                   // ← リトラクト量（R値）
            s += `G74Z-${d(depth)}Q8000F.25`;                  // ← 切込み量 Q8000=8mm・送り速度 F.25
            s += `\nG1Z-${d1(depth - 0.1)}F2.5\n`;            // ← -0.1mm 位置へ戻り（F値）
            s += `G4U.3\n`;                                    // ← ドウェル秒数
            s += `Z3.F2.5`;                                    // ← 引き戻し速度（F値）
        } else {
            // ── G74 ペックサイクル（深さ 30mm 超）10mm ステップ ──
            s += `G74R.5\n`;                                   // ← リトラクト量（R値）
            s += `G74Z-30.Q3000F.25\n`;                        // ← 最初の 30mm：切込み量 Q3000=3mm・送り速度 F.25
            let currentZ = 30;
            while (currentZ < depth) {
                let nextZ = currentZ + 10;                     // ← 1ステップ量（mm）
                if (nextZ >= depth) {
                    s += `\nG1Z-${d1(currentZ - 0.1)}F2.5\n`; // ← 前ステップ戻り（F値）
                    s += `Z-${d(depth)}F.25\n`;                // ← 最終深さへ切削（F値）
                    s += `Z30.F2.5\n\n`;                       // ← 30mm まで引き戻し（F値）
                    s += `G1Z-${d(depth - 0.1)}F2.5\n`;       // ← 仕上げ位置へ（F値）
                    s += `G4U.3\n`;                            // ← ドウェル秒数
                    s += `G1Z30.F2.5`;                          // ← 引き戻し速度（F値）
                    break;
                }
                s += `\nG1Z-${d1(currentZ - 0.1)}F2.5\n`;    // ← ステップ間戻り（F値）
                s += `Z-${d(nextZ)}F.25\n`;                   // ← 次ステップへ切削（F値）
                s += `G4U.3\n`;                               // ← ドウェル秒数
                s += `Z1.F2.5`;                               // ← 引き戻し速度（F値）
                currentZ = nextZ;
            }
        }
    }
    return s;
}

/**
 * M12 HSS / M8 / ASWD 専用 ドリル仕上げブロック
 *
 *   G1 単動 + 10mm 刻みステップバック方式
 *   使用条件: M12/M12_MH + hss、または M8_21/M8_31/J_M8_300
 *
 *   ステップ動作:
 *     0 → 10mm → 引き戻し → 10→20mm → 引き戻し → … → 最終深さ
 */
function getDrillShiage10mmStepBlock(depth) {
    if (isNaN(depth) || depth <= 0) return "";
    const d  = (val) => wrapH(ncFormat(val.toFixed(3)));
    const d1 = (val) => wrapH(ncFormat(val.toFixed(3)));
    depth = Math.abs(depth);
    let s = "";
    let currentZ = 0;
    while (currentZ < depth) {
        const nextZ = currentZ + 10;               // ← 1ステップ量（mm）
        if (nextZ >= depth) {
            s += `G1Z-${d(depth)}F.1\n`;           // ← 最終深さへ切削（送り速度 F値）
            s += `G4U.3\n`;                        // ← ドウェル秒数
            s += `G1Z30.F2.5`;                     // ← 引き戻し速度（F値）
            break;
        }
        s += `G1Z-${d(nextZ)}F.1\n`;              // ← ステップ切削（送り速度 F値）
        s += `G1Z30.F2.5\n`;                      // ← 引き戻し速度（F値）
        s += `G1Z-${d1(nextZ - 1)}F2.5\n`;        // ← 次ステップ手前まで早送り（F値）
        currentZ = nextZ;
    }
    return s;
}


/**
 * 一文字ドリル 面取り（バリ取り）ブロック — CP ± 2mm でZ軸貫通
 *
 *   使用条件:
 *     - M12/M12_MH: style=CrossSmall/CrossBig かつ profile=drill_ichi_men（一文字面取り）
 *     - G18_40/42系: style=CrossSmall かつ profile=drill_ichi_men
 *     - 上記以外の全テンプレート: style=Ichimonji（2.一文字DR平底 以外の場合）
 *   工具: 機械定義の "一文字ドリル"
 */
function getIchimonjiBlock(cpStr, machineConfig) {
    const cp = parseFloat(cpStr);
    if (isNaN(cp)) return "(Error: CP Invalid)";

    const zApproach = (cp - 2.0).toFixed(3);  // ← CP 手前のアプローチ量（-2.0mm）
    const zFinish   = (cp + 2.0).toFixed(3);  // ← CP 奥への貫通量（+2.0mm）

    const tool = machineConfig["一文字ドリル"];
    if (!tool) return "(ERROR: 機械定義に '一文字ドリル' が設定されていません)";
    const mOn  = machineConfig["M51"] || "";
    const mOff = machineConfig["M59"] || "";
    const H = (v) => wrapH(v);

    let s = `N102(4.0DR-ICHIMONJI-MENTORI)\n`;
    s += `G0G40G97S500M3${H(tool)}\n`;           // ← 回転数（S値）
    s += `X0.Z30.${H(mOn)}\n`;
    s += `Z3.\n`;
    s += `G1Z-${H(zApproach)}(CP-2.)F1.5\n`;     // ← アプローチ送り速度（F値）
    s += `Z-${H(zFinish)}(CP+2.)F.1\n`;           // ← 切削送り速度（F値）
    s += `G4U.3\n`;                               // ← ドウェル秒数
    s += `Z1.F1.5\n`;                             // ← 引き上げ速度（F値）
    s += `G0Z30.${H(mOff)}\n`;
    s += `G28U0W0M1\n`;
    return s;
}

/**
 * 一文字ドリル 平底仕上げブロック — 内径深さ基準で Z-(Depth+0.2) まで加工
 *
 *   使用条件: M12/M12_MH かつ style=Ichimonji（2.一文字DR平底）
 *   工具: 機械定義の "一文字ドリル"
 */
function getIchimonjiHirazokoBlock(drawDepth, machineConfig) {
    const zDraw = Math.abs(parseFloat(drawDepth));
    if (isNaN(zDraw)) return "(Error: Depth Invalid)";
    const zApproach = (zDraw - 2.0).toFixed(3);   // ← 内径深さ手前のアプローチ量（-2.0mm）
    const zFinish   = (zDraw + 0.2).toFixed(3);   // ← 内径深さ奥への仕上げ代（+0.2mm）
    const tool = machineConfig["一文字ドリル"];
    if (!tool) return "(ERROR: 機械定義に '一文字ドリル' が設定されていません)";
    const mOn  = machineConfig["M51"] || "";
    const mOff = machineConfig["M59"] || "";
    const H = (v) => wrapH(v);
    let s = `N102(4.0DR-ICHIMONJI-HIRAZOKO)\n`;
    s += `G0G40G97S500M3${H(tool)}\n`;            // ← 回転数（S値）
    s += `X0.Z30.${H(mOn)}\n`;
    s += `Z3.\n`;
    s += `G1Z-${H(zApproach)}(Depth-2.)F1.5\n`;   // ← アプローチ送り速度（F値）
    s += `Z-${H(zFinish)}(Depth+0.2)F.1\n`;        // ← 切削送り速度（F値）
    s += `G4U.3\n`;                                // ← ドウェル秒数
    s += `Z1.F1.5\n`;                              // ← 引き上げ速度（F値）
    s += `G0Z30.${H(mOff)}\n`;
    s += `G28U0W0M1\n`;
    return s;
}

/**
 * 奥バイト 面取りブロック — M12 / M12_MH 専用
 *
 *   使用条件: M12/M12_MH かつ style=CrossSmall/CrossBig かつ
 *             profile=cross_oku または baito_oku かつ 相手径 ≥ 6.0mm
 *   工具: 機械定義の "内径ダイヤΦ4"
 *
 *   CP 基準のZ座標:
 *     z1 = CP - 0.3  （アプローチ終点）
 *     z2 = CP - 0.1  （X4. 移動後）
 *     z3 = CP + 1.0  （奥へ送り）
 *     z4 = CP + 0.55 （仕上げ位置）
 */
function getOkuBiteBlock(cpStr, machineConfig) {
    let cp = parseFloat(cpStr);
    if (isNaN(cp)) return "(ERROR: CP_INVALID)";

    const z1 = (cp - 0.3).toFixed(3);   // ← CP オフセット（-0.3mm）
    const z2 = (cp - 0.1).toFixed(3);   // ← CP オフセット（-0.1mm）
    const z3 = (cp + 1.0).toFixed(3);   // ← CP オフセット（+1.0mm）
    const z4 = (cp + 0.55).toFixed(3);  // ← CP オフセット（+0.55mm）
    const H = (v) => wrapH(v);

    const tool = machineConfig["内径ダイヤΦ4"];
    if (!tool) return "(ERROR: 機械定義に '内径ダイヤΦ4' が設定されていません)";
    const m51 = machineConfig["M51"] || "";
    const m59 = machineConfig["M59"] || "";

    let s = "";
    s += `N102(OKU-BAIT--MENTORI)(CP=${H(cp.toFixed(3))})\n`;
    s += `G0G40G97S300M3${H(tool)}\n`;           // ← 回転数（S値）
    s += `X3.7Z30.${wrapH(m51)}\n`;
    s += `Z1.\n`;
    s += `G1Z-${H(z1)}(CP-0.3)F2.5\n`;           // ← アプローチ送り速度（F値）
    s += `X4.Z-${H(z2)}(CP-0.1)F.04\n`;          // ← 切削送り速度（F値）
    s += `Z-${H(z3)}(CP+1.0)\n`;
    s += `X4.45\n`;
    s += `Z-${H(z4)}(CP+0.55)\n`;
    s += `G4U1.\n`;                               // ← ドウェル秒数
    s += `X3.7F.3\n`;                             // ← 退避速度（F値）
    s += `Z1.F3.\n`;                              // ← 引き戻し速度（F値）
    s += `G0Z30.${wrapH(m59)}\n`;
    s += `G28U0W0M1`;
    return s;
}

/**
 * 奥バイト 面取りブロック — G18_40 / G18_42 系専用
 *
 *   M12版との違い: X4.1（X アプローチ径）と X4.6（仕上げ径）が M12版より大きい
 *   使用条件: G18_40/G18_42/G18_40_MH/G18_42_MH かつ style=CrossSmall かつ profile=hgdr_oku
 *   工具: 機械定義の "内径ダイヤΦ4"
 *
 *   CP 基準のZ座標:
 *     z1 = CP - 0.3  （アプローチ終点）
 *     z2 = CP - 0.1  （X4.1 移動後）
 *     z3 = CP + 1.0  （奥へ送り）
 *     z4 = CP + 0.55 （仕上げ位置）
 */
function getOkuBiteBlockG18(cpStr, machineConfig) {
    const cp = parseFloat(cpStr);
    if (isNaN(cp)) return "(ERROR: CP_INVALID)";

    const z1 = (cp - 0.3).toFixed(3);   // ← CP オフセット（-0.3mm）
    const z2 = (cp - 0.1).toFixed(3);   // ← CP オフセット（-0.1mm）
    const z3 = (cp + 1.0).toFixed(3);   // ← CP オフセット（+1.0mm）
    const z4 = (cp + 0.55).toFixed(3);  // ← CP オフセット（+0.55mm）
    const H = (v) => wrapH(v);

    const tool = machineConfig["内径ダイヤΦ4"];
    if (!tool) return "(ERROR: 機械定義に '内径ダイヤΦ4' が設定されていません)";
    const m51 = machineConfig["M51"] || "";
    const m59 = machineConfig["M59"] || "";

    let s = "";
    s += `N102(OKU-BAIT--MENTORI-G18)(CP=${H(cp.toFixed(3))})\n`;
    s += `G0G40G97S300M3${H(tool)}\n`;           // ← 回転数（S値）
    s += `X3.7Z30.${wrapH(m51)}\n`;
    s += `Z1.\n`;
    s += `G1Z-${H(z1)}(CP-0.3)F2.5\n`;           // ← アプローチ送り速度（F値）
    s += `X4.1Z-${H(z2)}(CP-0.1)F.04\n`;         // ← 切削送り速度（F値）※ M12版は X4. ここは X4.1
    s += `Z-${H(z3)}(CP+1.0)\n`;
    s += `X4.6\n`;                               // ← 仕上げ径 ※ M12版は X4.45 ここは X4.6
    s += `Z-${H(z4)}(CP+0.55)\n`;
    s += `G4U1.\n`;                               // ← ドウェル秒数
    s += `X3.7F.3\n`;                             // ← 退避速度（F値）
    s += `Z1.F3.\n`;                              // ← 引き戻し速度（F値）
    s += `G0Z30.${wrapH(m59)}\n`;
    s += `G28U0W0M1`;
    return s;
}


/**
 * 平底ブロック末尾行: 図面内径径 ≒ バイト径なら従来の U-.2(…)、
 * 異なるなら X[バイト径].F.03 を出力する。
 * （チューブは tubeData.toolDia が無い規格では U-.2 のまま）
 *
 * ※ この関数は数値の判定ロジックを含むため数値の直接変更は開発者へ依頼してください。
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

    let idDia   = null;
    let toolDia = null;

    if (wt === "Tube" && typeof tubeData !== "undefined" && input.tubeSpec && tubeData[input.tubeSpec]) {
        const t = tubeData[input.tubeSpec];
        idDia   = t.id;
        toolDia = t.toolDia;
    } else if (wt === "M12") {
        return "U-.2";
    } else {
        idDia   = WORK_ID_MAP[wt];
        toolDia = FLAT_BOTTOM_TOOL_DIA_MM[wt];
    }

    if (idDia == null || toolDia == null || isNaN(idDia) || isNaN(toolDia)) {
        return defaultLine();
    }

    const eps = 0.02;
    if (Math.abs(idDia - toolDia) < eps) return defaultLine();

    return "X" + ncFormat(toolDia) + "F.03";   // ← 平底仕上げ送り速度（F値）
}

/**
 * チューブ N3: 従来「X6.」行と「U-.2」行を 1行にまとめる（例: X6.U-.2）。
 * 平底で X*.F.03 だけ出す場合はその 1行に任せる（二重 X を出さない）。
 *
 * 再現例（X6.U-.2 が出るとき）:
 *   - 規格に toolDia あり（例: data.js の "8x6 (R0.5)" → toolDia 6）
 *   - computeFlatBottomExitLine が U で始まる行（平底で id≒toolDia、または平底以外 → "U-.2"）
 *   toolDia が null の規格では結合せず "U-.2" のみ（X 前置きなし）
 *
 * ※ この関数は結合ロジックのみで数値を持ちません。変更は開発者へ依頼してください。
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
