# 内径加工ルール抽出（logic-v2.js / blocks-v2.js / gui-v2.js より）

> 目的: コードに実装されている「ワーク種別 × 内径スタイル → 使用ドリル／ドリルロジック／工具／平底処理」の
> 分岐ルールを漏れなく書き出したもの。会社の実際の加工ルールと突き合わせて差異を確認するための一次資料。
> 実装が変わったらこのファイルも更新すること（自動生成ではなく手動抽出）。
>
> 抽出元:
> - `Gコードジェネレータ/assets/logic-v2.js`（判定関数・ドリル深さ計算・ブロック選択チェーン・テンプレート選択）
> - `Gコードジェネレータ/assets/blocks-v2.js`（Gコードブロック本体）
> - `Gコードジェネレータ/assets/gui-v2.js`（ワーク種別ごとの選択可能スタイル・プロファイル解決）

---

## 1. ワーク種別一覧と基礎データ

`WORK_ID_MAP`（内径大径D） / `DRILL_DIA_MAP`（ドリル公称径） / `FLAT_BOTTOM_TOOL_DIA_MM`（平底仕上げバイト径）
（`logic-v2.js` 31〜186行目）

| ワーク種別 | 内径大径 D (mm) | ドリル径 (mm) | 平底仕上バイト径 (mm) | 備考 |
|---|---|---|---|---|
| M40 / M40_MH | 22.0 | 14.0 | 16.0 | |
| M22 / M22_MH | 10.0 | 7.0 | 8.0 | |
| M18 / M18_MH | 8.0 | 7.0 | 8.0 | |
| M15 / M15_MH | 6.0 | 3.3 | 6.0 | |
| M12 / M12_MH | 4.0 | 4.05 | （平底ロジック対象外 → 常に `U-.2`） | |
| G78 / G78_MH | 16.0 | 14.0 | 16.0 | |
| G18_40 / _MH | 4.0 | 4.05 | 未設定（マップになし）→ `U-.2` | ドリル仕上中心のためtoolDiaマップに載せない |
| G18_42 / _MH | 4.15 | 4.15 | 未設定 → `U-.2` | |
| G18_62 / _MH | 6.2 | 4.15 | 4.0 | 加工径(6.x)とバイト径4が異なる → `X4.F.03`分岐 |
| G18_655 / _MH | 6.55 | 4.15 | 4.0 | 同上 |
| G18_6175 / _MH | 6.175 | 4.15 | 4.0 | 同上 |
| M42X3_25175（ST） | 25.175 | 25.175 | 16 | φ16段付のみ id≒toolDia で `U-.2`、他は `X16.F.03` |
| M42X3_25175_20 | 20.0 | 20.0 | 16 | |
| M42X3_25175_22 | 22.0 | 22.0 | 16 | |
| M42X3_25175_16 | 16.0 | 16.0 | 16 | id≒toolDia なので `U-.2` |
| G12B_G_ST_12175_8 | 8.0 | 7.0 | 8 | |
| M8_21 | ― | 2.2 | ―（平底対象外） | |
| M8_31 | ― | 3.2 | ―（平底対象外） | |
| J_M8_300 | ― | 3.0 | ―（平底対象外） | ASWD系 |
| J_M8_200 | ― | 2.0 | ―（平底対象外） | ASWD系 |
| TOMESEN_M16 | 8.0 | 7.0 | 8 | |
| TOMESEN_M18 | 10.0 | 7.0 | 8 | |
| TOMESEN_M22 | 12.0 | 10.7 | 8 | |
| TOMESEN_M24 | 16.0 | 14.0 | 16 | M24/M35 は Φ16バイト |
| TOMESEN_M35 | 22.0 | 14.0 | 16 | |
| Tube | `tubeData[spec].id` | `tubeData[spec].drill` | `tubeData[spec].toolDia`（規格依存、無い規格もある） | data-v2.js 参照 |

ASWDドリル肩高さ `ASWD_SHOULDER_MM`（ドリル公称径キー）: `4.0→0.96` / `3.0→0.70` / `2.1→0.50` / `2.0→0.50`

---

## 2. ワーク種別ごとの選択可能な内径スタイル

`gui-v2.js` `getAvailableStyles()`（61〜75行目）

