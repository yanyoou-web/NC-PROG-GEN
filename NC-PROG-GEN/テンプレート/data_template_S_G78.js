const template_S_G78=`%
O{{入力_工程No}}(PM-{{入力_図番}}=No,{{入力_工程No}}=Q)
(S-G78)
({{入力_日付}})(ATE={{入力_アテ長さ}})({{入力_作成者}})
{{機械名ヘッダー}}
{{初期設定ブロック}}

N1(DR14.0){{扉閉じ}}
G0G40G97S450M3{{ドリルT}}
X0Z30.{{M51}}
Z3.
{{DRILL_BLOCK}}
G0Z30.{{M59}}
G0X200.{{M459}}
M1(TSUKAMIKAE)
G28U0W0M1

N2(OUT-30.1){{扉閉じ}}
G0G40G97S750M3{{外径荒}}
X{{最大径-5}}Z30.{{M51}}(-X-)
Z3.

(M99P100){{M99P100}}

G71U4.5R.5
G71P21Q22U6.W.2F.2
N21G0X28.1(C=0.9)
G1Z.1F.13
X30.1Z-.9F.08
Z-20.64
X32.Z-21.19
Z-25.
G2X34.Z-26.R1.
N22G1X{{最大径-5}}F.35(-X-)

N100

G0X28.1(C=0.9)
G1Z.1F.13
X30.1Z-.9F.08
Z-20.64
X32.Z-21.19
Z-25.
G2X34.Z-26.R1.
G1X34.2F.08
{{最大径+角}}Z-25.F.3
Z-26.F.03
{{最大径+3}}X34.1F.08{{M459}}(-X-)
G0Z.2
G1X30.F.2
G0Z.2
G1X23.F.08
W.2
X13.F.2
Z.2
X23.5
G0Z50.{{M59}}
{{M459}}
G28U0W0M1

N3(IN-16){{扉閉じ}}
G0G40G97S500M3{{内径ダイヤΦ16}}
X16.Z50.
M1
M3
Z.3{{M51}}
G1Z-3.F.05
Z-18.F.1
Z-{{入力_内径深さ}}F.05(-Z-){{ヨセパス}}
{{平底_内径仕上出口}}
G0Z30.{{M59}}
{{M459}}
G28U0W0M1

{{ヨセブロック}}(YOSE Blocks)

N4(IN-21.9)(G41){{扉閉じ}}
G0G40G97S600M3{{内径荒}}
{{M458}}
X21.9Z30.{{M51}}
{{M459}}
G4U1.
Z1.
G1Z-18.75F.1
X15.5{{M458}}
G0Z100.
G41X25.14Z.8S350(G41)
{{M459}}
G4U1.
G1Z.3F.2
X21.9Z-5.746F.04
U-.3{{M458}}()
G0Z30.{{M59}}
{{M459}}
G28U0W0M1

N5(IN-22.3X21.7-R.25){{扉閉じ}}
G0G40G97S500M3{{スーパー}}
({{M458}})
X22.3Z30.{{M51}}
({{M459}})
G4U1.
Z3.
Z-4.5
G1Z-21.55F.04
G3X22.Z-21.7R.15
G3X21.77Z-21.65R.15
G1X15.8Z-17.5F.35
Z-18.09
X21.77Z-21.65F.04
G2X22.Z-21.7R.15
G1W.2({{M458}})
G0Z30.{{M59}}
({{M459}})
G28U0W0M1

N6(IN-16XIN-MENTORI){{扉閉じ}}
G0G40G97S350M3{{内径荒}}
X19.Z30.
M1
M3
Z0.{{M51}}
Z-18.
G1Z-18.82F.05
X16.4
X15.6Z-19.37
U-.2
G0Z30.{{M59}}
{{M459}}
G28U0W0M1

{{M53/M61/M408}}(M53/M61/M408)

N7(G78-Z20.64-R.25){{扉閉じ}}
G0G40G97S650M3{{ネジ切り}}
X32.Z30.{{M51}}
Z5.
G76P010500
G76X27.87Z-20.64P1200Q450F1.8143
G0Z30.{{M59}}
{{M459}}
G28U0W0M1

N8(NEJI-MEN){{扉閉じ}}
G0G40G97S600M3{{外径荒}}
X33.Z30.{{M51}}
Z2.
Z-1.6
X30.5F.5
G1X27.3Z0F.06
X25.95
Z.3
X24.2F.2
Z0.
X25.95F.06
G0Z30.{{M59}}
{{M459}}
G28U0W0M1

{{終了設定ブロック}}
%
`;

registerWorkType({
    id: "S_G78",
    ui: {
        label: "S-G78",
        group: "スーパー系",
        order: 70,
        styles: ["Hirazoko", "Normal", "YoseRelay", "Yose", "CrossSmall"],
    },
    machining: {
        idDiameterMm: 16,
        drillDiameterMm: 14,
        flatBottomToolDiameterMm: 16,
        drillMaxDepthMm: null,
    },
    features: { mh: false, tube: false },
    template: template_S_G78,
});
