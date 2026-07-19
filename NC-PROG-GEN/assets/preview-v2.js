// ========== preview-v2 ==========
/**
 * preview-v2.js
 * ツールパス描画エンジン（V2ウィザード版）
 * v1 assets/v1/preview.js からの移植。以下の点をV2向けに変更している:
 * - サイクル範囲のハッチング表示（drawApproachHatching）は廃止
 * - G0/G1表示切替はチェックボックスではなくボタンスイッチ
 * - 生コードは _ncLastPlainGCode ではなく #resultArea の dataset.plain を参照
 * - 通常表示（画面追従OFF・全画面OFF）時もキャンバス幅をコンテナ幅に追従させる
 * - V2は「result」画面に戻るたびに previewContainer 以下が丸ごと作り直されるため、
 *   document/window に貼るグローバルリスナーは一度だけbindし、点滅タイマーや
 *   ResizeObserver は対象要素が isConnected でなくなったら自己停止する
 * - 文言はV2の他画面と同様に日本語直書き
 *
 * 依存: gui-v2.js が生成後に #resultArea (data-plain属性を持つ) を用意すること
 */

// --- グローバル変数 ---
let g_paths = [];
let g_minX = 0,
    g_maxX = 0,
    g_minZ = 0,
    g_maxZ = 0;
let g_scale = 1.0;
/** リセット時のフィットをやや拡大（バウンディング中心は画面中央のまま） */
const PREVIEW_DEFAULT_FIT_ZOOM = 1.28;
let g_offsetX = 0,
    g_offsetY = 0;
let g_isDragging = false;
let g_lastMouseX = 0,
    g_lastMouseY = 0;

// フィルタ・表示設定
/** 表示するNブロック＝N番号(コメント)（複数選択可）。空のときは全ブロックを表示 */
let g_nBlockFilterSet = new Set();
let g_showG0 = false; // デフォルト: G0(早送り)非表示
let g_showG1 = true;
let g_stickyPreview = false;
/** 画面追従パネルを見出しからドラッグ移動中（キャンバス上のホバー判定と競合させない） */
let g_stickyPanelDragging = false;
/** 画面追従パネルのリサイズ監視 */
let g_previewStickyResizeObs = null;
let g_stickyBoxPersistTimer = null;
const LS_STICKY_BOX = "nc_v2_previewStickyBox";

// インスペクタ用
let g_highlightIdx = -1; // キャンバスホバーによる一時ハイライト (g_paths 配列インデックス)
let g_flashLineIdx = -1; // Gコードdblclick → ツールパス黄色点滅 (lineIdx)
let g_flashVisible = true; // 点滅の表示/非表示フラグ
let g_flashTimer = null; // 5秒終了タイマー
let g_flashBlink = null; // 点滅インターバル
let g_mousePos = { x: 0, y: 0 };

// キャンバス要素のキャッシュ
let g_canvas = null;
let g_ctx = null;
let g_debounceTimer = null;

/** document/window に貼るグローバルリスナーは画面遷移で要素が作り直されても一度だけbindする */
let g_globalListenersInited = false;

function getPlainGCode() {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea) return "";
    return resultArea.dataset.plain || resultArea.innerText || "";
}

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
            localStorage.setItem(
                LS_STICKY_BOX,
                JSON.stringify({
                    w: w,
                    h: h,
                    left: Math.round(r.left),
                    top: Math.round(r.top),
                })
            );
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

