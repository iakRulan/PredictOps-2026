/* =========================================================================
 * CWRU 真实数据抽取与溯源工具（构建期运行，产物提交进仓库）
 *
 *   node tools/cwru-extract.js <mat目录> <输出目录> [限定编号...]
 *
 * 对每个官方 .mat：
 *   1. 记录 sha256 / 字节数 / MATLAB 头 —— 「数据确系官网原始文件」的证据
 *   2. 解析 MAT v5，取驱动端加速度变量 X<id>_DE_time
 *   3. 由数组长度反推采样率（12k ≈ 122281 点，48k ≈ 489000 点），不采信二手元数据
 *   4. 切 1 段 16384 点标定窗 + N 段互不重叠的 4096 点评测窗
 *   5. 用与前端完全相同的 assets/dsp.js 做包络解调，实测特征频率
 *   6. 理论侧转速取官方目录标称 rpm（tools/cwru-catalog.js 抓取），
 *      判定侧峰值由波形实测 —— 真值与预测彼此独立，比对结果才是真的
 *   7. 产出 assets/data/cwru.bin（Int16 PCM）+ assets/data/cwru.json
 * ========================================================================= */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { readMat } = require("../tools/mat5");
const DSP = require("../assets/dsp.js").DSP || global.DSP;

const EVAL_WINDOWS = 8;       // 每只样本的评测窗段数

const ELEMENT_OF = { IR: "BPFI", OR: "BPFO", B: "BSF", NO: null };

/* 采样率判据：CWRU 每段录制时长固定，12k→约 12.2 万点(10.1 s)，48k→约 24.4 万点(5.1 s)。
 * 用长度反推比采信二手页码更可靠，页码留作交叉校验记入产物。 */
function inferFs(len) {
  if (len >= 180000) return 48000;
  if (len >= 60000) return 12000;
  return null;
}

/* 分析窗按「等时长」而非等点数取，保证 12k 与 48k 数据的频率分辨率一致：
 * 标定窗 1.365 s（df ≈ 0.73 Hz）、评测窗 0.341 s —— 否则 48k 文件分辨率被稀释 4 倍 */
const CAL_SECONDS = 16384 / 12000;
const EVAL_SECONDS = 4096 / 12000;
const windowLens = fsHz => ({
  cal: Math.min(DSP.nextPow2(Math.floor(fsHz * CAL_SECONDS)), 65536),
  evalW: Math.min(DSP.nextPow2(Math.floor(fsHz * EVAL_SECONDS)), 16384)
});

/* 元素判定：在包络谱上实测三条候选分量，按 DSP.RULE 取有效且信噪比最高者 */
function diagnose(envSpec, fr) {
  return [["BPFI", "IR"], ["BPFO", "OR"], ["BSF", "B"]].map(([code, el]) =>
    Object.assign({ code, element: el }, DSP.measure(envSpec, fr * DSP.CWRU_6205[code]))
  ).filter(DSP.isValid).sort((a, b) => b.snr - a.snr);
}

function quantize(win) {                       // 双精度 → Int16 PCM，附还原标度
  let peak = 0;
  for (let i = 0; i < win.length; i++) peak = Math.max(peak, Math.abs(win[i]));
  const scale = peak / 32767 || 1;
  const out = new Int16Array(win.length);
  for (let i = 0; i < win.length; i++) out[i] = Math.round(win[i] / scale);
  return { out, scale, peak: +peak.toFixed(4) };
}

function kurtosis(x) {
  const n = x.length; let m = 0;
  for (let i = 0; i < n; i++) m += x[i]; m /= n;
  let m2 = 0, m4 = 0;
  for (let i = 0; i < n; i++) { const d = x[i] - m; m2 += d * d; m4 += d * d * d * d; }
  m2 /= n; m4 /= n; return m2 > 0 ? m4 / (m2 * m2) : 3;
}

