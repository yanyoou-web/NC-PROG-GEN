// ========== debug panel ==========
// 依存: app.js の escapeHtml / gcodeDisplayHtmlToPlainText (utils セクション)
/* global escapeHtml, gcodeDisplayHtmlToPlainText */
var _ncDebugLastInput = null;
var _ncDebugLastReplaceMap = null;
var _ncDebugLastTemplateKeys = null;
var _ncDebugLastUnresolved = null;
var _ncDebugLastCalcValues = null;

function isDebugModeOn() {
    const el = document.getElementById("debugModeToggle");
    return el ? el.checked : false;
}

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
    renderDebugCalcPane();
    renderDebugFlowPane();
    renderDebugMachinePane();
}

function renderDebugInputPane() {
    const el = document.getElementById("debugInputPane");
    if (!el) return;
    if (!_ncDebugLastInput) {
        el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>';
        return;
    }
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
    const missing = [...tKeys].filter((k) => !rKeys.has(k));
    // ✅ テンプレートにあり replaceMap にも存在（解決済み）
    const resolved = [...tKeys].filter((k) => rKeys.has(k));
    // ⚠️ replaceMap にあるがテンプレートで未使用
    const unused = [...rKeys].filter((k) => !tKeys.has(k));

    const sections = [];

    if (missing.length) {
        sections.push(
            `<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--miss">❌ 未解決 (テンプレートにあるが replaceMap なし) ${missing.length}件</div>` +
                missing
                    .map(
                        (k) =>
                            `<div class="dbg-row dbg-row--missing"><span class="dbg-key">{{${escapeHtml(k)}}}</span></div>`
                    )
                    .join("") +
                `</div>`
        );
    }

    if (unresolved.size) {
        sections.push(
            `<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--miss">⚠️ 出力に残存 (置換後も {{}} が残った) ${unresolved.size}件</div>` +
                [...unresolved]
                    .map(
                        (k) =>
                            `<div class="dbg-row dbg-row--missing"><span class="dbg-key">{{${escapeHtml(k)}}}</span></div>`
                    )
                    .join("") +
                `</div>`
        );
    }

    sections.push(
        `<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--ok">✅ 解決済み ${resolved.length}件</div>` +
            resolved
                .map(
                    (k) =>
                        `<div class="dbg-row"><span class="dbg-key" style="color:#6a9f6a;">{{${escapeHtml(k)}}}</span></div>`
                )
                .join("") +
            `</div>`
    );

    sections.push(
        `<div class="dbg-cov-section"><div class="dbg-cov-label dbg-cov-label--unused">💤 未使用 (replaceMap にあるがテンプレート外) ${unused.length}件</div>` +
            unused
                .map(
                    (k) => `<div class="dbg-row dbg-row--empty"><span class="dbg-key">{{${escapeHtml(k)}}}</span></div>`
                )
                .join("") +
            `</div>`
    );

    el.innerHTML = sections.join("");
}

// ─── デバッグ状態 JSON エクスポート (F3) ────────────────────────────────────

