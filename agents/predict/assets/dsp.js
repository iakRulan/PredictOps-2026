/* =========================================================================
 * DSP 层 —— 真实振动信号的频谱与包络解调分析
 * 无第三方依赖，浏览器与 Node 共用同一份实现，保证「页面里跑的算法」与
 * 「离线标定用的算法」完全一致。
 *
 * 用途：对 NASA CWRU 真实加速度波形做包络解调，实测轴承特征频率，
 *       再与 6205-2RS 几何参数导出的理论系数比对。所有偏差均由数据算出。
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------- 复数 FFT（原位迭代 Cooley-Tukey，长度须为 2 的幂） ---------------- */
  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < (len >> 1); k++) {
          const a = i + k, b = a + (len >> 1);
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  function detrend(x) {                 // 去均值 + 去线性趋势，抑制基线漂移
    const n = x.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    const den = n * sxx - sx * sx;
    const b = den ? (n * sxy - sx * sy) / den : 0;
    const a = (sy - b * sx) / n;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = x[i] - (a + b * i);
    return out;
  }

  function hann(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    return w;
  }

  /* ---------------- 单边幅值谱 ---------------- */
  // 返回 {freqs, mag, df}；mag 按窗能量归一，量级与原始信号幅值同阶
  function spectrum(x, fs, useWindow) {
    const n = x.length;
    const re = new Float64Array(n), im = new Float64Array(n);
    const w = useWindow === false ? null : hann(n);
    let sumW = 0;
    for (let i = 0; i < n; i++) { re[i] = w ? x[i] * w[i] : x[i]; sumW += w ? w[i] : 1; }
    fft(re, im, false);
    const half = n >> 1;
    const freqs = new Float64Array(half + 1), mag = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) {
      freqs[k] = k * fs / n;
      mag[k] = Math.hypot(re[k], im[k]) * 2 / sumW;
    }
    mag[0] = 0;                          // 已去趋势，直流无意义
    return { freqs, mag, df: fs / n };
  }

  /* ---------------- 频域带通（保留 [lo,hi]，含共轭负频） ---------------- */
  function bandpass(x, fs, lo, hi) {
    const n = x.length;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[i];
    fft(re, im, false);
    for (let k = 0; k < n; k++) {
      const f = k <= n / 2 ? k * fs / n : (n - k) * fs / n;
      if (f < lo || f > hi) { re[k] = 0; im[k] = 0; }
    }
    fft(re, im, true);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = re[i];
    return out;
  }

  /* ---------------- Hilbert 解析信号 → 包络 ---------------- */
  function envelope(x) {
    const n = x.length;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[i];
    fft(re, im, false);
    const half = n >> 1;
    for (let k = 1; k < half; k++) { re[k] *= 2; im[k] *= 2; }    // 正频加倍
    for (let k = half + 1; k < n; k++) { re[k] = 0; im[k] = 0; }   // 负频清零
    fft(re, im, true);
    const env = new Float64Array(n);
    for (let i = 0; i < n; i++) env[i] = Math.hypot(re[i], im[i]);
    return env;
  }

  /* ---------------- 亚 bin 峰值细化 ---------------- */
  // 取整 bin 在 30 Hz 量级上会带来 ±1.2% 以上的量化误差，足以污染特征频率偏差判定，
  // 因此所有频率读数一律做抛物线插值。
  function refine(spec, k) {
    const y0 = spec.mag[k - 1], y1 = spec.mag[k], y2 = spec.mag[k + 1];
    const den = y0 - 2 * y1 + y2;
    const d = den !== 0 ? 0.5 * (y0 - y2) / den : 0;
    return spec.freqs[k] + Math.max(-0.5, Math.min(0.5, d)) * spec.df;
  }

  function peakInRange(spec, lo, hi) {
    const { mag } = spec;
    const k0 = Math.max(1, Math.floor(lo / spec.df));
    const k1 = Math.min(mag.length - 2, Math.ceil(hi / spec.df));
    let bi = -1, bv = -1;
    for (let k = k0; k <= k1; k++) if (mag[k] > bv) { bv = mag[k]; bi = k; }
    if (bi < 1) return null;
    return { freq: refine(spec, bi), mag: bv, bin: bi };
  }

  /* ---------------- 冲击共振带自动选择 ---------------- */
  // 在 1.2k~fs/2.2 之间找能量最集中的频点，取其 ±1 kHz 作解调带
  function resonanceBand(x, fs) {
    const spec = spectrum(x, fs, true);
    const p = peakInRange(spec, 1200, Math.max(1300, fs / 2.2));
    if (!p) return { lo: 1000, hi: 3000, center: 2000, mag: 0 };
    return { lo: Math.max(200, p.freq - 1000), hi: Math.min(fs / 2 - 100, p.freq + 1000), center: p.freq, mag: p.mag };
  }

  /* ---------------- 主轴转频实测 ---------------- */
  // CWRU 驱动端信号存在显著 60 Hz 工频干扰。若只是「跳过落在工频上的候选」，
  // 会连 2×30≈60 的真实转频一起误杀（实测踩过此坑）；
  // 正确做法是先把工频及其谐波邻域陷波，再在净化后的谱上找 1X 并用谐波族打分。
  const LINE = [50, 60, 100, 120, 150, 180];
  const NOTCH = 1.5;                        // Hz，单侧陷波宽度

  function notchLine(spec) {
    const s = { freqs: spec.freqs, mag: Float64Array.from(spec.mag), df: spec.df };
    for (let k = 1; k < s.mag.length; k++) {
      if (LINE.some(l => Math.abs(s.freqs[k] - l) < NOTCH)) s.mag[k] = 0;
    }
    return s;
  }

  function shaftFreq(x, fs, lo, hi) {
    lo = lo || 15; hi = hi || 45;
    const spec = notchLine(spectrum(detrend(x), fs, true));
    const at = f => {
      const k = Math.round(f / spec.df);
      return k > 0 && k < spec.mag.length ? spec.mag[k] : 0;
    };
    let best = -1, bestScore = 0;
    const k0 = Math.ceil(lo / spec.df), k1 = Math.min(spec.mag.length - 2, Math.floor(hi / spec.df));
    for (let k = k0; k <= k1; k++) {
      if (spec.mag[k] <= 0) continue;
      if (spec.mag[k] < spec.mag[k - 1] || spec.mag[k] < spec.mag[k + 1]) continue;   // 只取局部峰
      const score = at(spec.freqs[k]) + at(2 * spec.freqs[k]) * 0.7 + at(3 * spec.freqs[k]) * 0.5;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best < 0 ? null : refine(spec, best);
  }

  /* ---------------- 包络谱完整管线 ---------------- */
  // 输入：一段真实加速度（官方量纲 g）；输出：包络谱 + 解调带 + 实测转频
  function envelopeAnalysis(xRaw, fs, opts) {
    opts = opts || {};
    const n = nextPow2(Math.min(xRaw.length, opts.maxLen || 16384));
    const x = detrend(Float64Array.from(xRaw.subarray(0, n)));
    const band = opts.band || resonanceBand(x, fs);
    const bp = bandpass(x, fs, band.lo, band.hi);
    const env = detrend(envelope(bp));
    const spec = spectrum(env, fs, true);
    return {
      n, fs, band,
      envSpec: spec,
      shaft: opts.shaft || shaftFreq(x, fs),
      peak: peakInRange(spec, 20, 1500)
    };
  }

  /* ---------------- 轴承特征频率理论系数（6205-2RS，CWRU 试验台轴承） ---------------- */
  const CWRU_6205 = { BPFI: 5.4152, BPFO: 3.5840, BSF: 2.3569, FTF: 0.3982 };

  /**
   * 实测某特征频率分量：在理论值 ±tol 窗口内取峰并细化，报告实测频率、偏差与信噪比。
   * snr = 峰值 / 同窗口中位数，用于区分「真峰」与「窗口里恰好有噪声」。
   */
  function measure(spec, theoryHz, tolRatio) {
    const tol = tolRatio == null ? 0.035 : tolRatio;
    const p = peakInRange(spec, theoryHz * (1 - tol), theoryHz * (1 + tol));
    if (!p) return { theory: theoryHz, measured: null, dev: null, detected: false, snr: 0 };
    const lo = Math.max(1, Math.floor(theoryHz * (1 - tol) / spec.df));
    const hi = Math.min(spec.mag.length - 2, Math.ceil(theoryHz * (1 + tol) / spec.df));
    const seg = [];
    for (let k = lo; k <= hi; k++) seg.push(spec.mag[k]);
    seg.sort((a, b) => a - b);
    const med = seg[Math.floor(seg.length / 2)] || 1e-12;
    return {
      theory: theoryHz,
      measured: p.freq,
      dev: (p.freq - theoryHz) / theoryHz * 100,
      detected: true,
      snr: p.mag / med
    };
  }

  /* 判定规则：|偏差| ≤ devTol 且 snr ≥ snrTol 才算该分量被真实检出 */
  const RULE = { devTol: 2, snrTol: 8 };
  function isValid(m) {
    return !!(m && m.detected && Math.abs(m.dev) <= RULE.devTol && m.snr >= RULE.snrTol);
  }

  global.DSP = {
    fft, nextPow2, detrend, hann, spectrum, bandpass, envelope, refine,
    peakInRange, resonanceBand, shaftFreq, envelopeAnalysis, measure, isValid, RULE,
    CWRU_6205, LINE
  };
})(typeof window !== "undefined" ? window : module.exports);
