/**
 * チューブ平底仕上一行の検証（assets/data.js の tubeData を実ファイルから読み込み）
 *
 * 実行: プロジェクトルートで
 *   node scripts/verify-tube-x6u2.mjs
 *
 * 注意: 下の ncFormat / computeFlatBottomExitLine / combineTubeFlatBottomFinishLine は
 * assets/app.js の同名関数と同じであること。app.js を変えたらここも揃えること。
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_JS = path.join(__dirname, "..", "assets", "data.js");

function loadTubeDataFromDataJs() {
  const code = fs.readFileSync(DATA_JS, "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(code + "\nvar __tubeExport = { machines, tubeData };", context);
  return context.__tubeExport.tubeData;
}

function ncFormat(val) {
  if (val === "" || val === null || val === undefined) return "";
  const num = parseFloat(val);
  if (isNaN(num)) return "";
  let s = num.toString();
  if (s.indexOf(".") === -1) {
    return s + ".";
  }
  return s;
}

function computeFlatBottomExitLine(input, tubeData) {
  const wt = input.workType;
  const st = input.internalStyle;

  function defaultLine() {
    if (wt === "G78" || wt === "M40") return "U-.2(X16)";
    if (wt === "M22") return "U-.2(X8)";
    return "U-.2";
  }

  if (st !== "Hirazoko") return defaultLine();

  let idDia = null;
  let toolDia = null;

  if (wt === "Tube" && tubeData && input.tubeSpec && tubeData[input.tubeSpec]) {
    const t = tubeData[input.tubeSpec];
    idDia = t.id;
    toolDia = t.toolDia;
  } else if (wt === "M12") {
    return "U-.2";
  } else {
    idDia = null;
    toolDia = null;
  }

  if (idDia == null || toolDia == null || isNaN(idDia) || isNaN(toolDia)) {
    return defaultLine();
  }

  const eps = 0.02;
  if (Math.abs(idDia - toolDia) < eps) return defaultLine();

  return "X" + ncFormat(toolDia) + "F.03";
}

function combineTubeFlatBottomFinishLine(toolDia, exitLine) {
  const e = String(exitLine || "").trim();
  if (toolDia === null || toolDia === undefined || isNaN(Number(toolDia))) {
    return e;
  }
  const xTool = "X" + ncFormat(Number(toolDia));
  if (e.length > 0 && e.charAt(0) === "U") {
    return xTool + e;
  }
  return e;
}

function assert(ok, msg) {
  if (!ok) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

const tubeData = loadTubeDataFromDataJs();

// --- 実データ連動の検証 ---
const spec86 = "8x6 (R0.5)";
const t86 = tubeData[spec86];
assert(t86 && t86.toolDia === 6 && t86.id === 6, `${spec86} の id/toolDia が data.js 通り (6/6)`);

const inputHira = { workType: "Tube", internalStyle: "Hirazoko", tubeSpec: spec86 };
const exit86 = computeFlatBottomExitLine(inputHira, tubeData);
const combined86 = combineTubeFlatBottomFinishLine(t86.toolDia, exit86);
assert(exit86 === "U-.2", `exitLine === "U-.2" (実際: ${JSON.stringify(exit86)})`);
assert(ncFormat(6) === "6.", `ncFormat(6) === "6." (実際: ${JSON.stringify(ncFormat(6))})`);
assert(
  combined86 === "X6.U-.2",
  `結合結果 === "X6.U-.2" (実際: ${JSON.stringify(combined86)})`
);

const specNull = "6.35x3.95 (R0.5)";
const tNull = tubeData[specNull];
assert(tNull && tNull.toolDia === null, `${specNull} の toolDia が null`);
const exitNull = computeFlatBottomExitLine(
  { workType: "Tube", internalStyle: "Hirazoko", tubeSpec: specNull },
  tubeData
);
const combinedNull = combineTubeFlatBottomFinishLine(tNull.toolDia, exitNull);
assert(combinedNull === "U-.2", `toolDia null 時は "U-.2" のみ (実際: ${JSON.stringify(combinedNull)})`);

const specMismatch = "9.53x6.33 (R1)";
const tm = tubeData[specMismatch];
assert(tm && Math.abs(tm.id - tm.toolDia) > 0.02, `${specMismatch} は id≠toolDia`);
const exitM = computeFlatBottomExitLine(
  { workType: "Tube", internalStyle: "Hirazoko", tubeSpec: specMismatch },
  tubeData
);
const combinedM = combineTubeFlatBottomFinishLine(tm.toolDia, exitM);
assert(
  exitM === "X6.F.03" && combinedM === "X6.F.03",
  `径不一致は X6.F.03 の1行 (exit=${JSON.stringify(exitM)} combined=${JSON.stringify(combinedM)})`
);

console.log("");
console.log("--- サマリ（data.js 実データ） ---");
console.log(spec86, "→", combined86);
console.log(specNull, "→", combinedNull);
console.log(specMismatch, "→", combinedM);
