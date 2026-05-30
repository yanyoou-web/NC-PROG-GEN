/**
 * オペレーター向け「注意書き」専用ファイル（アプリ本体の改修は不要）
 *
 * 使い方:
 *   - 下の NC_OPERATOR_HINTS の「右側の文字列」だけを編集してください。
 *   - キー名（左側の "maxOdFocusHint" など）は変更しないでください（画面と対応しています）。
 *   - 行を削除するか、値を ""（空）にすると、アプリ同梱のデフォルト文言に戻ります。
 *   - 改行したいときは \n を使ってください。
 *
 * 読み込み順: index.html ではこのファイルを i18n.js より前に読み込みます。
 *
 * ── キー一覧 ──────────────────────────────────────────────
 *  ateLengthFocusHint      アテ長さ入力欄
 *  maxOdFocusHint          外径最大径入力欄
 *  valStockAFocusHint      最大径計算モード「通常」母材 A
 *  valStockBFocusHint      最大径計算モード「通常」母材 B
 *  valAFocusHint           最大径計算モード「偏心」距離 A
 *  valBFocusHint           最大径計算モード「偏心」距離 B
 *  valCornWFocusHint       最大径計算モード「角あり」母材 幅
 *  valCornHFocusHint       最大径計算モード「角あり」追加 高さ
 *  drillDepthFocusHint     ドリル深さ入力欄
 *  idDepthFocusHint        内径深さ入力欄
 *  cpUsesIdDepthHint       CP計算 相手径 (Φ) 入力欄
 *  yoseDFocusHint          ヨセ 相手径 (Φd) 入力欄
 *  yoseTotalLengthFocusHint  ヨセ中継 全長入力欄
 *  yosePartnerDepthFocusHint ヨセ中継 相手径深さ入力欄
 * ─────────────────────────────────────────────────────────
 */
(function () {
    "use strict";

    window.NC_OPERATOR_HINTS = {
        /** アテ長さ … プリセット＋直接入力コンボ */
        ateLengthFocusHint: "※プリセット選ぶか、半角数値で直接入力。\n" + "四則演算が使えます。例)50-27-7.5=15.5",

        /** 外径最大径 … フォーカス時の吹き出し（#maxOD） */
        maxOdFocusHint: "※ 図面の外径最大径を半角数値で入力。" + "四則演算が使えます。\n" + "",

        /** 最大径計算モード「通常」母材 A */
        valStockAFocusHint:
            "※ 通常モード: 素材の外径寸法 A を半角 mm で入力。" + "B と合わせて √(A²+B²) で外径最大径を算出します。",

        /** 最大径計算モード「通常」母材 B */
        valStockBFocusHint:
            "※ 通常モード: 素材の外径寸法 B を半角 mm で入力。" + "A と合わせて √(A²+B²) で外径最大径を算出します。",

        /** 最大径計算モード「偏心」距離 A (横) */
        valAFocusHint: "※ 偏心モード: 軸中心から加工中心までの距離 A(横方向)を半角で入力。",

        /** 最大径計算モード「偏心」距離 B (縦) */
        valBFocusHint: "※ 偏心モード: 軸中心から加工中心までの距離 B(縦方向)を半角で入力。",

        /** 最大径計算モード「角あり」母材 幅 */
        valCornWFocusHint: "※ 角ありモード: 素材の幅寸法を半角 mm で入力。",

        /** 最大径計算モード「角あり」追加 高さ */
        valCornHFocusHint:
            "※ 角ありモード: 角の追加高さ寸法を半角 mm で入力。" + "追加高さ分は計算され送りF.3で荒仕上げされます",

        /** ドリル深さ（#drillDepth） */
        drillDepthFocusHint:
            "※ ドリル深さを半角 mm で入力。" +
            "平底・一文字DR スタイルでは内径深さから自動計算されるため、通常は内径深さのみ入力してください。",

        /** 内径深さ（#idDepth） */
        idDepthFocusHint:
            "※ 図面の内径深さ（穴の深さ）を半角 mm で入力。" +
            "交差穴（加工径小）スタイルでは穴交差点の距離 IP を入力してください。",

        /** CP計算 相手径 (Φ)（#valPartnerD） */
        cpUsesIdDepthHint:
            "※ CP計算の「原点〜相手中心距離」は、右列の「内径深さ (図面値)」と同じ寸法です。" +
            "内径深さ欄にのみ入力してください。",

        /** ヨセ 相手径 (Φd)（#yoseD） */
        yoseDFocusHint: "※ ヨセ／ヨセ中継の相手径(Φd)。図面値を半角で入力。",

        /** ヨセ中継 全長（#yoseTotalLength） */
        yoseTotalLengthFocusHint: "※ ヨセ中継専用: ワークの全長を半角 mm で入力。" + "内径深さ算出に使用します。",

        /** ヨセ中継 相手径深さ（#yosePartnerDepth） */
        yosePartnerDepthFocusHint:
            "※ ヨセ中継専用: 2工程目の相手径深さを半角 mm で入力。" +
            "全長と合わせて1工程目の内径深さを自動計算します。",
    };
})();