/** 通常表示（画面追従OFF・全画面OFF）: コンテナ幅に合わせてレスポンシブにキャンバス解像度を決める */
function syncEmbeddedPreviewCanvasSize() {
    const container = document.getElementById("previewContainer");
    const cv = document.getElementById("simCanvas");
    if (!container || !cv) return false;
    const innerW = Math.max(240, container.clientWidth);
    const w = Math.floor(innerW);
    const h = Math.floor(Math.max(220, Math.min(480, w * 0.55)));
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
        if (!container.isConnected) {
            teardownStickyPreviewResizeObserver();
            return;
        }
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

/** パネル右下グリップで幅・高さを変更（左上基準）。previewContainerは画面遷移のたびに作り直されるため、
 *  要素側のdatasetでbind済みかどうかを判定する（モジュール変数での一度きりガードにはしない） */
function setupPreviewResizeGrip() {
    const grip = document.getElementById("previewResizeGrip");
    if (!grip || grip.dataset.gripInit) return;
    grip.dataset.gripInit = "true";
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
    const container = document.getElementById("previewContainer");
    if (!container) return;

    if (document.fullscreenElement || container.classList.contains("pseudo-full")) return;

    if (g_stickyPreview) {
        container.classList.add("preview-sticky");
        applyStickyBoxFromStorage(container);
        setupPreviewStickyDrag();
        setupPreviewResizeGrip();
        setupStickyPreviewResizeObserver();
        requestAnimationFrame(function () {
            handleResize();
        });
    } else {
        teardownStickyPreviewResizeObserver();
        container.classList.remove("preview-sticky");
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
    const container = document.getElementById("previewContainer");
    if (!container) return;

    const isFull = document.fullscreenElement || container.classList.contains("pseudo-full");

    if (!isFull) {
        teardownStickyPreviewResizeObserver();
        container.classList.remove("preview-sticky");
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
    el.classList.remove("preview-sticky");
    el.classList.add("pseudo-full");
    el.style.cssText =
        "position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; background:#0e1118; margin:0; padding:0;";
    handleResize();
}

function deactivatePseudoFull(el) {
    el.classList.remove("pseudo-full");
    el.style.cssText = "";
    updatePreviewSticky();
    // updatePreviewSticky 内で handleResize（非追従は同期／追従は rAF）が呼ばれるため二重にしない
}

function handleResize() {
    if (!g_canvas) g_canvas = document.getElementById("simCanvas");
    if (!g_canvas) return;
    const container = document.getElementById("previewContainer");
    const isFull = document.fullscreenElement || (container && container.classList.contains("pseudo-full"));

    if (isFull) {
        g_canvas.width = window.innerWidth;
        // 見出し・ツール列・凡例・下段コントロール分を差し引き、描画域をできるだけ広くする
        const chrome = 120;
        g_canvas.height = Math.max(220, window.innerHeight - chrome);
    } else if (g_stickyPreview && container && container.classList.contains("preview-sticky")) {
        syncStickyPreviewCanvasSize();
    } else {
        syncEmbeddedPreviewCanvasSize();
    }
    drawPreview(true);
}

/**
 * メイン描画関数
 */
function drawPreview(forceFit = false) {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea) return;
    const rawCode = getPlainGCode();

    g_canvas = document.getElementById("simCanvas");
    if (!g_canvas) return;
    g_ctx = g_canvas.getContext("2d");

    const previewEl = document.getElementById("previewContainer");
    if (previewEl) {
        previewEl.style.display = "block";
        // V2は「result」画面に戻るたびにprevewContainerが作り直されるため、
        // 新しい要素が来るたびに: 前回のResizeObserverを確実に片付け、
        // 画面追従がONのまま戻ってきた場合はDOM状態(sticky class)を再同期する
        if (!previewEl.dataset.stickyChecked) {
            previewEl.dataset.stickyChecked = "true";
            teardownStickyPreviewResizeObserver();
            if (g_stickyPreview) updatePreviewSticky();
        }
    }

    if (!g_canvas.dataset.init) {
        initCanvasEventListeners(g_canvas);
        initGlobalEventListenersOnce();
        setupGCodeHighlightSync();
        g_canvas.dataset.init = "true";
        if (previewEl && !g_stickyPreview && !document.fullscreenElement && !previewEl.classList.contains("pseudo-full")) {
            syncEmbeddedPreviewCanvasSize();
        }
    }

    parseGCode(rawCode);

    createPreviewUI();

    const willFit = forceFit || g_scale === 1.0;

    if (willFit) {
        fitToScreen();
    }

    renderCanvas();
}

/**
 * Gコード行 逆ハイライト初期化。
 * ダブルクリック → 対応ツールパスを黄色で 5 秒点滅 + プレビューへスクロール。
 * resultArea 全体に委譲リスナーを 1 つだけ付ける（innerHTML 再生成後も追加不要）。
 */
function startFlashHighlight(lineIdx) {
    clearTimeout(g_flashTimer);
    clearInterval(g_flashBlink);
    g_flashLineIdx = lineIdx;
    g_flashVisible = true;
    const canvasAtStart = g_canvas;
    if (typeof renderCanvas === "function") renderCanvas();

    g_flashBlink = setInterval(() => {
        if (!canvasAtStart || !canvasAtStart.isConnected) {
            clearInterval(g_flashBlink);
            g_flashBlink = null;
            return;
        }
        g_flashVisible = !g_flashVisible;
        if (typeof renderCanvas === "function") renderCanvas();
    }, 400);

    g_flashTimer = setTimeout(() => {
        clearInterval(g_flashBlink);
        g_flashBlink = null;
        g_flashLineIdx = -1;
        g_flashVisible = true;
        if (canvasAtStart && canvasAtStart.isConnected && typeof renderCanvas === "function") renderCanvas();
    }, 5000);
}

function setupGCodeHighlightSync() {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea || resultArea.dataset.gcHighlightBound) return;
    resultArea.dataset.gcHighlightBound = "true";

    resultArea.addEventListener("dblclick", (e) => {
        const line = e.target.closest(".gc-line");
        if (!line) return;
        e.preventDefault();
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        const lineIdx = parseInt(line.dataset.ln, 10);
        if (isNaN(lineIdx)) return;
        // 対応パスが存在しない行は無視
        if (!g_paths || !g_paths.some((p) => p.lineIdx === lineIdx)) return;

        startFlashHighlight(lineIdx);

        // プレビューエリアへ自動スクロール
        const preview = document.getElementById("previewContainer");
        if (preview && preview.offsetParent !== null) {
            preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });
}

/**
 * 円弧の角度範囲チェック。phi が [phi0→phi1] の範囲内（CW/CCW 考慮）かを返す。
 */
function isAngleInArcRange(phi, phi0, phi1, isCw) {
    const TAU = 2 * Math.PI;
    const norm = (a) => ((a % TAU) + TAU) % TAU;
    if (isCw) {
        const total = norm(phi0 - phi1);
        const portion = norm(phi0 - phi);
        return portion <= total + 1e-9;
    } else {
        const total = norm(phi1 - phi0);
        const portion = norm(phi - phi0);
        return portion <= total + 1e-9;
    }
}

/**
 * 円弧の解析的バウンディングボックス（world 空間: x=直径, z）を返す。
 */
function arcWorldBounds(zc, rc, R, phi0, phi1, isCw) {
    const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const pts = [phi0, phi1];
    for (const c of cardinals) {
        if (isAngleInArcRange(c, phi0, phi1, isCw)) pts.push(c);
    }
    let minZ = Infinity,
        maxZ = -Infinity,
        minR = Infinity,
        maxR = -Infinity;
    for (const phi of pts) {
        const z = zc + R * Math.cos(phi);
        const r = rc + R * Math.sin(phi);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
    }
    return { minX: minR * 2, maxX: maxR * 2, minZ, maxZ };
}

/**
 * G2/G3 の円弧メタデータを 1 セグメントとして返す。
 * 不正（半径不一致・I/K 崩れ等）のときは null → 直線フォールバック。
 */
function buildArcMeta(curX, curZ, nextX, nextZ, I, K, isCw, lineIdx, originalText, tool, arcMode, nComment) {
    const r0 = curX / 2,
        z0 = curZ;
    const r1 = nextX / 2,
        z1 = nextZ;
    const zc = z0 + K;
    const rc = r0 + I;
    const d0 = Math.hypot(z0 - zc, r0 - rc);
    const d1 = Math.hypot(z1 - zc, r1 - rc);
    if (d0 < 1e-5 || d1 < 1e-5) return null;
    if (Math.abs(d0 - d1) > 0.05 * Math.max(d0, d1, 1)) return null;
    const R = (d0 + d1) / 2;
    const phi0 = Math.atan2(r0 - rc, z0 - zc);
    let dPhi = Math.atan2(r1 - rc, z1 - zc) - phi0;
    while (dPhi > Math.PI) dPhi -= 2 * Math.PI;
    while (dPhi < -Math.PI) dPhi += 2 * Math.PI;
    if (isCw) {
        if (dPhi > 0) dPhi -= 2 * Math.PI;
    } else {
        if (dPhi < 0) dPhi += 2 * Math.PI;
    }
    const phi1 = phi0 + dPhi;
    return {
        lineIdx,
        originalText,
        mode: arcMode,
        tool,
        nComment,
        x1: curX,
        z1: curZ,
        x2: nextX,
        z2: nextZ,
        arcMeta: { zc, rc, R, phi0, phi1, isCw },
    };
}

/**
 * G2/G3 の R 指定（I/K なし）円弧メタデータ。
 * FANUC: R>0 = 短弧(|dPhi|≤π)、R<0 = 長弧(|dPhi|>π)。
 */
function buildArcMetaFromR(curX, curZ, nextX, nextZ, Rval, isCw, lineIdx, originalText, tool, arcMode, nComment) {
    const r0 = curX / 2,
        z0 = curZ;
    const r1 = nextX / 2,
        z1 = nextZ;
    const dz = z1 - z0,
        dr = r1 - r0;
    const chord = Math.hypot(dz, dr);
    if (chord < 1e-9) return null;
    const absR = Math.abs(Rval);
    if (chord > 2 * absR * (1 + 0.01) + 1e-3) return null;
    const h = Math.sqrt(Math.max(0, absR * absR - (chord / 2) * (chord / 2)));
    const zm = (z0 + z1) / 2,
        rm = (r0 + r1) / 2;
    const pz = -dr / chord,
        pr = dz / chord;

    const candidates = [
        { zc: zm + h * pz, rc: rm + h * pr },
        { zc: zm - h * pz, rc: rm - h * pr },
    ];

    for (const { zc, rc } of candidates) {
        const phi0 = Math.atan2(r0 - rc, z0 - zc);
        let dPhi = Math.atan2(r1 - rc, z1 - zc) - phi0;
        while (dPhi > Math.PI) dPhi -= 2 * Math.PI;
        while (dPhi < -Math.PI) dPhi += 2 * Math.PI;
        if (isCw) {
            if (dPhi > 0) dPhi -= 2 * Math.PI;
        } else {
            if (dPhi < 0) dPhi += 2 * Math.PI;
        }
        const isShort = Math.abs(dPhi) <= Math.PI + 1e-9;
        if (Rval > 0 === isShort) {
            return {
                lineIdx,
                originalText,
                mode: arcMode,
                tool,
                nComment,
                x1: curX,
                z1: curZ,
                x2: nextX,
                z2: nextZ,
                arcMeta: { zc, rc, R: absR, phi0, phi1: phi0 + dPhi, isCw },
            };
        }
    }
    return null;
}

function parseGCode(code) {
    g_paths = [];
    const lines = code.split("\n");
    let curX = 100.0,
        curZ = 50.0;
    let minX = 100,
        maxX = -100,
        minZ = 100,
        maxZ = -100;
    let hasData = false;

    const regexX = /X([-0-9.]+)/,
        regexZ = /Z([-0-9.]+)/;
    const regexU = /U([-0-9.]+)/,
        regexW = /W([-0-9.]+)/;
    const regexI = /I([-0-9.]+)/,
        regexK = /K([-0-9.]+)/;
    const regexR = /R([-0-9.]+)/;
    const regexT = /T([0-9]{2,4})/,
        regexG_Num = /G([0-9]+)/g;

    let currentMode = "G0",
        currentTool = "Unknown";
    /** 直近の Nブロック全体の文字列 例 N1(DR14.0)（次の移動に付与。N行のみのときは次行へ継承） */
    let lastNComment = "";

    function expandBounds(ax, az, bx, bz) {
        if (!hasData) {
            minX = Math.min(ax, bx);
            maxX = Math.max(ax, bx);
            minZ = Math.min(az, bz);
            maxZ = Math.max(az, bz);
            hasData = true;
        } else {
            minX = Math.min(minX, ax, bx);
            maxX = Math.max(maxX, ax, bx);
            minZ = Math.min(minZ, az, bz);
            maxZ = Math.max(maxZ, az, bz);
        }
    }

    lines.forEach((line, index) => {
        const normalizedLine = line.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
        /** N1(DR14.0) 形式のみ（(M99…) や M1(…) は N番号がないため一致しない） */
        const reNComment = /\bN(\d+)\(([^)]*)\)/g;
        let nm;
        while ((nm = reNComment.exec(normalizedLine)) !== null) {
            lastNComment = "N" + nm[1] + "(" + nm[2].trim() + ")";
        }

        let cleanLine = normalizedLine.replace(/\([^)]*\)/g, "").toUpperCase();
        const matchT = cleanLine.match(regexT);
        if (matchT) currentTool = "T" + matchT[1];

        let gNumbers = [],
            match;
        while ((match = regexG_Num.exec(cleanLine)) !== null) gNumbers.push(parseInt(match[1], 10));
        if (gNumbers.some((n) => [4, 10, 28, 50, 65, 70, 71, 72, 73].includes(n))) return;

        if (gNumbers.includes(0)) currentMode = "G0";
        else if (gNumbers.includes(2)) currentMode = "G2";
        else if (gNumbers.includes(3)) currentMode = "G3";
        else if (gNumbers.some((n) => [1].includes(n))) currentMode = "G1";

        let nextX = curX,
            nextZ = curZ,
            moved = false;
        const mX = cleanLine.match(regexX),
            mZ = cleanLine.match(regexZ);
        const mU = cleanLine.match(regexU),
            mW = cleanLine.match(regexW);

        if (mX) {
            nextX = parseFloat(mX[1]);
            moved = true;
        }
        if (mZ) {
            nextZ = parseFloat(mZ[1]);
            moved = true;
        }
        if (mU) {
            nextX += parseFloat(mU[1]);
            moved = true;
        }
        if (mW) {
            nextZ += parseFloat(mW[1]);
            moved = true;
        }

        if (moved) {
            const skipSegmentForPreview = /\bM(?:51|59|61|408|459)\b/i.test(cleanLine);
            const isG2 = gNumbers.includes(2);
            const isG3 = gNumbers.includes(3);
            const mI = cleanLine.match(regexI),
                mK = cleanLine.match(regexK);
            const mR = cleanLine.match(regexR);
            let arcPieces = null;
            if (!skipSegmentForPreview && (isG2 || isG3)) {
                if (mI && mK) {
                    const I = parseFloat(mI[1]),
                        K = parseFloat(mK[1]);
                    const arcSeg = buildArcMeta(
                        curX,
                        curZ,
                        nextX,
                        nextZ,
                        I,
                        K,
                        isG2,
                        index + 1,
                        line.trim(),
                        currentTool,
                        isG2 ? "G2" : "G3",
                        lastNComment
                    );
                    if (arcSeg) arcPieces = [arcSeg];
                } else if (mR) {
                    const arcSeg = buildArcMetaFromR(
                        curX,
                        curZ,
                        nextX,
                        nextZ,
                        parseFloat(mR[1]),
                        isG2,
                        index + 1,
                        line.trim(),
                        currentTool,
                        isG2 ? "G2" : "G3",
                        lastNComment
                    );
                    if (arcSeg) arcPieces = [arcSeg];
                }
            }
            if (!skipSegmentForPreview && arcPieces && arcPieces.length) {
                arcPieces.forEach(function (seg) {
                    g_paths.push(seg);
                    if (seg.arcMeta) {
                        const { zc, rc, R, phi0, phi1, isCw } = seg.arcMeta;
                        const b = arcWorldBounds(zc, rc, R, phi0, phi1, isCw);
                        expandBounds(b.minX, b.minZ, b.maxX, b.maxZ);
                    } else {
                        expandBounds(seg.x1, seg.z1, seg.x2, seg.z2);
                    }
                });
            } else if (!skipSegmentForPreview) {
                const drawMode = (currentMode === "G2" || currentMode === "G3") && (!mI || !mK) ? "G1" : currentMode;
                g_paths.push({
                    lineIdx: index + 1,
                    originalText: line.trim(),
                    mode: drawMode,
                    tool: currentTool,
                    nComment: lastNComment,
                    x1: curX,
                    z1: curZ,
                    x2: nextX,
                    z2: nextZ,
                });
                expandBounds(curX, curZ, nextX, nextZ);
            } else {
                expandBounds(curX, curZ, nextX, nextZ);
            }
            curX = nextX;
            curZ = nextZ;
        }
    });
    // 初期仮想位置(100,50)が min/max に残ると表示が極端に小さくなるため、実軌跡の端点だけで範囲を取り直す
    if (g_paths.length > 0) {
        minX = Infinity;
        maxX = -Infinity;
        minZ = Infinity;
        maxZ = -Infinity;
        g_paths.forEach((p) => {
            if (p.arcMeta) {
                const { zc, rc, R, phi0, phi1, isCw } = p.arcMeta;
                const b = arcWorldBounds(zc, rc, R, phi0, phi1, isCw);
                minX = Math.min(minX, b.minX);
                maxX = Math.max(maxX, b.maxX);
                minZ = Math.min(minZ, b.minZ);
                maxZ = Math.max(maxZ, b.maxZ);
            } else {
                minX = Math.min(minX, p.x1, p.x2);
                maxX = Math.max(maxX, p.x1, p.x2);
                minZ = Math.min(minZ, p.z1, p.z2);
                maxZ = Math.max(maxZ, p.z1, p.z2);
            }
        });
    }
    g_minX = minX;
    g_maxX = maxX;
    g_minZ = minZ;
    g_maxZ = maxZ;
}