| ワーク種別 | 選択可能スタイル |
|---|---|
| J_M8_300 / J_M8_200（ASWD系） | `CrossSmall` のみ（固定） |
| M8_21 / M8_31 | `Ichimonji`, `YoseRelay`, `CrossSmall` |
| G18_40 / G18_42（+MH） | `YoseRelay`, `CrossSmall` |
| G18_62 / G18_655 / G18_6175（+MH）＝HGDR系 | `Hirazoko`, `Normal`, `YoseRelay` |
| M42X3_25175系（全4種） | `Hirazoko`, `Normal`, `Yose`, `YoseRelay` |
| M12 / M12_MH | `Ichimonji`, `Normal`, `YoseRelay`, `CrossSmall` |
| TOMESEN系（全5種） | `Hirazoko`, `Ichimonji`, `Normal`, `YoseRelay`, `Yose` |
| それ以外（M40/M22/M18/M15/G78 とそのMH、G12B） | `Hirazoko`, `Normal`, `YoseRelay`, `Yose`, `CrossSmall`（全種） |

スタイル名対応（日本語表示）: `Hirazoko`=内径バイト平底 / `Ichimonji`=一文字DR平底 / `Normal`=通常バイト加工 /
`YoseRelay`=ヨセ中継 / `Yose`=ヨセ / `CrossSmall`=交差穴（小径）

---

## 3. ドリルロジック選択チェーン（優先順位つき）

`logic-v2.js` 866〜878行目。**上から順に該当した条件で確定し、以降は評価されない。**

```
① usesG18DrillShiageG1Block(workType)                         → getDrillShiageHGDRBlock(depth, "G1")
   対象: G18_40 / G18_42 / G18_62 / G18_655 / G18_6175（+MH全て）

② isJM8ASWDWorkType(workType) または isM8WorkType(workType)     → getDrillShiage10mmStepBlock(depth)
   対象: J_M8_300 / J_M8_200（ASWD）、M8_21 / M8_31

③ (workType===M12||M12_MH) かつ m12FinishType==="hss"           → getDrillShiage10mmStepBlock(depth)

④ それ以外                                                       → getDrillShiageHGDRBlock(depth, input.drillMode)
   対象: M40/M22/M18/M15/G78（+MH）、M42X3系、TOMESEN系、G12B、M12バイト/HGDR
   ※ このケースのみ、ユーザーがUIで選んだ drillMode（G74 or G1）が実際に反映される
```

### ①④共通: `getDrillShiageHGDRBlock(depth, mode)` の中身（`blocks-v2.js` 51〜97行目）

- `mode="G1"`: 単動1発切削（`G1Z-depth F.15` → `G4U.3` → `Z1.F2.5`）
- `mode="G74"` かつ `depth ≤ 30mm`: G74ペック一発切込み（`G74R.5` → `G74Z-depth Q8000 F.25` → 仕上げ）
- `mode="G74"` かつ `depth > 30mm`: 最初30mmをG74（Q3000）、以降10mmステップで送り、最終深さで仕上げ

### ②③共通: `getDrillShiage10mmStepBlock(depth)` の中身（`blocks-v2.js` 108〜129行目）

G1単動固定、10mm刻みで「切削→Z30.まで引き戻し→次ステップ手前まで早送り」を繰り返し、最終深さのみドウェル(`G4U.3`)を入れて終了。**G74は一切使わない。**

### ⚠️ UIとの不整合（前回セッションで確認済み・未解決）

`index.html` / ウィザードUI (`gui-v2.js buildDepthsScreen`) には常に「ドリルモード G74/G1」の選択UIが表示されるが、
上記①②③に該当するワーク種別では**UIでの選択が無視される**（コード上、選択肢を隠す/無効化する処理なし）。
実際にドリルモード選択が効くのは④のグループのみ。

---

## 4. 平底（Hirazoko）仕上げ出口ロジック

`computeFlatBottomExitLine(input)`（`blocks-v2.js` 296〜331行目）

```
1. internalStyle !== "Hirazoko" → デフォルト行のみ（下記）
     デフォルト行: workType が G78/M40 → "U-.2(X16)"
                   workType が M22     → "U-.2(X8)"
                   それ以外            → "U-.2"

2. internalStyle === "Hirazoko" のとき:
   - workType==="Tube" かつ tubeData に id/toolDia があれば idDia/toolDia を使用
   - workType==="M12"                    → 常に "U-.2"（バイト径判定なし）
   - それ以外                            → idDia = WORK_ID_MAP[wt], toolDia = FLAT_BOTTOM_TOOL_DIA_MM[wt]

3. idDia と toolDia の差が 0.02mm 未満（≒同一径）→ デフォルト行（"U-.2"系）
4. 差が 0.02mm 以上（内径加工径 ≠ バイト径）      → "X{toolDia}F.03"
```

