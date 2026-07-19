// チューブ MH ワーク用テンプレート（未実装 / TODO）
//
// data_template_Tube.js と data_template_G18_40-MH.js を比較すると、MH版は
// 外径の荒加工サイクル(G71)をまるごと削除し、規格ごとの実際の仕上げ径・
// 送り速度を使った固定ブロックに置き換える構造になっている。
// これはチューブ規格（tubeData）ごとの実測・実加工値が無いと安全に書けないため、
// このファイルでは推測でのG-code作成を行わず、内容を空のままにしてある。
//
// 実装時にやること:
//   1. data_template_Tube.js をベースに、N2(OUT-ARA)ブロックを
//      {{MH外径荒}} を使う固定ブロックへ書き換える
//      （G71粗取りサイクルを外し、tubeData[spec].od 由来の仕上げ径を使う）
//   2. 下記の const template_Tube_MH に実際のG-codeテンプレート文字列を設定する
//   3. gui-v2.html の <script src="テンプレート/data_template_Tube.js"> の下に
//      <script src="テンプレート/data_template_Tube_MH.js"></script> を追加する
//
// 上記が未完了の間は template_Tube_MH が未定義のままなので、
// ワーク種別「チューブ MH」を選んでGコードを生成しようとすると
// logic-v2.js 側で安全に「エラー: テンプレートが見つかりません」と表示され、
// 誤ったGコードが出力されることはない。
