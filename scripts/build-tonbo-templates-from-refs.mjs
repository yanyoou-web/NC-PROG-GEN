/**
 * 参考フォルダのトンボ雛形（読み取りのみ）から data_template_Tonbo_*.js を一括生成する。
 * 実行: node scripts/build-tonbo-templates-from-refs.mjs
 *
 * NLX: G78-PP1 / M40X2-PP の2種（参考ファイル名は従来どおり G7.8 等の場合あり）
 * CL:  ・トンボ加工（雛型）内の6ファイル
 *
 * N1 は {{DRILL_BLOCK}} に統一（getDrillBlock）。NLX M40 の SUB2 だけは雛形どおり短いドリルブロックを維持。
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const refClDir = path.join(
  root,
  "参考フォルダ",
  "CL-2000-1(角) M8",
  "・トンボ加工（雛型）"
);
const refNlxDir = path.join(
  root,
  "参考フォルダ",
  "NLX-2500-700 トンボ M42 ヌスミ",
  "トンボ"
);

function escTemplateLiteral(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function applyCommonTooling(s) {
  return s
    .replace(/T1016/g, "{{外径溝_裏補正}}")
    .replace(/T1010/g, "{{外径溝}}")
    .replace(/T0808/g, "{{ネジ切り}}")
    .replace(/T0909/g, "{{ドリルT}}")
    .replace(/T0900/g, "{{ドリルT}}")
    .replace(/T0505/g, "{{外径荒}}")
    .replace(/T0606/g, "{{内径ダイヤΦ16}}")
    .replace(/T0202/g, "{{内径荒}}")
    .replace(/T0303/g, "{{中溝}}")
    .replace(/T0313/g, "{{中溝裏}}")
    .replace(/M458(?![0-9])/g, "{{タレットエアーON}}")
    .replace(/M459(?![0-9])/g, "{{タレットエアーOFF}}")
    .replace(/M408(?![0-9])/g, "{{加工終了信号}}")
    .replace(/M51(?![0-9])/g, "{{集塵機オン}}")
    .replace(/M59(?![0-9])/g, "{{集塵機オフ}}");
}

/** CL 共通: O1〜O3・座標マーカ・平底 */
function applyCL(src) {
  let s = src;
  if (s.startsWith("%")) s = s.trimStart().replace(/^%\s*/, "");
  s = s.replace(/^O1\(PM-#=SUB1=/m, "O1(PM-{{入力_図番}}=SUB1=");
  s = s.replace(/^O2\(PM-#=SUB2=/m, "O2(PM-{{入力_図番}}=SUB2=");
  s = s.replace(/^O3\(PM-#=NO,#=MAIN=/m, "O3(PM-{{入力_図番}}=No,{{入力_工程No}}=MAIN=");
  s = s.replace(/^O3\(PM-#=NO,=MAIN=/m, "O3(PM-{{入力_図番}}=No,{{入力_工程No}}=MAIN=");
  s = s.replace(/^\(#\/#\/#\)\(ATE=#\)\(NAME\)$/m, "({{入力_日付}})(ATE={{入力_アテ長さ}})({{入力_作成者}})");
  s = s.replace(/^\(CL-2000-1\)$/m, "{{機械名ヘッダー}}");
  s = s.replace(/\(M99P100\)\r?\n/g, "(M99P100){{M99P100}}\n");
  s = s.replace(/X##\.Z30\./g, "X{{計算_最大径1}}.Z30.");
  s = s.replace(/N22X##\./g, "N22X{{計算_最大径1}}.");
  s = s.replace(/X##\.\(--X--\)/g, "{{仕上_ラピッドX}}");
  s = s.replace(/Z-##\.F\.05/g, "Z-{{入力_内径深さ}}F.05");
  s = s.replace(/\r?\nU-\.2\(--X--\)\r?\n/g, "\n{{平底_内径仕上出口}}\n");
  s = s.replace(/\r?\nU-\.2\r?\n/g, "\n{{平底_内径仕上出口}}\n");
  s = applyCommonTooling(s);
  return s;
}

/** NLX: M8/M9→タレット、O3 は NO,#=MAIN と MAIN= の2形態 */
function applyNLX(src) {
  let s = src;
  s = s.replace(/^O1\(PM-#=SUB1=/m, "O1(PM-{{入力_図番}}=SUB1=");
  s = s.replace(/^O2\(PM-#=SUB2=/m, "O2(PM-{{入力_図番}}=SUB2=");
  s = s.replace(/^O3\(PM-#=NO,#=MAIN=/m, "O3(PM-{{入力_図番}}=No,{{入力_工程No}}=MAIN=");
  s = s.replace(/^O3\(PM-#=MAIN=/m, "O3(PM-{{入力_図番}}=MAIN=");
  s = s.replace(/^\(25\/#\/#\)\(ATE=#\)\(#\)$/m, "({{入力_日付}})(ATE={{入力_アテ長さ}})({{入力_作成者}})");
  s = s.replace(/^\(#\/#\/#\)\(ATE=#\)\(#\)$/m, "({{入力_日付}})(ATE={{入力_アテ長さ}})({{入力_作成者}})");
  s = s.replace(/^\(G55=Z0\.0\/G56=Z-1\.\)$/m, "{{トンボ_G55G56コメント}}");
  s = s.replace(/^\(NLX2500\/700\)$/m, "{{機械名ヘッダー}}");
  s = s.replace(/X##\.Z30\./g, "X{{計算_最大径1}}.Z30.");
  s = s.replace(/N22X##\./g, "N22X{{計算_最大径1}}.");
  s = s.replace(/X##\.\(--X--\)/g, "{{仕上_ラピッドX}}");
  s = s.replace(/Z-##\.F\.05/g, "Z-{{入力_内径深さ}}F.05");
  s = s.replace(/\(M99P100\)\r?\n/g, "(M99P100){{M99P100}}\n");
  s = s.replace(/\r?\nU-\.2\(X16\)\r?\n/g, "\n{{平底_内径仕上出口}}\n");
  s = applyCommonTooling(s);
  s = s.replace(/\bM8\b/g, "{{タレットエアーON}}");
  s = s.replace(/\bM9\b/g, "{{タレットエアーOFF}}");
  // 座標と同一行の M8/M9（例: X31.22M8）は単語境界が取れないため別途
  s = s.replace(/(X[0-9]+(?:\.[0-9]+)?)M8\b/g, "$1{{タレットエアーON}}");
  s = s.replace(/Z-14\.5F\.1M9\b/g, "Z-14.5F.1{{タレットエアーOFF}}");
  s = s.replace(/Z-19\.F\.1M9\b/g, "Z-19.F.1{{タレットエアーOFF}}");
  s = s.replace(/Z-21\.5M9\b/g, "Z-21.5{{タレットエアーOFF}}");
  s = s.replace(/G0T0101/g, "G0{{切り欠け}}");
  return s;
}

const blockNlxDrill = `N1(DR14.0)
G0G40G97S750{{ドリルT}}M3
G0G28V0U0W0
G99M46
G18

X0.Z30.{{集塵機オン}}
Z3.{{タレットエアーON}}
{{DRILL_BLOCK}}
G0Z30.{{集塵機オフ}}
{{タレットエアーOFF}}
G28U0W0M1`;

const blockClDrill = `N1(DR14.0)
G0G40G97S750{{ドリルT}}M3
G0G28V0U0W0
G99M46
G18

X0Z30.{{集塵機オン}}
Z3.{{タレットエアーON}}
{{DRILL_BLOCK}}
G0Z30.{{集塵機オフ}}
{{タレットエアーOFF}}
G28U0W0M1`;

/** 全ての SUB の N1(DR14.0)…G28U0W0M1 を置換 */
function injectDrillAllN1(s, block) {
  const re = /N1\(DR14\.0\)[\s\S]*?\r?\nG28U0W0M1\r?\n(?=\r?\n*N2\()/g;
  return s.replace(re, block + "\n");
}

/** 先頭の N1 のみ置換（NLX M40 の SUB2 は雛形のまま） */
function injectDrillFirstN1Only(s, block) {
  const re = /N1\(DR14\.0\)[\s\S]*?\r?\nG28U0W0M1\r?\n(?=\r?\n*N2\()/;
  return s.replace(re, block + "\n");
}

function wrapConst(name, body, headerLines) {
  const h = headerLines.join("\n");
  return `${h}

const ${name} = \`
${body}\`;
`;
}

const nlxJobs = [
  {
    file: "NLX-2500-700=MAIN&SUB-TONBO=G7.8-PP1=24.04.02.txt",
    constName: "template_Tonbo_NLX_G78",
    outFile: "data_template_Tonbo_NLX_G78.js",
    inject: "all",
    header: [
      "// NLX-2500/700 トンボ — 雛形: NLX-2500-700=MAIN&SUB-TONBO=G7.8-PP1=24.04.02.txt",
      "// O1(SUB1)+O2(SUB2)+O3(MAIN)、G55/G56+M98P1/P2",
    ],
  },
  {
    file: "NLX-2500-700=MAIN&SUB-TONBO=M40X2-PP=24.04.02.txt",
    constName: "template_Tonbo_NLX_M40",
    outFile: "data_template_Tonbo_NLX_M40.js",
    inject: "first",
    header: [
      "// NLX-2500/700 トンボ — 雛形: NLX-2500-700=MAIN&SUB-TONBO=M40X2-PP=24.04.02.txt",
      "// SUB1 N1 は {{DRILL_BLOCK}}。SUB2 の N1 は雛形の短ドリル（片側のみ）を維持",
    ],
  },
];

const clJobs = [
  { file: "CL-2000-1=MAIN&SUB-TONBO=G7,8-PP=24.04.02.txt", constName: "template_Tonbo_CL_G78", outFile: "data_template_Tonbo_CL_G78.js" },
  { file: "CL-2000-1=MAIN&SUB-TONBO=M40X2-PP=24.04.02.txt", constName: "template_Tonbo_CL_M40", outFile: "data_template_Tonbo_CL_M40.js" },
  { file: "CL-2000-1=MAIN&SUB-TONBO=M22X1.5-PP=24.04.02.txt", constName: "template_Tonbo_CL_M22", outFile: "data_template_Tonbo_CL_M22.js" },
  { file: "CL-2000-1=MAIN&SUB-TONBO=M18X1.5-PP=24.04.02.txt", constName: "template_Tonbo_CL_M18", outFile: "data_template_Tonbo_CL_M18.js" },
  { file: "CL-2000-1=MAIN&SUB-TONBO=M15X1.25-PP=24.04.02.txt", constName: "template_Tonbo_CL_M15", outFile: "data_template_Tonbo_CL_M15.js" },
  { file: "CL-2000-1=MAIN&SUB-TONBO=M12X1-P=HGDR4.05+IN-MEN=24.04.02.txt", constName: "template_Tonbo_CL_M12", outFile: "data_template_Tonbo_CL_M12.js" },
];

for (const job of nlxJobs) {
  const p = path.join(refNlxDir, job.file);
  if (!fs.existsSync(p)) {
    console.error("Missing:", p);
    process.exit(1);
  }
  let body = fs.readFileSync(p, "utf8");
  body = applyNLX(body);
  if (job.inject === "all") body = injectDrillAllN1(body, blockNlxDrill);
  else body = injectDrillFirstN1Only(body, blockNlxDrill);
  const outPath = path.join(root, "テンプレート", job.outFile);
  fs.writeFileSync(
    outPath,
    wrapConst(job.constName, escTemplateLiteral(body), job.header),
    "utf8"
  );
  console.log("Wrote:", outPath);
}

for (const job of clJobs) {
  const p = path.join(refClDir, job.file);
  if (!fs.existsSync(p)) {
    console.error("Missing:", p);
    process.exit(1);
  }
  let body = fs.readFileSync(p, "utf8");
  body = applyCL(body);
  body = injectDrillAllN1(body, blockClDrill);
  const header = [
    `// CL-2000-1 トンボ — 雛形: ${job.file}`,
    "// O1(SUB1)+O2(SUB2)+O3(MAIN)",
  ];
  const outPath = path.join(root, "テンプレート", job.outFile);
  fs.writeFileSync(
    outPath,
    wrapConst(job.constName, escTemplateLiteral(body), header),
    "utf8"
  );
  console.log("Wrote:", outPath);
}