→ **要確認ポイント**: 「加工径とバイト径が一致していれば `U-.2`、異なれば `X{バイト径}F.03` に自動で切り替える」
というのがコード上のルール。G18のHGDR系（φ6.2/6.55/6.175）はこの差分ルールに該当し、`X4.F.03`が出る。

チューブ規格側は `combineTubeFlatBottomFinishLine()`（`blocks-v2.js` 344〜354行目）で `X6.U-.2` のように1行結合される場合がある（規格に `toolDia` があるかどうかで挙動が変わる）。

---

## 5. 奥バイト／一文字（面取り）ロジック（`logic-v2.js` 718〜776行目）

ドリル直後（EARLY）に入るか、バイト仕上げ後（LATE、`baito`のときのみ）に入るかも分岐する。

| 条件 | 使用ブロック | 挿入タイミング |
|---|---|---|
| ASWD系（J_M8_300/200） | なし（常に空、ドリル側で自動処理） | ― |
| style="Ichimonji" かつ (M12/M12_MH または M8系) | `getIchimonjiHirazokoBlock(内径深さ)` — 内径深さ基準の平底仕上げ | EARLY |
| style="Ichimonji" かつ 上記以外の全ワーク | `getIchimonjiBlock(CP)` — CP±2mmで貫通の面取り | EARLY |
| G18_40/42（+MH）× CrossSmall × `g18Profile==="drill_ichi_men"` | `getIchimonjiBlock(CP)` | EARLY |
| G18_40/42（+MH）× CrossSmall × それ以外（hgdr_oku） | `getOkuBiteBlockG18(CP)` | EARLY |
| M12/M12_MH × (CrossSmall/CrossBig) × `m12Profile==="drill_ichi_men"` | `getIchimonjiBlock(CP)` | EARLY |
| M12/M12_MH × (CrossSmall/CrossBig) × それ以外（cross_oku/baito_oku）かつ 相手径≥6.0mm かつ okuBiteEnabled | `getOkuBiteBlock(CP)` | `m12FinishType==="baito"` なら LATE、それ以外は EARLY |
| M8系（M8_21/31）× CrossSmall × `m8Profile==="drill_ichi_men"` | `getIchimonjiBlock(CP)` | EARLY |
| M8系 × CrossSmall × それ以外 | `getOkuBiteBlock(CP)`（コード上到達しない想定・予約分岐） | EARLY |

奥バイト面取りブロックの径違い:
- `getOkuBiteBlock`（M12系）: アプローチ `X4.` → 仕上げ `X4.45`
- `getOkuBiteBlockG18`（G18_40/42系）: アプローチ `X4.1` → 仕上げ `X4.6`（M12版よりひと回り大きい）

---

## 6. M12 / G18 / M8 の「加工方法」プロファイル対応表

UIの選択カード（`m12CrossMethod` / `g18CrossMethod` / `m12FinishType`）→ 内部の `finishType` / `profile` への変換。
`gui-v2.js` `resolveM12Profile()` / `resolveG18Profile()`（1144〜1159行目）

### M12/M12_MH

| internalStyle | UI選択 | finishType | profile | 意味 |
|---|---|---|---|---|
| Ichimonji | HSSドリル | hss | drill_ichi_hira | 一文字DR平底、HSSドリルで10mmステップ |
| Ichimonji | HGDRドリル | halfmoon(hgdr) | drill_ichi_hira | 一文字DR平底、HGDRドリルでG1 |
| Normal | （固定） | baito | baito_no | 通常バイト加工 |
| YoseRelay | （固定） | halfmoon | drill_ichi_hira | ヨセ中継 |
| CrossSmall | HSSドリル + 奥バイト | hss | cross_oku | |
| CrossSmall | HGDRドリル + 奥バイト | halfmoon | cross_oku | |
| CrossSmall | HSSドリル + 一文字面取り | hss | drill_ichi_men | |
| CrossSmall | HGDRドリル + 一文字面取り | halfmoon | drill_ichi_men | |
| CrossSmall | バイト + 奥バイト | baito | baito_oku | 奥バイトはLATE挿入（バイト仕上げ後） |

