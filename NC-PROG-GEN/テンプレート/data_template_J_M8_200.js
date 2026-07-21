const template_J_M8_200=`%
O{{入力_工程No}}(PM-{{入力_図番}}=No,{{入力_工程No}}=Q)
(J-M8-ASWD-200)
({{入力_日付}})(ATE={{入力_アテ長さ}})({{入力_作成者}})
{{機械名ヘッダー}}
{{初期設定ブロック}}

N1(MOMITUKE){{扉閉じ}}
G0G40G97S250M3{{M8スーパー}}
X0.1Z30.{{M51}}
Z2.
G1Z-1.F.06
X5.1Z1.5
G0Z30.{{M59}}
G28U0W0M1

N2(2.0-ASWD){{扉閉じ}}
G0G40G97S800M3{{ドリルASWD}}
X0Z30.{{M51}}
Z3.
{{DRILL_BLOCK}}
G0Z30.{{M59}}
G0X200.{{M459}}
M1(TSUKAMIKAE)
G28U0W0M1

{{内バリ処理}}(MENTORI)

N3(OUT=7.93){{扉閉じ}}
G0G40G97S750M3{{外径荒}}
X{{最大径-5}}Z30.{{M51}}(-X-)
Z3.

(M99P100){{M99P100}}

G71U4.5R.5
G71P21Q22U6.W.2F.2
N21G0X6.9(C=0.4)
G1Z.1F.08
X7.9Z-.4
Z-6.375
X8.05Z-6.435
Z-7.
G2X8.65Z-7.3R.3F.05
G1X9.98
G3X10.18Z-7.41R.1
G1Z-9.5F.08
N22G1X{{最大径-5}}F.35(-X-)

N100
G42(G42)
X6.9(C=0.4)
Z2.
G1Z.1F.08
X7.9Z-.4
Z-6.375
X8.05Z-6.435
Z-7.
G2X8.65Z-7.3R.3F.05
G1X9.98
G3X10.18Z-7.41R.1
G1X9.87Z-9.17
G2X10.47Z-9.5R.3
G1U.4
G40(G40)
{{最大径+角}}Z-9.F.3
Z-9.5F.03
{{最大径+3}}X10.67F.08{{M459}}(-X-)
W.1
U.5
G0Z0.
X8.5
G1X4.F.08
X1.F.13
G0Z30.{{M59}}
G28U0W0M1

N4(IN-ARA-4.0){{扉閉じ}}
G0G40G97S350M3{{M8内径荒}}
X4.897Z30.{{M51}}
Z1.
G1Z0F.1
X4.Z-1.673F.03
Z-4.8F.1S500
X1.8{{M458}}
{{M459}}
G0Z3.
X1.6
Z1.
G1Z-4.F1.5
Z-5.45F.15
X2.7Z-4.9F.04
X4.{{M458}}
W.2U-.2{{M459}}
G0Z30.{{M59}}
G28U0W0M1

N5(IN-MIZO)(HABA-0.5)
G0G40G97S250M3{{M8溝}}
{{M458}}
X4.2Z30.
{{M459}}
M1
M3
Z1.{{M51}}
G1Z-1.F.3{{M459}}
Z-6.4F.04
Z-4.7{{M458}}
G0Z30.{{M59}}
{{M459}}
M1
M3
X2.8{{M8溝裏}}{{M458}}
Z1.{{M51}}
G1Z-4.6F1.
Z-4.8F.15{{M459}}
X3.2Z-5.F.03
Z-6.4
Z-4.8{{M458}}
U-.3
{{M459}}
G0Z30.{{M59}}
G28U0W0M1

{{M53/M61/M408}}(M53/M61/M408)

N6(M8=6.4-MAX0.4){{扉閉じ}}
G0G40G97S600M3{{ネジ切り}}
X10.Z30.{{M51}}
Z5.
G76P010300
G76X7.0Z-6.4P600Q250F.75
G0Z30.{{M59}}
G28U0W0M1

N7(NEJI-MENTORI){{扉閉じ}}
G0G40G97S300M3{{外径荒}}
X9.Z30.{{M51}}
Z-.8
G1X8.3F.15
X6.3Z.2F.03
G0Z30.{{M59}}
G28U0W0M1

{{終了設定ブロック}}
%
`;

registerWorkType({
    id: "J_M8_200",
    ui: {
        label: "M8 φ2.0",
        group: "主要ネジ系",
        order: 10,
        styles: ["CrossSmall"],
    },
    machining: {
        idDiameterMm: null,
        drillDiameterMm: 2,
        flatBottomToolDiameterMm: null,
        drillMaxDepthMm: 24,
    },
    features: { mh: false, tube: false },
    template: template_J_M8_200,
});