function exportDebugJSON() {
    if (!_ncDebugLastInput) {
        alert("先にGコードを生成してからエクスポートしてください。");
        return;
    }

    function plainMap(map) {
        if (!map) return null;
        const result = {};
        for (const [k, v] of Object.entries(map)) {
            result[k] = gcodeDisplayHtmlToPlainText(String(v == null ? "" : v));
        }
        return result;
    }

    const data = {
        exportedAt: new Date().toISOString(),
        input: _ncDebugLastInput,
        calcValues: _ncDebugLastCalcValues,
        replaceMap: plainMap(_ncDebugLastReplaceMap),
        templateKeys: _ncDebugLastTemplateKeys ? [..._ncDebugLastTemplateKeys] : null,
        unresolvedKeys: _ncDebugLastUnresolved ? [..._ncDebugLastUnresolved] : null,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nc-debug-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── 機械定義 JSON エクスポート/インポート (F7) ──────────────────────────────

function exportMachinesJSON() {
    if (typeof machines === "undefined") {
        alert("machines が見つかりません。data.js が読み込まれているか確認してください。");
        return;
    }
    const data = {
        _comment: "NC Program Generator — 機械定義エクスポート。このJSONを編集してインポートすることで機械設定を追加・変更できます。",
        machines: typeof machines !== "undefined" ? machines : {},
        tubeData: typeof tubeData !== "undefined" ? tubeData : {},
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nc-machines-config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderDebugMachinePane() {
    const el = document.getElementById("debugMachinePane");
    if (!el) return;

    const machineList = typeof machines !== "undefined" ? Object.keys(machines) : [];

    let html =
        `<div class="dbg-cov-label dbg-cov-label--ok">▼ 登録機械一覧 (${machineList.length}台)</div>` +
        machineList
            .map((name) => {
                const mc = machines[name];
                const toolCount = Object.keys(mc).filter((k) => /^[TtMm]/.test(String(mc[k]))).length;
                return (
                    `<div class="dbg-row">` +
                    `<span class="dbg-key">${escapeHtml(name)}</span>` +
                    `<span class="dbg-sep">—</span>` +
                    `<span class="dbg-val">${escapeHtml(mc["機械名ヘッダー"] || "")}</span>` +
                    `</div>`
                );
            })
            .join("");

    html +=
        `<div class="dbg-cov-label dbg-cov-label--ok" style="margin-top:10px;">▼ 操作</div>` +
        `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">` +
        `<button class="debug-panel__export" onclick="exportMachinesJSON()" style="font-size:11px;">⬇ machines.json エクスポート</button>` +
        `<button class="debug-panel__export" onclick="_importMachinesJSON()" style="font-size:11px;">⬆ JSONからインポート (一時)</button>` +
        `</div>` +
        `<div id="machineImportStatus" style="margin-top:6px;font-size:11px;color:#aaa;"></div>` +
        `<div class="dbg-cov-label dbg-cov-label--ok" style="margin-top:10px;">▼ インポート手順</div>` +
        `<div style="color:#888;font-size:10px;line-height:1.6;padding:4px 0;">` +
        `1. 「machines.json エクスポート」で現在の設定をダウンロード<br>` +
        `2. JSONを編集（新機械追加、T番号変更など）<br>` +
        `3. 「JSONからインポート」で読み込む（セッション内のみ有効）<br>` +
        `4. 恒久反映は data.js に直接コピーしてください` +
        `</div>`;

    el.innerHTML = html;
}

function _importMachinesJSON() {
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
                if (!data.machines) throw new Error("machines キーが見つかりません");

                // セッション内のみ: machines オブジェクトに追加/上書き
                let added = 0;
                let updated = 0;
                for (const [name, cfg] of Object.entries(data.machines)) {
                    if (machines[name]) {
                        updated++;
                    } else {
                        added++;
                    }
                    machines[name] = cfg;
                }

                // machineSelect に新機械を追加
                const sel = document.getElementById("machineSelect");
                if (sel) {
                    for (const name of Object.keys(data.machines)) {
                        if (![...sel.options].some((o) => o.value === name)) {
                            const opt = document.createElement("option");
                            opt.value = name;
                            opt.textContent = name;
                            sel.appendChild(opt);
                        }
                    }
                }

                const statusEl = document.getElementById("machineImportStatus");
                if (statusEl) {
                    statusEl.textContent = `✅ インポート完了: 新規${added}台, 更新${updated}台 (セッション内のみ有効)`;
                    statusEl.style.color = "#6abf6a";
                }
                renderDebugMachinePane();
            } catch (err) {
                const statusEl = document.getElementById("machineImportStatus");
                if (statusEl) {
                    statusEl.textContent = `❌ インポート失敗: ${err.message}`;
                    statusEl.style.color = "#ff6b6b";
                }
            }
        };
        reader.readAsText(file);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}

function renderDebugReplacePane() {
    const el = document.getElementById("debugReplacePane");
    if (!el) return;
    if (!_ncDebugLastReplaceMap) {
        el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>';
        return;
    }
    const rows = Object.entries(_ncDebugLastReplaceMap).map(([k, v]) => {
        const plain = gcodeDisplayHtmlToPlainText(String(v == null ? "" : v));
        const isEmpty = plain.trim() === "";
        // wrapH の kind を HTML から判定
        let kind = "machine";
        const m = String(v).match(/data-hl-attr="(calc|input|machine)"/);
        if (m) kind = m[1];
        const cls = isEmpty ? "dbg-row dbg-row--missing" : `dbg-row dbg-row--${kind}`;
        const keyHtml = `<span class="dbg-key">{{${escapeHtml(k)}}}</span>`;
        const valHtml = isEmpty
            ? `<span class="dbg-val dbg-val--empty">(空)</span>`
            : `<span class="dbg-val">${escapeHtml(plain)}</span>`;
        return `<div class="${cls}">${keyHtml}<span class="dbg-sep">→</span>${valHtml}</div>`;
    });
    el.innerHTML = rows.join("");
}

// ─── 算出値パネル ───────────────────────────────────────────────────────────

function renderDebugCalcPane() {
    const el = document.getElementById("debugCalcPane");
    if (!el) return;
    if (!_ncDebugLastCalcValues) {
        el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>';
        return;
    }
    const cv = _ncDebugLastCalcValues;

    function row(key, val, kind) {
        const strVal = val == null ? "" : String(val);
        const isEmpty = strVal === "" || strVal === "null";
        const cls = isEmpty ? "dbg-row dbg-row--empty" : `dbg-row dbg-row--${kind || "calc"}`;
        return (
            `<div class="${cls}">` +
            `<span class="dbg-key">${escapeHtml(key)}</span>` +
            `<span class="dbg-sep">=</span>` +
            `<span class="dbg-val">${escapeHtml(isEmpty ? "(空)" : strVal)}</span>` +
            `</div>`
        );
    }

    function section(label) {
        return `<div class="dbg-cov-label dbg-cov-label--ok" style="margin-top:8px;">${escapeHtml(label)}</div>`;
    }

    let html = "";

    html += section("▼ 生成コンテキスト");
    html += row("機械名 (machineName)", cv.machineName, "machine");
    html += row("加工スタイル (style)", cv.style, "input");
    html += row("選択テンプレート", cv.templateName, "input");
    html += row("外径モード (calcMode)", cv.calcMode, "input");
    html += row("ドリルブロック種別", cv.drillBlockKind, "calc");

    html += section("▼ 外径計算 (maxOD 系)");
    html += row("valMaxOD (parse後)", cv.valMaxOD, "input");
    html += row("calcMax1  → {{最大径-5}}", cv.calcMax1, "calc");
    html += row("calcMax2  → {{最大径+角}}(角あり: {{最大径+3}})", cv.calcMax2, "calc");
    html += row("calcMainMax (角あり時: W×√2)", cv.calcMainMax, "calc");
    html += row("calcCorner (角あり時: maxOD)", cv.calcCorner, "calc");

    html += section("▼ 深さ決定");
    html += row("baseIDDepth (入力値)", cv.baseIDDepth, "input");
    html += row("finalDrillDepth → DRILL_BLOCK depth", cv.finalDrillDepth, "calc");
    html += row("finalFinishDepth → {{入力_内径深さ}}", cv.finalFinishDepth, "calc");
    html += row("bigD (ワーク内径大径)", cv.bigD, "machine");
    html += row("drillDia (ドリル径)", cv.drillDia, "machine");

    if (cv.crossSmallDepth != null) {
        html += section("▼ CrossSmall 計算");
        html += row("crossSmallFinishDepth = CP + (R − √(R²−r²)) + 1", cv.crossSmallDepth, "calc");
    }

    if (cv.yoseRelayMetrics) {
        const m = cv.yoseRelayMetrics;
        html += section("▼ YoseRelay メトリクス");
        html += row(
            "opposedDistance = 全長 − 相手深さ",
            m.opposedDistance != null ? m.opposedDistance.toFixed(3) : null,
            "calc"
        );
        html += row(
            "yoseLength = (Φd/2 − Φ加工/2) / tan(θ)",
            m.yoseLength != null ? m.yoseLength.toFixed(3) : null,
            "calc"
        );
        html += row(
            "taiYoseLength = opposedDistance − yoseLength",
            m.taiYoseLength != null ? m.taiYoseLength.toFixed(3) : null,
            "calc"
        );
        html += row(
            "relayIdDepth = taiYoseLength + 1.0 → {{入力_内径深さ}}",
            m.relayIdDepth != null ? m.relayIdDepth.toFixed(3) : null,
            "calc"
        );
        html += row(
            "relayDrillDepth = taiYoseLength + 0.3×D → DRILL_BLOCK depth",
            m.relayDrillDepth != null && !isNaN(m.relayDrillDepth) ? m.relayDrillDepth.toFixed(3) : null,
            "calc"
        );
    }

    html += section("▼ その他");
    html += row("fullDrawStr (図番結合)", cv.fullDrawStr, "input");
    html += row("valM99 (M99P100 文字列)", cv.valM99 || "(空=使用しない)", "input");

    el.innerHTML = html;
}

// ─── 計算フローチャート ──────────────────────────────────────────────────────

function renderDebugFlowPane() {
    const el = document.getElementById("debugFlowPane");
    if (!el) return;
    if (!_ncDebugLastCalcValues) {
        el.innerHTML = '<span class="dbg-empty">生成後に表示されます</span>';
        return;
    }
    const cv = _ncDebugLastCalcValues;
    const inp = _ncDebugLastInput || {};

    // ノードHTML生成ヘルパー
    function N(cls, text) {
        return `<span class="dbg-flow-node dbg-flow-node--${cls}">${escapeHtml(String(text == null ? "(null)" : text))}</span>`;
    }
    const ARR = `<span class="dbg-flow-arrow">→</span>`;

    function flowRow(parts) {
        return `<div class="dbg-flow-row">${parts.join(ARR)}</div>`;
    }

    function group(num, title, rows, variant) {
        const cls = variant ? `dbg-flow-group dbg-flow-group--${variant}` : "dbg-flow-group";
        return (
            `<div class="${cls}">` +
            `<div class="dbg-flow-group__title">${num} ${escapeHtml(title)}</div>` +
            rows.join("") +
            `</div>`
        );
    }

    const style = cv.style || "(未選択)";
    const rows1 = [];
    const rows2 = [];
    const rows3 = [];
    const rows4 = [];
    const rows5 = [];
    const rows6 = [];

    // ① 外径計算
    if (cv.valMaxOD != null) {
        rows1.push(flowRow([N("input", "maxOD=" + cv.valMaxOD), N("op", "− 5"), N("result", cv.calcMax1), N("placeholder", "{{最大径-5}}")]));
        if (cv.isCorner) {
            rows1.push(flowRow([N("input", "W=" + (inp.valCornW || "?")), N("op", "× √2"), N("result", cv.calcMainMax), N("op", "+ 3"), N("result", cv.calcMax2), N("placeholder", "{{最大径+3}} (角あり)")]));
            rows1.push(flowRow([N("input", "maxOD=" + cv.valMaxOD), N("op", "as-is"), N("result", cv.calcCorner), N("placeholder", "{{最大径+角}} (角あり X+F.3 行)")]));
        } else {
            rows1.push(flowRow([N("input", "maxOD=" + cv.valMaxOD), N("op", "+ 3"), N("result", cv.calcMax2), N("placeholder", "{{最大径+角}} → X(--X--)")]));
        }
    } else {
        rows1.push(`<div class="dbg-flow-empty">maxOD 未入力 — 外径計算スキップ</div>`);
    }

    // ② 深さ決定
    if (cv.yoseRelayMetrics) {
        const m = cv.yoseRelayMetrics;
        const fmtOD = (n) => (n != null && !isNaN(n) ? n.toFixed(3) : "?");
        rows2.push(flowRow([N("input", "全長=" + (inp.yoseTotalLength || "?")), N("input", "相手深さ=" + (inp.yosePartnerDepth || "?")), N("op", "全長−相手深さ"), N("result", fmtOD(m.opposedDistance)), N("placeholder", "opposedDistance")]));
        rows2.push(flowRow([N("input", "Φd=" + (inp.yoseD || "?")), N("input", "bigD=" + cv.bigD), N("input", "θ=" + (inp.yoseAngle || "?") + "°"), N("op", "(d/2−D/2)/tan(θ)"), N("result", fmtOD(m.yoseLength)), N("placeholder", "yoseLength")]));
        rows2.push(flowRow([N("result", "opposed=" + fmtOD(m.opposedDistance)), N("result", "yoseLen=" + fmtOD(m.yoseLength)), N("op", "opposed − yoseLen"), N("result", fmtOD(m.taiYoseLength)), N("placeholder", "taiYoseLength")]));
        rows2.push(flowRow([N("result", "taiYose=" + fmtOD(m.taiYoseLength)), N("op", "+ 1.0"), N("result", fmtOD(m.relayIdDepth)), N("placeholder", "{{入力_内径深さ}} (仕上深さ)")]));
        if (!isNaN(m.relayDrillDepth)) {
            rows2.push(flowRow([N("result", "taiYose=" + fmtOD(m.taiYoseLength)), N("input", "D=" + cv.drillDia), N("op", "+ 0.3×D"), N("result", fmtOD(m.relayDrillDepth)), N("placeholder", "DRILL_BLOCK depth")]));
        }
    } else if (cv.crossSmallDepth != null) {
        const pD = inp.valPartnerD || "?";
        rows2.push(flowRow([N("input", "CP=" + (inp.cpVal || "?")), N("input", "partnerD=" + pD), N("input", "bigD=" + cv.bigD), N("op", "CP + (R−√(R²−r²)) + 1"), N("result", cv.crossSmallDepth), N("placeholder", "{{入力_内径深さ}} (CrossSmall)")]));
        rows2.push(flowRow([N("input", "idDepth=" + cv.baseIDDepth), N("op", "as-is"), N("result", cv.finalDrillDepth), N("placeholder", "DRILL_BLOCK depth")]));
    } else if (style === "Hirazoko" || style === "Ichimonji") {
        rows2.push(flowRow([N("input", "idDepth=" + cv.baseIDDepth), N("input", "style=" + style), N("op", "+ 0.1"), N("result", cv.finalDrillDepth), N("placeholder", "finalDrillDepth → DRILL_BLOCK")]));
        rows2.push(flowRow([N("input", "idDepth=" + cv.baseIDDepth), N("input", "style=" + style), N("op", "+ 0.2"), N("result", cv.finalFinishDepth), N("placeholder", "{{入力_内径深さ}} (仕上深さ)")]));
    } else {
        rows2.push(flowRow([N("input", "idDepth=" + cv.baseIDDepth), N("input", "style=" + style), N("op", "as-is"), N("result", cv.finalFinishDepth), N("placeholder", "{{入力_内径深さ}} (仕上深さ)")]));
        rows2.push(flowRow([N("input", "drillDepth=" + (inp.drillDepth || "?")), N("op", "as-is"), N("result", cv.finalDrillDepth), N("placeholder", "DRILL_BLOCK depth")]));
    }

    // ③ ドリルブロック選択
    const drillModeDisp = inp.drillMode || (inp.m12BaitoDrillMode ? inp.m12BaitoDrillMode : "G74");
    rows3.push(flowRow([N("input", "workType=" + inp.workType), N("input", "m12FinishType=" + (inp.m12FinishType || "hss")), N("op", "種別判定"), N("result", cv.drillBlockKind)]));
    rows3.push(flowRow([N("result", "depth=" + (cv.finalDrillDepth != null ? cv.finalDrillDepth : "?")), N("input", "drillMode=" + drillModeDisp), N("op", "getDrillBlock"), N("placeholder", "{{DRILL_BLOCK}}")]));

    // ④ 内バリ処理
    if (style === "Ichimonji") {
        rows4.push(flowRow([N("input", "style=Ichimonji"), N("input", "cpVal=" + (inp.cpVal || "?")), N("op", "getIchimonjiBlock"), N("placeholder", "{{内バリ処理}} (early)")]));
    } else if (style === "CrossSmall" || style === "CrossBig") {
        const profileKey = inp.workType === "M12" || inp.workType === "M12_MH" ? "m12Profile" : inp.workType === "G18_40" || inp.workType === "G18_42" || inp.workType === "G18_40_MH" || inp.workType === "G18_42_MH" ? "g18Profile" : "m8Profile";
        const profile = inp[profileKey] || "?";
        const blockFn = profile === "drill_ichi_men" ? "getIchimonjiBlock" : "getOkuBiteBlock";
        rows4.push(flowRow([N("input", "style=" + style), N("input", "profile=" + profile), N("input", "cpVal=" + (inp.cpVal || "?")), N("op", blockFn), N("placeholder", "{{内バリ処理}}")]));
    } else {
        rows4.push(`<div class="dbg-flow-empty">内バリ処理なし (style=${escapeHtml(style)})</div>`);
    }

    // ⑤ テンプレート選択
    if (inp.workType === "M12" || inp.workType === "M12_MH") {
        rows5.push(flowRow([N("input", "workType=" + inp.workType), N("input", "m12FinishType=" + (inp.m12FinishType || "hss")), N("op", "if/else選択"), N("result", cv.templateName), N("out", "finalCode")]));
    } else {
        rows5.push(flowRow([N("input", "workType=" + inp.workType), N("op", "if/else選択"), N("result", cv.templateName), N("out", "finalCode")]));
    }
    rows5.push(flowRow([N("input", "machine=" + cv.machineName), N("op", "data.js参照"), N("placeholder", "M51/M59/T番号/初期終了ブロック..."), N("out", "replaceMap (機械変数)")]));

    // ⑥ 最終出力
    rows6.push(flowRow([N("result", "replaceMap (" + Object.keys(_ncDebugLastReplaceMap || {}).length + "キー)"), N("op", "{{key}}一括置換"), N("result", cv.templateName), N("out", "Gコード出力")]));
    rows6.push(flowRow([N("out", "displayHtml"), N("op", "→ #resultArea")]));
    rows6.push(flowRow([N("out", "plainText"), N("op", "→ _ncLastPlainGCode"), N("op", "→ drawPreview()"), N("op", "→ 保存(.txt)")]));

    const html =
        `<div class="dbg-flow">` +
        group("①", "外径計算 (maxOD → calcMax1/2)", rows1) +
        group("②", "深さ決定 (style=" + style + ")", rows2) +
        group("③", "ドリルブロック選択 → {{DRILL_BLOCK}}", rows3) +
        group("④", "内バリ処理 → {{内バリ処理}}", rows4) +
        group("⑤", "テンプレート選択 + 機械変数マッピング", rows5) +
        group("⑥", "プレースホルダー置換 → 最終出力", rows6, "out") +
        `</div>`;

    el.innerHTML = html;
}
