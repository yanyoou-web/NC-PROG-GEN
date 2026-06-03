/* =========================================================
   gui-v2.js — NCプログラム作成 ウィザードコントローラー
   ---------------------------------------------------------
   読み込み順: gui-v2.js を logic.js より先に読み込むこと。
   logic.js が Section 1 の utils 関数をグローバルとして使用する。
   ========================================================= */
/* global navigator */
/* global generateGCode */
/* global isM8WorkType, isYoseMachiningStyle, isYoseRelayStyle */
/* global calcSpecialDrillZ, calcYoseRelayMetrics, calcCrossSmallFinishDepth */
/* global DRILL_DIA_MAP */

// ========== Section 1: utils（logic.js が依存するグローバル関数） ==========

function evaluateFormula(str) {
    if (!str) return "";
    const sanitized = str.replace(/[^0-9+\-*/.()]/g, "");
    try { const r = new Function("return " + sanitized)(); return isNaN(r) ? str : r; }
    catch (e) { return str; }
}
function parseSimpleNumberOrFormula(str) {
    if (str === null || str === undefined) return NaN;
    const raw = String(str).trim();
    if (!raw) return NaN;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return Number(raw);
    if (!/^[0-9+\-*/().\s]+$/.test(raw)) return NaN;
    const ev = evaluateFormula(raw);
    return typeof ev === "number" && isFinite(ev) ? ev : NaN;
}
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
function wrapHCalc(val)    { return (val===""||val===undefined) ? "" : escapeHtml(val); }
function wrapHInput(val)   { return (val===""||val===undefined) ? "" : escapeHtml(val); }
function wrapHMachine(val) { return (val===""||val===undefined) ? "" : escapeHtml(val); }
function gcodeDisplayHtmlToPlainText(htmlStr) {
    if (!htmlStr) return "";
    const d = document.createElement("div"); d.innerHTML = htmlStr;
    return (d.innerText||"").replace(/\u00a0/g," ");
}
const $id = function(id){ return document.getElementById(id); };
var currentInternalStyle = "";
function isDebugModeOn() { return false; }

// ========== Section 2: スタイル制約 ==========

var STYLE_LABELS = {
    Hirazoko:"内径バイト平底", Ichimonji:"一文字DR平底", Normal:"通常バイト加工",
    YoseRelay:"ヨセ中継", Yose:"ヨセ", CrossSmall:"交差穴（小径）",
};
var STYLE_NUMS = { Hirazoko:"1",Ichimonji:"2",Normal:"3",YoseRelay:"4",Yose:"5",CrossSmall:"6" };

function getAvailableStyles(workType) {
    if (workType==="J_M8_300") return ["CrossSmall"];
    if (workType==="M8_21"||workType==="M8_31") return ["Ichimonji","YoseRelay","CrossSmall"];
    if (workType==="G18_40"||workType==="G18_42"||workType==="G18_40_MH"||workType==="G18_42_MH")
        return ["YoseRelay","CrossSmall"];
    if (workType==="G18_62"||workType==="G18_655"||workType==="G18_6175"||
        workType==="G18_62_MH"||workType==="G18_655_MH"||workType==="G18_6175_MH")
        return ["Hirazoko","Normal","YoseRelay"];
    if (workType==="M42X3_25175"||workType==="M42X3_25175_16"||workType==="M42X3_25175_20"||workType==="M42X3_25175_22")
        return ["Hirazoko","Normal","Yose","YoseRelay"];
    if (workType==="M12"||workType==="M12_MH") return ["Ichimonji","Normal","YoseRelay","CrossSmall"];
    if (workType==="TOMESEN_M16"||workType==="TOMESEN_M18"||workType==="TOMESEN_M22"||workType==="TOMESEN_M24"||workType==="TOMESEN_M35")
        return ["Hirazoko","Ichimonji","Normal","YoseRelay","Yose"];
    return ["Hirazoko","Normal","YoseRelay","Yose","CrossSmall"];
}

// ========== Section 3: 定数 ==========

var WORK_TYPE_GROUPS = [
    {label:"ねじ系",   items:[{value:"M12",label:"M12"},{value:"M15",label:"M15"},{value:"M18",label:"M18"},{value:"M22",label:"M22"},{value:"G78",label:"G78"},{value:"M40",label:"M40"}]},
    {label:"ねじ系 MH",items:[{value:"M12_MH",label:"M12-MH"},{value:"M15_MH",label:"M15-MH"},{value:"M18_MH",label:"M18-MH"},{value:"M22_MH",label:"M22-MH"},{value:"G78_MH",label:"G78-MH"},{value:"M40_MH",label:"M40-MH"}]},
    {label:"G18系",    items:[{value:"G18_40",label:"φ4.0"},{value:"G18_42",label:"φ4.2"},{value:"G18_62",label:"φ6.2"},{value:"G18_655",label:"φ6.55"},{value:"G18_6175",label:"φ6.175"},{value:"G18_40_MH",label:"φ4.0 MH"},{value:"G18_42_MH",label:"φ4.2 MH"},{value:"G18_62_MH",label:"φ6.2 MH"},{value:"G18_655_MH",label:"φ6.55 MH"},{value:"G18_6175_MH",label:"φ6.175 MH"}]},
    {label:"M42X3系",  items:[{value:"M42X3_25175",label:"φ25.175 ST"},{value:"M42X3_25175_16",label:"→φ16"},{value:"M42X3_25175_20",label:"→φ20"},{value:"M42X3_25175_22",label:"→φ22"}]},
    {label:"M8系",     items:[{value:"M8_21",label:"S-M8 φ2.1"},{value:"M8_31",label:"S-M8 φ3.1"},{value:"J_M8_300",label:"次世代M8 φ3.0"}]},
    {label:"トメセン",  items:[{value:"TOMESEN_M16",label:"M16"},{value:"TOMESEN_M18",label:"M18"},{value:"TOMESEN_M22",label:"M22"},{value:"TOMESEN_M24",label:"M24"},{value:"TOMESEN_M35",label:"M35"}]},
    {label:"特殊",     items:[{value:"G12B_G_ST_12175_8",label:"G12B-ST-12.175-8"}]},
    {label:"チューブ", items:[{value:"Tube",label:"チューブ"}]},
];
var ATE_PRESETS = [
    {value:"42.5",label:"42.5（15角）",kaku:true},{value:"41",label:"41（18角）",kaku:true},
    {value:"39.5",label:"39.5（21角）",kaku:true},{value:"37.5",label:"37.5（25角）",kaku:true},
    {value:"33.25",label:"33.25（33.5角）",kaku:true},{value:"28.5",label:"28.5（43角）",kaku:true},
    {value:"6.25",label:"6.25"},{value:"11.25",label:"11.25"},{value:"20",label:"20"},
    {value:"24.5",label:"24.5"},{value:"31.5",label:"31.5"},{value:"36.75",label:"36.75"},
];
var KAKU_ATE_VALUES = ATE_PRESETS.filter(function(p){return p.kaku;}).map(function(p){return p.value;});
var AUTHOR_PRESETS  = ["YAMADA","SAWADA","RIN","REI","TANIGUTI","MURAKAMI"];
var DRAW_REV_OPTIONS = ["NONE","A","B","C","D","E"];
var DRILL_QUICK_BTNS = [{v:"20.4",lbl:"20.4<br><small>φ29</small>"},{v:"16.8",lbl:"16.8<br><small>φ23</small>"},{v:"14.4",lbl:"14.4<br><small>φ19</small>"},{v:"11.4",lbl:"11.4<br><small>φ14</small>"},{v:"7.2",lbl:"7.2<br><small>φ7</small>"}];

// ========== Section 4: ウィザード状態 ==========

var wizardState = {
    machine:null, workType:null, tubeSpec:"", tubeLength:"",
    internalStyle:null,
    yoseMethod:"2", yoseAngle:"60", yoseD:"", yoseTotalLength:"", yosePartnerDepth:"",
    maxOD:"", calcMode:"normal", valStockA:"", valStockB:"", valEccA:"", valEccB:"", valCornW:"", valCornH:"",
    ateLength:"",
    drillMode:"G74", drillDepth:"", drillDepthManual:false, idDepth:"",
    mhOdTool:"外径荒", g12bNoseR:"none",
    m12FinishType:"hss", m12CrossMethod:"hss_oku", g18CrossMethod:"hgdr_oku",
    valPartnerD:"", cpVal:"", okuBiteEnabled:false,
    m99Mode:"off",
    drawNumA:"", drawNumB:"2", drawRev:"NONE", processNum:"1", workerName:"",
};
var screenStack = [];

// ========== Section 5: ナビゲーション ==========

function isMHWorkType(wt) {
    return wt==="M12_MH"||wt==="M15_MH"||wt==="M18_MH"||wt==="M22_MH"||wt==="M40_MH"||wt==="G78_MH"||
           wt==="G18_40_MH"||wt==="G18_42_MH"||wt==="G18_62_MH"||wt==="G18_655_MH"||wt==="G18_6175_MH";
}
function isM12Like(wt)   { return wt==="M12"||wt==="M12_MH"; }
function isG18Small(wt)  { return wt==="G18_40"||wt==="G18_42"||wt==="G18_40_MH"||wt==="G18_42_MH"; }
function isCrossStyle(s) { return s==="CrossSmall"; }
function needsOptionsScreen() { return isMHWorkType(wizardState.workType)||wizardState.workType==="G12B_G_ST_12175_8"; }

