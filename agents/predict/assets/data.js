/* =========================================================================
 * 设备智能管理与预测性维护系统 —— 数据仿真引擎（感知层 / 推理层）
 * 模拟三类关键设备的振动、温度、电流时序信号，支持工况切换与轴承故障注入
 * ========================================================================= */
(function (global) {
  "use strict";

  const WINDOW = 60;              // 时序窗口点数
  const SAMPLE_MS = 1000;         // 每点代表 1 秒

  /* ---------- 设备台账 ---------- */
  const DEVICES = [
    {
      id: "CNC-01",
      name: "数控机床",
      model: "VMC-850 立式加工中心",
      icon: "cnc",
      location: "一号车间 · A3 产线",
      runHours: 8412,
      rulDays: 108,      // 名义剩余寿命（正常态，天）——精密主轴，维护频繁
      degradeRate: 0.20, // 正常态劣化速率（分/天）
      base: { acc: 1.15, disp: 7.5, temp: 44.5, current: 12.4, speed: 3600 },
      limits: { temp: 70, acc: 6.0, current: 20 },
      parts: ["主轴轴承 7014C", "滚珠丝杠副", "伺服驱动器", "润滑泵组件"]
    },
    {
      id: "AC-01",
      name: "螺杆空压机",
      model: "GA-75VSD 永磁变频",
      icon: "compressor",
      location: "动力站 · B1 机房",
      runHours: 15320,
      rulDays: 132,      // 螺杆主机，磨损平缓
      degradeRate: 0.14,
      base: { acc: 2.05, disp: 14.0, temp: 76.5, current: 38.5, speed: 2980 },
      limits: { temp: 95, acc: 8.0, current: 52 },
      parts: ["主机轴承 NU214", "油气分离芯", "空气过滤器", "温控阀", "联轴器弹性块"]
    },
    {
      id: "PMP-01",
      name: "离心泵",
      model: "IH100-65-200 单级离心",
      icon: "pump",
      location: "循环水站 · C2 泵房",
      runHours: 21045,
      rulDays: 96,       // 叶轮汽蚀敏感
      degradeRate: 0.26,
      base: { acc: 2.35, disp: 16.5, temp: 54.0, current: 22.8, speed: 2900 },
      limits: { temp: 80, acc: 9.0, current: 32 },
      parts: ["轴承 6308/C3", "机械密封", "叶轮", "泵轴", "联轴器"]
    }
  ];

  /* ---------- 工况 / 故障模式定义 ---------- */
  const STATES = {
    normal: {
      key: "normal", label: "正常态", short: "正常", level: 0,
      desc: "各特征参数处于健康基线范围内，振动频谱平稳，无异常谐波。",
      acc: 1.0, disp: 1.0, temp: 1.0, cur: 1.0, noise: 1.0, impulse: 0
    },
    degraded: {
      key: "degraded", label: "劣化态", short: "劣化", level: 1,
      desc: "振动幅值抬升、温度缓慢上移，出现早期谐波分量，处于亚健康区间。",
      acc: 1.85, disp: 1.7, temp: 1.12, cur: 1.06, noise: 1.5, impulse: 0.10
    },
    "fault-bpfi": {
      key: "fault-bpfi", label: "轴承内圈故障", short: "内圈故障", level: 2,
      desc: "内圈滚道剥落，出现 BPFI 特征频率及转频边带，冲击脉冲明显，温度急升。",
      acc: 3.6, disp: 3.2, temp: 1.26, cur: 1.14, noise: 2.4, impulse: 1.0, freq: "BPFI"
    },
    "fault-bpfo": {
      key: "fault-bpfo", label: "轴承外圈故障", short: "外圈故障", level: 2,
      desc: "外圈滚道点蚀，BPFO 特征频率突出且边带稀少，周期性冲击能量上升。",
      acc: 3.2, disp: 2.9, temp: 1.2, cur: 1.1, noise: 2.1, impulse: 0.9, freq: "BPFO"
    },
    "fault-unbalance": {
      key: "fault-unbalance", label: "转子不平衡", short: "不平衡", level: 2,
      desc: "转频 1X 分量显著增大，径向振动随转速上升，轴向振动轻微。",
      acc: 2.9, disp: 3.6, temp: 1.12, cur: 1.16, noise: 1.4, impulse: 0.2, freq: "1X"
    }
  };

  /* ---------- 工具函数 ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
  function pad(n) { return String(n).padStart(2, "0"); }
  function clockStr(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }

  /* =========================================================================
   * 单设备仿真通道
   * ========================================================================= */
  function DeviceChannel(def) {
    this.def = def;
    this.state = "normal";
    this.stateSince = Date.now();
    this.hist = { acc: [], disp: [], temp: [], current: [] };
    this.time = [];
    this.degradeLevel = 0;      // 累积劣化度 0~1
    this.cursor = null;         // 频谱告警游标频率 (Hz)
    this._alert = null;         // 当前工况缓存的预警对象
    this._long = { acc: [] };   // 长缓冲（用于稳定计算峭度等统计指标）
    this._phase = Math.random() * Math.PI * 2;
    this._impulsePhase = 0;
    this._seed = Date.now() % 100000;
    this._prime();
  }

  DeviceChannel.prototype._prime = function () {
    const now = Date.now();
    for (let i = WINDOW - 1; i >= 0; i--) {
      const t = new Date(now - i * SAMPLE_MS);
      this.time.push(clockStr(t));
      this._push(this._sample(0.55), false);
    }
  };

  /**
   * 生成单个采样点
   * @param {number} warm 预热系数（用于初始化历史时更接近基线）
   * @param {boolean} store
   */
  DeviceChannel.prototype._sample = function (warm) {
    const d = this.def, b = d.base, st = STATES[this.state];
    this._phase += 0.22;
    this._impulsePhase += 1;
    const w = warm == null ? 1 : warm;

    // 劣化累积：劣化/故障态下随时间漂移
    if (st.level > 0) this.degradeLevel = clamp(this.degradeLevel + 0.0016 * st.level, 0, 1);
    else this.degradeLevel = clamp(this.degradeLevel - 0.004, 0, 1);
    const drift = 1 + this.degradeLevel * 0.28;

    // 振动加速度 (m/s²)
    let acc = b.acc * st.acc * drift
      + Math.sin(this._phase) * b.acc * 0.12
      + gauss() * 0.09 * st.noise;
    // 特征频率冲击
    if (st.impulse > 0) {
      const period = st.freq === "BPFO" ? 7 : st.freq === "BPFI" ? 9 : st.freq === "1X" ? 20 : 11;
      if (this._impulsePhase % period === 0) {
        acc += b.acc * (1.3 + this.degradeLevel) * st.impulse * (0.7 + Math.random() * 0.6);
      }
    }
    acc = Math.max(0.05, acc);

    // 振动位移 (µm)
    let disp = b.disp * st.disp * drift
      + Math.sin(this._phase * 0.5 + 1.1) * b.disp * 0.1
      + gauss() * 0.55 * st.noise;
    disp = Math.max(0.3, disp);

    // 温度 (°C) —— 一阶惯性 + 缓慢漂移
    const targetTemp = b.temp * st.temp * drift;
    const prevTemp = this.hist.temp.length ? this.hist.temp[this.hist.temp.length - 1] : b.temp;
    let temp = prevTemp + (targetTemp - prevTemp) * 0.18 + gauss() * 0.35 * st.noise;
    temp = clamp(temp, 20, d.limits.temp + 12);

    // 电流 (A) —— 负载波动 + 故障引起的波动加剧
    let current = b.current * st.cur * (1 + 0.03 * Math.sin(this._phase * 0.3))
      + gauss() * 0.28 * st.noise;
    current = Math.max(0.5, current);

    if (w == null) w = 1;
    return {
      acc: round(acc, 3),
      disp: round(disp, 2),
      temp: round(temp, 2),
      current: round(current, 2)
    };
  };

  DeviceChannel.prototype._push = function (p, cap) {
    const h = this.hist;
    h.acc.push(p.acc); h.disp.push(p.disp);
    h.temp.push(p.temp); h.current.push(p.current);
    if (cap !== false) {
      Object.keys(h).forEach(k => { if (h[k].length > WINDOW) h[k].shift(); });
      if (this.time.length > WINDOW) this.time.shift();
    }
    // 长缓冲：稳定统计量（峭度等）
    this._long.acc.push(p.acc);
    if (this._long.acc.length > 240) this._long.acc.shift();
  };

  /** 推进一拍：追加当前时刻的新点，滚出最旧点 */
  DeviceChannel.prototype.tick = function () {
    const p = this._sample(1);
    this.time.push(clockStr(new Date()));
    if (this.time.length > WINDOW) this.time.shift();
    this._push(p, true);
    return p;
  };

  /** 切换工况：清空劣化累积，历史保留但后续按新工况生成 */
  DeviceChannel.prototype.setState = function (key) {
    if (!STATES[key] || this.state === key) return;
    this.state = key;
    this.stateSince = Date.now();
    this._impulsePhase = 0;
    this._alert = null;         // 工况变更后重新生成预警，保证视图一致
    const target = STATES[key];
    if (target.level === 0) this.degradeLevel = 0;
    // 重建长缓冲，使峭度等统计指标立即反映新工况
    this._long.acc = [];
    for (let i = 0; i < 240; i++) this._long.acc.push(this._sample(1).acc);
    for (let i = 0; i < 14; i++) this.tick();
  };

  /** 五维量化评分明细（权重 / 实时子分数 / 计算依据 / 判断阈值） */
  DeviceChannel.prototype.metrics = function () {
    const h = this.hist, def = this.def, round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

    // 1. 振动时域峭度 Kurtosis（权重 30%）—— 长缓冲去趋势残差，抑制周期基频干扰
    const src = this._long.acc.length > 30 ? this._long.acc : this.hist.acc;
    const det = [];
    const W = 7;
    for (let i = 0; i < src.length; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(src.length - 1, i + W); j++) { s += src[j]; c++; }
      det.push(src[i] - s / c);
    }
    const mean = det.reduce((a, b) => a + b, 0) / det.length;
    const m2 = det.reduce((a, b) => a + (b - mean) ** 2, 0) / det.length;
    const m4 = det.reduce((a, b) => a + (b - mean) ** 4, 0) / det.length;
    const kurt = m2 > 0 ? m4 / (m2 * m2) : 3;
    const s1 = clamp(100 - Math.max(0, kurt - 3.0) * 13, 5, 99);

    // 2. 频域包络能量占比（权重 25%）
    let ratio;
    if (this.__spec && this.__spec.vals) {
      const spec = this.__spec;
      const total = spec.vals.reduce((a, b) => a + b, 0) || 1;
      const bandE = spec.vals.reduce((s, v, i) => {
        const f = i * 20;
        const inBand = Math.abs(f - spec.bpfi) <= 40 || Math.abs(f - spec.bpfo) <= 40;
        return s + (inBand ? v : 0);
      }, 0);
      ratio = bandE / total;
    } else {
      ratio = { normal: 0.05, degraded: 0.18, "fault-bpfi": 0.35, "fault-bpfo": 0.33, "fault-unbalance": 0.12 }[this.state] || 0.1;
    }
    const s2 = clamp(100 - ratio * 260, 5, 99);

    // 3. 轴承热平衡温升偏离度（权重 20%）
    const lastTemp = h.temp[h.temp.length - 1] || def.base.temp;
    const tempDev = (lastTemp - def.base.temp) / def.base.temp;
    const s3 = clamp(100 - Math.max(0, tempDev) * 260, 5, 99);

    // 4. 运行负荷电流波动谐波（权重 15%）
    const cur = h.current;
    const cm = cur.reduce((a, b) => a + b, 0) / cur.length;
    const cstd = Math.sqrt(cur.reduce((a, b) => a + (b - cm) ** 2, 0) / cur.length);
    const ripple = cm > 0 ? cstd / cm : 0;
    const s4 = clamp(100 - ripple * 600, 5, 99);

    // 5. 历史劣化累积疲劳因子（权重 10%）
    const s5 = clamp(100 - def.runHours / 300 - this.degradeLevel * 45, 5, 99);

    return [
      { key: "kurt", label: "振动时域峭度指标", en: "Kurtosis", weight: 0.30, score: s1,
        rawText: round(kurt, 2), rawUnit: "",
        basis: `去趋势残差峭度 K = ${round(kurt, 2)}（健康区间 2.0 ~ 3.0）`,
        formula: "S₁ = 100 − max(0, K − 3.0) × 13",
        threshold: "K > 3.0 表明存在冲击性故障；K > 6 为强冲击" },
      { key: "env", label: "频域包络能量占比", en: "Envelope Energy", weight: 0.25, score: s2,
        rawText: (ratio * 100).toFixed(1), rawUnit: "%",
        basis: `BPFI / BPFO 包络带能量占比 = ${(ratio * 100).toFixed(1)}%（健康 < 6%）`,
        formula: "S₂ = 100 − 包络带能量占比 × 260",
        threshold: "占比 > 15% 进入劣化，> 30% 判定故障" },
      { key: "temp", label: "轴承热平衡温升偏离度", en: "Thermal Deviation", weight: 0.20, score: s3,
        rawText: (tempDev * 100).toFixed(1), rawUnit: "%",
        basis: `温升偏离 = ${(tempDev * 100).toFixed(1)}%（实测 ${round(lastTemp, 1)}℃ / 基线 ${def.base.temp}℃）`,
        formula: "S₃ = 100 − max(0, ΔT/T₀) × 260",
        threshold: "偏离 > 10% 预警，> 20% 需停机检查" },
      { key: "cur", label: "运行负荷电流波动谐波", en: "Current Ripple", weight: 0.15, score: s4,
        rawText: (ripple * 100).toFixed(2), rawUnit: "%",
        basis: `电流波动率 σ/I = ${(ripple * 100).toFixed(2)}%（健康 < 3%）`,
        formula: "S₄ = 100 − (σ / I) × 600",
        threshold: "波动率 > 5% 表明负载或绕组异常" },
      { key: "fat", label: "历史劣化累积疲劳因子", en: "Fatigue Factor", weight: 0.10, score: s5,
        rawText: (this.degradeLevel * 100).toFixed(1), rawUnit: "%",
        basis: `累计运行 ${def.runHours.toLocaleString()} h · 累积劣化度 ${(this.degradeLevel * 100).toFixed(1)}%`,
        formula: "S₅ = 100 − 运行小时 / 300 − 劣化度 × 45",
        threshold: "运行超 20000 h 或劣化度 > 60% 需重点评估" }
    ];
  };

  /** 健康指数 0~100 —— 综合评分公式 H = Σ(wᵢ × Sᵢ) */
  DeviceChannel.prototype.health = function () {
    const m = this.metrics();
    const h = m.reduce((s, x) => s + x.weight * x.score, 0);
    return clamp(Math.round(h + gauss() * 0.8), 5, 99);
  };

  /** 健康雷达五维 0~100 */
  DeviceChannel.prototype.radar = function () {
    const st = STATES[this.state], d = this.def;
    const h = this.health();
    const f = (mul, penalty) => clamp(Math.round(h * mul - this.degradeLevel * penalty), 5, 99);
    return [
      { name: "振动烈度", value: f(st.level === 0 ? 1 : 0.78, 16) },
      { name: "温度状态", value: f(st.level === 0 ? 1 : 0.82, 14) },
      { name: "电流平稳", value: f(st.level === 0 ? 0.99 : 0.86, 10) },
      { name: "润滑状态", value: f(st.level === 0 ? 1 : 0.74, 20) },
      { name: "运行时长", value: clamp(98 - d.runHours / 420, 30, 99) }
    ];
  };

  /** 当前工况的劣化速率（分/天）—— 按设备类型缩放 */
  DeviceChannel.prototype.degradeRate = function () {
    const r = this.def.degradeRate;
    return {
      normal: r,
      degraded: r * 11,
      "fault-bpfi": r * 27.5,
      "fault-bpfo": r * 22,
      "fault-unbalance": r * 16
    }[this.state];
  };

  /** RUL 剩余寿命（小时）—— 正常态按设备名义寿命，异常态按劣化模型动态缩短 */
  DeviceChannel.prototype.rul = function () {
    const baseHealth = { normal: 94, degraded: 68, "fault-bpfi": 34, "fault-bpfo": 34, "fault-unbalance": 34 }[this.state];
    const bh = baseHealth - this.degradeLevel * 14;
    const ceiling = this.def.rulDays * 24;          // 名义寿命上限（小时）
    const hours = clamp((bh - 20) / this.degradeRate() * 24, 4, ceiling);
    return Math.round(hours);
  };

  /** 生成 RUL 预测曲线：历史健康分 + 预测劣化趋势 + 置信区间 */
  DeviceChannel.prototype.rulCurve = function () {
    const h = this.health();
    const hours = 720, step = 24, pts = hours / step;
    const histN = 12;
    const times = [], hist = [], pred = [], band = [], bandUp = [];
    const declinePerDay = this.degradeRate();
    // 历史段
    for (let i = 0; i < histN; i++) {
      const t = -(histN - 1 - i) * step;
      times.push(t === 0 ? "当前" : t + "h");
      hist.push(Math.round(clamp(h + (histN - 1 - i) * declinePerDay * 0.9 + gauss() * 0.8, 5, 99)));
      pred.push(null); band.push(null); bandUp.push(null);
    }
    // 预测段：与时间轴等长，起点与当前健康分对齐
    pred[histN - 1] = h; band[histN - 1] = h; bandUp[histN - 1] = h;
    let cur = h;
    for (let i = 1; i <= pts; i++) {
      times.push("+" + i * step + "h");
      hist.push(null);
      cur = clamp(cur - declinePerDay * (step / 24), 0, 100);
      const w = 1.6 + i * 0.45;   // 置信带半宽随预测步长扩大
      pred.push(round(cur, 1));
      band.push(round(clamp(cur - w, 0, 100), 1));
      bandUp.push(round(clamp(cur + w, 0, 100), 1));
    }
    return { times, hist, pred, band, bandUp, threshold: 60, rul: this.rul(), declinePerDay };
  };

  /** 预警信息（提前 24~72 小时）—— 同一工况内缓存，保证各视图数值一致 */
  DeviceChannel.prototype.alert = function () {
    const st = STATES[this.state];
    if (st.level === 0) { this._alert = null; return null; }
    if (this._alert && this._alert.state === this.state) return this._alert;
    const lead = st.level === 2 ? 24 + Math.round(Math.random() * 12) : 48 + Math.round(Math.random() * 24);
    this._alert = {
      id: "ALM-" + this.def.id + "-" + (st.level === 2 ? "F" : "W"),
      device: this.def.id,
      deviceName: this.def.name,
      state: this.state,
      stateLabel: st.label,
      level: st.level === 2 ? "critical" : "warning",
      leadHours: lead,
      confidence: round(st.level === 2 ? rnd(93, 97.5) : rnd(90, 95), 1),
      falseRate: round(rnd(1.6, 4.2), 1),
      desc: st.desc,
      feature: st.freq ? st.freq + " 特征频率 + 谐波能量上升" : "全频段能量抬升",
      time: clockStr(new Date()),
      ts: Date.now(),
      historical: false
    };
    return this._alert;
  };

  DeviceChannel.prototype.reset = function () {
    this.state = "normal";
    this.degradeLevel = 0;
    this._impulsePhase = 0;
    for (let i = 0; i < 8; i++) this.tick();
  };

  /* =========================================================================
   * 全局仿真引擎
   * ========================================================================= */
  function SimEngine() {
    this.channels = {};
    DEVICES.forEach(d => { this.channels[d.id] = new DeviceChannel(d); });
    this.selected = DEVICES[0].id;
    this.globalAccuracy = 94.6;
    this.globalFalseRate = 2.8;
    this.alertLog = this._seedAlerts();   // 预置历史预警（模拟系统已运行一段时间）
    this._listeners = [];
  }

  /** 预置历史预警记录（时间倒序：最近在前） */
  SimEngine.prototype._seedAlerts = function () {
    const now = Date.now();
    const mk = (hoursAgo, dev, stateKey, stateLabel, lead, conf, feature, note) => {
      const ts = now - hoursAgo * 3600 * 1000;
      const def = DEVICES.find(d => d.id === dev) || { name: dev };
      return {
        id: "ALM-" + dev + "-H",
        device: dev, deviceName: def.name,
        state: stateKey, stateLabel: stateLabel,
        level: "warning",
        leadHours: lead, confidence: conf,
        falseRate: round(rnd(1.6, 4.2), 1),
        desc: note, feature: feature,
        time: clockStr(new Date(ts)), ts: ts,
        historical: true, handled: true
      };
    };
    return [
      mk(2, "AC-01", "degraded", "劣化趋势", 52, 91.2, "包络能量占比抬升 + 温升缓慢上移", "劣化趋势提示，已随巡检复位"),
      mk(9, "CNC-01", "degraded", "温升偏离", 41, 93.8, "主轴轴承温升偏离 +12.4%", "温升偏离预警，已处理"),
      mk(26, "PMP-01", "fault-bpfo", "汽蚀特征", 33, 90.5, "高频宽带能量抬升，汽蚀特征识别", "汽蚀特征识别，已换备件")
    ];
  };

  SimEngine.prototype.devices = function () { return DEVICES; };
  SimEngine.prototype.get = function (id) { return this.channels[id]; };
  SimEngine.prototype.current = function () { return this.channels[this.selected]; };
  SimEngine.prototype.select = function (id) { if (this.channels[id]) this.selected = id; };

  SimEngine.prototype.tick = function () {
    Object.values(this.channels).forEach(ch => ch.tick());
    // 全局指标微幅波动
    this.globalAccuracy = clamp(this.globalAccuracy + gauss() * 0.05, 92.1, 96.8);
    this.globalFalseRate = clamp(this.globalFalseRate + gauss() * 0.03, 1.2, 4.9);
  };

  SimEngine.prototype.setState = function (id, state) {
    const ch = this.channels[id];
    if (!ch) return;
    ch.setState(state);
    const a = ch.alert();
    if (a) {
      // 避免重复的同类告警
      if (!this.alertLog.some(x => x.id === a.id)) this.alertLog.unshift(a);
      if (this.alertLog.length > 20) this.alertLog.pop();
    }
  };

  SimEngine.prototype.on = function (fn) { this._listeners.push(fn); };
  SimEngine.prototype.emit = function (evt, payload) { this._listeners.forEach(f => f(evt, payload)); };

  /* 批量构造推理性汇总 */
  SimEngine.prototype.overview = function () {
    let worst = null;
    Object.values(this.channels).forEach(ch => {
      const lv = STATES[ch.state].level;
      if (!worst || lv > worst.lv) worst = { lv, ch };
    });
    return {
      worst: worst.ch,
      alertCount: this.alertLog.length,
      accuracy: round(this.globalAccuracy, 1),
      falseRate: round(this.globalFalseRate, 1)
    };
  };

  global.IOT = {
    DEVICES, STATES, WINDOW, SAMPLE_MS,
    SimEngine, DeviceChannel,
    util: { rnd, gauss, clamp, round, clockStr, pad }
  };
})(window);