function fitToScreen() {
    if (!g_canvas) return;
    const padding = 40;

    // 表示中のパス（Nブロックフィルター＋G0/G1表示フラグ）のみを対象に範囲を算出
    let minX = g_minX,
        maxX = g_maxX,
        minZ = g_minZ,
        maxZ = g_maxZ;
    if (g_paths.length > 0) {
        let fxMin = Infinity,
            fxMax = -Infinity,
            fzMin = Infinity,
            fzMax = -Infinity;
        let hasVisible = false;
        g_paths.forEach((p) => {
            if (!toolPathPassesToolFilter(p)) return;
            if (p.mode === "G0" && !g_showG0) return;
            if (isCuttingMoveMode(p.mode) && !g_showG1) return;
            if (p.arcMeta) {
                const { zc, rc, R, phi0, phi1, isCw } = p.arcMeta;
                const b = arcWorldBounds(zc, rc, R, phi0, phi1, isCw);
                fxMin = Math.min(fxMin, b.minX);
                fxMax = Math.max(fxMax, b.maxX);
                fzMin = Math.min(fzMin, b.minZ);
                fzMax = Math.max(fzMax, b.maxZ);
            } else {
                fxMin = Math.min(fxMin, p.x1, p.x2);
                fxMax = Math.max(fxMax, p.x1, p.x2);
                fzMin = Math.min(fzMin, p.z1, p.z2);
                fzMax = Math.max(fzMax, p.z1, p.z2);
            }
            hasVisible = true;
        });
        if (hasVisible) {
            minX = fxMin;
            maxX = fxMax;
            minZ = fzMin;
            maxZ = fzMax;
        }
    }

    const rangeZ = maxZ - minZ || 100,
        rangeX = maxX - minX || 50;
    let s = Math.min((g_canvas.width - padding * 2) / rangeZ, (g_canvas.height - padding * 2) / (rangeX / 2 + 10));
    s *= PREVIEW_DEFAULT_FIT_ZOOM;
    g_scale = s;
    g_offsetX = g_canvas.width / 2 - ((minZ + maxZ) / 2) * g_scale;
    g_offsetY = g_canvas.height / 2 + ((minX + maxX) / 4) * g_scale;
}

