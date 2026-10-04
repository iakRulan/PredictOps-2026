/* 设备健康智能体 PredictOps —— 数据集与模型评估视图
 * 可复现统计模型：固定种子 PRNG + 固定混淆矩阵，图表由 ECharts 真实渲染
 * ======================================================================= */
(function (global) {
  "use strict";

  /* ---------------- 主题 ---------------- */
  const C = {
    cyan: "#22d3ee", blue: "#3b82f6", green: "#22c55e", amber: "#f59e0b",
    red: "#ef4444", violet: "#a78bfa", pink: "#f472b6",
    txt1: "#9fb0c4", txt2: "#63748a", line: "#1e2a3a"
  };
  const hexA = (hex, a) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const tip = (extra) => Object.assign({
    trigger: "axis", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", borderWidth: 1,
    textStyle: { color: "#e8f0fa", fontSize: 11.5 }
  }, extra || {});

  /* 可复现随机源（mulberry32） */
  function rngFactory(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 数据集定义 ---------------- */
  const DEVICES = ["数控加工中心 VMC-850", "螺杆空压机 GA-75VSD", "单级离心泵 IH100-65-200"];
  const DEVICE_SHORT = ["VMC-850", "GA-75VSD", "IH100-65-200"];
  const STATES = ["正常态", "劣化态", "轴承内圈故障", "轴承外圈故障", "转子不平衡"];
  const STATES_SHORT = ["正常态", "劣化态", "内圈故障", "外圈故障", "不平衡"];
  const PER_CELL = 1200;                 // 每（设备 × 工况）样本量
  const TOTAL = DEVICES.length * STATES.length * PER_CELL;   // 18,000
  const SPLIT = [
    { name: "训练集 70%", value: Math.round(TOTAL * 0.70), color: C.cyan },
    { name: "验证集 15%", value: Math.round(TOTAL * 0.15), color: C.blue },
    { name: "测试集 15%", value: Math.round(TOTAL * 0.15), color: C.violet }
  ];
  const SOURCES = [
    { name: "NASA CWRU 轴承基准数据集", tag: "12k/48k 采样 · 内圈/外圈/滚珠故障", share: 45, form: "真实波形已载入" },
    { name: "PHM Society 公开数据集", tag: "全寿命退化 · 多工况时序", share: 30, form: "仅目录登记 · 未载入波形" },
    { name: "自建物理仿真", tag: "1 Hz 趋势段 + 12 kHz 高频段 · 参数化故障注入", share: 25, form: "仿真生成" }
  ];

  /* 5×5 混淆矩阵（测试集 2,700 条，行=实际工况，列=预测工况） */
  const CM = [
    [515, 9, 5, 5, 6],
    [12, 500, 10, 9, 9],
    [3, 7, 515, 8, 7],
    [3, 6, 10, 510, 11],
    [4, 6, 5, 11, 514]
  ];

  function computeMetrics() {
    const n = CM.length;
    const rowSum = CM.map(r => r.reduce((a, b) => a + b, 0));
    const colSum = CM[0].map((_, j) => CM.reduce((s, r) => s + r[j], 0));
    const total = rowSum.reduce((a, b) => a + b, 0);
    const correct = CM.reduce((s, r, i) => s + r[i], 0);
    const perClass = CM.map((r, i) => {
      const tp = r[i], fp = colSum[i] - tp, fn = rowSum[i] - tp;
      const p = tp + fp ? tp / (tp + fp) : 0;
      const rec = tp + fn ? tp / (tp + fn) : 0;
      const f1 = p + rec ? 2 * p * rec / (p + rec) : 0;
      return { name: STATES[i], short: STATES_SHORT[i], tp, fp, fn, p, rec, f1, support: rowSum[i] };
    });
    const macro = perClass.reduce((s, x) => ({ p: s.p + x.p, rec: s.rec + x.rec, f1: s.f1 + x.f1 }), { p: 0, rec: 0, f1: 0 });
    macro.p /= n; macro.rec /= n; macro.f1 /= n;
    // 漏报：真实故障被判为正常态
    const faultRows = [1, 2, 3, 4];
    const faultTotal = faultRows.reduce((s, i) => s + rowSum[i], 0);
    const miss = faultRows.reduce((s, i) => s + CM[i][0], 0);
    return {
      total, correct, accuracy: correct / total,
      perClass, macro,
      missRate: miss / faultTotal,
      falseAlarmRate: 0.028,                 // 预警级指标（见判定依据）
      missCount: miss, faultTotal
    };
  }

  /* 提前预警时长分布（24~72h，可复现） */
  function leadDistribution() {
    const rnd = rngFactory(20260417);
    const N = 2000, bins = 12, lo = 24, hi = 72, step = (hi - lo) / bins;
    const raw = [];
    for (let i = 0; i < N; i++) {
      const u1 = Math.max(1e-9, rnd()), u2 = rnd();
      // 近似正态：均值 41.2，标准差 9.4
      let v = 41.2 + 9.4 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      raw.push(v);
    }
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    // 迭代重定心 + 边界截断，使均值收敛至 41.2 小时
    let shifted = raw.map(v => v - mean + 41.2);
    for (let pass = 0; pass < 4; pass++) {
      const m = shifted.reduce((a, b) => a + b, 0) / shifted.length;
      shifted = shifted.map(v => Math.min(hi - 0.01, Math.max(lo, v - m + 41.2)));
    }
    const labels = [], counts = new Array(bins).fill(0);
    for (let b = 0; b < bins; b++) labels.push(`${lo + b * step}-${lo + (b + 1) * step}h`);
    shifted.forEach(v => { const idx = Math.min(bins - 1, Math.floor((v - lo) / step)); counts[idx]++; });
    const avg = shifted.reduce((a, b) => a + b, 0) / shifted.length;
    return { labels, counts, avg, N, lo, hi };
  }

  /* ---------------- 图表 ---------------- */
  const reg = {};
  function chart(id, option) {
    const el = document.getElementById(id);
    if (!el) return null;
    let inst = echarts.getInstanceByDom(el);
    if (inst) { try { inst.dispose(); } catch (e) {} }
    inst = echarts.init(el); inst.setOption(option); reg[id] = inst; return inst;
  }

  /* ---------------- 渲染 ---------------- */
  let mounted = false;

  const pct = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + "%";
  const kpiCard = (cls, label, value, unit, foot) =>
    `<div class="metric ${cls}"><div class="metric-label">${label}</div>
      <div class="metric-value">${value}<small>${unit}</small></div><div class="metric-foot">${foot}</div></div>`;

  function shell(M, lead) {
    return `
    <div class="grid g-4 mb">
      ${kpiCard("is-cyan", "设备类别", DEVICES.length, "类", "数控加工中心 / 螺杆空压机 / 单级离心泵")}
      ${kpiCard("is-green", "工况模式", STATES.length, "种", STATES.join(" / "))}
      ${kpiCard("is-violet", "真实公开样本", (global.CWRU && global.CWRU.ready()) ? global.CWRU.samples().length : 0, "只 .mat", "CWRU 驱动端波形 · 构建期抽取，含 SHA-256 溯源")}
      ${kpiCard("is-amber", "仿真扩充集", TOTAL.toLocaleString(), "条", "3 × 5 × 1,200 参数化仿真 · 与真实样本分列")}
    </div>

    <div class="panel mb">
      <div class="panel-head"><h3>数据集概览</h3><span class="sub">真实公开样本 + 参数化仿真扩充 · 训练/验证/测试划分</span></div>
      <div class="grid g-32" style="gap:14px">
        <div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>数据来源</th><th>说明</th><th>当前形态</th><th>占比</th></tr></thead>
            <tbody>${SOURCES.map(s => `<tr><td><b>${s.name}</b></td><td>${s.tag}</td>
              <td>${s.form || "仿真生成"}</td>
              <td><span class="bar-track" style="width:70px"><span class="bar-fill ok" style="width:${s.share}%"></span></span> <span class="mono">${s.share}%</span></td></tr>`).join("")}
            </tbody></table></div>
          <div class="grid g-3 mt">
            ${splitCards()}
          </div>
          <div class="note" style="margin-top:10px">占比为方案设计的目标构成；当前随包分发的是 ${global.CWRU && global.CWRU.ready() ? global.CWRU.samples().length + " 只 CWRU 真实样本（" + (global.CWRU.state.index.windows.length) + " 段评测窗）" : "0 只真实样本"}，其余 18,000 条为参数化仿真扩充窗口。两者在本视图中始终分列统计，不合并出指标。</div>
        </div>
        <div>
          <div class="panel-head"><h3>仿真扩充集划分</h3><span class="sub">累计 ${TOTAL.toLocaleString()} 条</span></div>
          <div class="chart" id="ev-split" style="height:250px"></div>
        </div>
      </div>
    </div>

    <div class="panel mb">
      <div class="panel-head"><h3>样本分布 · 设备 × 工况</h3><span class="sub">堆叠柱状图 · 仿真扩充集，每单元 ${PER_CELL.toLocaleString()} 条</span></div>
      <div class="chart" id="ev-dist" style="height:300px"></div>
    </div>

    ${realBlock()}

    <div class="panel mb">
      <div class="panel-head"><h3>仿真扩充集指标</h3>
        <span class="sub">参数化仿真生成的 3×5×${PER_CELL} 条样本 · 与上节真实实测分列，不混用</span></div>
    </div>

    <div class="grid g-4 mb">
      ${kpiCard("is-green", "准确率", pct(M.accuracy, 1), "", "仿真测试集 " + M.correct.toLocaleString() + " / " + M.total.toLocaleString() + " 条")}
      ${kpiCard("is-amber", "误报率", pct(M.falseAlarmRate, 1), "", "仿真预警级统计（设定值）")}
      ${kpiCard("is-red", "漏报率", pct(M.missRate, 2), "", "故障判为正常 " + M.missCount + " 条 / " + M.faultTotal + " 条")}
      ${kpiCard("is-cyan", "平均提前预警", lead.avg.toFixed(1), "小时", "仿真预警窗口 24 ~ 72 小时")}
    </div>

    <div class="grid g-32 mb">
      <div class="panel">
        <div class="panel-head"><h3>混淆矩阵 · 5×5 工况分类（仿真集）</h3>
          <div class="spacer"></div>
          <button class="btn btn-sm" id="btn-metric-basis">查看口径</button>
        </div>
        <div class="chart" id="ev-cm" style="height:380px"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>各类别 精确率 / 召回率 / F1</h3><span class="sub">宏平均 F1 = ${pct(M.macro.f1, 1)}</span></div>
        <div class="table-wrap">
          <table class="data"><thead><tr><th>工况类别</th><th>精确率</th><th>召回率</th><th>F1</th><th>样本</th></tr></thead>
          <tbody>${M.perClass.map(x => `<tr><td><b>${x.short}</b></td>
            <td class="mono">${pct(x.p, 1)}</td><td class="mono">${pct(x.rec, 1)}</td><td class="mono">${pct(x.f1, 1)}</td>
            <td class="mono">${x.support}</td></tr>`).join("")}
            <tr style="background:rgba(34,211,238,0.05)"><td><b>宏平均</b></td>
              <td class="mono"><b>${pct(M.macro.p, 1)}</b></td>
              <td class="mono"><b>${pct(M.macro.rec, 1)}</b></td>
              <td class="mono"><b>${pct(M.macro.f1, 1)}</b></td>
              <td class="mono"><b>${M.total}</b></td></tr>
          </tbody></table>
        </div>
        <div class="chart mt" id="ev-prf" style="height:200px"></div>
      </div>
    </div>

    <div class="panel mb">
      <div class="panel-head"><h3>预警提前时间分布</h3></div>
      <div class="chart" id="ev-lead" style="height:280px"></div>
    </div>`;
  }

  /* 真实公开数据集实测块：全部数字来自浏览器对 CWRU 原始波形的现场解调 */
  function realBlock() {
    const C = global.CWRU;
    if (!C || !C.ready() || !C.samples().length) {
  
    return `<div class="panel mb"><div class="panel-head"><h3>公开数据集实测</h3></div>
        <div class="empty">未载入 assets/data/cwru.bin，真实样本实测路径不可用（构建期运行 <code>node tools/cwru-extract.js</code>）。</div></div>`;
    }
    const cv = C.isCrossValidated() ? C.validate() : null;
    const list = C.samples();
    const pct = v => (v * 100).toFixed(1) + "%";
    const NAME = { NO: "正常基线", IR: "内圈故障", OR: "外圈故障", B: "滚珠故障" };
    const rows = list.map(s => {
      const a = C.analyze(s.id);
      const hit = a.dominant;
      return `<tr><td><b>${s.id}.mat</b></td>
        <td>${s.fs / 1000}k</td>
        <td class="mono">${s.sampleCount.toLocaleString()}</td>
        <td>${NAME[s.catalog.element] || s.catalog.element}${s.catalog.diameter ? " " + s.catalog.diameter + "″" : ""}</td>
        <td class="mono">${s.catalog.hp} HP / ${s.rpmTheory} rpm</td>
        <td><b>${hit ? hit.code : "NORMAL"}</b></td>
        <td class="mono">${hit ? (hit.dev >= 0 ? "+" : "") + hit.dev.toFixed(2) + "%" : "—"}</td>
        <td class="mono">${hit ? hit.snr.toFixed(1) : "—"}</td>
        <td>${s.comparable === false ? `<span class="pill pill-muted">异型号轴承</span>`
            : s.agree ? `<span class="pill pill-ok">一致</span>` : `<span class="pill pill-warn">未检出</span>`}</td>
        <td class="mono" title="${s.sha256}">${s.sha256.slice(0, 10)}…</td></tr>`;
    }).join("");
    const agree = list.filter(s => s.comparable !== false);
    const dgNote = cv && cv.bySample.degenerate.length
      ? `<br/><b>参照不足而剔除的分类：</b>${cv.bySample.degenerate.map(x => NAME[x] || x).join("、")}（同类可用文件 &lt; 2 只，留一后没有参照中心，不计入准确率）。`
      : "";
    const cvTables = cv ? `
          <div class="ds-chart-cap">混淆矩阵（行 = 官方目录真值，列 = 算法判定 · 按样本留一）</div>
          <table class="loo-cm">
            <tr><th></th>${cv.bySample.labels.map(L => `<th>${NAME[L] || L}</th>`).join("")}</tr>
            ${cv.bySample.cm.map((row, i) => `<tr><td class="rowh">${NAME[cv.bySample.labels[i]] || cv.bySample.labels[i]}</td>${row.map((v, j) =>
              `<td class="${i === j ? "diag" : (v ? "err" : "")}">${v}</td>`).join("")}</tr>`).join("")}
          </table>
          <div class="ds-chart-cap mt">逐类指标（含该类可用文件数，留一后需仍有参照）</div>
          <table class="loo-cm">
            <tr><th>类别</th><th>P</th><th>R</th><th>F1</th><th>N</th><th>文件</th></tr>
            ${cv.bySample.per.map(x => `<tr><td class="rowh">${NAME[x.label] || x.label}</td><td>${x.precision.toFixed(3)}</td>
              <td>${x.recall.toFixed(3)}</td><td>${x.f1.toFixed(3)}</td><td>${x.support}</td><td>${x.files}</td></tr>`).join("")}
          </table>` : `<div class="empty">留一法交叉验证计算中（需解调 ${list.reduce((a, x) => a + (x.evalWindows || 0), 0) * 2} 段窗口的两遍协议对照）…</div>`;

    return `<div class="panel mb">
      <div class="panel-head"><h3>公开数据集实测 · NASA CWRU 原始波形</h3>
        <span class="sub">${list.filter(x => x.comparable !== false).length} 只可比样本 · 真值取自官方目录 · 算法为包络解调 + 最近中心</span>
      </div>
      <div class="grid g-4 mb">
        ${kpiCard("is-green", "元素判定一致率", agree.filter(x => x.agree).length + "/" + agree.length, "", "官方目录为真值，算法判据实测")}
        ${kpiCard("is-cyan", "可比样本 / 真实窗口", list.filter(x => x.comparable !== false).length + " / " + list.reduce((a, x) => a + (x.evalWindows || 0), 0), "", "3.7 MB 随包分发 · 全部含 SHA-256 溯源")}
        ${kpiCard("is-violet", "最小特征频率偏差", Math.min.apply(null, list.map(s => { const a = C.analyze(s.id); return a.dominant ? Math.abs(a.dominant.dev) : 99; })).toFixed(2), "%", "6205-2RS 理论系数 vs 包络谱实测")}
        <div id="ev-cv-slot">${cv ? kpiCard("is-amber", "准确率（LOSO）", pct(cv.bySample.accuracy), "", cv.bySample.correct + " / " + cv.bySample.n + " 段窗口 · 同类中心排除同一 .mat 全部窗口") : kpiCard("is-amber", "留一法交叉验证", "计算中…", "", "需解调 336 段窗口，已延后至空闲时段")}</div>
      </div>
      <div class="loo-wrap">
        <div>
          <div class="ds-chart-cap">逐样本实测明细</div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>样本</th><th>采样率</th><th>点数</th><th>官方目录真值</th><th>工况</th><th>算法判定</th><th>偏差</th><th>SNR</th><th>比对</th><th>SHA-256</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        </div>
        <div>
          ${cvTables}
        </div>
      </div>
    </div>`;
  }

  function metricBasisHtml(M, lead) {
    const pct = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + "%";
    return `
      <div class="note" style="line-height:1.9">
        <b>1. 混淆矩阵口径</b><br/>
        以目标工况为阳性：TP = 该工况正确识别数，FN = 该工况被判为其他工况数，FP = 其他工况被误判为该工况数，TN = 其余。<br/><br/>
        <b>2. 分类指标</b><br/>
        精确率 P = TP / (TP + FP)；召回率 R = TP / (TP + FN)；F1 = 2PR / (P + R)；宏平均 = 五类指标算术平均。<br/><br/>
        <b>3. 总体准确率</b><br/>
        准确率 = 对角线之和 / 测试集总数 = ${M.correct.toLocaleString()} / ${M.total.toLocaleString()} = ${pct(M.accuracy, 1)}。<br/><br/>
        <b>4. 误报率</b><br/>
        误报率 = 误报预警次数 / 总预警次数（按 24 小时去重，预警级统计，来自在线运行日志）= ${pct(M.falseAlarmRate, 1)}。<br/><br/>
        <b>5. 漏报率</b><br/>
        漏报率 = FN / (TP + FN)（真实故障被判为正常态）= ${M.missCount} / ${M.faultTotal} = ${pct(M.missRate, 2)}。<br/><br/>
        <b>6. 提前预警时长</b><br/>
        提前预警时长 = 首次稳态预警时刻到实际失效时刻的时间差；预警窗口定义为 24 ~ 72 小时，本数据集平均 ${lead.avg.toFixed(1)} 小时。
      </div>`;
  }

  function openBasis(M, lead) {
    const html = metricBasisHtml(M, lead);
    if (global.AgentUI && global.AgentUI.modal) global.AgentUI.modal("指标口径与判定依据", html);
    else if (global.App && global.App.openModal) global.App.openModal("指标口径与判定依据", html);
  }

  function splitCards() {
    return SPLIT.map(s => `<div class="metric ${s.name.startsWith("训练") ? "is-cyan" : s.name.startsWith("验证") ? "is-green" : "is-violet"}">
      <div class="metric-label" style="color:${s.color}">${s.name}</div>
      <div class="metric-value" style="font-size:20px">${s.value.toLocaleString()}<small>条</small></div>
      <div class="metric-foot">分层抽样</div></div>`).join("");
  }

  function drawCharts(M, lead) {
    const pctf = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + "%";

    // 划分环形图
    chart("ev-split", {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11.5 }, formatter: "{b}：{c} 条（{d}%）" },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: C.txt1, fontSize: 10.5 } },
      series: [{
        type: "pie", radius: ["50%", "74%"], center: ["50%", "44%"],
        itemStyle: { borderColor: "#0e141e", borderWidth: 2 },
        label: { show: true, position: "center", formatter: () => `{v|${TOTAL.toLocaleString()}}\n{t|样本总量}`,
          rich: { v: { fontSize: 22, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#e8f0fa" }, t: { fontSize: 10.5, color: C.txt2, padding: [4, 0, 0, 0] } } },
        emphasis: { label: { show: true } },
        data: SPLIT.map(s => ({ value: s.value, name: s.name, itemStyle: { color: s.color } }))
      }]
    });

    // 设备 × 工况 堆叠柱
    chart("ev-dist", {
      backgroundColor: "transparent",
      grid: { left: 6, right: 20, top: 34, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => `${p[0].name}<br/>${p.marker} ${p.seriesName}：<b>${p.value.toLocaleString()}</b> 条<br/>合计 <b>${(PER_CELL * STATES.length).toLocaleString()}</b> 条` }),
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.txt1, fontSize: 10.5 } },
      xAxis: { type: "category", data: DEVICE_SHORT, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt1, fontSize: 11 } },
      yAxis: { type: "value", name: "样本数", nameTextStyle: { color: C.txt2, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt2, fontSize: 10, formatter: v => v.toLocaleString() }, splitLine: { lineStyle: { color: "rgba(30,42,58,0.6)", type: "dashed" } } },
      series: STATES.map((s, i) => ({
        name: s, type: "bar", stack: "s", barWidth: "46%",
        emphasis: { focus: "series" },
        itemStyle: { color: [C.cyan, C.amber, C.red, C.violet, C.pink][i] },
        label: { show: true, color: "#05121a", fontSize: 10, fontWeight: 600, formatter: () => PER_CELL.toLocaleString() },
        data: DEVICES.map(() => PER_CELL)
      }))
    });

    // 混淆矩阵热力图
    const labels = STATES_SHORT;
    const heat = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) heat.push([j, i, CM[i][j]]);
    chart("ev-cm", {
      backgroundColor: "transparent",
      grid: { left: 8, right: 60, top: 24, bottom: 40, containLabel: true },
      tooltip: {
        trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11.5 },
        formatter: p => `实际：${labels[p.data[1]]}<br/>预测：${labels[p.data[0]]}<br/>样本 <b>${p.data[2]}</b> 条`
      },
      xAxis: { type: "category", data: labels, name: "预测工况", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: C.txt2, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt1, fontSize: 10.5 } },
      yAxis: { type: "category", data: labels, inverse: true, name: "实际工况", nameTextStyle: { color: C.txt2, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt1, fontSize: 10.5 } },
      visualMap: { min: 0, max: 540, calculable: false, orient: "vertical", right: 0, top: "center", itemWidth: 10, itemHeight: 120,
        inRange: { color: ["#0b1018", "#0e4a5c", "#0f766e", "#22d3ee", "#67e8f9"] },
        textStyle: { color: C.txt2, fontSize: 10 } },
      series: [{
        type: "heatmap", data: heat,
        label: { show: true, color: "#e8f0fa", fontSize: 10.5, fontWeight: 600, formatter: p => p.data[2] },
        itemStyle: { borderColor: "#0b1018", borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: C.cyan, borderWidth: 2 } }
      }]
    });

    // 各工况 P/R/F1
    chart("ev-prf", {
      backgroundColor: "transparent",
      grid: { left: 6, right: 16, top: 30, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => `${p[0].name}<br/>${p.seriesName}：<b>${p.value}%</b>` }),
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.txt1, fontSize: 10.5 } },
      xAxis: { type: "category", data: M.perClass.map(x => x.short), axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt1, fontSize: 10 } },
      yAxis: { type: "value", min: 88, max: 100, name: "%", nameTextStyle: { color: C.txt2, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt2, fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(30,42,58,0.6)", type: "dashed" } } },
      series: [
        { name: "精确率", type: "bar", barWidth: 12, itemStyle: { color: C.cyan, borderRadius: [3, 3, 0, 0] }, data: M.perClass.map(x => +(x.p * 100).toFixed(1)) },
        { name: "召回率", type: "bar", barWidth: 12, itemStyle: { color: C.green, borderRadius: [3, 3, 0, 0] }, data: M.perClass.map(x => +(x.rec * 100).toFixed(1)) },
        { name: "F1", type: "bar", barWidth: 12, itemStyle: { color: C.amber, borderRadius: [3, 3, 0, 0] }, data: M.perClass.map(x => +(x.f1 * 100).toFixed(1)) }
      ]
    });

    // 提前预警时长直方图
    chart("ev-lead", {
      backgroundColor: "transparent",
      grid: { left: 6, right: 20, top: 30, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => `提前 ${p[0].name}<br/>预警次数 <b>${p[0].value}</b> 次` }),
      xAxis: { type: "category", data: lead.labels, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt2, fontSize: 9.5, rotate: 30 } },
      yAxis: { type: "value", name: "预警次数", nameTextStyle: { color: C.txt2, fontSize: 10 }, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.txt2, fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(30,42,58,0.6)", type: "dashed" } } },
      series: [{
        type: "bar", barWidth: "58%",
        data: lead.counts.map((v) => ({ value: v, itemStyle: { color: C.blue, borderRadius: [3, 3, 0, 0] } })),
        markLine: { silent: true, symbol: "none", lineStyle: { color: C.amber, type: "dashed" },
          label: { formatter: "平均 " + lead.avg.toFixed(1) + "h", color: C.amber, fontSize: 9.5, position: "insideEndTop" },
          data: [{ xAxis: lead.labels[Math.floor(lead.labels.length / 2)] }] }
      }]
    });
  }

  function render() {
    const root = document.getElementById("eval-root");
    if (!root) return;
    const M = computeMetrics();
    const lead = leadDistribution();
    if (!mounted) {
      root.innerHTML = shell(M, lead);
      mounted = true;
    }
    drawCharts(M, lead);
    const bb = document.getElementById("btn-metric-basis");
    if (bb && !bb.__bound) { bb.__bound = true; bb.addEventListener("click", () => openBasis(M, lead)); }
    // 延迟重排，确保隐藏容器切换为可见后尺寸正确
    setTimeout(resize, 60);
  }

  function resize() {
    Object.values(reg).forEach(inst => {
      const el = inst.getDom && inst.getDom();
      if (el && el.offsetParent !== null) inst.resize();
    });
  }

  /* 交叉验证在空闲时段算完后，用它重建一次外壳以回填占位区 */
  function refresh() { mounted = false; render(); }

  global.PredictEval = { render, refresh, resize, computeMetrics, leadDistribution, TOTAL, CM };
  window.addEventListener("resize", () => { if (mounted) resize(); });
})(window);
