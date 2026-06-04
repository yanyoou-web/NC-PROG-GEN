/**
 * UI 文言（ja / en / vi）
 * 入力値の localStorage 保存は行わない。言語のみ sessionStorage に保持。
 */
(function () {
    const STORAGE_KEY = "ncUiLang";

    const T = {
        ja: {
            pageTitle: "NCプログラム作成",
            formAria: "ファイル情報・機械・ワークと基本入力",
            uiLanguage: "表示言語",
            fileInfo: "ファイル情報",
            machineSelect: "機械選択",
            machineLabel: "使用機械",
            workType: "ワーク種別",
            workTypeTube: "チューブ",
            m12DrillTypeLabel: "ドリル種類",
            m12DrillTypeHss: "HSSドリル",
            m12DrillTypeHgdr: "HGDRドリル",
            m12CrossMethodLabel: "加工方法",
            m12CrossHssOku: "HSSドリル + 奥バイト面取り",
            m12CrossHgdrOku: "HGDRドリル + 奥バイト面取り",
            m12CrossHssMen: "HSSドリル + 一文字面取り",
            m12CrossHgdrMen: "HGDRドリル + 一文字面取り",
            m12CrossBaitoOku: "バイト + 奥バイト面取り",
            templateLabel: "テンプレート",
            templatePick: "-- 選択 --",
            revNone: "なし",
            machineWorkHeading: "機械・ワーク選択",
            basicInfo: "基本情報",
            ateLength: "アテ長さ",
            ateLengthPick: "-- 選択 --",
            author: "作成者",
            phManual: "手入力",
            phDirect: "直接入力",
            machiningSettings: "加工設定",
            tubeSpec: "チューブ規格選択",
            tubeSpecLabel: "チューブ規格",
            tubePick: "-- 規格を選択 --",
            tubeLen: "長さ(L)",
            styleHint: "",
            maxDiaMode: "最大径 計算モード",
            modeNormal: "通常",
            modeEcc: "偏心",
            modeCorner: "角あり",
            distA: "距離 A (横)",
            distB: "距離 B (縦)",
            stockA: "母材 A",
            stockB: "母材 B",
            phEx: "例: 15.0",
            eccHint: "※ 自動計算: √(2A)² + (2B)²\nA・B は加工中心から素材端面までの距離（遠い側）\nA = 横方向、B = 縦方向",
            normalStockHint: "※ 自動計算: √(A² + B²)",
            stockW: "母材 幅",
            addH: "追加 高さ",
            cornerHint: "※ 自動計算: √{2(幅/2 + 高さ)}² + 幅²",
            internalStyle: "内径スタイル",
            styleUnselected: "未選択",
            style1: "1. 内径バイト平底",
            style2: "2. 一文字DR平底",
            style3: "3. 通常バイト加工",
            styleNormalNote: "自動計算されないモードで任意深さに設定可能\n同内径プログラムなどに使用してください",
            style4: "4. ヨセ中継",
            style5Relay: "5. ヨセ",
            yoseRelayNote: "ヨセ中継: 1工程目内径深さの計算専用です。",
            style5: "5. 交差穴\n加工径大",
            style6: "6. 横穴＆中バリ処理",
            style8: "8. 中継\n(未実装)",
            cpDist: "原点〜相手中心距離",
            cpPartnerD: "相手径 (Φ)",
            cpUsesIdDepthHint:
                "※ CP計算の「原点〜相手中心距離」は、右列の「内径深さ (図面値)」と同じ寸法です（そちらにのみ入力してください）。",
            cpAuto: "CP (自動計算)",
            cpPlaceholder: "自動計算",
            okuTitle: "奥バイト面取り (M12専用)",
            okuChk: "奥バイト面取りを行う",
            okuHint: "※ 相手径が6.0mm以上の場合のみ出力されます",
            yoseMethod: "加工方法",
            yoseAngle: "テーパ角度",
            yoseD: "相手径 (Φd)",
            yoseTotalLength: "全長",
            yosePartnerDepth: "相手径深さ",
            yoseOpposedDistance: "対向口径距離",
            yoseLength: "ヨセ長さ",
            yoseTaiLength: "対ヨセ長さ",
            maxOD: "外径最大径",
            maxOdFocusHint:
                "※ 図面の外径最大径を半角数値で入力。算出する場合はこの欄をクリックして最大径 計算モードを開いてください。",
            ateLengthFocusHint:
                "※ チャックのアテ長さ。プリセット(15角=42.5 など）を選ぶか、半角数値で直接入力。最大径計算モード「アテ長さ」選択時に外径最大径の自動算出に使われます。",
            valStockAFocusHint:
                "※ 通常モード: 素材の外径寸法 A を半角 mm で入力。B と合わせて √(A²+B²) で外径最大径を算出します。",
            valStockBFocusHint:
                "※ 通常モード: 素材の外径寸法 B を半角 mm で入力。A と合わせて √(A²+B²) で外径最大径を算出します。",
            valAFocusHint: "※ 偏心モード: 軸中心から加工中心までの距離 A(横方向)を半角で入力。",
            valBFocusHint: "※ 偏心モード: 軸中心から加工中心までの距離 B(縦方向)を半角で入力。",
            valCornWFocusHint: "※ 角ありモード: 素材の幅寸法を半角 mm で入力。",
            valCornHFocusHint: "※ 角ありモード: 角の追加高さ寸法を半角 mm で入力。",
            idDepthFocusHint:
                "※ 図面の内径深さ（穴の深さ）を半角 mm で入力。交差穴（加工径小）スタイルでは穴交差点の距離 IP を入力してください。",
            yoseDFocusHint:
                "※ ヨセ／ヨセ中継の相手径(Φd)。図面値を半角で入力",
            yoseTotalLengthFocusHint:
                "※ワークの全長を半角 mm で入力。",
            yosePartnerDepthFocusHint:
                "※2工程目の相手径深さを半角 mm で入力。",
            btnMaxOdCalc: "計算",
            btnMaxOdApply: "適用",
            btnMaxOdCalcClose: "閉じる",
            m99ModeLabel: "M99P100",
            m99ModeOff: "使用しない",
            m99ModeOn: "M99P100",
            btnMaxOdFromAte: "アテ長さが○○角のとき\n最大径自動計算",
            maxOdAteNeedKaku: "※ 自動計算:   (50−アテ長さ)×2×√2 　15角〜43角でアテを選んだ場合のみ選択可能",
            maxOdApplyErrAte: "アテ長さを半角数値で入力してください。",
            maxOdApplyErrNormal: "通常モードでは母材 A・B を半角数値で入力してください。",
            maxOdApplyErrEccentric: "偏心モードでは距離 A・B を半角数値で入力してください。",
            maxOdApplyErrCorner: "角ありモードでは母材幅・追加高さを半角数値で入力してください。",
            drillMode: "ドリル モード",
            drillZ: "ドリル深さ",
            drillAutoPlaceholder: "自動計算されるので手動モードはオフにしておいてください",
            drillDepthHangetsu: "半月ドリル深さ（自動計算）",
            idDepth: "内径深さ",
            idDepthCross: "IP(内径交差点)",
            crossSmallFinishDepth: "内径深さ",
            btnGen: "Gコード生成",
            btnSave: "デスクトップに保存",
            previewHeading: "",
            previewResizeTitle: "ドラッグしてサイズ変更",
            previewHeadingDrag: "ドラッグでパネルを移動",
            previewStickyContainerTitle:
                "パネル右下の斜線をドラッグしてサイズを変えられます（左上を基準に広がります）。",
            resultPlaceholder: "ここにGコードが生成されます...",
            easterBtnAria: "開発用メニュー",
            easterFoundMsg: "秘密の場所です",
            easterSecretList: "スーパー\nNPT R G\nクォーツねじ\nM12もみつけ",
            easterAuthorLine: "開発・連絡:山田",
            previewReset: "⟲ リセット",
            previewFull: "⛶ 全画面",
            previewSticky: "画面追従",
            previewAll: "全て",
            previewCutting: "切削(G1〜)",
            saveError: "Gコードを生成してください。",
            yoseOpt1: "① 同時加工 (バイト1本)",
            yoseOpt2: "② 別工程 (バイト2本)",
        },
    };

    function getLang() {
        return "ja";
    }

    function setLang(code) {
        window.ncUiLang = "ja";
        document.documentElement.lang = "ja";
        return "ja";
    }

    function t(key) {
        var oh =
            typeof window.NC_OPERATOR_HINTS === "object" && window.NC_OPERATOR_HINTS !== null
                ? window.NC_OPERATOR_HINTS
                : null;
        if (oh && Object.prototype.hasOwnProperty.call(oh, key)) {
            var ov = oh[key];
            if (ov !== undefined && ov !== null && String(ov).trim() !== "") {
                return String(ov);
            }
        }
        const lang = window.ncUiLang || "ja";
        const pack = T[lang] || T.ja;
        return pack[key] !== undefined ? pack[key] : T.ja[key] !== undefined ? T.ja[key] : key;
    }

    function applyI18n() {
        document.querySelectorAll("[data-i18n]").forEach(function (el) {
            const key = el.getAttribute("data-i18n");
            if (!key) return;
            if (el.id === "resultArea") {
                const known = [T.ja.resultPlaceholder];
                const cur = el.textContent
                    .replace(/\u00a0/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                const normKnown = known.map(function (k) {
                    return k.replace(/\s+/g, " ").trim();
                });
                if (cur !== "" && normKnown.indexOf(cur) === -1) return;
            }
            const val = t(key);
            if (el.tagName === "TITLE" || el.tagName === "title") {
                document.title = val;
                return;
            }
            if (val.indexOf("\n") >= 0) {
                el.innerHTML = val.split("\n").join("<br>");
            } else {
                el.textContent = val;
            }
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
            const key = el.getAttribute("data-i18n-placeholder");
            if (key) el.placeholder = t(key);
        });
        document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
            const key = el.getAttribute("data-i18n-title");
            if (key) el.title = t(key);
        });
        document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
            const key = el.getAttribute("data-i18n-aria-label");
            if (key) el.setAttribute("aria-label", t(key));
        });
        var yoseM = document.getElementById("yoseMethod");
        if (yoseM) {
            var y1 = yoseM.querySelector('option[value="1"]');
            var y2 = yoseM.querySelector('option[value="2"]');
            if (y1) y1.textContent = t("yoseOpt1");
            if (y2) y2.textContent = t("yoseOpt2");
        }
        var v1cEl = document.getElementById("v1c");
        if (v1cEl) {
            var vNone = v1cEl.querySelector('option[value="NONE"]');
            if (vNone) vNone.textContent = t("revNone");
        }
        var tubeSpec = document.getElementById("tubeSpecSelect");
        if (tubeSpec && tubeSpec.options.length) {
            tubeSpec.options[0].textContent = t("tubePick");
        }
        if (typeof window._ncUpdateInternalStyleDrawerLabel === "function") {
            window._ncUpdateInternalStyleDrawerLabel();
        }
        if (typeof window._ncUpdateM40M99UI === "function") {
            window._ncUpdateM40M99UI();
        }
        if (typeof window.updateM12CascadeUI === "function") {
            window.updateM12CascadeUI();
        }
    }

    function initUiLangFromStorage() {
        window.ncUiLang = getLang();
        const sel = document.getElementById("uiLang");
        if (sel) sel.value = window.ncUiLang;
        applyI18n();
    }

    window.NC_I18N = { t: t, applyI18n: applyI18n, setLang: setLang, initUiLangFromStorage: initUiLangFromStorage };
})();