function getNextScreen(currentId) {
    if (currentId==="start")        return "q-machine";
    if (currentId==="q-machine")    return "q-worktype";
    if (currentId==="q-worktype") { if (wizardState.workType==="Tube") return "q-tube-spec"; return "q-style"; }
    if (currentId==="q-tube-spec")  return "q-tube-length";
    if (currentId==="q-tube-length")return "q-atelength";
    if (currentId==="q-style") {
        if (wizardState.internalStyle==="YoseRelay"||wizardState.internalStyle==="Yose") return "q-yose-detail";
        if (needsOptionsScreen()) return "q-options";
        return "q-atelength";
    }
    if (currentId==="q-yose-detail") { if (needsOptionsScreen()) return "q-options"; return "q-atelength"; }
    if (currentId==="q-options")    return "q-atelength";
    if (currentId==="q-atelength")  return "q-maxod";
    if (currentId==="q-maxod")      return "q-depths";
    if (currentId==="q-depths")     return "q-drawnum";
    if (currentId==="q-drawnum")    return "result";
    return null;
}
function getStepInfo(screenId) {
    var main=["q-machine","q-worktype","q-style","q-atelength","q-maxod","q-depths","q-drawnum"];
    var idx=main.indexOf(screenId); if (idx>=0) return {current:idx+1,total:main.length};
    if (screenId==="q-tube-spec"||screenId==="q-tube-length") return {current:2,total:main.length};
    if (screenId==="q-yose-detail"||screenId==="q-options")   return {current:3,total:main.length};
    return null;
}

// ========== Section 6: 画面遷移エンジン ==========

function advance(currentId) { var n=getNextScreen(currentId); if(!n) return; screenStack.push(currentId); renderScreen(n); }
function goBack()            { if(screenStack.length===0) return; renderScreen(screenStack.pop()); }

function renderScreen(screenId) {
    var main=$id("wiz-main"), footer=$id("wiz-footer"), prog=$id("wiz-progress-bar");
    if (!main) return;
    main.classList.add("wiz-exit");
    setTimeout(function() {
        main.innerHTML = buildScreenHTML(screenId);
        main.classList.remove("wiz-exit"); main.classList.add("wiz-enter");
        setTimeout(function(){ main.classList.remove("wiz-enter"); },220);
        var info=getStepInfo(screenId);
        if (info) { prog.hidden=false; prog.innerHTML=buildProgressHTML(info.current,info.total); } else prog.hidden=true;
        footer.hidden=(screenId==="start"||screenStack.length===0);
        if (screenId==="result")   setTimeout(runGeneration,80);
        if (screenId==="q-maxod")  { bindCalcInputs(); initValidation(); }
        if (screenId==="q-depths") { initDrillAutoCalc(); bindDepthInputs(); initValidation(); }
        initValidation(); // 全画面でバリデーション対象を登録
    },130);
}
var STYLE_LABELS_SHORT = {
    Hirazoko:"平底", Ichimonji:"一文字平底", Normal:"通常バイト",
    YoseRelay:"ヨセ中継", Yose:"ヨセ", CrossSmall:"交差穴",
};

function getWorkTypeShortLabel(wt) {
    for (var i=0;i<WORK_TYPE_GROUPS.length;i++) {
        var g=WORK_TYPE_GROUPS[i];
        for (var j=0;j<g.items.length;j++) {
            if (g.items[j].value===wt) return g.items[j].label;
        }
    }
    return wt||"";
}

function buildCrumbBarHTML() {
    var chips=[];
    if (wizardState.machine)
        chips.push(wizardState.machine);
    if (wizardState.workType) {
        var wl=wizardState.workType==="Tube"?"チューブ":getWorkTypeShortLabel(wizardState.workType);
        chips.push(wl);
    }
    if (wizardState.workType==="Tube"&&wizardState.tubeSpec)
        chips.push(wizardState.tubeSpec+(wizardState.tubeLength?" "+wizardState.tubeLength+"mm":""));
    if (wizardState.internalStyle)
        chips.push(STYLE_LABELS_SHORT[wizardState.internalStyle]||wizardState.internalStyle);
    if (wizardState.ateLength)
        chips.push("アテ "+wizardState.ateLength);
    if (wizardState.maxOD)
        chips.push("最大径 "+wizardState.maxOD);

    // バッジ（M99P100等）
    var badges=[];
    if (wizardState.m99Mode==="on")    badges.push("M99P100");
    if (wizardState.m99Mode==="x50u8") badges.push("X50.U8");

    if (chips.length===0&&badges.length===0) return "";

    var h='<div class="wiz-crumb-bar">';
    for (var i=0;i<chips.length;i++) {
        if (i>0) h+='<span class="wiz-crumb-sep">›</span>';
        h+='<span class="wiz-crumb">'+escapeHtml(chips[i])+'</span>';
    }
    for (var j=0;j<badges.length;j++) {
        h+='<span class="wiz-crumb-sep">·</span>';
        h+='<span class="wiz-crumb wiz-crumb--badge">'+escapeHtml(badges[j])+'</span>';
    }
    h+='</div>';
    return h;
}

function buildProgressHTML(cur,tot) {
    var h=buildCrumbBarHTML();
    h+='<div class="wiz-prog-steps">';
    for (var i=1;i<=tot;i++) {
        var c=i<cur?"done":i===cur?"active":"";
        h+='<div class="wiz-prog-dot '+c+'"></div>';
        if (i<tot) h+='<div class="wiz-prog-line'+(i<cur?" done":"")+'"></div>';
    }
    return h+'</div><div class="wiz-prog-label">ステップ '+cur+' / '+tot+'</div>';
}

// ========== Section 7: 画面HTMLビルダー ==========

function buildScreenHTML(id) {
    switch(id) {
        case "start":          return buildStartScreen();
        case "q-machine":      return buildMachineScreen();
        case "q-worktype":     return buildWorkTypeScreen();
        case "q-tube-spec":    return buildTubeSpecScreen();
        case "q-tube-length":  return buildTubeLengthScreen();
        case "q-style":        return buildStyleScreen();
        case "q-yose-detail":  return buildYoseDetailScreen();
        case "q-options":      return buildOptionsScreen();
        case "q-atelength":    return buildAteLengthScreen();
        case "q-maxod":        return buildMaxODScreen();
        case "q-depths":       return buildDepthsScreen();
        case "q-drawnum":      return buildDrawNumScreen();
        case "result":         return buildResultScreen();
        default: return "<p>不明な画面</p>";
    }
}
function card(value,label,action,selected,extraClass) {
    var c="wiz-card"+(extraClass?" "+extraClass:"")+(selected?" selected":"");
    return '<button class="'+c+'" data-action="'+action+'" data-value="'+escapeHtml(value)+'"><span class="wiz-card__label">'+escapeHtml(label)+'</span></button>';
}

/* ---- スタート ---- */
function buildStartScreen() {
    return '<div class="wiz-start">'
        +'<img src="assets/icon.svg" alt="NC" class="wiz-start__icon" />'
        +'<h1 class="wiz-start__title">NCプログラム作成</h1>'
        +''
        +'<button class="wiz-btn-primary wiz-start__btn" data-action="start">開始する</button>'
        +'<button class="wiz-btn-outline wiz-start__import" data-action="import-json">前回の入力を読み込む (JSON)</button>'
        +'</div>';
}

/* ---- Q1: 機械 ---- */
function buildMachineScreen() {
    var names=typeof machines!=="undefined"?Object.keys(machines):["NCL044","NCL015","NCL085","NCL012"];
    return '<div class="wiz-question"><h2 class="wiz-q-title">使用機械を選んでください</h2>'
        +'<div class="wiz-grid wiz-grid--4">'+names.map(function(n){return card(n,n,"select-machine",wizardState.machine===n);}).join("")+'</div></div>';
}

/* ---- Q2: ワーク種別 ---- */
function buildWorkTypeScreen() {
    var groups=WORK_TYPE_GROUPS.map(function(g) {
        var items=g.items.map(function(it){return card(it.value,it.label,"select-worktype",wizardState.workType===it.value,"wiz-card--sm");}).join("");
        return '<div class="wiz-group"><div class="wiz-group__lbl">'+escapeHtml(g.label)+'</div><div class="wiz-grid">'+items+'</div></div>';
    }).join("");
    return '<div class="wiz-question"><h2 class="wiz-q-title">ワーク種別を選んでください</h2>'+groups+'</div>';
}

/* ---- Q2a/2b: チューブ ---- */
function buildTubeSpecScreen() {
    var specs=typeof tubeData!=="undefined"?Object.keys(tubeData):[];
    return '<div class="wiz-question"><h2 class="wiz-q-title">チューブ規格を選んでください</h2>'
        +'<div class="wiz-grid">'+specs.map(function(s){return card(s,s,"select-tube-spec",wizardState.tubeSpec===s);}).join("")+'</div></div>';
}
function buildTubeLengthScreen() {
    var spec=wizardState.tubeSpec;
    var lengths=typeof tubeData!=="undefined"&&tubeData[spec]&&tubeData[spec].lengths?tubeData[spec].lengths:[];
    return '<div class="wiz-question"><h2 class="wiz-q-title">長さを選んでください</h2>'
        +'<p class="wiz-q-sub">規格: '+escapeHtml(spec)+'</p>'
        +'<div class="wiz-grid">'+lengths.map(function(l){var v=String(l);return card(v,v+" mm","select-tube-length",wizardState.tubeLength===v);}).join("")+'</div></div>';
}