function worldToScreen(wx, wz) {
    return { x: wz * g_scale + g_offsetX, y: g_offsetY - (wx / 2) * g_scale };
}

/**
 * プレビュー用：工具色パレット。色相を 360° 均等分割し黄〜黄橙に偏らないようにする。
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
    if (g_flashLineIdx !== -1 && p.lineIdx === g_flashLineIdx && g_flashVisible) return "#ffff00";
    const t = TOOL_PREVIEW_PALETTE[toolPaletteIndex(p.tool)];
    const hue = t[0],
        sat = t[1],
        lig = t[2];
    if (p.mode === "G0") return "hsla(" + hue + "," + sat + "%," + lig + "%,0.42)";
    return "hsl(" + hue + "," + sat + "%," + lig + "%)";
}

function isCuttingMoveMode(mode) {
    return mode === "G1" || mode === "G2" || mode === "G3";
}

/**
 * 円弧を canvas arc で描画するヘルパー。
 * screen_angle = -phi (y軸反転補正)、anticlockwise = !isCw (同理由)。
 */
function drawArcSegment(ctx, seg) {
    const { zc, rc, R, phi0, phi1, isCw } = seg.arcMeta;
    const sc = worldToScreen(rc * 2, zc);
    const sR = R * g_scale;
    ctx.arc(sc.x, sc.y, sR, -phi0, -phi1, !isCw);
}

