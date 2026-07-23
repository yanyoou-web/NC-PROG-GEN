const template_TOMESEN_M16=`%
O{{入力_工程No}}(PM-{{入力_図番}}=No,{{入力_工程No}}=Q)
(TOMESEN_M16)
({{入力_日付}})(ATE={{入力_アテ長さ}})({{入力_作成者}})
{{機械名ヘッダー}}
{{初期設定ブロック}}

N1(7.0DR){{扉閉じ}}
G0G40G97S750M3{{ドリルT}}
X0.Z30.{{M51}}
Z3.
{{DRILL_BLOCK}}
G0Z30.{{M59}}
G0X200.{{M459}}
M1(TSUKAMIKAE)
G28U0W0M1

N2(TANMEN){{扉閉じ}}
G0G40G97S750M3{{外径荒}}
{{最大径+3}}Z30.{{M51}}(-X-)
Z3.
G1Z.01F.2
X19.F.08
X6.F.13
G0Z30.{{M59}}
G28U0W0M1

N3(IN-8.0){{扉閉じ}}
G0G40G97S500M3{{内径ダイヤΦ8}}
X8.Z30.{{M51}}
Z1.
G1Z.3F.2
Z-3.F.05
Z-11.9F.1
Z-{{入力_内径深さ}}F.05(-Z-){{ヨセパス}}
{{平底_内径仕上出口}}
G0Z30.{{M59}}
G28U0W0M1

{{ヨセブロック}}(YOSE Blocks)

N4(IN-14.5X12){{扉閉じ}}
G0G40G97S750M3{{内径荒}}
X10.Z30.{{M51}}
Z.1
G1Z-11.8F.2
U-.5
G0Z3.
X14.5
Z.1
G1Z-11.8F.2
X7.8
Z-12.
X14.5S600F.05
W.2
U-.3
G0Z30.{{M59}}
G28U0W0M1

{{M53/M61/M408}}(M53/M61/M408)

N5(M16-Z10.8-MAX1.1-R0.1){{扉閉じ}}
G0G40G97S650M3{{ネジ切り}}
X13.Z30.{{M51}}
Z5.
G76P010000
G76X16.1Z-10.8P900Q330F1.5
G0Z30.{{M59}}
G28U0W0M1

N6(NEJI-MENTORI)(C=2.0){{扉閉じ}}
G0G40G97S600M3{{内径荒}}
X14.Z30.{{M51}}
Z-3.
G1X20.4Z.2F.05
G0Z30.{{M59}}
G28U0W0M1

{{終了設定ブロック}}
%
`;

registerWorkType({
    id: "TOMESEN_M16",
    ui: {
        label: "M16 TOMESEN",
        group: "トメセン系",
        order: 10,
        styles: ["Hirazoko", "Ichimonji", "Normal", "YoseRelay", "Yose"],
    },
    machining: {
        idDiameterMm: 8,
        drillDiameterMm: 7,
        flatBottomToolDiameterMm: 8,
        drillMaxDepthMm: null,
    },
    features: { mh: false, tube: false },
    template: template_TOMESEN_M16,
});