/* ---- Q3: スタイル ---- */
function buildStyleScreen() {
    var av=getAvailableStyles(wizardState.workType);
    var cards=av.map(function(s){
        return '<button class="wiz-card wiz-card--style'+(wizardState.internalStyle===s?" selected":"")
            +'" data-action="select-style" data-value="'+escapeHtml(s)+'">'
            +'<span class="wiz-card__num">'+(STYLE_NUMS[s]||"")+'</span>'
            +'<span class="wiz-card__label">'+escapeHtml(STYLE_LABELS[s]||s)+'</span></button>';
    }).join("");
    return '<div class="wiz-question"><h2 class="wiz-q-title">加工スタイルを選んでください</h2>'
        +(av.length===1?'<p class="wiz-q-sub">このワーク種別はスタイルが自動で決まります</p>':"")
        +'<div class="wiz-grid wiz-grid--2">'+cards+'</div></div>';
}

/* ---- Q3a: ヨセ詳細 ---- */
function buildYoseDetailScreen() {
    var isRelay=wizardState.internalStyle==="YoseRelay";
    var methodCards=[{v:"1",l:"① 同時加工（バイト1本）"},{v:"2",l:"② 別工程（バイト2本）"}]
        .map(function(o){return card(o.v,o.l,"select-yose-method",wizardState.yoseMethod===o.v,"wiz-card--sm");}).join("");
    var angleCards=["75","60","45"].map(function(a){return card(a,a+"度","select-yose-angle",wizardState.yoseAngle===a,"wiz-card--sm");}).join("");
    var relayFields=isRelay
        ?'<label class="wiz-lbl" for="yose-total-len">全長 (mm)</label><input class="wiz-input" id="yose-total-len" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.yoseTotalLength)+'" />'
         +'<label class="wiz-lbl" for="yose-partner-depth">相手径深さ (mm)</label><input class="wiz-input" id="yose-partner-depth" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.yosePartnerDepth)+'" />'
        :"";
    return '<div class="wiz-question">'
        +'<h2 class="wiz-q-title">'+(isRelay?"ヨセ中継":"ヨセ")+' の詳細を入力してください</h2>'
        +'<div class="wiz-form">'
        +'<label class="wiz-lbl">加工方法</label><div class="wiz-grid wiz-grid--2">'+methodCards+'</div>'
        +'<label class="wiz-lbl">テーパ角度</label><div class="wiz-grid wiz-grid--3">'+angleCards+'</div>'
        +'<label class="wiz-lbl" for="yose-d">相手径 Φd (mm)</label>'
        +'<input class="wiz-input" id="yose-d" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.yoseD)+'" />'
        +relayFields+'</div>'
        +'<button class="wiz-btn-primary" data-action="next-yose">次へ →</button></div>';
}

/* ---- Q3b: 追加オプション ---- */
function buildOptionsScreen() {
    var wt=wizardState.workType, isMH=isMHWorkType(wt), isG12B=wt==="G12B_G_ST_12175_8";
    var html='<div class="wiz-question"><h2 class="wiz-q-title">加工オプションを選んでください</h2><div class="wiz-form">';
    if (isMH) {
        var toolCards=[{v:"外径荒",l:"外径荒\n(T0505系)"},{v:"外径溝",l:"外径溝\n(T1010系)"}]
            .map(function(o){return card(o.v,o.l,"select-mh-tool",wizardState.mhOdTool===o.v,"wiz-card--sm");}).join("");
        html+='<label class="wiz-lbl">MH 外径バイトの種類</label><div class="wiz-grid wiz-grid--2">'+toolCards+'</div>';
    }
    if (isG12B) {
        var noseCards=[{v:"none",l:"ノーズR なし"},{v:"r05",l:"ノーズR あり (R0.5)"}]
            .map(function(o){return card(o.v,o.l,"select-g12b-noser",wizardState.g12bNoseR===o.v,"wiz-card--sm");}).join("");
        html+='<label class="wiz-lbl">根本ノーズR</label><div class="wiz-grid wiz-grid--2">'+noseCards+'</div>';
    }
    html+='</div><button class="wiz-btn-primary" data-action="next-options">次へ →</button></div>';
    return html;
}

/* ---- Q4: アテ長さ ---- */
function buildAteLengthScreen() {
    var presets=ATE_PRESETS.map(function(p){
        return '<button class="wiz-preset'+(wizardState.ateLength===p.value?" selected":"")+'" data-action="preset-atelength" data-value="'+escapeHtml(p.value)+'">'+escapeHtml(p.label)+'</button>';
    }).join("");
    return '<div class="wiz-question"><h2 class="wiz-q-title">アテ長さを入力してください</h2>'
        +'<div class="wiz-presets">'+presets+'</div>'
        +'<div class="wiz-form"><label class="wiz-lbl" for="ate-input">直接入力 (mm)</label>'
        +'<input class="wiz-input wiz-input--lg" id="ate-input" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.ateLength)+'" /></div>'
        +'<button class="wiz-btn-primary" data-action="next-atelength">次へ →</button></div>';
}

/* ---- Q5: 外径最大径（SVG 図解 + 入力埋め込み + M99P100） ---- */
function buildMaxODScreen() {
    var calcMode=wizardState.calcMode||"normal";
    var modeCards=[{v:"normal",l:"通常"},{v:"eccentric",l:"偏心"},{v:"corner",l:"角あり"},{v:"ate",l:"アテ長さから"}]
        .map(function(m){return '<button class="wiz-card wiz-card--sm'+(calcMode===m.v?" selected":"")+'" data-action="set-calc-mode" data-value="'+m.v+'">'+escapeHtml(m.l)+'</button>';}).join("");

    // SVGパネル: 計算式は calc-result-row の直上に表示
    var pN='<div id="cp-normal" class="calc-panel'+(calcMode!=="normal"?" calc-panel--hidden":"")+'">'+buildSVGNormal()+'</div>';
    var pE='<div id="cp-eccentric" class="calc-panel'+(calcMode!=="eccentric"?" calc-panel--hidden":"")+'">'+buildSVGEccentric()+'</div>';
    var pC='<div id="cp-corner" class="calc-panel'+(calcMode!=="corner"?" calc-panel--hidden":"")+'">'+buildSVGCorner()+'</div>';
    var ateOk=KAKU_ATE_VALUES.indexOf(String(wizardState.ateLength))>=0;
    var pA='<div id="cp-ate" class="calc-panel'+(calcMode!=="ate"?" calc-panel--hidden":"")+'">'+
        (ateOk?'<p class="calc-hint">アテ長さ <strong>'+escapeHtml(wizardState.ateLength)+'</strong> mm → (50 − アテ長さ) × 2 × √2</p>'
              :'<p class="calc-hint calc-hint--warn">角形アテ（42.5 / 41 / 39.5 / 37.5 / 33.25 / 28.5）を選んだ場合のみ使用できます</p>')+'</div>';

    // 計算式テキスト（モードに応じて切替、this値を使用ボタンの直上）
    var formulaMap={normal:"√(A² + B²)",eccentric:"√((A×2)² + (B×2)²)",corner:"√(((W/2+H)×2)² + W²)",ate:""};
    var formulaHtml=formulaMap[calcMode]?'<p class="calc-formula-label">'+formulaMap[calcMode]+'</p>':"";

    // M99P100（Tube以外）— 自動計算ツールの下に配置
    var m99Html="";
    if (wizardState.workType!=="Tube") {
        var m99Opts=[{v:"off",l:"使用しない"},{v:"on",l:"使用する (M99P100)"}];
        if (wizardState.workType==="M40"||wizardState.workType==="M40_MH") m99Opts.push({v:"x50u8",l:"X50.U8. (M40専用)"});
        var m99Cards=m99Opts.map(function(o){return card(o.v,o.l,"select-m99",wizardState.m99Mode===o.v,"wiz-card--sm");}).join("");
        m99Html='<div class="wiz-form wiz-m99-section"><label class="wiz-lbl">M99P100</label><div class="wiz-grid wiz-grid--2">'+m99Cards+'</div></div>';
    }

    return '<div class="wiz-question"><h2 class="wiz-q-title">外径最大径を入力してください</h2>'
        +'<p class="wiz-q-sub">ワーク外径の最大値 (mm)</p>'
        +'<div class="wiz-form">'
        +'<input class="wiz-input wiz-input--hero validate-positive" id="maxod-direct-input" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.maxOD)+'" autofocus />'
        +'</div>'
        +'<details class="wiz-calc-details"><summary class="wiz-calc-summary">自動計算ツール ▼</summary>'
        +'<div class="wiz-calc-body"><div class="wiz-grid wiz-grid--4">'+modeCards+'</div>'
        +pN+pE+pC+pA
        +formulaHtml
        +'<div class="calc-result-row"><div id="calc-result-preview" class="calc-result-preview calc-result-preview--right"></div>'
        +'<button class="wiz-btn-secondary" data-action="apply-maxod-calc">この値を使用</button></div></div></details>'
        +m99Html
        +'<button class="wiz-btn-primary" data-action="next-maxod">次へ →</button></div>';
}

/* SVG ヘルパー: arrowhead markers (ID prefix で重複回避) */
function svgArrows(pfx) {
    return '<defs><marker id="'+pfx+'-s" orient="auto" markerWidth="7" markerHeight="7" refX="0" refY="3.5"><path d="M7,0 L0,3.5 L7,7 Z" fill="#445"/></marker>'
        +'<marker id="'+pfx+'-e" orient="auto" markerWidth="7" markerHeight="7" refX="7" refY="3.5"><path d="M0,0 L7,3.5 L0,7 Z" fill="#445"/></marker></defs>';
}
/* SVG foreignObject ラッパー（SVG内入力欄）
   固定サイズ: 高さ28px（フォント11px + padding + border 込み）・幅60px（半角5桁＋余白）*/