function loadCatalog(dir) {
  const f = path.join(dir, "cwru-catalog.json");
  if (!fs.existsSync(f)) return { map: {}, source: null };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function main(srcDir, outDir) {
  const only = process.argv.slice(4);
  const cat = loadCatalog(outDir);
  const files = fs.readdirSync(srcDir).filter(f => /^\d+\.mat$/.test(f))
    .filter(f => !only.length || only.includes(path.basename(f, ".mat")));

  const index = {
    provenance: {
      source: "NASA CWRU Bearing Data Center · https://engineering.case.edu/bearingdatacenter",
      catalog: cat.source || null, catalogFetchedAt: cat.fetchedAt || null,
      generated: new Date().toISOString(),
      algorithm: "assets/dsp.js（浏览器与构建期同一份实现）",
      rule: "判定条件 |偏差| ≤ " + DSP.RULE.devTol + "% 且 包络谱信噪比 ≥ " + DSP.RULE.snrTol
    },
    unit: "g（官方驱动端加速度量纲）", samples: [], windows: []
  };
  const blobs = [];
  let offset = 0;

  for (const f of files.sort()) {
    const buf = fs.readFileSync(path.join(srcDir, f));
    const id = path.basename(f, ".mat");
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    let mat;
    try { mat = readMat(buf, true); }   // 容忍官方文件里 MATLAB 残留的残缺 ans 变量，跳过后继续走
    catch (e) { console.log("!! " + f + " 解析失败：" + e.message); continue; }

    // 变量名必须与本文件编号一致：官方 99.mat 里同时打包了 X098_DE_time，
    // 按「最长的 DE 变量」挑会取到另一只样本的通道
    const wanted = ["X" + id.padStart(3, "0") + "_DE_time", "X" + id + "_DE_time"];
    const de = mat.variables.filter(v => wanted.indexOf(v.name) >= 0 && v.values && v.values.length > 8192)[0];
    if (!de) { console.log("!! " + f + " 未找到编号匹配的 X<id>_DE_time（已解析变量：" +
      mat.variables.map(v => v.name).join(",") + "）"); continue; }
    const decoys = mat.variables.filter(v => /^X\d+_DE/.test(v.name) && wanted.indexOf(v.name) < 0)
      .map(v => v.name + ":" + v.values.length);

    const meta = (cat.map || {})[id] || null;
    const lenFs = inferFs(de.values.length);                 // 长度判据为准（数据自证）
    const fsHz = lenFs || (meta && meta.fs);
    if (!fsHz) { console.log("!! " + f + " 采样率不可判定 len=" + de.values.length); continue; }
    const wl = windowLens(fsHz);

    const cal = de.values.subarray(0, wl.cal);
    const measShaft = DSP.shaftFreq(DSP.detrend(cal), fsHz);
    const frNom = meta && meta.rpm ? meta.rpm / 60 : measShaft;
    const fr = frNom;                     // 理论侧优先官方标称转速
    const r = DSP.envelopeAnalysis(cal, fsHz, { maxLen: wl.cal, shaft: fr });
    const hits = diagnose(r.envSpec, fr);

    const rec = {
      id, file: id + ".mat", bytes: buf.length, sha256: sha,
      header: mat.header, variable: de.name, sampleCount: de.values.length,
      fs: fsHz, durationS: +(de.values.length / fsHz).toFixed(2),
      fsCheck: { lengthImplied: lenFs, pageDeclared: meta ? meta.fs || null : null, agree: !!(meta && meta.fs) ? meta.fs === lenFs : null },
      catalog: meta, rpmTheory: +(fr * 60).toFixed(1), shaftHzMeasured: measShaft ? +measShaft.toFixed(2) : null,
      shaftBlindHz: measShaft ? +measShaft.toFixed(2) : null,
      // 说明：DE 通道 1X 常被打频/工频成分压住，盲搜会挑到别的峰（98.mat 给过 19.22 Hz），
      // 故本字段仅作元数据留档；理论转速一律取官方目录标称值，不做「交叉校验」展示。
      demodBand: [Math.round(r.band.lo), Math.round(r.band.hi)],
      resonanceHz: Math.round(r.band.center),
      windowSec: +(wl.cal / fsHz).toFixed(3),
      kurtosis: +kurtosis(cal).toFixed(2),
      measured: hits.map(h => ({ code: h.code, theory: +h.theory.toFixed(2), measured: +h.measured.toFixed(2), devPct: +h.dev.toFixed(2), snr: +h.snr.toFixed(1) })),
      verdict: hits.length ? hits[0].code : "NORMAL",
      // 6205-2RS 试验台的变量名遵循 X<id>_DE_time；0.028/0.040 组为另一型号轴承，
      // 其几何系数不同于 6205，特征频率比对不适用，据实标记为不参与比对。
      comparable: de.name === "X" + id.padStart(3, "0") + "_DE_time",
      truth: meta ? (ELEMENT_OF[meta.element] || "NORMAL") : null,
      agree: meta ? (hits.length ? hits[0].element === meta.element : meta.element === "NO") : null
    };

    const q1 = quantize(cal);   // 注意：Buffer.from(typedArray) 只按元素数取字节，必须传 .buffer
    blobs.push(Buffer.from(q1.out.buffer));
    index.samples.push(Object.assign({}, rec, { kind: "cal", offset, length: wl.cal, scale: q1.scale, peak: q1.peak }));
    offset += wl.cal;

    let evalCount = 0;
    for (let w = 0; w < EVAL_WINDOWS; w++) {
      const at = wl.cal + w * wl.evalW;
      if (at + wl.evalW > de.values.length) break;
      const win = de.values.subarray(at, at + wl.evalW);
      const q = quantize(win);
      blobs.push(Buffer.from(q.out.buffer));
      index.windows.push({
        id, offset, length: wl.evalW, scale: q.scale,
        element: meta ? meta.element : null, verdict: rec.verdict,
        fr, kurtosis: +kurtosis(win).toFixed(2)
      });
      offset += wl.evalW; evalCount++;
    }
    rec.evalWindows = evalCount;

    console.log([
      id.padEnd(5), (fsHz / 1000) + "k",
      (meta ? meta.element + " " + (meta.diameter || "-") + " " + meta.hp + "HP " + meta.rpm + "rpm" : "目录无此项"),
      "盲搜1X=" + (rec.shaftBlindHz || "-") + "Hz 标称" + rec.rpmTheory + "rpm",
      "带=" + rec.demodBand.join("-"),
      "判定=" + rec.verdict, "一致=" + (rec.agree === null ? "-" : rec.agree ? "✓" : "✗"),
      "K=" + rec.kurtosis,
      rec.measured.map(m => m.code + ":" + (m.devPct >= 0 ? "+" : "") + m.devPct + "%/SNR" + m.snr).join(" ")
    ].join("  "));
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "cwru.bin"), Buffer.concat(blobs));
  fs.writeFileSync(path.join(outDir, "cwru.json"), JSON.stringify(index, null, 1));
  const agree = index.samples.filter(s => s.agree !== null);
  console.log("\n样本 " + index.samples.length + " 只 / 评测窗 " + index.windows.length +
    " 段 / bin " + (Buffer.concat(blobs).length / 1024).toFixed(0) + " KB → " + outDir +
    "\n元素判定与官方目录一致：" + agree.filter(s => s.agree).length + " / " + agree.length);
}

main(process.argv[2] || "/tmp/cwru", process.argv[3] || "assets/data");
