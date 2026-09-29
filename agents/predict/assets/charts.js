/* =========================================================================
 * 图表层 —— 基于 ECharts 的工业可视化
 * ========================================================================= */
(function (global) {
  "use strict";

  const C = {
    cyan: "#22d3ee", blue: "#3b82f6", green: "#22c55e",
    amber: "#f59e0b", red: "#ef4444", violet: "#a78bfa", pink: "#f472b6",
    txt1: "#9fb0c4", txt2: "#63748a", line: "#1e2a3a", panel: "#0e141e"
  };

  const baseAxis = (isTime) => ({
    axisLine: { lineStyle: { color: C.line } },
    axisTick: { show: false },
    axisLabel: { color: C.txt2, fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
    splitLine: isTime
      ? { show: false }
      : { show: true, lineStyle: { color: "rgba(30,42,58,0.6)", type: "dashed" } }
  });

  const tooltip = (extra) => Object.assign({
    trigger: "axis",
    backgroundColor: "rgba(10,15,23,0.94)",
    borderColor: "#26364b",
    borderWidth: 1,
    textStyle: { color: "#e8f0fa", fontSize: 11.5 },
    axisPointer: { lineStyle: { color: "rgba(34,211,238,0.5)" }, crossStyle: { color: "rgba(34,211,238,0.5)" } }
  }, extra || {});

  const registry = {};
  function mount(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (!registry[id]) registry[id] = echarts.init(el, null, { renderer: "canvas" });
    return registry[id];
  }
  function resizeAll() { Object.values(registry).forEach(c => c && c.resize()); }

  /* ---------------- 0. 卡片迷你趋势图（sparkline） ---------------- */
  function renderSparkline(id, data, color) {
    const el = document.getElementById(id);
    if (!el) return;
    const c = mount(id); if (!c) return;
    const first = !c.__inited;
    if (first) c.__inited = true;
    c.setOption({
      animation: first,
      animationDuration: 200,
      grid: { left: 1, right: 1, top: 3, bottom: 3 },
      xAxis: { type: "category", show: false, boundaryGap: false, data: data.map((_, i) => i) },
      yAxis: { type: "value", show: false, scale: true,
        min: v => v.min - (v.max - v.min) * 0.25 - 0.001,
        max: v => v.max + (v.max - v.min) * 0.25 + 0.001 },
      series: [{
        type: "line", data, smooth: 0.4, symbol: "none", silent: true,
        lineStyle: { width: 1.5, color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexA(color, 0.32) }, { offset: 1, color: hexA(color, 0) }
          ])
        }
      }]
    }, false);
  }

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ---------------- 1. 时序趋势图 ---------------- */
  function renderTrend(id, ch) {
    const c = mount(id); if (!c) return;
    const def = ch.def, base = def.base;
    const isVib = id === "chart-vib";
    const unitPrimary = isVib ? "m/s²" : "°C";
    const series = isVib
      ? [
        { name: "振动加速度", type: "line", data: ch.hist.acc, yAxisIndex: 0, unit: "m/s²", color: C.cyan },
        { name: "振动位移", type: "line", data: ch.hist.disp, yAxisIndex: 1, unit: "µm", color: C.violet }
      ]
      : id === "chart-temp"
        ? [{ name: "温度", type: "line", data: ch.hist.temp, yAxisIndex: 0, unit: "°C", color: C.amber }]
        : [{ name: "电流", type: "line", data: ch.hist.current, yAxisIndex: 0, unit: "A", color: C.green }];

    const baseLine = isVib ? base.acc
      : id === "chart-temp" ? base.temp : base.current;

    c.setOption({
      backgroundColor: "transparent",
      animationDuration: 260,
      grid: { left: 6, right: isVib ? 6 : 10, top: 30, bottom: 4, containLabel: true },
      tooltip: tooltip({
        formatter: params => {
          const head = params[0].axisValue;
          return head + "<br/>" + params.map(p =>
            `<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${p.color};margin-right:6px"></span>` +
            `${p.seriesName}：<b style="font-family:JetBrains Mono">${p.value == null ? "--" : p.value}</b> ${p.seriesName === "振动加速度" ? "m/s²" : p.seriesName === "振动位移" ? "µm" : p.seriesName === "温度" ? "°C" : "A"}`
          ).join("<br/>");
        }
      }),
      legend: {
        top: 0, right: 0, itemWidth: 12, itemHeight: 3,
        textStyle: { color: C.txt1, fontSize: 10.5 }
      },
      xAxis: Object.assign({ type: "category", data: ch.time, boundaryGap: false }, baseAxis(true)),
      yAxis: isVib
        ? [
          Object.assign({ type: "value", name: "加速度 m/s²", nameTextStyle: { color: C.cyan, fontSize: 10 }, scale: true }, baseAxis(false)),
          Object.assign({ type: "value", name: "位移 µm", nameTextStyle: { color: C.violet, fontSize: 10 }, scale: true, splitLine: { show: false } }, baseAxis(false))
        ]
        : [Object.assign({ type: "value", scale: true, name: unitPrimary, nameTextStyle: { color: C.txt2, fontSize: 10 } }, baseAxis(false))],
      series: series.map(s => ({
        name: s.name,
        type: "line",
        yAxisIndex: s.yAxisIndex,
        smooth: 0.25,
        symbol: "none",
        lineStyle: { width: 1.8, color: s.color, shadowColor: s.color, shadowBlur: 8 },
        areaStyle: {
          opacity: 0.14,
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: s.color }, { offset: 1, color: "rgba(0,0,0,0)" }
          ])
        },
        data: s.data,
        markLine: s.yAxisIndex === 0 ? {
          silent: true, symbol: "none",
          lineStyle: { color: "rgba(34,197,94,0.55)", type: "dashed", width: 1 },
          label: { formatter: "健康基线", color: C.green, fontSize: 9.5, position: "insideEndTop" },
          data: [{ yAxis: s.name === "温度" ? def.base.temp : s.name === "电流" ? def.base.current : baseLine }]
        } : undefined
      }))
    }, true);
    resizeAll();
  }

  /* ---------------- 2. 振动频谱（主频 / 特征频率 / 告警游标） ---------------- */
  const SPEC_RES = 20;      // 频率分辨率 Hz
  const SPEC_MAX = 1000;    // 频谱上限 Hz

  function buildSpectrum(ch) {
    const def = ch.def, st = global.IOT.STATES[ch.state];
    const rot = def.base.speed / 60;            // 转频 1X (Hz)
    const bpfi = rot * 5.42, bpfo = rot * 3.58;
    const baseAmp = def.base.acc;
    const boost = { normal: 0.25, degraded: 0.75, "fault-bpfi": 1, "fault-bpfo": 1, "fault-unbalance": 0.95 }[ch.state];
    const freqs = [], vals = [];
    for (let i = 0; i <= SPEC_MAX / SPEC_RES; i++) {
      const f = i * SPEC_RES;
      let amp = baseAmp * 0.42 * Math.exp(-f / (rot * 6 + 40)) + Math.random() * 0.05 * baseAmp;
      const near = (x, tol) => Math.abs(f - x) <= tol;
      if (near(rot, SPEC_RES * 0.7)) amp += baseAmp * (0.55 + boost * 1.1);          // 1X
      if (near(2 * rot, SPEC_RES * 0.7)) amp += baseAmp * (0.22 + boost * 0.55);     // 2X
      if (near(3 * rot, SPEC_RES * 0.7)) amp += baseAmp * (0.1 + boost * 0.25);      // 3X
      if (st.freq === "BPFI" && near(bpfi, SPEC_RES * 0.8)) amp += baseAmp * (1.7 + boost);
      if (st.freq === "BPFO" && near(bpfo, SPEC_RES * 0.8)) amp += baseAmp * (1.55 + boost);
      freqs.push(String(f));
      vals.push(global.IOT.util.round(amp, 2));
    }
    return { rot, bpfi, bpfo, freqs, vals, baseAmp, alarm: round2(baseAmp * 2.2) };
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  function renderSpectrum(id, ch) {
    const c = mount(id); if (!c) return;
    const spec = buildSpectrum(ch);
    ch.__spec = spec;
    const cursorF = ch.cursor == null ? Math.round(spec.rot / SPEC_RES) * SPEC_RES : ch.cursor;
    const st = global.IOT.STATES[ch.state];
    const catOf = f => spec.freqs[Math.max(0, Math.min(spec.freqs.length - 1, Math.round(f / SPEC_RES)))];

    const marks = [
      { xAxis: catOf(spec.rot), lineStyle: { color: C.cyan, type: "dashed", width: 1 },
        label: { formatter: "1X " + spec.rot.toFixed(0) + "Hz", color: C.cyan, fontSize: 9, position: "insideEndTop" } },
      { xAxis: catOf(2 * spec.rot), lineStyle: { color: hexA(C.blue, 0.6), type: "dotted", width: 1 },
        label: { formatter: "2X", color: C.blue, fontSize: 8.5, position: "insideEndTop" } },
      { yAxis: spec.alarm, lineStyle: { color: C.amber, type: "dashed", width: 1 },
        label: { formatter: "振幅告警线 " + spec.alarm, color: C.amber, fontSize: 9, position: "insideEndTop" } }
    ];
    if (st.freq === "BPFI") marks.push({
      xAxis: catOf(spec.bpfi), lineStyle: { color: C.red, type: "solid", width: 1.2 },
      label: { formatter: "BPFI " + spec.bpfi.toFixed(0) + "Hz", color: C.red, fontSize: 9, position: "insideEndBottom" }
    });
    if (st.freq === "BPFO") marks.push({
      xAxis: catOf(spec.bpfo), lineStyle: { color: C.red, type: "solid", width: 1.2 },
      label: { formatter: "BPFO " + spec.bpfo.toFixed(0) + "Hz", color: C.red, fontSize: 9, position: "insideEndBottom" }
    });
    // 告警游标
    marks.push({
      xAxis: catOf(cursorF), lineStyle: { color: "#f472b6", width: 1.4, type: "solid" },
      label: { formatter: "游标", color: C.pink, fontSize: 9, position: "insideEndTop" }
    });

    c.setOption({
      backgroundColor: "transparent",
      animation: false,
      grid: { left: 6, right: 14, top: 30, bottom: 4, containLabel: true },
      tooltip: tooltip({
        formatter: p => `频率 <b>${p[0].axisValue}</b> Hz<br/>幅值 <b>${p[0].value}</b> m/s²`
      }),
      xAxis: Object.assign({
        type: "category", data: spec.freqs,
        name: "频率 Hz", nameTextStyle: { color: C.txt2, fontSize: 9.5 },
        axisLabel: { color: C.txt2, fontSize: 9, interval: 2 }
      }, baseAxis(true)),
      yAxis: Object.assign({
        type: "value", name: "m/s²", nameTextStyle: { color: C.txt2, fontSize: 9.5 }, max: v => Math.ceil(Math.max(v.max, spec.alarm) * 1.15 * 10) / 10
      }, baseAxis(false)),
      series: [{
        type: "bar",
        data: spec.vals.map((v, i) => {
          const f = i * SPEC_RES;
          const crit = (st.freq === "BPFI" && Math.abs(f - spec.bpfi) <= SPEC_RES * 0.8) ||
            (st.freq === "BPFO" && Math.abs(f - spec.bpfo) <= SPEC_RES * 0.8);
          const high = v >= spec.alarm;
          return {
            value: v,
            itemStyle: {
              color: crit ? C.red : high ? C.amber : "rgba(34,211,238,0.55)",
              borderRadius: [2, 2, 0, 0]
            }
          };
        }),
        barWidth: "68%",
        markLine: { silent: true, symbol: "none", data: marks }
      }]
    }, true);
    resizeAll();
  }


  /* ---------------- 3. 健康指数仪表盘 ---------------- */
  function renderGauge(id, ch) {
    const c = mount(id); if (!c) return;
    const h = ch.health();
    const color = h >= 85 ? C.green : h >= 60 ? C.amber : C.red;
    c.setOption({
      backgroundColor: "transparent",
      series: [{
        type: "gauge",
        startAngle: 210, endAngle: -30,
        min: 0, max: 100,
        radius: "96%",
        center: ["50%", "60%"],
        progress: { show: true, width: 12, roundCap: true, itemStyle: { color } },
        axisLine: { lineStyle: { width: 12, color: [[1, "rgba(30,42,58,0.9)"]] } },
        pointer: { show: true, length: "58%", width: 3, itemStyle: { color } },
        anchor: { show: true, size: 10, itemStyle: { color, borderColor: "#0b1018", borderWidth: 2 } },
        axisTick: { show: false },
        splitLine: { distance: -14, length: 8, lineStyle: { color: C.line, width: 1 } },
        axisLabel: { distance: -30, color: C.txt2, fontSize: 9 },
        detail: {
          offsetCenter: [0, "38%"],
          formatter: v => `{v|${Math.round(v)}}{u|分}`,
          rich: {
            v: { fontSize: 30, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color },
            u: { fontSize: 12, color: C.txt2, padding: [0, 0, 0, 4] }
          }
        },
        title: { offsetCenter: [0, "72%"], color: C.txt2, fontSize: 11 },
        data: [{ value: h, name: "健康指数" }]
      }]
    }, true);
  }

  /* ---------------- 4. 健康雷达评估 ---------------- */
  function renderRadar(id, ch) {
    const c = mount(id); if (!c) return;
    const radar = ch.radar();
    const baseline = [96, 96, 97, 96, radar[4].value];
    c.setOption({
      backgroundColor: "transparent",
      tooltip: tooltip({ trigger: "item" }),
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.txt1, fontSize: 10.5 } },
      radar: {
        center: ["50%", "56%"], radius: "62%",
        indicator: radar.map(r => ({ name: r.name, max: 100 })),
        axisName: { color: C.txt1, fontSize: 10.5 },
        splitLine: { lineStyle: { color: "rgba(38,54,75,0.9)" } },
        splitArea: { areaStyle: { color: ["rgba(34,211,238,0.03)", "rgba(34,211,238,0.06)"] } },
        axisLine: { lineStyle: { color: "rgba(38,54,75,0.9)" } }
      },
      series: [{
        type: "radar",
        data: [
          {
            value: baseline, name: "健康基线",
            lineStyle: { color: C.green, width: 1.4, type: "dashed" },
            itemStyle: { color: C.green }, symbolSize: 4,
            areaStyle: { color: "rgba(34,197,94,0.06)" }
          },
          {
            value: radar.map(r => r.value), name: "当前状态",
            lineStyle: { color: C.cyan, width: 2 },
            itemStyle: { color: C.cyan }, symbolSize: 5,
            areaStyle: {
              color: new echarts.graphic.RadialGradient(0.5, 0.5, 1, [
                { offset: 0, color: "rgba(34,211,238,0.35)" },
                { offset: 1, color: "rgba(59,130,246,0.08)" }
              ])
            }
          }
        ]
      }]
    }, true);
  }

  /* ---------------- 5. RUL 预测曲线 ---------------- */
  function renderRul(id, ch) {
    const c = mount(id); if (!c) return;
    const d = ch.rulCurve();
    const PRED = C.amber, BAND = "rgba(245,158,11,0.13)";
    const delta = d.bandUp.map((v, i) => (v == null ? null : global.IOT.util.round(v - d.band[i], 2)));
    c.setOption({
      backgroundColor: "transparent",
      animationDuration: 320,
      grid: { left: 6, right: 14, top: 32, bottom: 4, containLabel: true },
      tooltip: tooltip({
        formatter: p => {
          const t = p[0].axisValue;
          const rows = p.filter(x => ["历史健康分", "RUL 预测"].includes(x.seriesName) && x.value != null)
            .map(x => `<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${x.color};margin-right:6px"></span>${x.seriesName}：<b>${x.value}</b>`);
          return t + (rows.length ? "<br/>" + rows.join("<br/>") : "<br/><span style='color:#63748a'>无预测数据</span>");
        }
      }),
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10.5 },
        data: ["置信区间", "历史健康分", "RUL 预测"] },
      xAxis: Object.assign({ type: "category", data: d.times, boundaryGap: false, axisLabel: { color: C.txt2, fontSize: 9, interval: Math.floor(d.times.length / 10) } }, baseAxis(true)),
      yAxis: Object.assign({ type: "value", min: 0, max: 100, name: "健康分", nameTextStyle: { color: C.txt2, fontSize: 10 } }, baseAxis(false)),
      series: [
        {
          name: "置信区间下界", type: "line", data: d.band, stack: "conf",
          symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, silent: true, z: 1, tooltip: { show: false }
        },
        {
          name: "置信区间", type: "line", data: delta, stack: "conf",
          symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: BAND }, silent: true, z: 1, tooltip: { show: false }
        },
        {
          name: "历史健康分", type: "line", data: d.hist, symbol: "circle", symbolSize: 5,
          lineStyle: { color: C.cyan, width: 2 }, itemStyle: { color: C.cyan }, z: 3, connectNulls: false
        },
        {
          name: "RUL 预测", type: "line", data: d.pred, symbol: "none", smooth: 0.3,
          lineStyle: { color: PRED, width: 2, type: "dashed" }, z: 3, connectNulls: false,
          markLine: {
            silent: true, symbol: "none",
            lineStyle: { color: C.red, type: "dashed", width: 1 },
            label: { formatter: "停机阈值 60", color: C.red, fontSize: 9.5, position: "insideEndTop" },
            data: [{ yAxis: d.threshold }]
          }
        }
      ]
    }, true);
    // 在图表容器上渲染 RUL 文本徽标
    const badge = document.getElementById("rul-badge");
    if (badge) {
      const rul = d.rul;
      const txt = rul >= 720 ? Math.floor(rul / 24) + " 天" : rul + " 小时";
      const risk = rul < 72 ? "danger" : rul < 300 ? "warn" : "ok";
      badge.className = "pill pill-" + risk;
      badge.textContent = "RUL 预测剩余 " + txt;
    }
  }

  /* ---------------- 6. 劣化趋势（长周期） ---------------- */
  function renderDegrade(id, ch) {
    const c = mount(id); if (!c) return;
    const st = global.IOT.STATES[ch.state];
    const days = 90, pts = 45;
    const times = [], mid = [];
    const h0 = ch.health();
    const HMAX = 95;
    for (let i = 0; i < pts; i++) {
      const back = (pts - 1 - i) * (days / pts);   // 距离当前的天数（越大越早）
      const p = back / days;                        // 0=当前, 1=90 天前
      const v = global.IOT.util.clamp(h0 + (HMAX - h0) * Math.pow(p, 2.6) + Math.sin(i * 0.8) * 0.9, 5, 100);
      times.push("-" + back.toFixed(0) + "d");
      mid.push(global.IOT.util.round(v, 1));
    }
    mid[pts - 1] = h0;
    c.setOption({
      backgroundColor: "transparent",
      grid: { left: 6, right: 12, top: 26, bottom: 4, containLabel: true },
      tooltip: tooltip({ formatter: p => p[0].axisValue + "<br/>健康分 <b>" + p[0].value + "</b>" }),
      xAxis: Object.assign({ type: "category", data: times, boundaryGap: false, axisLabel: { color: C.txt2, fontSize: 9, interval: 6 } }, baseAxis(true)),
      yAxis: Object.assign({ type: "value", min: 0, max: 100 }, baseAxis(false)),
      series: [{
        name: "健康分趋势", type: "line", data: mid, symbol: "none", smooth: 0.35, z: 3,
        lineStyle: { color: C.violet, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(167,139,250,0.24)" }, { offset: 1, color: "rgba(167,139,250,0)" }
          ])
        },
        markLine: {
          silent: true, symbol: "none",
          lineStyle: { color: "rgba(239,68,68,0.5)", type: "dashed", width: 1 },
          label: { formatter: "预警线 60", color: C.red, fontSize: 9, position: "insideEndTop" },
          data: [{ yAxis: 60 }]
        },
        markArea: st.level > 0 ? {
          silent: true,
          itemStyle: { color: st.level === 2 ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)" },
          data: [[{ xAxis: times[Math.floor(pts * 0.6)] }, { xAxis: times[pts - 1] }]]
        } : undefined
      }]
    }, true);
  }

  /* ---------------- 7. 备件库存条形图 ---------------- */
  function renderParts(id, parts) {
    const c = mount(id); if (!c) return;
    const sorted = parts.slice().sort((a, b) => a.stock / a.min - b.stock / b.min);
    c.setOption({
      backgroundColor: "transparent",
      grid: { left: 6, right: 18, top: 10, bottom: 4, containLabel: true },
      tooltip: tooltip({ trigger: "item", formatter: p => `${p.name}<br/>库存 <b>${p.value}</b> / 安全库存 ${p.markerSafe || ""}` }),
      xAxis: Object.assign({ type: "value" }, baseAxis(false)),
      yAxis: Object.assign({ type: "category", data: sorted.map(p => p.name), axisLabel: { color: C.txt1, fontSize: 10.5 } }, baseAxis(true)),
      series: [{
        type: "bar",
        barWidth: 13,
        data: sorted.map(p => ({
          value: p.stock,
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: p.stock < p.min ? C.red : p.stock < p.min * 1.4 ? C.amber : C.green
          }
        })),
        label: { show: true, position: "right", color: C.txt1, fontSize: 10.5, fontFamily: "JetBrains Mono, monospace" },
        markLine: {
          silent: true, symbol: "none",
          lineStyle: { color: "rgba(245,158,11,0.4)", type: "dashed" },
          label: { show: false },
          data: []
        }
      }]
    }, true);
  }

  /* ---------------- 8. 工单状态环形图 ---------------- */
  function renderWoPie(id, counts) {
    const c = mount(id); if (!c) return;
    const data = [
      { value: counts.pending, name: "待处理", itemStyle: { color: C.red } },
      { value: counts.processing, name: "处理中", itemStyle: { color: C.amber } },
      { value: counts.done, name: "已完成", itemStyle: { color: C.green } },
      { value: counts.closed, name: "已闭环", itemStyle: { color: C.blue } }
    ];
    c.setOption({
      backgroundColor: "transparent",
      tooltip: tooltip({ trigger: "item", formatter: "{b}：{c} 单（{d}%）" }),
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: C.txt1, fontSize: 10.5 } },
      series: [{
        type: "pie", radius: ["52%", "74%"], center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: C.panel, borderWidth: 2 },
        label: { show: true, position: "center", formatter: () => "{v|" + (counts.pending + counts.processing + counts.done + counts.closed) + "}\n{t|工单总数}",
          rich: { v: { fontSize: 24, fontFamily: "JetBrains Mono, monospace", color: C.txt0 || "#e8f0fa", fontWeight: 700 }, t: { fontSize: 10.5, color: C.txt2, padding: [4, 0, 0, 0] } } },
        emphasis: { label: { show: true } },
        data
      }]
    }, true);
  }

  global.Charts = {
    renderSparkline, renderTrend, renderSpectrum, renderGauge, renderRadar,
    renderRul, renderDegrade, renderParts, renderWoPie,
    resizeAll, registry,
    get: id => registry[id]
  };
})(window);