function svgFO(x,y,_w,_h,id,val) {
    var W=60, H=28;
    return '<foreignObject x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'">'
        +'<input xmlns="http://www.w3.org/1999/xhtml" type="text" id="'+id+'" class="calc-field svg-input validate-positive"'
        +' value="'+escapeHtml(val)+'" inputmode="decimal" />'
        +'</foreignObject>';
}

/* 通常モード SVG: 矩形ワーク、対角=最大径、A=幅、B=高さ */
function buildSVGNormal() {
    var p="svgn";
    return '<svg class="calc-svg" viewBox="-53 0 287 228" role="img" aria-label="通常モード図解">'
        +svgArrows(p)
        // ワーク矩形
        +'<rect x="5" y="5" width="155" height="150" fill="#161c28" stroke="#2a3550" stroke-width="1.5" rx="2"/>'
        // 最大径 対角線
        +'<line x1="5" y1="5" x2="160" y2="155" stroke="#4a9eff" stroke-width="2"/>'
        +'<text x="72" y="76" fill="#4a9eff" font-size="11" text-anchor="middle" transform="rotate(44,72,76)">最大径</text>'
        // A 寸法矢印（下）
        +'<line x1="5" y1="168" x2="160" y2="168" stroke="#445" stroke-width="1.2" marker-start="url(#'+p+'-s)" marker-end="url(#'+p+'-e)"/>'
        +'<text x="82" y="183" fill="#7a8fa8" font-size="11" text-anchor="middle">母材幅 A</text>'
        // A 入力欄
        +svgFO(52,190,60,22,"calc-stock-a",wizardState.valStockA)
        // B 寸法矢印（右）
        +'<line x1="172" y1="5" x2="172" y2="155" stroke="#445" stroke-width="1.2" marker-start="url(#'+p+'-s)" marker-end="url(#'+p+'-e)"/>'
        +'<text x="175" y="72" fill="#7a8fa8" font-size="11">母材幅 B</text>'
        // B 入力欄
        +svgFO(174,79,60,22,"calc-stock-b",wizardState.valStockB)
        +'</svg>';
}

/* 偏心モード SVG: 矩形ワーク、赤=旋削中心、青=偏心穴軸、A=横距離、B=縦距離 */
function buildSVGEccentric() {
    var p="svge";
    return '<svg class="calc-svg" viewBox="-56 0 285 228" role="img" aria-label="偏心モード図解">'
        +svgArrows(p)
        // ワーク矩形
        +'<rect x="0" y="0" width="160" height="155" fill="#161c28" stroke="#2a3550" stroke-width="1.5" rx="2"/>'
        // 赤: 旋削中心軸（垂直、x=80）
        +'<line x1="80" y1="-6" x2="80" y2="163" stroke="#e05555" stroke-width="1.5"/>'
        // 青: 偏心穴軸（水平、y=100）
        +'<line x1="-6" y1="100" x2="168" y2="100" stroke="#4488ff" stroke-width="1.5"/>'
        // 交点
        +'<circle cx="80" cy="100" r="4" fill="white"/>'
        // A 寸法（左端→中心、水平）
        +'<line x1="0" y1="170" x2="0" y2="164" stroke="#445" stroke-width="1"/>'
        +'<line x1="80" y1="170" x2="80" y2="164" stroke="#445" stroke-width="1"/>'
        +'<line x1="0" y1="168" x2="80" y2="168" stroke="#445" stroke-width="1.2" marker-start="url(#'+p+'-s)" marker-end="url(#'+p+'-e)"/>'
        +'<text x="40" y="183" fill="#7a8fa8" font-size="11" text-anchor="middle">距離 A（横）</text>'
        +svgFO(10,190,60,22,"calc-ecc-a",wizardState.valEccA)
        // B 寸法（上端→穴軸、垂直）
        +'<line x1="168" y1="0" x2="162" y2="0" stroke="#445" stroke-width="1"/>'
        +'<line x1="168" y1="100" x2="162" y2="100" stroke="#445" stroke-width="1"/>'
        +'<line x1="166" y1="0" x2="166" y2="100" stroke="#445" stroke-width="1.2" marker-start="url(#'+p+'-s)" marker-end="url(#'+p+'-e)"/>'
        +'<text x="170" y="36" fill="#7a8fa8" font-size="11">距離 B（縦）</text>'
        +svgFO(169,42,60,22,"calc-ecc-b",wizardState.valEccB)
        +'</svg>';
}

/* 角ありモード SVG: 大きな下部矩形（幅W）の上に小矩形（高さH）が中央に乗った形状
   viewBox を通常/偏心モードと同一（-53 0 287 228）にすることで
   拡大倍率・テキスト・入力欄の見た目サイズを揃える */
function buildSVGCorner() {
    var p="svgc";
    return '<svg class="calc-svg" viewBox="-53 0 287 228" role="img" aria-label="角ありモード図解">'
        +svgArrows(p)
        // 下部大矩形（母材幅 W）— x=5〜160, y=45〜155（小矩形分だけ上に伸ばす）
        +'<rect x="5" y="45" width="155" height="110" fill="#161c28" stroke="#2a3550" stroke-width="1.5"/>'
        // 上部小矩形（追加高さ H）— 正方形(22×22), 中央配置, 底辺=下部矩形上端(y=45)
        +'<rect x="72" y="23" width="22" height="22" fill="#161c28" stroke="#2a3550" stroke-width="1.5"/>'
        // 母材幅 W 寸法矢印（下）
        +'<line x1="5" y1="168" x2="160" y2="168" stroke="#445" stroke-width="1.2" marker-start="url(#'+p+'-s)" marker-end="url(#'+p+'-e)"/>'
        +'<text x="82" y="183" fill="#7a8fa8" font-size="11" text-anchor="middle">母材幅 W</text>'
        +svgFO(52,190,60,22,"calc-corn-w",wizardState.valCornW)
        // 追加高さ H 寸法矢印（右）— y=23〜45（小矩形の高さ分のみ）、中点 y=34
        +'<line x1="172" y1="23" x2="172" y2="45" stroke="#445" stroke-width="1.2" marker-start="url(#'+p+'-s)" marker-end="url(#'+p+'-e)"/>'
        +'<text x="175" y="29" fill="#7a8fa8" font-size="11">追加高さ H</text>'
        +svgFO(174,31,60,22,"calc-corn-h",wizardState.valCornH)
        +'</svg>';
}