`m12FinishType==="hss"` のときのみ §3-③のドリルロジック（10mmステップ）が発動。`baito`/`halfmoon(hgdr)`の場合は§3-④（HGDR系、drillMode選択有効）に落ちる。

### G18_40 / G18_42（+MH）

| UI選択（g18CrossMethod） | finishType | profile |
|---|---|---|
| HGDRドリル + 奥バイト | halfmoon | cross_oku |
| HGDRドリル + 一文字面取り | halfmoon | drill_ichi_men |

G18系は常に §3-① に該当するため、ドリル自体は常にG1固定（HGDR/HSSの区別はドリル自体のロジックには影響しない）。

### M8_21 / M8_31

`m8Profile` は常に `"drill_ichi_men"` 固定（UI選択肢なし、`buildDepthsScreen`のコメントより「M8 交差穴: HSSドリル + 一文字面取り（固定）」）。

---

## 7. ドリル深さ・内径深さの自動計算ルール（`logic-v2.js` 680〜716行目）

```
style が Hirazoko または Ichimonji かつ 内径深さ入力あり:
    ドリル深さ = 内径深さ + 0.1
    内径仕上深さ = 内径深さ + 0.2

style = CrossSmall:
    内径仕上深さ = calcCrossSmallFinishDepth()
      A = sqrt((相手径/2)^2 - (加工径/2)^2)
      B = 相手径/2 - A
      内径仕上深さ = CP + B + 1

style = YoseRelay:
    内径仕上深さ = 対ヨセ長さ + 1.0
    ドリル深さ   = 対ヨセ長さ + 0.3×ドリル径
      対ヨセ長さ = (全長-相手径深さ) - ヨセ長さ
      ヨセ長さ   = (相手径/2 - 加工径/2) / tan(テーパ角度)

workType が ASWD系（J_M8_300/200）:
    ドリル深さ = ASWD_SHOULDER_MM[ドリル径] + CP + 1　（ユーザー入力を上書き）

Yose（テーパ）:
    Zend = 内径深さ(or チューブ長さ) + (加工径-相手径+0.4)/2 ÷ tan(テーパ角度)

特殊加工共通式（calcSpecialDrillZ、現状 Yose/YoseRelay/CrossBig/CrossSmall のみで使用）:
    Yose/YoseRelay: 0.3×ドリル径 + 基準深さ - 0.4
    CrossBig/CrossSmall: 基準深さ + 1 + 0.3×ドリル径
```

---

## 8. テンプレート選択ロジック（`logic-v2.js` 938〜1086行目）

ほぼ `workType` 1対1でテンプレートファイルを選択するが、以下は分岐あり:

- **M12 / M12_MH**: `m12FinishType`（hss/baito/それ以外=hgdr）で `template_M12HSS` / `template_M12BAITO` / `template_M12HGDR`（+`_MH`）を切替
- **M40**: `m99Mode==="x50u8"` のとき `G71U4.5R.5→G71U8.0R.5`、`N22X{{最大径-5}}F.35→N22X56.F.35` を固定値に置換（M40専用の特殊分岐）
- **G12B_G_ST_12175_8**: `g12bNoseR==="r05"` で根本ノーズR付き/なしの2パターン（Z座標・X座標が変わる）
- 該当なし（デフォルト）は `template_G78`

---

## 9. このドキュメントの使い方（次のステップ）

1. 上記の表を会社の実際の加工ルール（紙・口伝・ベテランの知見）と1行ずつ突き合わせる。
2. 一致しない/怪しい箇所には `要確認` 等の印を付けて記録する（このファイルを直接編集してよい）。
3. 特に確認優先度が高いと思われる点:
   - §3の「UIのドリルモード選択がG18/M8/ASWD/M12-HSSでは無視される」仕様が意図通りか
   - §4の「id≒toolDeiaなら`U-.2`、異なれば`X{toolDia}F.03`」という平底切替の閾値(0.02mm)と対象ワークの網羅性
   - §5のM8系「hss_oku到達しない想定（予約分岐）」— 本当に到達しないか、UIから到達させる経路がないか
   - G18_40/42 と G18_62/655/6175 で「使用可能スタイル」が全く異なる理由（HGDR系はCrossSmall非対応）
