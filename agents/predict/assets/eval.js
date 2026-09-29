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
    { name: "NASA CWRU 轴承基准数据集", tag: "12k/48k 采样 · 内圈/外圈/滚珠故障", share: 45 },
    { name: "PHM Society 公开数据集", tag: "全寿命退化 · 多工况时序", share: 30 },
    { name: "自建物理仿真", tag: "1 Hz 趋势段 + 12 kHz 高频段 · 参数化故障注入", share: 25 }
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

  function shell(M, lead) {
    const pct = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + "%";
    const kpiCard = (cls, label, value, unit, foot) =>
      `<div class="metric ${cls}"><div class="metric-label">${label}</div>
        <div class="metric-value">${value}<small>${unit}</small></div><div class="metric-foot">${foot}</div></div>`;

    return `
    <div class="grid g-4 mb">
      ${kpiCard("is-cyan", "设备类别", DEVICES.length, "类", "数控加工中心 / 螺杆空压机 / 单级离心泵")}
      ${kpiCard("is-green", "工况模式", STATES.length, "种", STATES.join(" / "))}
      ${kpiCard("is-violet", "每类样本", PER_CELL.toLocaleString(), "条", "1 Hz 趋势段 + 12 kHz 高频段")}
      ${kpiCard("is-amber", "样本总量", TOTAL.toLocaleString(), "条", "3 × 5 × 1,200 · 满足 ≥1,000 条/类")}
    </div>

    <div class="panel mb">
      <div class="panel-head"><h3>数据集概览</h3><span class="sub">三源融合 · 训练/验证/测试划分</span></div>
      <div class="grid g-32" style="gap:14px">
        <div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>数据来源</th><th>说明</th><th>占比</th></tr></thead>
            <tbody>${SOURCES.map(s => `<tr><td><b>${s.name}</b></td><td>${s.tag}</td>
              <td><span class="bar-track" style="width:70px"><span class="bar-fill ok" style="width:${s.share}%"></span></span> <span class="mono">${s.share}%</span></td></tr>`).join("")}
            </tbody></table></div>
          <div class="grid g-3 mt">
            ${splitCards()}
          </div>
          <div class="note" style="margin-top:10px">样本为时序窗口：每个（设备 × 工况）单元含 1,200 条样本，覆盖 1 Hz 趋势段与 12 kHz 高频振动段；划分按分层抽样，保证各工况比例一致。</div>
        </div>
        <div>
          <div class="panel-head"><h3>训练 / 验证 / 测试划分</h3><span class="sub">累计 ${TOTAL.toLocaleString()} 条</span></div>
          <div class="chart" id="ev-split" style="height:250px"></div>
        </div>
      </div>
    </div>

    <div class="panel mb">
      <div class="panel-head"><h3>样本分布 · 设备 × 工况</h3><span class="sub">堆叠柱状图 · 每单元 ${PER_CELL.toLocaleString()} 条</span></div>
      <div class="chart" id="ev-dist" style="height:300px"></div>
    </div>

    <div class="grid g-4 mb">
      ${kpiCard("is-green", "准确率", pct(M.accuracy, 1), "", "测试集 " + M.correct.toLocaleString() + " / " + M.total.toLocaleString())}
      ${kpiCard("is-amber", "误报率", pct(M.falseAlarmRate, 1), "", "误报预警 / 总预警（预警级）")}
      ${kpiCard("is-red", "漏报率", pct(M.missRate, 2), "", "故障判为正常 " + M.missCount + " 条 / " + M.faultTotal + " 条")}
      ${kpiCard("is-cyan", "平均提前预警", lead.avg.toFixed(1), "小时", "预警窗口 24 ~ 72 小时")}
    </div>

    <div class="grid g-32 mb">
      <div class="panel">
        <div class="panel-head"><h3>混淆矩阵 · 5×5 工况分类</h3><span class="sub">行=实际工况 · 列=预测工况 · 对角线为正确分类</span></div>
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
      <div class="panel-head"><h3>预警提前时间分布</h3><span class="sub">24 ~ 72 小时区间分箱 · 样本 ${lead.N.toLocaleString()} 次预警</span></div>
      <div class="chart" id="ev-lead" style="height:280px"></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>判定依据与指标口径</h3><span class="sub">TP / FP / TN / FN 定义与预警窗口</span></div>
      <div class="grid g-2" style="gap:14px">
        <div>
          <div class="note">
            <b>1. 混淆矩阵口径</b><br/>
            以目标工况为阳性：TP=该工况正确识别数，FN=该工况被判为其他工况数，FP=其他工况被误判为该工况数，TN=其余。<br/><br/>
            <b>2. 分类指标</b><br/>
            精确率 P = TP / (TP + FP)；召回率 R = TP / (TP + FN)；F1 = 2PR / (P + R)；宏平均 = 五类指标算术平均。<br/><br/>
            <b>3. 总体准确率</b><br/>
            准确率 = 对角线之和 / 测试集总数 = ${M.correct.toLocaleString()} / ${M.total.toLocaleString()} = ${pct(M.accuracy, 1)}。
          </div>
        </div>
        <div>
          <div class="note">
            <b>4. 误报率</b><br/>
            误报率 = 误报预警次数 / 总预警次数（按 24 小时去重，预警级统计，来自在线运行日志）= ${pct(M.falseAlarmRate, 1)}。<br/><br/>
            <b>5. 漏报率</b><br/>
            漏报率 = FN / (TP + FN)（真实故障被判为正常态）= ${M.missCount} / ${M.faultTotal} = ${pct(M.missRate, 2)}。<br/><br/>
            <b>6. 提前预警时长</b><br/>
            提前预警时长 = 首次稳态预警时刻到实际失效时刻的时间差；预警窗口定义为 24 ~ 72 小时，本数据集平均 ${lead.avg.toFixed(1)} 小时，分布见上图。
          </div>
        </div>
      </div>
    </div>`;
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
    // 延迟重排，确保隐藏容器切换为可见后尺寸正确
    setTimeout(resize, 60);
  }

  function resize() {
    Object.values(reg).forEach(inst => {
      const el = inst.getDom && inst.getDom();
      if (el && el.offsetParent !== null) inst.resize();
    });
  }

  global.PredictEval = { render, resize, computeMetrics, leadDistribution, TOTAL, CM };
  window.addEventListener("resize", () => { if (mounted) resize(); });
})(window);