/* ---- Q6: 加工深さ（自動計算 + 手動切替 + クイックボタン） ---- */
function buildDepthsScreen() {
    var wt=wizardState.workType, st=wizardState.internalStyle;
    var isM12=isM12Like(wt), isG18S=isG18Small(wt);
    var isM8=typeof isM8WorkType==="function"&&isM8WorkType(wt);
    var isCross=isCrossStyle(st);
    var isRelay=st==="YoseRelay";
    var isManual=wizardState.drillDepthManual;

    // ドリルモード
    var drillModeCards=[{v:"G74",l:"G74（サイクル）"},{v:"G1",l:"G1（単動）"}]
        .map(function(o){return card(o.v,o.l,"select-drill-mode",wizardState.drillMode===o.v,"wiz-card--sm");}).join("");

    // ドリル深さ: 自動 or 手動
    var autoVal=computeDrillDepthAuto();
    var drillHtml;
    if (!isManual && autoVal!==null) {
        // 自動計算値を表示（readonly）
        drillHtml='<label class="wiz-lbl">ドリル深さ</label>'
            +'<div class="depth-auto-row" id="drill-depth-auto-row">'
            +'<span class="depth-auto-val" id="drill-depth-auto-val">'+escapeHtml(autoVal)+' mm <span class="depth-auto-badge">自動計算</span></span>'
            +'<button class="depth-manual-link" data-action="toggle-drill-manual">手動で変更</button>'
            +'</div>';
    } else {
        // 手動入力
        var quickBtns=DRILL_QUICK_BTNS.map(function(b){
            return '<button class="depth-quick-btn" data-action="quick-drill" data-value="'+b.v+'">'+b.lbl+'</button>';
        }).join("");
        drillHtml='<label class="wiz-lbl">ドリル深さ (mm)</label>'
            +'<input class="wiz-input depth-cross-field" id="drill-depth" type="text" inputmode="decimal"'
            +' value="'+escapeHtml(wizardState.drillDepth)+'" />'
            +'<div class="depth-quick-row">'+quickBtns+'</div>'
            +(autoVal!==null?'<button class="depth-manual-link" data-action="toggle-drill-manual">自動計算に戻す（'+escapeHtml(autoVal)+'mm）</button>':"");
    }

    // 一文字（M12・M8以外）: CP入力が必要
    var isIchimonjiNeedsCp = st==="Ichimonji" && !isM12Like(wt) && !(typeof isM8WorkType==="function" && isM8WorkType(wt));

    // 内径深さ / IP（ヨセ中継は自動。交差穴・一文字CP では「IP = 原点〜穴中心距離」として使用）
    var idAutoVal = isRelay ? computeIdDepthForRelay()
                 : wt==="Tube" ? computeIdDepthForTube()
                 : null;
    var idLabel = (isCross || isIchimonjiNeedsCp)
        ? (isCross
            ? 'IP（原点〜穴中心距離）(mm)<span class="depth-ip-hint"> ← CP = IP − 相手径/2</span>'
            : 'IP（原点〜一文字位置）(mm)<span class="depth-ip-hint"> ← CP = IP − ドリル径/2</span>')
        : '内径深さ (mm)';
    var idHtml;
    if (idAutoVal!==null) {
        var idAutoLabel = wt==="Tube" ? "自動（規格値）" : "自動計算";
        idHtml='<label class="wiz-lbl">内径深さ</label>'
            +'<div class="depth-auto-row"><span class="depth-auto-val">'+escapeHtml(idAutoVal)+' mm <span class="depth-auto-badge">'+idAutoLabel+'</span></span></div>';
        wizardState.idDepth = idAutoVal;
    } else {
        idHtml='<label class="wiz-lbl" for="id-depth">'+idLabel+'</label>'
            +'<input class="wiz-input depth-cross-field" id="id-depth" type="text" inputmode="decimal"'
            +' value="'+escapeHtml(wizardState.idDepth)+'" />';
    }

    // 交差穴 / 一文字CP: IP + 相手径 + CP表示
    var cpHtml="";
    if (isCross) {
        var cpComp=computeCP(wizardState.idDepth,wizardState.valPartnerD);
        var finishDepthHint="";
        if (st==="CrossSmall" && cpComp) {
            var fd=computeCrossSmallFinishDepthHint(cpComp, wizardState.valPartnerD);
            if (fd!==null) finishDepthHint='<p class="depth-finish-hint">内径仕上深さ参考値: '+escapeHtml(fd)+' mm</p>';
        }
        cpHtml='<label class="wiz-lbl" for="depth-partner-d">相手径 Φ (mm)</label>'
            +'<input class="wiz-input depth-cross-field" id="depth-partner-d" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.valPartnerD)+'" />'
            +'<label class="wiz-lbl">CP値 = IP − 相手径/2（自動計算）</label>'
            +'<input class="wiz-input" id="depth-cp-display" type="text" readonly value="'+escapeHtml(cpComp)+'"'
            +' style="background:#1a2030;color:#7ec8e3;font-weight:bold;" />'
            +finishDepthHint;
    } else if (isIchimonjiNeedsCp) {
        // 一文字（M12・M8以外）: IP + ドリル径 → CP自動計算（getIchimonjiBlock に渡す）
        var cpCompI = computeCP(wizardState.idDepth, wizardState.valPartnerD);
        cpHtml='<label class="wiz-lbl" for="depth-partner-d">ドリル径 Φ (mm)</label>'
            +'<input class="wiz-input depth-cross-field" id="depth-partner-d" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.valPartnerD)+'" />'
            +'<label class="wiz-lbl">CP値 = IP − ドリル径/2（自動計算）</label>'
            +'<input class="wiz-input" id="depth-cp-display" type="text" readonly value="'+escapeHtml(cpCompI)+'"'
            +' style="background:#1a2030;color:#7ec8e3;font-weight:bold;" />';
    }

    // M12固有
    var m12Html="";
    if (isM12&&st==="Ichimonji") {
        var ftCards=[{v:"hss",l:"HSSドリル"},{v:"hgdr",l:"HGDRドリル"}]
            .map(function(o){return card(o.v,o.l,"select-m12-ft",wizardState.m12FinishType===o.v,"wiz-card--sm");}).join("");
        m12Html='<label class="wiz-lbl">ドリル種類（一文字DR用）</label><div class="wiz-grid wiz-grid--2">'+ftCards+'</div>';
    }
    if (isM12&&st==="CrossSmall") {
        var crossOps=[{v:"hss_oku",l:"HSSドリル + 奥バイト"},{v:"hgdr_oku",l:"HGDRドリル + 奥バイト"},{v:"hss_men",l:"HSSドリル + 一文字面取り"},{v:"hgdr_men",l:"HGDRドリル + 一文字面取り"},{v:"baito_oku",l:"バイト + 奥バイト"}]
            .map(function(o){return card(o.v,o.l,"select-m12-cross",wizardState.m12CrossMethod===o.v,"wiz-card--sm");}).join("");
        m12Html+='<label class="wiz-lbl">M12 交差穴 加工方法</label><div class="wiz-grid">'+crossOps+'</div>';
    }
    if (isG18S&&st==="CrossSmall") {
        var g18Ops=[{v:"hgdr_oku",l:"HGDRドリル + 奥バイト"},{v:"hgdr_men",l:"HGDRドリル + 一文字面取り"}]
            .map(function(o){return card(o.v,o.l,"select-g18-cross",wizardState.g18CrossMethod===o.v,"wiz-card--sm");}).join("");
        m12Html+='<label class="wiz-lbl">G18 交差穴 加工方法</label><div class="wiz-grid wiz-grid--2">'+g18Ops+'</div>';
    }
    // M8 CrossSmall: 選択肢は1種固定なので情報表示のみ
    if (isM8&&st==="CrossSmall") {
        m12Html+='<p class="depth-info-note">M8 交差穴: HSSドリル + 一文字面取り（固定）</p>';
    }

    // 奥バイト: M12の交差穴加工方法から自動判定（チェックボックス廃止）
    // hss_oku / hgdr_oku / baito_oku → 奥バイトあり（情報表示のみ）
    var okuHtml="";
    if (isM12 && st==="CrossSmall") {
        var okuActive = wizardState.m12CrossMethod==="hss_oku"||wizardState.m12CrossMethod==="hgdr_oku"||wizardState.m12CrossMethod==="baito_oku";
        okuHtml='<p class="depth-info-note">奥バイト面取り: '+(okuActive?"<strong>あり</strong>（相手径 6.0mm以上時のみ出力）":"なし")+'</p>';
    }

    return '<div class="wiz-question"><h2 class="wiz-q-title">加工深さを入力してください</h2>'
        +'<div class="wiz-form">'
        +'<label class="wiz-lbl">ドリルモード</label><div class="wiz-grid wiz-grid--2">'+drillModeCards+'</div>'
        +drillHtml+idHtml+cpHtml+m12Html+okuHtml
        +'</div><button class="wiz-btn-primary" data-action="next-depths">次へ →</button></div>';
}

/* ---- Q7: 図番・作成者（M99P100はQ5へ移動済み） ---- */
function buildDrawNumScreen() {
    var revOpts=DRAW_REV_OPTIONS.map(function(v){return '<option value="'+v+'"'+(wizardState.drawRev===v?" selected":"")+'>'+(v==="NONE"?"なし":v)+'</option>';}).join("");
    var authorBtns=AUTHOR_PRESETS.map(function(n){return '<button class="wiz-author-btn" data-action="set-author" data-value="'+escapeHtml(n)+'">'+escapeHtml(n)+'</button>';}).join("");
    return '<div class="wiz-question"><h2 class="wiz-q-title">図番・作成者を入力してください</h2>'
        +'<div class="wiz-form"><label class="wiz-lbl">図番</label>'
        +'<div class="wiz-drawnum-row"><span class="wiz-fix">PM-</span>'
        +'<input class="wiz-input wiz-input--sm" id="v1a" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.drawNumA)+'" />'
        +'<span class="wiz-fix">-</span>'
        +'<input class="wiz-input wiz-input--xs" id="v1b" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.drawNumB)+'" />'
        +'<select class="wiz-select" id="v1c">'+revOpts+'</select>'
        +'<span class="wiz-fix">=No,</span>'
        +'<input class="wiz-input wiz-input--xs" id="v2" type="text" inputmode="decimal" value="'+escapeHtml(wizardState.processNum)+'" /></div>'
        +'<label class="wiz-lbl" for="worker-name">作成者</label>'
        +'<input class="wiz-input" id="worker-name" type="text" value="'+escapeHtml(wizardState.workerName)+'" />'
        +'<div class="wiz-author-presets">'+authorBtns+'</div></div>'
        +'<button class="wiz-btn-primary" data-action="next-drawnum">Gコードを生成する →</button></div>';
}

/* ---- 結果 ---- */
function buildResultScreen() {
    return '<div class="wiz-result" id="result-wrap"><p class="wiz-generating">Gコードを生成中...</p></div>';
}

// ========== Section 8: 計算補助 ==========

function computeCP(idDepth,partnerD) {
    var d=parseFloat(idDepth),p=parseFloat(partnerD);
    if (isNaN(d)||isNaN(p)) return "";
    return (d-p/2).toFixed(3);
}

/* チューブ内径深さ自動計算（tubeData[spec].id から取得） */
function computeIdDepthForTube() {
    if (wizardState.workType !== "Tube") return null;
    if (typeof tubeData === "undefined" || !tubeData[wizardState.tubeSpec]) return null;
    return String(tubeData[wizardState.tubeSpec].id);
}

/* ドリル深さ自動計算（logic.js の関数を使用）
   DOM が存在する場合は DOM の現在値を優先して参照する */