function renderCanvas() {
    if (!g_ctx || !g_canvas) return;
    const ctx = g_ctx;

    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.fillStyle = "#161c28";
    ctx.fillRect(0, 0, g_canvas.width, g_canvas.height);

    // グリッド軸: 機械座標 X=0, Z=0 を通る線（worldToScreen(0,0) = {x:g_offsetX, y:g_offsetY}）
    ctx.strokeStyle = "#2a3550";
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

    g_paths.forEach(function (p, idx) {
        if (!toolPathPassesToolFilter(p)) return;
        if (p.mode === "G0" && !g_showG0) return;
        if (isCuttingMoveMode(p.mode) && !g_showG1) return;
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineCap = "round";
        ctx.strokeStyle = strokeColorForToolpath(p, idx);
        const isFlash = g_flashLineIdx !== -1 && p.lineIdx === g_flashLineIdx && g_flashVisible;
        const isHover = idx === g_highlightIdx;
        ctx.lineWidth = isFlash ? 22 : isHover ? 5 : p.mode === "G0" ? 1 : 3;
        if (isFlash) {
            ctx.shadowColor = "#ffff00";
            ctx.shadowBlur = 28;
        }
        ctx.beginPath();
        if (p.arcMeta) {
            drawArcSegment(ctx, p);
        } else {
            const p1 = worldToScreen(p.x1, p.z1),
                p2 = worldToScreen(p.x2, p.z2);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
        ctx.restore();
    });

    drawOriginMarkXZ0();
    if (g_highlightIdx !== -1) drawTooltip(g_paths[g_highlightIdx]);
}

/** 機械座標 X=0・Z=0 に原点マーク（軸線の交点と同じ位置） */
function drawOriginMarkXZ0() {
    if (!g_ctx || !g_canvas) return;
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
    g_ctx.fillStyle = "#ffff00";
    g_ctx.beginPath();
    g_ctx.arc(endPos.x, endPos.y, 4, 0, Math.PI * 2);
    g_ctx.fill();
    const hasN = p.nComment != null && String(p.nComment).length > 0;
    const fmtCoord = (v) => (Math.round(v * 1000) / 1000).toString();
    const coordStr = `X${fmtCoord(p.x2)}  Z${fmtCoord(p.z2)}`;
    const txt = hasN
        ? [`${p.nComment}`, `${p.mode}  ${coordStr}`, `Line ${p.lineIdx}: ${p.originalText}`]
        : [`${p.mode}  ${coordStr}`, `Line ${p.lineIdx}: ${p.originalText}`];
    g_ctx.font = "12px monospace";
    let bx = g_mousePos.x + 15,
        by = g_mousePos.y + 15;
    const tw = Math.min(
        420,
        Math.max(
            220,
            14 +
                Math.max.apply(
                    null,
                    txt.map(function (s) {
                        return s.length;
                    })
                ) *
                    7
        )
    );
    const th = hasN ? 56 : 40;
    if (bx + tw > g_canvas.width) bx -= tw + 20;
    g_ctx.fillStyle = "rgba(0,0,0,0.9)";
    g_ctx.fillRect(bx, by, tw, th);
    g_ctx.fillStyle = "#aaa";
    if (hasN) g_ctx.fillText(txt[0], bx + 5, by + 15);
    g_ctx.fillStyle = "#fff";
    g_ctx.fillText(hasN ? txt[1] : txt[0], bx + 5, by + (hasN ? 30 : 15));
    g_ctx.fillStyle = "#ccc";
    g_ctx.fillText(hasN ? txt[2] : txt[1], bx + 5, by + (hasN ? 45 : 30));
}

function createToggleBtn(label, active, onToggle) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerText = label;
    b.className = "wiz-preview-btn" + (active ? " active" : "");
    b.onclick = onToggle;
    return b;
}

