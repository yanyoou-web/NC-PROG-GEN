/* =========================================================
   validators-v2.js — 入力チェック共通処理
   ---------------------------------------------------------
   読み込み順: gui-v2.js より前（logic-v2.js より前）に読み込むこと。
   gui-v2.js / logic-v2.js の両方がここで定義するグローバル関数
   （ncFormat, escapeHtml, wrapH*, evaluateFormula,
     parseSimpleNumberOrFormula, $id など）に依存する。

   旧 gui-v2.js の「Section 1: utils」をこのファイルに移設し、
   あわせて半角チェック・安全な計算式評価などの新しい処理を追加した。
   ========================================================= */

// ========== A. 数値・記号まわりの基本ユーティリティ ==========

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function ncFormat(val) {
    if (val === "" || val === null || val === undefined) return "";
    const num = parseFloat(val); if (isNaN(num)) return "";
    const s = num.toString(); return s.indexOf(".") === -1 ? s + "." : s;
}
function wrapH(val)        { return (val===""||val===undefined) ? "" : escapeHtml(val); }
function wrapHCalc(val)    { return wrapH(val); }
function wrapHInput(val)   { return wrapH(val); }
function wrapHMachine(val) { return wrapH(val); }
function gcodeDisplayHtmlToPlainText(htmlStr) {
    if (!htmlStr) return "";
    const d = document.createElement("div"); d.innerHTML = htmlStr;
    return (d.innerText||"").replace(/ /g," ");
}
const $id = function(id){ return document.getElementById(id); };
var currentInternalStyle = "";
function isDebugModeOn() { return false; }

// ========== B. 計算式の安全な評価 ==========
//
// 旧実装は `new Function("return " + sanitized)()` を使っており、
// 次の2つの不具合があった（詳細は計画書を参照）。
//   1. "10//2" のようにスラッシュを2つ続けると、JS の行コメット開始と
//      解釈されてしまい、エラーにならず一部の数字が無視される。
//   2. ゼロ除算で得られる Infinity を isNaN では検出できない。
// ここでは +-*/() と数字だけを扱う小さな自前パーサーに置き換え、
// 上記どちらも構文エラー・非数値として正しく検出できるようにする。

/**
 * "10.5+2.3" のような四則演算の文字列を数値に変換する。
 * 数字・小数点・+ - * / ( ) 半角スペース 以外の文字が含まれる場合や、
 * 構文として不正な場合、有限数にならない場合（ゼロ除算等）は例外を投げる。
 */
function evaluateExpression(str) {
    var s = String(str);
    var i = 0;

    function fail(msg) { throw new Error(msg || ("式が正しくありません: " + str)); }
    function skipWs() { while (i < s.length && s[i] === " ") i++; }

    function parseNumber() {
        skipWs();
        var start = i;
        var sawDigit = false;
        while (i < s.length && s[i] >= "0" && s[i] <= "9") { i++; sawDigit = true; }
        if (s[i] === ".") {
            i++;
            while (i < s.length && s[i] >= "0" && s[i] <= "9") { i++; sawDigit = true; }
        }
        if (!sawDigit) fail("数値ではありません");
        return parseFloat(s.slice(start, i));
    }
    function parseFactor() {
        skipWs();
        if (s[i] === "+") { i++; return parseFactor(); }
        if (s[i] === "-") { i++; return -parseFactor(); }
        if (s[i] === "(") {
            i++;
            var v = parseExpr();
            skipWs();
            if (s[i] !== ")") fail("括弧が閉じていません");
            i++;
            return v;
        }
        return parseNumber();
    }
    function parseTerm() {
        var v = parseFactor();
        for (;;) {
            skipWs();
            if (s[i] === "*") { i++; v = v * parseFactor(); }
            else if (s[i] === "/") { i++; v = v / parseFactor(); }
            else break;
        }
        return v;
    }
    function parseExpr() {
        var v = parseTerm();
        for (;;) {
            skipWs();
            if (s[i] === "+") { i++; v = v + parseTerm(); }
            else if (s[i] === "-") { i++; v = v - parseTerm(); }
            else break;
        }
        return v;
    }

    if (s.trim() === "") fail("空です");
    var result = parseExpr();
    skipWs();
    if (i !== s.length) fail("余分な文字があります: " + s.slice(i));
    return result;
}

