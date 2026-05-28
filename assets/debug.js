// ========== debug panel ==========
// 依存: app.js の escapeHtml / gcodeDisplayHtmlToPlainText (utils セクション)
/* global escapeHtml, gcodeDisplayHtmlToPlainText */
var _ncDebugLastInput = null;
var _ncDebugLastReplaceMap = null;
var _ncDebugLastTemplateKeys = null;
var _ncDebugLastUnresolved = null;

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