function createPreviewUI() {
    const container = document.getElementById("previewContainer");
    if (!container) return;
    let area =
        document.getElementById("toolBtnArea") ||
        (() => {
            const a = document.createElement("div");
            a.id = "toolBtnArea";
            a.className = "wiz-preview-toolbar-area";
            container.insertBefore(a, g_canvas);
            return a;
        })();
    area.innerHTML = "";
    const row = document.createElement("div");
    row.className = "wiz-preview-toolbar";

    const grpNav = document.createElement("div");
    grpNav.className = "wiz-preview-toolbar-group";
    const btnFit = document.createElement("button");
    btnFit.type = "button";
    btnFit.innerText = "⟲ リセット";
    btnFit.className = "wiz-preview-btn";
    btnFit.onclick = function () {
        drawPreview(true);
    };
    const btnFull = document.createElement("button");
    btnFull.type = "button";
    btnFull.innerText = "⛶ 全画面";
    btnFull.className = "wiz-preview-btn";
    btnFull.onclick = toggleFullscreen;
    const btnSticky = document.createElement("button");
    btnSticky.type = "button";
    btnSticky.innerText = "画面追従";
    btnSticky.className = "wiz-preview-btn" + (g_stickyPreview ? " active" : "");
    btnSticky.onclick = function () {
        g_stickyPreview = !g_stickyPreview;
        updatePreviewSticky();
        createPreviewUI();
    };
    grpNav.appendChild(btnFit);
    grpNav.appendChild(btnFull);
    grpNav.appendChild(btnSticky);

    const grpG = document.createElement("div");
    grpG.className = "wiz-preview-toolbar-group wiz-preview-toolbar-group--path-toggles";
    grpG.appendChild(
        createToggleBtn("G0", g_showG0, () => {
            g_showG0 = !g_showG0;
            createPreviewUI();
            renderCanvas();
        })
    );
    grpG.appendChild(
        createToggleBtn("切削(G1〜)", g_showG1, () => {
            g_showG1 = !g_showG1;
            createPreviewUI();
            renderCanvas();
        })
    );

    // N番号(コメント) 付きブロック別フィルター — 全パスから出現順に収集
    const nBlockOrder = [];
    const nBlockSeen = new Set();
    g_paths.forEach((p) => {
        if (!p.nComment) return;
        if (!nBlockSeen.has(p.nComment)) {
            nBlockSeen.add(p.nComment);
            nBlockOrder.push(p.nComment);
        }
    });
    if (nBlockOrder.length === 0 && g_nBlockFilterSet.size > 0) {
        g_nBlockFilterSet.clear();
    }

    const grpNBlock = document.createElement("div");
    grpNBlock.className = "wiz-preview-toolbar-group wiz-preview-toolbar-group--nblocks";
    if (nBlockOrder.length > 1) {
        grpNBlock.appendChild(createNBlockFilterBtn("全て", null));
        nBlockOrder.forEach((nb) => grpNBlock.appendChild(createNBlockFilterBtn(nb, nb)));
    }

    row.appendChild(grpNav);
    row.appendChild(grpG);
    row.appendChild(grpNBlock);
    area.appendChild(row);
}

