/* =========================================================================
 * CWRU 真实样本层 —— 载入构建期抽取的 assets/data/cwru.{json,bin}
 * 页面里显示的不是画好的曲线，而是真实加速度窗口经 assets/dsp.js
 * 现场做 FFT / 带通 / Hilbert 包络解调后的实测结果。
 * ========================================================================= */
(function (global) {
  "use strict";

  const state = { index: null, bin: null, loading: null, analysis: {}, loo: null, error: null };

  function ensure() {
    if (state.index && state.bin) return Promise.resolve(true);
    if (state.loading) return state.loading;
    state.loading = Promise.all([
      fetch("assets/data/cwru.json").then(r => r.ok ? r.json() : Promise.reject(new Error("索引缺失 " + r.status))),
      fetch("assets/data/cwru.bin").then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error("波形缺失 " + r.status)))
    ]).then(([j, b]) => {
      state.index = j; state.bin = b; state.error = null;
      return true;
    }).catch(e => {
      state.error = e.message; state.loading = null;
      throw e;
    });
    return state.loading;
  }

  const ready = () => !!(state.index && state.bin);
  const samples = () => ready() ? state.index.samples : [];
  const sample = id => samples().find(s => s.id === String(id)) || null;

  /* Int16 PCM → Float64，按该窗标度还原到原始 g 量级 */
  function windowOf(entry) {
    const i16 = new Int16Array(state.bin, entry.offset * 2, entry.length);
    const out = new Float64Array(entry.length);
    for (let i = 0; i < entry.length; i++) out[i] = i16[i] * entry.scale;
    return out;
  }

  /* 包络实测：理论侧用官方目录标称转速，识别侧用波形测出的谱峰 */
  function analyze(id) {
    const s = sample(id);
    if (!s) return null;
    if (state.analysis[id]) return state.analysis[id];
    const DSP = global.DSP;
    const x = windowOf(s);
    const r = DSP.envelopeAnalysis(x, s.fs, { maxLen: s.length, band: { lo: s.demodBand[0], hi: s.demodBand[1], center: s.resonanceHz }, shaft: s.rpmTheory / 60 });
    const fr = s.rpmTheory / 60;
    const rawSpec = DSP.spectrum(DSP.detrend(x), s.fs, true);
    const table = [
      { code: "1X", name: "转频", factor: 1, spec: rawSpec },
      { code: "2X", name: "二倍频", factor: 2, spec: rawSpec },
      { code: "BPFI", name: "内圈通过频率", factor: DSP.CWRU_6205.BPFI, spec: r.envSpec },
      { code: "BPFO", name: "外圈通过频率", factor: DSP.CWRU_6205.BPFO, spec: r.envSpec },
      { code: "BSF", name: "滚珠自转频率", factor: DSP.CWRU_6205.BSF, spec: r.envSpec },
      { code: "FTF", name: "保持架频率", factor: DSP.CWRU_6205.FTF, spec: r.envSpec }
    ].map(t => {
      const th = fr * t.factor;
      const m = DSP.measure(t.spec, th);
      return Object.assign({ code: t.code, name: t.name, factor: t.factor, spec: t.spec }, m, {
        theory: th, valid: DSP.isValid(m)
      });
    });
    const res = {
      sample: s, x, fs: s.fs, fr, table,
      rawSpec, envSpec: r.envSpec, band: r.band,
      dominant: table.filter(t => t.valid && t.factor > 2).sort((a, b) => b.snr - a.snr)[0] || null,
      verdict: (() => {
        const d = table.filter(t => t.valid && t.factor > 2).sort((a, b) => b.snr - a.snr)[0];
        return d ? d.code : "NORMAL";
      })()
    };
    state.analysis[id] = res;
    return res;
  }

  /* ---------------- 特征向量：真实包络谱的带能量归一化 + 峭度 + 峰值因子 ---------------- */
  function featureVector(envSpec, fr, x) {
    const e = envSpec;
    const comps = [1, 2, global.DSP.CWRU_6205.BPFI, global.DSP.CWRU_6205.BPFO, global.DSP.CWRU_6205.BSF, global.DSP.CWRU_6205.FTF]
      .map(f => {
        const th = fr * f;
        const lo = Math.max(1, Math.floor(th * 0.965 / e.df));
        const hi = Math.min(e.mag.length - 1, Math.ceil(th * 1.035 / e.df));
        let s = 0; for (let k = lo; k <= hi; k++) s += e.mag[k] * e.mag[k];
        return Math.sqrt(s);
      });
    const mx = Math.max.apply(null, comps) || 1;
    return comps.map(v => v / mx).concat([kurtosis(x) / 12, Math.min(8, crest(x)) / 8]);
  }
  function kurtosis(x) {
    const n = x.length; let m = 0;
    for (let i = 0; i < n; i++) m += x[i]; m /= n;
    let m2 = 0, m4 = 0;
    for (let i = 0; i < n; i++) { const d = x[i] - m; m2 += d * d; m4 += d * d * d * d; }
    m2 /= n; m4 /= n; return m2 > 0 ? m4 / (m2 * m2) : 3;
  }
  function crest(x) {
    let p = 0, r = 0;
    for (let i = 0; i < x.length; i++) { p = Math.max(p, Math.abs(x[i])); r += x[i] * x[i]; }
    return p / Math.sqrt(r / x.length || 1e-9);
  }

  /**
   * 交叉验证。真值标签取自官方目录（IR/OR/B/NO），预测取自算法实测；
   * 混淆矩阵与全部指标都在运行时算出来，没有任何写死的常量。
   *
   * 默认按「样本文件」留一（LOSO）：预测某窗口时，同类中心必须排除来自同一 .mat 的全部窗口。
   * 同一只文件切出的窗口来自同一次连续录制、彼此高度相关，若只按窗口留一（LOO），
   * 同类近邻里含它自己的兄弟窗口，准确率会虚高——两种口径都算出来并标明，以免被误读。
   * 某类可用文件数 < 2 时该类无法留一，单列为「参照不足」，不计入准确率。
   */
  function crossValidate(bySample) {
    const set = [];
    state.index.windows.forEach(w => {
      const s = sample(w.id);
      if (!s || s.comparable === false || !s.catalog) return;
      const x = windowOf(w);
      const r = global.DSP.envelopeAnalysis(x, s.fs, {
        maxLen: w.length,
        band: { lo: s.demodBand[0], hi: s.demodBand[1], center: s.resonanceHz },
        shaft: s.rpmTheory / 60
      });
      set.push({ file: w.id, truth: s.catalog.element || "NO", vec: featureVector(r.envSpec, s.rpmTheory / 60, x) });
    });
    const usable = set.filter(s => s.truth && s.vec.every(v => isFinite(v)));
    const filesOf = L => new Set(usable.filter(s => s.truth === L).map(s => s.file));
    const allLabels = ["NO", "IR", "OR", "B"].filter(L => usable.some(s => s.truth === L));
    const degenerate = bySample ? allLabels.filter(L => filesOf(L).size < 2) : [];
    const labels = allLabels.filter(L => !degenerate.includes(L));
    const codeOf = { NO: "NORMAL", IR: "BPFI", OR: "BPFO", B: "BSF" };
    const cm = labels.map(() => labels.map(() => 0));
    let correct = 0, n = 0, skipped = 0;
    usable.forEach((s, i) => {
      const ti = labels.indexOf(s.truth);
      if (ti < 0) { skipped++; return; }
      let best = -1, bestD = Infinity;
      labels.forEach((L, li) => {
        const peers = usable.filter((p, pi) => p.truth === L &&
          (bySample ? p.file !== s.file : pi !== i));
        if (!peers.length) return;
        const cen = s.vec.map((_, k) => peers.reduce((a, p) => a + p.vec[k], 0) / peers.length);
        const d = Math.sqrt(s.vec.reduce((a, v, k) => a + (v - cen[k]) * (v - cen[k]), 0));
        if (d < bestD) { bestD = d; best = li; }
      });
      if (best < 0) { skipped++; return; }
      cm[ti][best]++; n++;
      if (best === ti) correct++;
    });
    const per = labels.map((L, i) => {
      const tp = cm[i][i];
      const fp = cm.reduce((a, row, r) => a + (r !== i ? row[i] : 0), 0);
      const fn = cm[i].reduce((a, v, c) => a + (c !== i ? v : 0), 0);
      const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
      return {
        label: L, code: codeOf[L], tp, fp, fn, precision, recall,
        f1: 2 * precision * recall / (precision + recall || 1e-9),
        support: cm[i].reduce((a, v) => a + v, 0), files: filesOf(L).size
      };
    });
    return {
      mode: bySample ? "loso" : "loo",
      protocol: bySample
        ? "留一法按样本文件（LOSO）· 同类中心排除同一 .mat 的全部窗口"
        : "留一法按窗口（LOO）· 含同文件相关窗口，偏乐观，仅作对照",
      labels, cm, per, n, correct,
      accuracy: n ? correct / n : 0,
      macroF1: per.reduce((a, p) => a + p.f1, 0) / (per.length || 1),
      degenerate, skipped,
      files: new Set(usable.map(s => s.file)).size,
      windows: usable.length,
      samples: samples().length,
      featureSet: "六条包络带能量归一化（1X/2X/BPFI/BPFO/BSF/FTF）+ 峭度 + 峰值因子 · 最近中心"
    };
  }

  let cvCache = null;
  const isCrossValidated = () => !!cvCache;
  function validate() {
    if (!ready()) return null;
    if (!cvCache) cvCache = { bySample: crossValidate(true), byWindow: crossValidate(false) };
    return cvCache;
  }
  /* 对外申报口径：按样本文件留一 */
  function leaveOneOut() { const v = validate(); return v && v.bySample; }

  global.CWRU = {
    ensure, ready, samples, sample, analyze, windowOf, validate, isCrossValidated, leaveOneOut, state,
    error: () => state.error
  };
})(window);
