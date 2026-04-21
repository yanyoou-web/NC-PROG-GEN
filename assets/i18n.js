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
      workTypeTonbo: "トンボ",
      workTypeTonboDisabled: "トンボ（未実装）",
      workTypeTonboDisabledHint: "未実装のため通常は選択できません。デベロッパーモードで有効化できます。",
      devModeBtnOn: "デベロッパーモード: ON",
      devModeBtnOff: "デベロッパーモード: OFF",
      workTypeTube: "チューブ",
      m12CascadeHeading: "M12 仕上げ",
      m12FinishTypeLabel: "仕上げタイプ",
      m12FinishHss: "HSSドリル仕上げ",
      m12FinishHalfmoon: "HGDRドリル仕上げ",
      m12FinishBaito2: "バイト仕上げ",
      m12ProfileLabel: "加工プロファイル",
      m12ProfDrillIchiMen: "一文字バリ取り",
      m12ProfDrillIchiHira: "一文字平底加工",
      m12ProfCrossNoIchiOku: "奥バイト面取り",
      m12ProfCrossNoIchiNo: "なし",
      m12ProfBaitoOku: "奥バイト面取り",
      m12ProfBaitoNo: "なし",
      templateLabel: "テンプレート",
      tonboVariantHeading: "トンボワーク種別",
      tonboVariantLabel: "設備・ネジ品種に合わせて選択",
      revNone: "なし",
      basicInfo: "基本情報",
      ateLength: "アテ長さ",
      author: "作成者",
      phManual: "手入力",
      phDirect: "直接入力",
      machiningSettings: "加工設定",
      tubeSpec: "チューブ規格選択",
      tubePick: "-- 規格を選択 --",
      tubeLen: "長さ(L)",
      styleHint: "",
      maxDiaMode: "最大径 計算モード",
      modeNormal: "通常",
      modeEcc: "偏心",
      modeCorner: "角あり",
      distA: "距離 A (横)",
      distB: "距離 B (縦)",
      phEx: "例: 15.0",
      eccHint: "※ 自動計算: √(2A)² + (2B)²",
      stockW: "母材 幅",
      addH: "追加 高さ",
      cornerHint: "※ 自動計算: √{2(幅/2 + 高さ)}² + 幅²",
      internalStyle: "内径加工スタイル",
      style1: "1. 平底",
      style2: "2. 一文字DR",
      style3: "3. 通常加工",
      style4: "4. ヨセ",
      style5: "5. 交差穴\n加工径大",
      style6: "6. 交差穴\n加工径小",
      style7: "7. トンボ",
      style8: "8. 中継\n(未実装)",
      cpDist: "原点〜相手中心距離",
      cpPartnerD: "相手径 (Φ)",
      cpUsesIdDepthHint:
        "※ CP計算の「原点〜相手中心距離」は、右列の「内径深さ (図面値)」と同じ寸法です（そちらにのみ入力してください）。",
      cpAuto: "CP (自動計算)",
      cpPlaceholder: "自動入力",
      okuTitle: "奥バイト面取り (M12専用)",
      okuChk: "奥バイト面取りを行う",
      okuHint: "※ 相手径が6.0mm以上の場合のみ出力されます",
      yoseMethod: "加工方法",
      yoseAngle: "テーパ角度",
      yoseD: "相手径 (Φd)",
      maxOD: "外径最大径",
      drillMode: "ドリル モード",
      drillZ: "ドリル深さ (Z)",
      drillDepthHangetsu: "半月ドリル深さ（自動計算）",
      idDepth: "内径深さ (図面値)",
      idDepthCross: "IP(内径交差点)",
      btnGen: "Gコード生成",
      btnSave: "デスクトップに保存",
      previewHeading: "",
      previewResizeTitle: "ドラッグしてサイズ変更",
      previewHeadingDrag: "ドラッグでパネルを移動",
      previewStickyContainerTitle:
        "パネル右下の斜線をドラッグしてサイズを変えられます（左上を基準に広がります）。",
      resultPlaceholder: "ここにGコードが生成されます...",
      easterBtnAria: "ヒント・開発用メニュー",
      easterFoundMsg:
        "ひみつの「？」を見つけましたね。ここには開発用のテスト入力だけが入っています。本番の加工データでは不用意に押さないでください。",
      easterAuthorLine: "開発・連絡: 天才プログラマー山田とAIのCURSOR君",
      dbgTest: "[DEBUG] テスト入力",
      dbgTube: "[DEBUG] NCL085・チューブ・偏心",
      previewReset: "⟲ リセット",
      previewFull: "⛶ 全画面",
      previewSticky: "画面追従",
      previewAll: "全て",
      previewCutting: "切削(G1〜)",
      saveError:
        "保存できるプレーンテキストがありません。先に Gコード生成を成功させてください。",
      yoseOpt1: "① 同時加工 (バイト1本)",
      yoseOpt2: "② 別工程 (バイト2本)",
    },
    en: {
      pageTitle: "NC Program Generator",
      formAria: "File, machine, template and basic fields",
      uiLanguage: "Language",
      fileInfo: "File name",
      machineSelect: "Machine",
      machineLabel: "Machine",
      workType: "Work type",
      workTypeTonbo: "Tonbo",
      workTypeTonboDisabled: "Tonbo (not implemented)",
      workTypeTonboDisabledHint: "Not available in normal mode. Enable Developer mode to select.",
      devModeBtnOn: "Developer mode: ON",
      devModeBtnOff: "Developer mode: OFF",
      workTypeTube: "Tube",
      m12CascadeHeading: "M12 finish",
      m12FinishTypeLabel: "Finish type",
      m12FinishHss: "HSS drill finish",
      m12FinishHalfmoon: "HGDR drill finish",
      m12FinishBaito2: "Baito finish",
      m12ProfileLabel: "Machining profile",
      m12ProfDrillIchiMen: "One-slot chamfer",
      m12ProfDrillIchiHira: "One-slot flat bottom",
      m12ProfCrossNoIchiOku: "Oku chamfer",
      m12ProfCrossNoIchiNo: "None",
      m12ProfBaitoOku: "Oku chamfer",
      m12ProfBaitoNo: "None",
      templateLabel: "Template",
      tonboVariantHeading: "Tonbo work type",
      tonboVariantLabel: "Machine / thread family",
      revNone: "None",
      basicInfo: "Basic",
      ateLength: "Stock length",
      author: "Author",
      phManual: "Manual",
      phDirect: "Type here",
      machiningSettings: "Machining",
      tubeSpec: "Tube standard",
      tubePick: "-- Select --",
      tubeLen: "Length (L)",
      styleHint: "",
      maxDiaMode: "Max Ø mode",
      modeNormal: "Normal",
      modeEcc: "Eccentric",
      modeCorner: "Corner",
      distA: "Distance A",
      distB: "Distance B",
      phEx: "e.g. 15.0",
      eccHint: "※ Auto: √((2A)²+(2B)²)",
      stockW: "Stock width",
      addH: "Added height",
      cornerHint: "※ Auto per formula",
      internalStyle: "Internal style",
      style1: "1. Flat bottom",
      style2: "2. Single slot DR",
      style3: "3. Standard",
      style4: "4. Chamfer blend",
      style5: "5. Cross hole\n(large Ø)",
      style6: "6. Cross hole\n(small Ø)",
      style7: "7. Tombo",
      style8: "8. Mid\n(N/A)",
      cpDist: "Origin to mate center",
      cpPartnerD: "Mate Ø",
      cpUsesIdDepthHint:
        "※ For CP, use the same value as “ID depth (drawing)” in the right column—enter it only there.",
      cpAuto: "CP (auto)",
      cpPlaceholder: "Auto",
      okuTitle: "Rear chamfer (M12)",
      okuChk: "Enable rear chamfer",
      okuHint: "※ Output only if mate Ø ≥ 6.0 mm",
      yoseMethod: "Method",
      yoseAngle: "Taper angle",
      yoseD: "Mate Ø (d)",
      maxOD: "Max OD",
      drillMode: "Drill mode",
      drillZ: "Drill depth (Z)",
      drillDepthHangetsu: "Half-moon Drill Depth (Auto)",
      idDepth: "ID depth (drawing)",
      idDepthCross: "IP (ID intersection)",
      btnGen: "Generate G-code",
      btnSave: "Save to desktop",
      previewHeading: "",
      previewResizeTitle: "Drag to resize",
      previewHeadingDrag: "Drag to move the panel",
      previewStickyContainerTitle:
        "Drag the grip on the panel’s bottom-right to resize (top-left stays fixed).",
      resultPlaceholder: "Generated G-code appears here...",
      easterBtnAria: "Hints & developer menu",
      easterFoundMsg:
        "You found the secret “?”—nice. Only dev test fills live here. Don’t tap these on real shop jobs by mistake.",
      easterAuthorLine: "Dev / contact: lead programmer Yamada & Cursor (AI)",
      dbgTest: "[DEBUG] Test fill",
      dbgTube: "[DEBUG] NCL085 Tube ecc.",
      previewReset: "⟲ Reset",
      previewFull: "⛶ Full",
      previewSticky: "Follow",
      previewAll: "ALL",
      previewCutting: "Cuts",
      saveError:
        "No plain text to save. Generate G-code successfully first.",
      yoseOpt1: "① Simultaneous (1 tool)",
      yoseOpt2: "② Separate ops (2 tools)",
    },
    vi: {
      pageTitle: "Tạo chương trình NC",
      formAria: "File, máy, mẫu và thông tin cơ bản",
      uiLanguage: "Ngôn ngữ",
      fileInfo: "Tên file",
      machineSelect: "Máy",
      machineLabel: "Máy dùng",
      workType: "Loại chi tiết",
      workTypeTonbo: "Tonbo",
      workTypeTonboDisabled: "Tonbo (chưa triển khai)",
      workTypeTonboDisabledHint: "Chưa triển khai — bật chế độ Developer để chọn.",
      devModeBtnOn: "Chế độ Developer: BẬT",
      devModeBtnOff: "Chế độ Developer: TẮT",
      workTypeTube: "Ống",
      m12CascadeHeading: "Hoàn thiện M12",
      m12FinishTypeLabel: "Kiểu hoàn thiện",
      m12FinishHss: "Hoàn thiện khoan HSS",
      m12FinishHalfmoon: "Hoàn thiện khoan HGDR",
      m12FinishBaito2: "Gia công dao (Baito)",
      m12ProfileLabel: "Hồ sơ gia công",
      m12ProfDrillIchiMen: "Một rãnh vát cạnh",
      m12ProfDrillIchiHira: "Một rãnh đáy phẳng",
      m12ProfCrossNoIchiOku: "Vát sau (oku)",
      m12ProfCrossNoIchiNo: "Không",
      m12ProfBaitoOku: "Vát sau (oku)",
      m12ProfBaitoNo: "Không",
      templateLabel: "Mẫu",
      tonboVariantHeading: "Loại công việc Tonbo",
      tonboVariantLabel: "Chọn theo máy / loại ren",
      revNone: "Không",
      basicInfo: "Cơ bản",
      ateLength: "Chiều dài phôi",
      author: "Người lập",
      phManual: "Nhập tay",
      phDirect: "Nhập trực tiếp",
      machiningSettings: "Gia công",
      tubeSpec: "Tiêu chuẩn ống",
      tubePick: "-- Chọn --",
      tubeLen: "Chiều dài (L)",
      styleHint: "",
      maxDiaMode: "Chế độ Ø max",
      modeNormal: "Thường",
      modeEcc: "Lệch tâm",
      modeCorner: "Góc",
      distA: "Khoảng A (ngang)",
      distB: "Khoảng B (dọc)",
      phEx: "vd: 15.0",
      eccHint: "※ Tự tính: √((2A)²+(2B)²)",
      stockW: "Khổ phôi",
      addH: "Chiều cao thêm",
      cornerHint: "※ Tự tính theo công thức",
      internalStyle: "Kiểu gia công trong",
      style1: "1. Đáy phẳng",
      style2: "2. Một rãnh DR",
      style3: "3. Gia công thường",
      style4: "4. Vát / nối",
      style5: "5. Lỗ giao\n(Ø lớn)",
      style6: "6. Lỗ giao\n(Ø nhỏ)",
      style7: "7. Tombo",
      style8: "8. Nối giữa\n(chưa có)",
      cpDist: "K/c từ gốc đến tâm đối",
      cpPartnerD: "Ø đối",
      cpUsesIdDepthHint:
        "※ Khoảng từ gốc đến tâm lỗ đối dùng chung với “Sâu trong (bản vẽ)” ở cột phải—chỉ nhập một lần.",
      cpAuto: "CP (tự động)",
      cpPlaceholder: "Tự động",
      okuTitle: "Vát mặt sau (M12)",
      okuChk: "Bật vát mặt sau",
      okuHint: "※ Chỉ xuất khi Ø đối ≥ 6.0 mm",
      yoseMethod: "Phương pháp",
      yoseAngle: "Góc côn",
      yoseD: "Ø đối (d)",
      maxOD: "Ø ngoài lớn nhất",
      drillMode: "Chế độ khoan",
      drillZ: "Sâu khoan (Z)",
      drillDepthHangetsu: "Sâu khoan nửa vầng (tự động)",
      idDepth: "Sâu trong (bản vẽ)",
      idDepthCross: "IP (giao điểm ID)",
      btnGen: "Tạo G-code",
      btnSave: "Lưu ra máy",
      previewHeading: "",
      previewResizeTitle: "Kéo để đổi kích thước",
      previewHeadingDrag: "Kéo để di chuyển khung",
      previewStickyContainerTitle:
        "Kéo vạch góc phải dưới của khung để đổi kích thước (góc trên trái cố định).",
      resultPlaceholder: "G-code hiển thị tại đây...",
      easterBtnAria: "Gợi ý và menu dành cho lập trình viên",
      easterFoundMsg:
        "Bạn đã tìm ra dấu “?” ẩn—giỏi lắm. Chỉ có nút điền thử phát triển ở đây. Đừng bấm nhầm khi làm việc thật trên máy.",
      easterAuthorLine: "Phát triển / liên hệ: lập trình viên Yamada & Cursor (AI)",
      dbgTest: "[DEBUG] Điền thử",
      dbgTube: "[DEBUG] NCL085 Ống lệch",
      previewReset: "⟲ Đặt lại",
      previewFull: "⛶ Toàn màn hình",
      previewSticky: "Theo màn hình",
      previewAll: "Tất cả",
      previewCutting: "Cắt",
      saveError:
        "Không có nội dung để lưu. Hãy tạo G-code thành công trước.",
      yoseOpt1: "① Đồng thời (1 dao)",
      yoseOpt2: "② Tách bước (2 dao)",
    },
  };

  function getLang() {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      if (s === "en" || s === "vi" || s === "ja") return s;
    } catch (e) {}
    return "ja";
  }

  function setLang(code) {
    if (code !== "en" && code !== "vi" && code !== "ja") code = "ja";
    try {
      sessionStorage.setItem(STORAGE_KEY, code);
    } catch (e) {}
    window.ncUiLang = code;
    document.documentElement.lang = code === "ja" ? "ja" : code === "vi" ? "vi" : "en";
    return code;
  }

  function t(key) {
    const lang = window.ncUiLang || "ja";
    const pack = T[lang] || T.ja;
    return pack[key] !== undefined ? pack[key] : T.ja[key] !== undefined ? T.ja[key] : key;
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      if (el.id === "resultArea") {
        const known = [T.ja.resultPlaceholder, T.en.resultPlaceholder, T.vi.resultPlaceholder];
        const cur = el.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
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
    if (typeof window._ncPopulateM12ProfileOptions === "function") {
      window._ncPopulateM12ProfileOptions(true);
    }
    if (typeof window._ncApplyDeveloperModeUi === "function") {
      window._ncApplyDeveloperModeUi();
    }
    if (typeof window._ncSyncDeveloperModeToggleButton === "function") {
      window._ncSyncDeveloperModeToggleButton();
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