function toolPathPassesToolFilter(p) {
    if (g_nBlockFilterSet.size > 0 && !g_nBlockFilterSet.has(p.nComment)) return false;
    return true;
}

function createNBlockFilterBtn(l, id) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerText = l;
    b.className = "wiz-preview-btn wiz-preview-nblock-btn";
    if (id === null) {
        if (g_nBlockFilterSet.size === 0) b.classList.add("active");
    } else if (g_nBlockFilterSet.has(id)) {
        b.classList.add("active");
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
    const c = document.getElementById("previewContainer");
    if (!c) return;
    if (document.fullscreenElement === c) {
        teardownStickyPreviewResizeObserver();
        c.classList.remove("preview-sticky");
    } else if (g_stickyPreview && !c.classList.contains("pseudo-full")) {
        c.classList.add("preview-sticky");
        applyStickyBoxFromStorage(c);
        setupStickyPreviewResizeObserver();
    }
    handleResize();
}

function scrollToGCodeLine(lineIdx) {
    const el = document.querySelector(`#resultArea .gc-line[data-ln="${lineIdx}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("gc-line-blink");
    void el.offsetWidth;
    el.classList.add("gc-line-blink");
    el.addEventListener("animationend", () => el.classList.remove("gc-line-blink"), { once: true });
}

/**
 * document/window に貼るグローバルリスナー。previewContainer/simCanvasは「result」画面に
 * 戻るたびに作り直されるが、これらは要素に依存せず常に g_canvas / document.getElementById を
 * その場で再取得して動くため、アプリ生存期間中に一度だけbindすれば十分。
 * （要素のdatasetでガードすると、要素が毎回作り直されるV2では再訪問のたびに多重登録されてしまう）
 */
function initGlobalEventListenersOnce() {
    if (g_globalListenersInited) return;
    g_globalListenersInited = true;

    document.addEventListener("fullscreenchange", onPreviewFullscreenLayoutChange);

    window.addEventListener("resize", function () {
        const c = document.getElementById("previewContainer");
        if (!c || !g_canvas) return;
        if (
            g_stickyPreview &&
            c.classList.contains("preview-sticky") &&
            !document.fullscreenElement &&
            !c.classList.contains("pseudo-full")
        ) {
            const mw = window.innerWidth - 20;
            const mh = window.innerHeight - 20;
            if (c.offsetWidth > mw) c.style.width = mw + "px";
            if (c.offsetHeight > mh) c.style.height = mh + "px";
            clampStickyPanelPosition(c);
        }
        handleResize();
    });

    window.addEventListener("mousemove", (e) => {
        if (g_stickyPanelDragging || !g_canvas) return;
        const r = g_canvas.getBoundingClientRect();
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

        // --- 軌跡（線分・円弧）への当たり判定ロジック ---
        let bestDist = 20,
            bestIdx = -1;
        g_paths.forEach((p, idx) => {
            if (!toolPathPassesToolFilter(p)) return;
            if (p.mode === "G0" && !g_showG0) return;
            if (isCuttingMoveMode(p.mode) && !g_showG1) return;

            const m = g_mousePos;
            let dist;

            if (p.arcMeta) {
                const { zc, rc, R, phi0, phi1, isCw } = p.arcMeta;
                const sc = worldToScreen(rc * 2, zc);
                const sR = R * g_scale;
                const dx = m.x - sc.x,
                    dy = m.y - sc.y;
                const dCenter = Math.sqrt(dx * dx + dy * dy);
                dist = Math.abs(dCenter - sR);
                if (dist < bestDist) {
                    const worldAngle = -Math.atan2(dy, dx);
                    if (!isAngleInArcRange(worldAngle, phi0, phi1, isCw)) return;
                    bestDist = dist;
                    bestIdx = idx;
                }
            } else {
                const s1 = worldToScreen(p.x1, p.z1);
                const s2 = worldToScreen(p.x2, p.z2);
                const A = m.x - s1.x;
                const B = m.y - s1.y;
                const C = s2.x - s1.x;
                const D = s2.y - s1.y;
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = lenSq !== 0 ? dot / lenSq : -1;
                let dx, dy;
                if (param < 0) {
                    dx = m.x - s1.x;
                    dy = m.y - s1.y;
                } else if (param > 1) {
                    dx = m.x - s2.x;
                    dy = m.y - s2.y;
                } else {
                    dx = m.x - (s1.x + param * C);
                    dy = m.y - (s1.y + param * D);
                }
                dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = idx;
                }
            }
        });

        if (bestIdx !== g_highlightIdx) {
            g_highlightIdx = bestIdx;
            renderCanvas();
        }
    });

    window.addEventListener("mouseup", (e) => {
        if (e.button !== 1 && !g_isDragging) return;
        g_isDragging = false;
        if (g_canvas) g_canvas.style.cursor = "crosshair";
    });
}

/** canvas要素固有のリスナー。previewContainerが作り直されるたびに新しいcanvas要素へ再bindする必要がある */
function initCanvasEventListeners(canvas) {
    // マウスホイール
    canvas.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            const d = e.deltaY > 0 ? 0.9 : 1.1;
            const r = canvas.getBoundingClientRect();
            g_offsetX -= (e.clientX - r.left - g_offsetX) * (d - 1);
            g_offsetY -= (e.clientY - r.top - g_offsetY) * (d - 1);
            g_scale *= d;
            renderCanvas();
        },
        { passive: false }
    );

    // 左ダブルクリック: ツールパス上→Gコード行ジャンプ、空白→全画面ON/OFF
    canvas.addEventListener("dblclick", (e) => {
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
    canvas.addEventListener("mousedown", (e) => {
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
        canvas.style.cursor = "grabbing";
    });

    // スマホ タッチ操作
    let startDist = 0;
    canvas.addEventListener(
        "touchstart",
        (e) => {
            if (e.touches.length === 2) {
                startDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            } else if (e.touches.length === 1) {
                g_isDragging = true;
                g_lastMouseX = e.touches[0].clientX;
                g_lastMouseY = e.touches[0].clientY;
            }
        },
        { passive: false }
    );

    canvas.addEventListener(
        "touchmove",
        (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const d = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
                if (startDist > 0) {
                    g_scale *= d / startDist;
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
        },
        { passive: false }
    );

    canvas.addEventListener("touchend", () => {
        g_isDragging = false;
    });
}
