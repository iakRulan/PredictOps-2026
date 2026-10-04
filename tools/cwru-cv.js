/* 交叉验证协议对照：窗口级留一(LOO) vs 样本级留一(LOSO)
 *
 * 同一只 .mat 切出的多段窗口来自同一次连续录制，彼此高度相关。
 * 若按「窗口」留一，被测窗口的同类近邻里包含同一只文件的兄弟窗口，
 * 中心点被它自己那一组拉着 → 准确率虚高（数据泄漏）。
 * 正确的公开数据集申报口径是按「样本文件」留一：预测某窗口时，
 * 同类中心必须排除来自同一 .mat 的全部窗口。
 *
 *   node tools/cwru-cv.js
 */
const fs = require("fs");
const path = require("path");
const DSP = require("../assets/dsp.js").DSP;

const DATA = path.join(__dirname, "..", "assets", "data");
const idx = JSON.parse(fs.readFileSync(path.join(DATA, "cwru.json"), "utf8"));
const bin = fs.readFileSync(path.join(DATA, "cwru.bin"));

const sampleOf = id => idx.samples.find(s => s.id === id);

function windowOf(e) {
  const n = e.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.readInt16LE(e.offset * 2 + i * 2) * e.scale;
  return out;
}
function kurtosis(x) {
  const n = x.length; let m = 0;
  for (const v of x) m += v; m /= n;
  let m2 = 0, m4 = 0;
  for (const v of x) { const d = v - m; m2 += d * d; m4 += d * d * d * d; }
  m2 /= n; m4 /= n; return m2 > 0 ? m4 / (m2 * m2) : 3;
}
function crest(x) {
  let p = 0, r = 0;
  for (const v of x) { p = Math.max(p, Math.abs(v)); r += v * v; }
  return p / Math.sqrt(r / x.length || 1e-9);
}

/* 特征：六条频带能量（按最大值归一）+ 峭度 + 峰值因子 */
function features(x, s) {
  const r = DSP.envelopeAnalysis(x, s.fs, {
    maxLen: x.length,
    band: { lo: s.demodBand[0], hi: s.demodBand[1], center: s.resonanceHz },
    shaft: s.rpmTheory / 60
  });
  const e = r.envSpec, fr = s.rpmTheory / 60;
  const comps = [1, 2, DSP.CWRU_6205.BPFI, DSP.CWRU_6205.BPFO, DSP.CWRU_6205.BSF, DSP.CWRU_6205.FTF].map(f => {
    const th = fr * f;
    const lo = Math.max(1, Math.floor(th * 0.965 / e.df));
    const hi = Math.min(e.mag.length - 1, Math.ceil(th * 1.035 / e.df));
    let a = 0; for (let k = lo; k <= hi; k++) a += e.mag[k] * e.mag[k];
    return Math.sqrt(a);
  });
  const mx = Math.max.apply(null, comps) || 1;
  return comps.map(v => v / mx).concat([kurtosis(x) / 12, Math.min(8, crest(x)) / 8]);
}

const LABELS = ["NO", "IR", "OR", "B"];
const NAME = { NO: "正常基线", IR: "内圈", OR: "外圈", B: "滚珠" };

const items = idx.windows
  .filter(w => { const s = sampleOf(w.id); return s && s.comparable !== false && s.catalog; })
  .map(w => {
    const s = sampleOf(w.id);
    return { file: w.id, truth: s.catalog.element, vec: features(windowOf(w), s) };
  });

function nearestCentroid(excludeSameFile) {
  const cm = LABELS.map(() => LABELS.map(() => 0));
  let ok = 0, n = 0;
  items.forEach((it, i) => {
    let best = -1, bd = Infinity;
    LABELS.forEach((Lb, li) => {
      const g = items.filter((p, pi) => p.truth === Lb &&
        (excludeSameFile ? p.file !== it.file : pi !== i));
      if (!g.length) return;
      const cen = it.vec.map((_, k) => g.reduce((a, p) => a + p.vec[k], 0) / g.length);
      const d = Math.sqrt(it.vec.reduce((a, v, k) => a + (v - cen[k]) * (v - cen[k]), 0));
      if (d < bd) { bd = d; best = li; }
    });
    if (best < 0) return;
    cm[LABELS.indexOf(it.truth)][best]++; n++;
    if (LABELS[best] === it.truth) ok++;
  });
  const per = LABELS.map((lb, i) => {
    const tp = cm[i][i];
    const fp = cm.reduce((a, row, r) => a + (r !== i ? row[i] : 0), 0);
    const fn = cm[i].reduce((a, v, c) => a + (c !== i ? v : 0), 0);
    const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
    return { lb, tp, fp, fn, p, r, f1: 2 * p * r / (p + r || 1e-9), sup: tp + fn };
  }).filter(x => x.sup);
  return { ok, n, acc: ok / n, per, macroF1: per.reduce((a, x) => a + x.f1, 0) / per.length, cm };
}

function show(tag, res) {
  console.log(`\n${tag}：准确率 ${(res.acc * 100).toFixed(2)}%（${res.ok}/${res.n}） 宏平均 F1 ${res.macroF1.toFixed(4)}`);
  res.per.forEach(x => console.log(`   ${NAME[x.lb].padEnd(5)} P ${x.p.toFixed(3)}  R ${x.r.toFixed(3)}  F1 ${x.f1.toFixed(3)}  N ${x.sup}`));
  console.log("   混淆矩阵(行真值/列预测) " + LABELS.map(l => NAME[l]).join(" "));
  res.cm.forEach((row, i) => { if (res.per.some(p => p.lb === LABELS[i])) console.log("     " + NAME[LABELS[i]].padEnd(5) + row.join("  ")); });
}

console.log("参与验证的真实窗口：", items.length, "段，来自", new Set(items.map(i => i.file)).size, "只 .mat");
show("窗口级留一 LOO（含同文件兄弟窗口，偏乐观）", nearestCentroid(false));
show("样本级留一 LOSO（排除同文件全部窗口，申报口径）", nearestCentroid(true));