function computeDrillDepthAuto() {
    var wt=wizardState.workType, st=wizardState.internalStyle;

    // Tube: ドリル深さ = チューブ長さ
    if (wt === "Tube") {
        var tl = parseFloat(wizardState.tubeLength);
        return !isNaN(tl) ? String(tl) : null;
    }

    // 内径深さ: DOM 優先（同一画面でリアルタイム計算するため）
    var idDomEl=document.getElementById("id-depth");
    var idD=parseFloat(idDomEl?idDomEl.value:wizardState.idDepth);

    // CP: DOM の ip/partnerD から直接計算（wizardState.cpVal は確定時のみ更新されるため）
    var ipVal=idDomEl?idDomEl.value:wizardState.idDepth;
    var pdDomEl=document.getElementById("depth-partner-d");
    var pdVal=pdDomEl?pdDomEl.value:wizardState.valPartnerD;
    var cpLive=computeCP(ipVal,pdVal);
    var cp=parseFloat(cpLive||wizardState.cpVal);

    // Hirazoko / Ichimonji: logic.js は idDepth + 0.1 を finalDrillDepth に使用する
    if (st==="Hirazoko"||st==="Ichimonji") {
        return !isNaN(idD) ? (idD+0.1).toFixed(3) : null;
    }
    // M12/G18small + CrossSmall: cp + 1.2 + 1
    if ((isM12Like(wt)||isG18Small(wt))&&st==="CrossSmall") {
        return !isNaN(cp) ? (cp+1.2+1).toFixed(3) : null;
    }
    // 他の CrossSmall: calcSpecialDrillZ(style, drillDia, cp)
    if (isCrossStyle(st)) {
        if (typeof calcSpecialDrillZ==="undefined"||typeof DRILL_DIA_MAP==="undefined") return null;
        var dd=DRILL_DIA_MAP[wt]||0; if (!dd||isNaN(cp)) return null;
        var z=calcSpecialDrillZ(st,dd,cp); return z!==null?String(z):null;
    }
    // Yose: calcSpecialDrillZ(style, drillDia, idDepth)
    if (st==="Yose") {
        if (typeof calcSpecialDrillZ==="undefined"||typeof DRILL_DIA_MAP==="undefined") return null;
        var dd2=DRILL_DIA_MAP[wt]||0; if (!dd2||isNaN(idD)) return null;
        var z2=calcSpecialDrillZ(st,dd2,idD); return z2!==null?String(z2):null;
    }
    // YoseRelay: calcYoseRelayMetrics
    if (st==="YoseRelay") {
        if (typeof calcYoseRelayMetrics==="undefined") return null;
        var m=calcYoseRelayMetrics({workType:wt,tubeSpec:wizardState.tubeSpec,
            yoseTotalLength:wizardState.yoseTotalLength,yosePartnerDepth:wizardState.yosePartnerDepth,
            yoseD:wizardState.yoseD,yoseAngle:wizardState.yoseAngle});
        if (!m) return null;
        if (!isNaN(m.relayIdDepth)&&isFinite(m.relayIdDepth)) wizardState.idDepth=m.relayIdDepth.toFixed(3);
        return (!isNaN(m.relayDrillDepth)&&isFinite(m.relayDrillDepth))?m.relayDrillDepth.toFixed(3):null;
    }
    return null;
}

/* YoseRelay の内径深さ自動計算 */
function computeIdDepthForRelay() {
    if (wizardState.internalStyle!=="YoseRelay") return null;
    if (typeof calcYoseRelayMetrics==="undefined") return null;
    var m=calcYoseRelayMetrics({workType:wizardState.workType,tubeSpec:wizardState.tubeSpec,
        yoseTotalLength:wizardState.yoseTotalLength,yosePartnerDepth:wizardState.yosePartnerDepth,
        yoseD:wizardState.yoseD,yoseAngle:wizardState.yoseAngle});
    if (!m||isNaN(m.relayIdDepth)||!isFinite(m.relayIdDepth)) return null;
    wizardState.idDepth=m.relayIdDepth.toFixed(3);
    return m.relayIdDepth.toFixed(3);
}

/* CrossSmall 仕上げ深さ参考値（グレー表示用）
   partnerD: DOMの現在値を呼び出し元から渡す（wizardState.valPartnerDは確定前は古い値のため） */
function computeCrossSmallFinishDepthHint(cpVal, partnerD) {
    if (typeof calcCrossSmallFinishDepth==="undefined") return null;
    var pd = (partnerD !== undefined) ? partnerD : wizardState.valPartnerD;
    var d=calcCrossSmallFinishDepth({cpVal:cpVal,valPartnerD:pd,workType:wizardState.workType,tubeSpec:wizardState.tubeSpec});
    return (isNaN(d)||!isFinite(d))?null:d.toFixed(3);
}

/* 外径最大径自動計算 */
function computeMaxOdResult() {
    var mode=wizardState.calcMode;
    if (mode==="normal") { var A=parseFloat((document.getElementById("calc-stock-a")||{value:""}).value),B=parseFloat((document.getElementById("calc-stock-b")||{value:""}).value); if(isNaN(A)||isNaN(B))return null; return Math.sqrt(A*A+B*B).toFixed(3); }
    if (mode==="eccentric") { var Ae=parseFloat((document.getElementById("calc-ecc-a")||{value:""}).value),Be=parseFloat((document.getElementById("calc-ecc-b")||{value:""}).value); if(isNaN(Ae)||isNaN(Be))return null; return Math.sqrt(Math.pow(Ae*2,2)+Math.pow(Be*2,2)).toFixed(2); }
    if (mode==="corner") { var W=parseFloat((document.getElementById("calc-corn-w")||{value:""}).value),H=parseFloat((document.getElementById("calc-corn-h")||{value:""}).value); if(isNaN(W)||isNaN(H))return null; var dY=(W/2+H)*2; return Math.sqrt(dY*dY+W*W).toFixed(2); }
    if (mode==="ate") { var ate=parseFloat(wizardState.ateLength); if(isNaN(ate)||KAKU_ATE_VALUES.indexOf(String(wizardState.ateLength))<0)return null; return ((50-ate)*2*Math.SQRT2).toFixed(2); }
    return null;
}
function updateCalcPreview() {
    var el=document.getElementById("calc-result-preview"); if(!el) return;
    var r=computeMaxOdResult();
    if (r!==null){el.textContent="計算結果: "+r+" mm";el.className="calc-result-preview calc-result-preview--right calc-result-preview--ready";}
    else{el.textContent="";el.className="calc-result-preview calc-result-preview--right";}
}
function bindCalcInputs() {
    document.querySelectorAll(".calc-field").forEach(function(inp){inp.addEventListener("input",updateCalcPreview);});
    updateCalcPreview();
}
function updateCPDisplay() {
    var id=(document.getElementById("id-depth")||{value:""}).value;
    var pd=(document.getElementById("depth-partner-d")||{value:""}).value;
    var el=document.getElementById("depth-cp-display"); if(el) el.value=computeCP(id,pd);
    // CrossSmall 仕上げ深さ参考値も更新
    var cpV=computeCP(id,pd);
    var hint=document.querySelector(".depth-finish-hint");
    if (hint&&wizardState.internalStyle==="CrossSmall"&&cpV) {
        var fd=computeCrossSmallFinishDepthHint(cpV, pd);
        hint.textContent=fd?"内径仕上深さ参考値: "+fd+" mm":"";
    }
    // drillDepth 自動計算表示も更新
    updateDrillDepthDisplay();
}
/* drillDepth 自動計算バッジ（#drill-depth-auto-val）をリアルタイムで更新 */
function updateDrillDepthDisplay() {
    if (wizardState.drillDepthManual) return;
    var autoRow=document.getElementById("drill-depth-auto-row");
    var autoValEl=document.getElementById("drill-depth-auto-val");
    if (!autoRow||!autoValEl) return; // 手動入力モード（#drill-depth-auto-row が存在しない）
    var newVal=computeDrillDepthAuto();
    if (newVal!==null) {
        autoValEl.innerHTML=escapeHtml(newVal)+' mm <span class="depth-auto-badge">自動計算</span>';
        wizardState.drillDepth=newVal;
    } else {
        autoValEl.innerHTML='<span style="color:var(--text-sub)">入力値を確認中...</span>';
    }
}
function bindDepthInputs() {
    // CP + drillDepth 連動: 全 depth-cross-field + id-depth を監視
    document.querySelectorAll(".depth-cross-field, #id-depth").forEach(function(inp){
        inp.addEventListener("input",updateCPDisplay);
    });
}
function initDrillAutoCalc() {
    // 自動計算値をstateに書き込む（手動でない場合）
    if (!wizardState.drillDepthManual) {
        var av=computeDrillDepthAuto();
        if (av!==null) wizardState.drillDepth=av;
    }
    computeIdDepthForRelay(); // YoseRelay: idDepthを自動セット
    // Tube: idDepthをtubeDataから自動セット
    if (wizardState.workType === "Tube") {
        var tubId = computeIdDepthForTube();
        if (tubId !== null) wizardState.idDepth = tubId;
    }
}

// ========== Section 9: JSON インポート/エクスポート ==========

function exportStateJson() {
    var data=Object.assign({},wizardState,{_version:2,_type:"nc-gui-v2",_exported:new Date().toISOString()});
    var a=wizardState.drawNumA||"noname", b=wizardState.drawNumB||"", c=wizardState.drawRev!=="NONE"?wizardState.drawRev:"";
    var dt=new Date(), ds=dt.getFullYear()+String(dt.getMonth()+1).padStart(2,"0")+String(dt.getDate()).padStart(2,"0");
    var fname="NC-V2-INPUT_PM-"+a+"-"+b+c+"_"+ds+".json";
    var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    var url=URL.createObjectURL(blob);
    var el=document.createElement("a"); el.href=url; el.download=fname;
    document.body.appendChild(el); el.click(); document.body.removeChild(el); URL.revokeObjectURL(url);
    showToast("入力値を保存しました: "+fname);
}

function importStateJson() {
    var inp=document.createElement("input"); inp.type="file"; inp.accept=".json,application/json";
    inp.onchange=function() {
        var file=inp.files[0]; if(!file) return;
        var reader=new FileReader();
        reader.onload=function(e) {
            try {
                var data=JSON.parse(e.target.result);
                if (!data||data._type!=="nc-gui-v2") { showToast("NC v2 入力JSONではありません"); return; }
                Object.keys(wizardState).forEach(function(k){ if (k in data&&!k.startsWith("_")) wizardState[k]=data[k]; });
                // 戻るスタックをインポートデータのパスに応じて動的に構築
                var stack=["start","q-machine","q-worktype"];
                if (wizardState.workType==="Tube") {
                    stack.push("q-tube-spec","q-tube-length");
                } else {
                    stack.push("q-style");
                    if (wizardState.internalStyle==="YoseRelay"||wizardState.internalStyle==="Yose") stack.push("q-yose-detail");
                    if (isMHWorkType(wizardState.workType)||wizardState.workType==="G12B_G_ST_12175_8") stack.push("q-options");
                }
                stack.push("q-atelength","q-maxod","q-depths");
                screenStack=stack;
                renderScreen("q-drawnum");
                showToast("インポート完了: "+file.name);
            } catch(err) { showToast("読み込み失敗: "+err.message); }
        };
        reader.readAsText(file);
    };
    document.body.appendChild(inp); inp.click(); document.body.removeChild(inp);
}