/**
 * 旧 evaluateFormula と同じ呼び出し方を保つための互換ラッパー。
 * 成功時は数値、失敗時（構文エラー・ゼロ除算などで有限数にならない場合）は
 * 元の文字列をそのまま返す（呼び出し側で不正値として扱われる）。
 */
function evaluateFormula(str) {
    if (!str) return "";
    var sanitized = String(str).replace(/[^0-9+\-*/.() ]/g, "");
    try {
        var r = evaluateExpression(sanitized);
        return isFinite(r) ? r : str;
    } catch (e) {
        return str;
    }
}

/**
 * 入力文字列が「単純な数値」または「四則演算の式」であれば、
 * 計算結果の数値を返す。どちらでもない場合・有限数にならない場合は NaN。
 */
function parseSimpleNumberOrFormula(str) {
    if (str === null || str === undefined) return NaN;
    var raw = String(str).trim();
    if (!raw) return NaN;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return Number(raw);
    if (!/^[0-9+\-*/().\s]+$/.test(raw)) return NaN;
    try {
        var ev = evaluateExpression(raw);
        return isFinite(ev) ? ev : NaN;
    } catch (e) {
        return NaN;
    }
}

// ========== C. 半角チェック（全角文字などの排除） ==========
//
// 入力欄を3種類に分類し、それぞれ「使ってよい文字」を許可リスト方式で定義する。
// 許可リストに無い文字は、全角文字に限らずすべて排除する
// （ゼロ幅文字など想定外の紛れ込みにも対応するため）。

var VALIDATOR_CATEGORIES = {
    // A. 桁数値ID系（図番・工程Noなど）: 半角数字のみ
    ID: { test: function(ch) { return ch >= "0" && ch <= "9"; } },
    // B. 数値計測系（長さ・直径など）: 半角数字 + 小数点 + 四則演算 + 括弧 + 半角スペース
    NUMERIC: { test: function(ch) { return /[0-9+\-*/.() ]/.test(ch); } },
    // C. 自由記述系（作成者名など）: 半角の印字可能文字のうち、
    //    G-codeのコメント( )や特殊記号(% ;)を壊す文字は禁止
    FREE_TEXT: { test: function(ch) {
        if (ch < "\x20" || ch > "\x7E") return false; // 半角の印字可能範囲(0x20-0x7E)以外はすべて禁止
        return ch !== "(" && ch !== ")" && ch !== "%" && ch !== ";";
    } },
};

/**
 * 文字列から、指定した分類で許可されていない文字を取り除く。
 * 戻り値: { cleaned: 除去後の文字列, removed: 1文字でも除去したか }
 */
function stripDisallowedChars(str, categoryName) {
    var category = VALIDATOR_CATEGORIES[categoryName];
    if (!category) throw new Error("未知の入力欄分類です: " + categoryName);
    var input = String(str == null ? "" : str);
    var out = "";
    var removed = false;
    for (var i = 0; i < input.length; i++) {
        var ch = input[i];
        if (category.test(ch)) out += ch;
        else removed = true;
    }
    return { cleaned: out, removed: removed };
}

/**
 * テキスト入力欄に「半角以外・許可されていない文字を即座に消す」ガードを設定する。
 * 日本語入力(IME)で変換中は妨げず、確定した瞬間だけチェックする。
 * 貼り付け（ペースト）にも対応する。
 * 文字が消された場合は onReject(el) を呼び出す（枠線を光らせる等の表示に使う）。
 */
function setupEraseGuard(el, categoryName, onReject) {
    function process() {
        var before = el.value;
        var result = stripDisallowedChars(before, categoryName);
        if (result.removed) {
            var pos = el.selectionStart;
            el.value = result.cleaned;
            if (typeof pos === "number") {
                var diff = before.length - result.cleaned.length;
                var newPos = Math.max(0, pos - diff);
                try { el.setSelectionRange(newPos, newPos); } catch (e) { /* 一部のinput type等では非対応のため無視 */ }
            }
            if (typeof onReject === "function") onReject(el);
        }
    }
    el.addEventListener("input", function(e) {
        if (e.isComposing) return; // IME変換中は妨げない
        process();
    });
    el.addEventListener("compositionend", function() { process(); });
    el.addEventListener("paste", function() { setTimeout(process, 0); });
}