// ========== Section 10: イベント処理 ==========

function handleAction(action, value) {
    switch(action) {
        case "start": screenStack=[]; advance("start"); break;
        case "select-machine":   wizardState.machine=value; advance("q-machine"); break;
        case "select-worktype":
            wizardState.workType=value;
            wizardState.internalStyle=value==="J_M8_300"?"CrossSmall":null;
            wizardState.drillDepthManual=false;
            advance("q-worktype"); break;
        case "select-tube-spec":   wizardState.tubeSpec=value; wizardState.tubeLength=""; advance("q-tube-spec"); break;
        case "select-tube-length": wizardState.tubeLength=value; advance("q-tube-length"); break;
        case "select-style":
            wizardState.internalStyle=value; wizardState.drillDepthManual=false; advance("q-style"); break;
        case "select-yose-method":
            wizardState.yoseMethod=value;
            document.querySelectorAll("[data-action='select-yose-method']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "select-yose-angle":
            wizardState.yoseAngle=value;
            document.querySelectorAll("[data-action='select-yose-angle']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "next-yose":
            wizardState.yoseAngle    =wizardState.yoseAngle||"60";
            wizardState.yoseMethod   =wizardState.yoseMethod||"2";
            wizardState.yoseD        =(document.getElementById("yose-d")||{value:""}).value.trim();
            wizardState.yoseTotalLength=(document.getElementById("yose-total-len")||{value:""}).value.trim();
            wizardState.yosePartnerDepth=(document.getElementById("yose-partner-depth")||{value:""}).value.trim();
            advance("q-yose-detail"); break;
        case "select-mh-tool":
            wizardState.mhOdTool=value;
            document.querySelectorAll("[data-action='select-mh-tool']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "select-g12b-noser":
            wizardState.g12bNoseR=value;
            document.querySelectorAll("[data-action='select-g12b-noser']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "next-options": advance("q-options"); break;
        case "preset-atelength":
            wizardState.ateLength=value;
            var ateInp=document.getElementById("ate-input"); if(ateInp) ateInp.value=value;
            document.querySelectorAll("[data-action='preset-atelength']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "next-atelength":
            wizardState.ateLength=(document.getElementById("ate-input")||{value:""}).value.trim();
            if(!wizardState.ateLength){showToast("アテ長さを入力してください");return;}
            advance("q-atelength"); break;
        case "set-calc-mode":
            wizardState.calcMode=value;
            document.querySelectorAll("[data-action='set-calc-mode']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            ["normal","eccentric","corner","ate"].forEach(function(m){var el=document.getElementById("cp-"+m);if(el)el.classList.toggle("calc-panel--hidden",m!==value);});
            // 計算式ラベルを更新
            (function(){
                var fmap={normal:"√(A² + B²)",eccentric:"√((A×2)² + (B×2)²)",corner:"√(((W/2+H)×2)² + W²)",ate:""};
                var fl=document.querySelector(".calc-formula-label");
                if(fl){fl.textContent=fmap[value]||"";}
            })();
            updateCalcPreview(); break;
        case "apply-maxod-calc": {
            wizardState.valStockA=(document.getElementById("calc-stock-a")||{value:""}).value;
            wizardState.valStockB=(document.getElementById("calc-stock-b")||{value:""}).value;
            wizardState.valEccA  =(document.getElementById("calc-ecc-a")||{value:""}).value;
            wizardState.valEccB  =(document.getElementById("calc-ecc-b")||{value:""}).value;
            wizardState.valCornW =(document.getElementById("calc-corn-w")||{value:""}).value;
            wizardState.valCornH =(document.getElementById("calc-corn-h")||{value:""}).value;
            var r=computeMaxOdResult();
            if(r!==null){wizardState.maxOD=r;var inp=document.getElementById("maxod-direct-input");if(inp)inp.value=r;showToast("外径最大径を "+r+" mm に設定しました");}
            else showToast("入力値を確認してください");
            break;
        }
        case "select-m99":
            wizardState.m99Mode=value;
            document.querySelectorAll("[data-action='select-m99']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "next-maxod":
            wizardState.maxOD=(document.getElementById("maxod-direct-input")||{value:""}).value.trim();
            // 自動計算ツールの入力値を「この値を使用」を押さなくても保存する
            wizardState.valStockA=(document.getElementById("calc-stock-a")||{value:""}).value;
            wizardState.valStockB=(document.getElementById("calc-stock-b")||{value:""}).value;
            wizardState.valEccA  =(document.getElementById("calc-ecc-a")||{value:""}).value;
            wizardState.valEccB  =(document.getElementById("calc-ecc-b")||{value:""}).value;
            wizardState.valCornW =(document.getElementById("calc-corn-w")||{value:""}).value;
            wizardState.valCornH =(document.getElementById("calc-corn-h")||{value:""}).value;
            if(!wizardState.maxOD){showToast("外径最大径を入力してください");return;}
            advance("q-maxod"); break;
        case "toggle-drill-manual": {
            var curVal=(document.getElementById("drill-depth")||{value:""}).value;
            if (wizardState.drillDepthManual) {
                // 自動に戻す
                wizardState.drillDepthManual=false;
                wizardState.drillDepth="";
            } else {
                // 手動に切替
                wizardState.drillDepthManual=true;
                if (curVal) wizardState.drillDepth=curVal;
            }
            renderScreen("q-depths"); break;
        }
        case "quick-drill":
            wizardState.drillDepth=value;
            var di=document.getElementById("drill-depth"); if(di){di.value=value;}
            break;
        case "select-drill-mode":
            wizardState.drillMode=value;
            document.querySelectorAll("[data-action='select-drill-mode']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "select-m12-ft":
            wizardState.m12FinishType=value;
            document.querySelectorAll("[data-action='select-m12-ft']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "select-m12-cross":
            wizardState.m12CrossMethod=value;
            document.querySelectorAll("[data-action='select-m12-cross']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "select-g18-cross":
            wizardState.g18CrossMethod=value;
            document.querySelectorAll("[data-action='select-g18-cross']").forEach(function(b){b.classList.toggle("selected",b.dataset.value===value);});
            break;
        case "next-depths":
            // 自動計算値を最終確定
            if (!wizardState.drillDepthManual) {
                var av2=computeDrillDepthAuto();
                if (av2!==null) wizardState.drillDepth=av2;
            } else {
                wizardState.drillDepth=(document.getElementById("drill-depth")||{value:""}).value.trim();
            }
            wizardState.idDepth=(document.getElementById("id-depth")||{value:wizardState.idDepth}).value||wizardState.idDepth;
            wizardState.valPartnerD=(document.getElementById("depth-partner-d")||{value:""}).value.trim();
            wizardState.cpVal=computeCP(wizardState.idDepth,wizardState.valPartnerD);
            // 奥バイトは m12CrossMethod から自動判定 - ここでは何もしない
            advance("q-depths"); break;
        case "set-author":
            wizardState.workerName=value;
            var wi=document.getElementById("worker-name"); if(wi) wi.value=value; break;
        case "next-drawnum":
            wizardState.drawNumA  =(document.getElementById("v1a")||{value:""}).value.trim();
            wizardState.drawNumB  =(document.getElementById("v1b")||{value:"2"}).value.trim();
            wizardState.drawRev   =(document.getElementById("v1c")||{value:"NONE"}).value;
            wizardState.processNum=(document.getElementById("v2")||{value:"1"}).value.trim();
            wizardState.workerName=(document.getElementById("worker-name")||{value:""}).value.trim();
            if(!wizardState.drawNumA)  {showToast("図番を入力してください");  return;}
            if(!wizardState.workerName){showToast("作成者を入力してください");return;}
            advance("q-drawnum"); break;
        case "copy-gcode": {
            var el2=document.getElementById("resultArea");
            var txt=el2?(el2.dataset.plain||el2.textContent):"";
            navigator.clipboard.writeText(txt).then(function(){showToast("コピーしました ✓");}).catch(function(){showToast("コピーに失敗しました");});
            break;
        }
        case "save-gcode": {
            var sel=document.getElementById("resultArea");
            var sText=sel?(sel.dataset.plain||sel.textContent):"";
            var blob2=new Blob([sText],{type:"text/plain"});
            var url2=URL.createObjectURL(blob2);
            var a2=document.createElement("a"); a2.href=url2; a2.download=buildFileName();
            document.body.appendChild(a2);a2.click();document.body.removeChild(a2);URL.revokeObjectURL(url2);
            break;
        }
        case "export-json": exportStateJson(); break;
        case "import-json": importStateJson(); break;
        case "restart":
            wizardState={machine:null,workType:null,tubeSpec:"",tubeLength:"",internalStyle:null,
                yoseMethod:"2",yoseAngle:"60",yoseD:"",yoseTotalLength:"",yosePartnerDepth:"",
                maxOD:"",calcMode:"normal",valStockA:"",valStockB:"",valEccA:"",valEccB:"",valCornW:"",valCornH:"",
                ateLength:"",drillMode:"G74",drillDepth:"",drillDepthManual:false,idDepth:"",
                mhOdTool:"外径荒",g12bNoseR:"none",m12FinishType:"hss",m12CrossMethod:"hss_oku",g18CrossMethod:"hgdr_oku",
                valPartnerD:"",cpVal:"",okuBiteEnabled:false,m99Mode:"off",
                drawNumA:"",drawNumB:"2",drawRev:"NONE",processNum:"1",workerName:""};
            screenStack=[]; renderScreen("start"); break;
    }
}

function showToast(msg) {
    var old=document.querySelector(".wiz-toast"); if(old) old.remove();
    var t=document.createElement("div"); t.className="wiz-toast"; t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(function(){t.classList.add("wiz-toast--show");},10);
    setTimeout(function(){t.classList.remove("wiz-toast--show");setTimeout(function(){t.remove();},300);},2500);
}

// ========== Section 11: Gコード生成 ==========

function resolveM12Profile() {
    var st=wizardState.internalStyle;
    if (st==="Ichimonji") return {finishType:wizardState.m12FinishType||"hss",profile:"drill_ichi_hira"};
    if (st==="Normal")    return {finishType:"baito",profile:"baito_no"};
    if (st==="YoseRelay") return {finishType:"halfmoon",profile:"drill_ichi_hira"};
    if (st==="CrossSmall") {
        var map={hss_oku:{finishType:"hss",profile:"cross_oku"},hgdr_oku:{finishType:"halfmoon",profile:"cross_oku"},
            hss_men:{finishType:"hss",profile:"drill_ichi_men"},hgdr_men:{finishType:"halfmoon",profile:"drill_ichi_men"},baito_oku:{finishType:"baito",profile:"baito_oku"}};
        return map[wizardState.m12CrossMethod||"hss_oku"]||{finishType:"hss",profile:"cross_oku"};
    }
    return {finishType:"hss",profile:"drill_ichi_hira"};
}
function resolveG18Profile() {
    var map={hgdr_oku:{finishType:"halfmoon",profile:"cross_oku"},hgdr_men:{finishType:"halfmoon",profile:"drill_ichi_men"}};
    return map[wizardState.g18CrossMethod||"hgdr_oku"]||{finishType:"halfmoon",profile:"cross_oku"};
}

function buildInputFromState() {
    var m12r=resolveM12Profile(), g18r=resolveG18Profile();
    var isM8=typeof isM8WorkType==="function"&&isM8WorkType(wizardState.workType);
    return {
        drawNumA:wizardState.drawNumA, drawNumB:wizardState.drawNumB, drawRev:wizardState.drawRev,
        processNum:wizardState.processNum, workerName:wizardState.workerName,
        ateLength:wizardState.ateLength, maxOD:wizardState.maxOD,
        drillDepth:wizardState.drillDepth, idDepth:wizardState.idDepth, drillMode:wizardState.drillMode||"G74",
        workType:wizardState.workType, internalStyle:wizardState.internalStyle||"",
        m99Mode:wizardState.workType==="Tube"?"off":(wizardState.m99Mode||"off"),
        m99p100:wizardState.m99Mode==="on",
        mhOdTool:wizardState.mhOdTool||"外径荒", g12bNoseR:wizardState.g12bNoseR||"none",
        m12FinishType:isM12Like(wizardState.workType)?m12r.finishType:"hss",
        m12Profile:isM12Like(wizardState.workType)?m12r.profile:"drill_ichi_hira",
        m12BaitoDrillMode:"G1",
        g18FinishType:isG18Small(wizardState.workType)?g18r.finishType:"halfmoon",
        g18Profile:isG18Small(wizardState.workType)?g18r.profile:"cross_oku",
        m8Profile:isM8?"drill_ichi_men":"hss_oku",
        cpVal:wizardState.cpVal, valPartnerD:wizardState.valPartnerD,
        // 奥バイトは加工方法から自動判定（cross_oku または baito_oku なら true）
        okuBiteEnabled: isM12Like(wizardState.workType)
            ? (wizardState.m12CrossMethod==="hss_oku"||wizardState.m12CrossMethod==="hgdr_oku"||wizardState.m12CrossMethod==="baito_oku")
            : false,
        yoseMethod:wizardState.yoseMethod, yoseAngle:wizardState.yoseAngle, yoseD:wizardState.yoseD,
        yoseTotalLength:wizardState.yoseTotalLength, yosePartnerDepth:wizardState.yosePartnerDepth,
        tubeSpec:wizardState.tubeSpec, tubeLength:wizardState.tubeLength,
        calcMode:wizardState.calcMode||"normal", lastAppliedCalcMode:wizardState.calcMode||"normal",
        valCornW:wizardState.valCornW, valCornH:wizardState.valCornH,
    };
}
function buildFileName() {
    var a=wizardState.drawNumA||"XXX", b=wizardState.drawNumB||"2";
    var c=wizardState.drawRev!=="NONE"?wizardState.drawRev:"";
    return "PM-"+a+"-"+b+c+"=No,"+(wizardState.processNum||"1")+"_"+(wizardState.workerName||"")+".txt";
}

function runGeneration() {
    currentInternalStyle=wizardState.internalStyle||"";
    var input=buildInputFromState();
    var result=generateGCode(input,wizardState.machine);
    var wrap=document.getElementById("result-wrap"); if(!wrap) return;
    var plain=result.plainText||"";

    var rows=[
        ["機械",wizardState.machine],["ワーク種別",wizardState.workType],
        ["加工スタイル",wizardState.workType==="Tube"?"（チューブ）":(STYLE_LABELS[wizardState.internalStyle]||wizardState.internalStyle||"")],
        ["M99P100",wizardState.m99Mode],["アテ長さ",wizardState.ateLength+" mm"],
        ["外径最大径",wizardState.maxOD+" mm"],["ドリル深さ",wizardState.drillDepth+" mm"],
        [isCrossStyle(wizardState.internalStyle)?"IP（穴中心距離）":"内径深さ", wizardState.idDepth+" mm"],
        ["図番","PM-"+(wizardState.drawNumA||"")+"-"+(wizardState.drawNumB||"")+(wizardState.drawRev!=="NONE"?wizardState.drawRev:"")+" =No,"+(wizardState.processNum||"")],
        ["作成者",wizardState.workerName],
    ].map(function(r){return '<div class="wiz-sum-row"><span class="wiz-sum-key">'+escapeHtml(r[0])+'</span><span class="wiz-sum-val">'+escapeHtml(r[1]||"")+'</span></div>';}).join("");

    wrap.innerHTML=
        '<details class="wiz-summary"><summary>入力内容を確認</summary>'+rows+'</details>'
        +'<div class="wiz-gcode-wrap">'
        +'<pre id="resultArea" class="wiz-gcode" data-plain="'+escapeHtml(plain)+'">'+(result.displayHtml||escapeHtml(plain))+'</pre>'
        +'</div>'
        +'<div class="wiz-result-actions">'
        +'<button class="wiz-btn-secondary" data-action="copy-gcode">コピー</button>'
        +'<button class="wiz-btn-secondary" data-action="save-gcode">Gコード保存</button>'
        +'<button class="wiz-btn-secondary" data-action="export-json">入力値保存 (JSON)</button>'
        +'<button class="wiz-btn-outline"   data-action="restart">最初からやり直す</button>'
        +'</div>';
}


// ========== Section 12: バリデーション ==========

function initValidation() {
    document.querySelectorAll(".validate-positive").forEach(function(el) {
        if (el.dataset.valBound) return;
        el.dataset.valBound = "1";
        el.addEventListener("input", function() { validatePositive(el); });
        el.addEventListener("blur",  function() { validatePositive(el); });
    });
}
function validatePositive(el) {
    var v = el.value.trim();
    var errId = el.id+"-err";
    var existing = document.getElementById(errId);
    if (v === "") {
        el.classList.remove("wiz-input--invalid");
        if (existing) existing.remove();
        return true;
    }
    var num = parseFloat(v);
    if (isNaN(num) || num <= 0) {
        el.classList.add("wiz-input--invalid");
        if (!existing) {
            var e = document.createElement("div");
            e.id = errId; e.className = "wiz-field-error";
            e.textContent = "正の数値を入力してください";
            el.parentNode.insertBefore(e, el.nextSibling);
        }
        return false;
    }
    el.classList.remove("wiz-input--invalid");
    if (existing) existing.remove();
    return true;
}

// ========== Section 13: 初期化 ==========

document.addEventListener("DOMContentLoaded", function() {
    var backBtn=$id("wiz-back-btn"); if(backBtn) backBtn.addEventListener("click",goBack);

    // 全 data-action クリックを document で委譲捕捉
    document.addEventListener("click", function(e) {
        var btn=e.target.closest("[data-action]"); if(!btn) return;
        handleAction(btn.dataset.action,btn.dataset.value);
    });

    // input イベントでバリデーションを委譲実行
    document.addEventListener("input", function(e) {
        var el = e.target;
        if (el.classList.contains("validate-positive")) validatePositive(el);
    });

    // Enter キーで画面内の「次へ」ボタンをクリック
    document.addEventListener("keydown", function(e) {
        if (e.key !== "Enter") return;
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === "BUTTON" || tag === "TEXTAREA" || tag === "SELECT") return;
        var main = document.getElementById("wiz-main");
        if (!main) return;
        var prim = main.querySelector(".wiz-btn-primary[data-action]");
        if (prim) { e.preventDefault(); prim.click(); }
    });

    renderScreen("start");
});
