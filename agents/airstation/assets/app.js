/* 空压站调度智能体 AirStationOps —— 多机协同智能调度 */
(function () {
  "use strict";
  const { chart, toast, theme } = AgentUI;
  const { C, axCat, axVal, tip, grad, hexA } = theme;

  const UNITS = [
    { id: "C1", type: "离心机", rated: 75, load: 82, flow: 11.8, power: 66.0 },
    { id: "C2", type: "离心机", rated: 90, load: 78, flow: 13.2, power: 70.0 },
    { id: "C3", type: "螺杆机", rated: 55, load: 91, flow: 8.2, power: 46.0 },
    { id: "C4", type: "螺杆机", rated: 37, load: 64, flow: 4.2, power: 20.0 }
  ];
  const BASELINE = 5.86;
  const norm = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const r = (v, d) => AgentUI.fmt.round(v, d == null ? 1 : d);

  function totals() {
    const flow = UNITS.reduce((s, u) => s + u.flow, 0);
    const power = UNITS.reduce((s, u) => s + u.power, 0);
    return { flow, power, sp: power / flow };
  }
  function nearest(arr, v) { let bi = 0, bd = 1e9; arr.forEach((x, i) => { const d = Math.abs(x - v); if (d < bd) { bd = d; bi = i; } }); return arr[bi]; }

  function drawPressure(id) {
    const n = 60, data = [];
    for (let i = 0; i < n; i++) data.push(r(0.72 + norm() * 0.012, 3));
    chart(id, {
      backgroundColor: "transparent", animation: false,
      grid: { left: 6, right: 14, top: 20, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => `母管压力 <b>${p[0].value}</b> MPa` }),
      xAxis: axCat(Array.from({ length: n }, (_, i) => i), { axisLabel: { show: false } }),
      yAxis: axVal({ min: 0.66, max: 0.78, name: "MPa" }),
      series: [{ type: "line", data, smooth: 0.4, symbol: "none", lineStyle: { color: C.cyan, width: 1.8 }, areaStyle: { color: grad(C.cyan) },
        markLine: { silent: true, symbol: "none", data: [
          { yAxis: 0.74, lineStyle: { color: hexA(C.amber, 0.7), type: "dashed" }, label: { formatter: "+0.02", color: C.amber, fontSize: 9 } },
          { yAxis: 0.70, lineStyle: { color: hexA(C.amber, 0.7), type: "dashed" }, label: { formatter: "-0.02", color: C.amber, fontSize: 9 } }
        ] } }]
    });
  }
  function drawSurge(id) {
    const q = [], margin = [];
    for (let i = 0; i <= 20; i++) { const f = 6 + i * 0.9; q.push(r(f, 1)); margin.push(r(Math.max(2, (f - 6) / 6 * 100), 1)); }
    chart(id, {
      backgroundColor: "transparent", grid: { left: 6, right: 14, top: 20, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => `流量 <b>${p[0].axisValue}</b> m³/min<br/>喘振裕度 <b>${p[0].value}</b>%` }),
      xAxis: axCat(q, { name: "m³/min", nameTextStyle: { color: C.txt2, fontSize: 9 } }),
      yAxis: axVal({ min: 0, max: 110, name: "%" }),
      series: [{ type: "line", data: margin, smooth: 0.3, symbol: "none", lineStyle: { color: C.violet, width: 2 }, areaStyle: { color: grad(C.violet) },
        markLine: { silent: true, symbol: "none", data: [
          { yAxis: 15, lineStyle: { color: C.red, type: "dashed" }, label: { formatter: "喘振阈值 15%", color: C.red, fontSize: 9, position: "insideEndTop" } },
          { xAxis: nearest(q, 12.9), lineStyle: { color: C.cyan, type: "solid", width: 1.2 }, label: { formatter: "运行点", color: C.cyan, fontSize: 9, position: "insideEndBottom" } }
        ] } }]
    });
  }
  function drawLoad(id) {
    chart(id, {
      backgroundColor: "transparent", grid: { left: 6, right: 26, top: 20, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => `${p[0].name}<br/>负荷率 <b>${p[0].value}%</b>` }),
      xAxis: axCat(UNITS.map(u => u.id)), yAxis: axVal({ min: 0, max: 100, name: "%" }),
      series: [{ type: "bar", barWidth: 26, data: UNITS.map(u => ({ value: u.load, itemStyle: { color: u.load >= 90 ? C.amber : u.load >= 55 ? C.cyan : C.red, borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: "top", color: C.txt1, fontSize: 10, formatter: "{c}%" } }]
    });
  }
  function loadTable() {
    const t = totals();
    return `<table class="data"><thead><tr><th>机组</th><th>类型</th><th>额定</th><th>最优负荷率</th><th>流量</th><th>功率</th><th>比功率</th><th>状态</th></tr></thead>
      <tbody>${UNITS.map(u => `<tr><td><b>${u.id}</b></td><td>${u.type}</td><td class="mono">${u.rated} kW</td>
        <td><span class="mono">${u.load}%</span> <span class="bar-track" style="width:64px;margin-left:6px"><span class="bar-fill ${u.load >= 90 ? "warn" : "ok"}" style="width:${u.load}%"></span></span></td>
        <td class="mono">${u.flow} m³/min</td><td class="mono">${u.power} kW</td><td class="mono">${(u.power / u.flow).toFixed(2)}</td>
        <td><span class="pill pill-ok" style="font-size:10px">最优</span></td></tr>`).join("")}
        <tr style="background:rgba(34,211,238,0.05)"><td colspan="4"><b>系统合计</b></td><td class="mono"><b>${t.flow.toFixed(1)} m³/min</b></td><td class="mono"><b>${t.power.toFixed(1)} kW</b></td><td class="mono"><b>${t.sp.toFixed(2)}</b></td><td><span class="pill pill-info" style="font-size:10px">能效 +7.8%</span></td></tr>
      </tbody></table>`;
  }
  function refreshKpis() {
    const t = totals();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set("k-sp", t.sp.toFixed(2)); set("k-flow", t.flow.toFixed(1));
    set("k-eff", ((1 - t.sp / BASELINE) * 100).toFixed(1));
  }

  const views = [
    {
      key: "overview", label: "站房总览",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 20h18M6 20V8l6-4 6 4v12M10 20v-5h4v5"/></svg>`,
      html() {
        const t = totals();
        return `<div class="grid g-4 mb">
          <div class="metric is-green"><div class="metric-label">系统比功率</div><div class="metric-value"><span id="k-sp">${t.sp.toFixed(2)}</span><small>kW/(m³/min)</small></div><div class="metric-foot">能效提升 <b class="up">7.8%</b></div></div>
          <div class="metric is-cyan"><div class="metric-label">母管压力</div><div class="metric-value">0.72<small>MPa</small></div><div class="metric-foot">恒压控制 ±0.02 MPa</div></div>
          <div class="metric is-violet"><div class="metric-label">总供气量</div><div class="metric-value"><span id="k-flow">${t.flow.toFixed(1)}</span><small>m³/min</small></div><div class="metric-foot">4 台机组协同</div></div>
          <div class="metric is-amber"><div class="metric-label">喘振裕度</div><div class="metric-value">31.5<small>%</small></div><div class="metric-foot">阈值 15% · 预警提前 45s</div></div>
        </div>
        <div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>母管压力趋势</h3><span class="sub">恒压 0.72 MPa</span></div><div class="chart chart-lg" id="ov-press"></div></div>
          <div class="panel"><div class="panel-head"><h3>站房运行状态</h3></div>
            <table class="data"><tbody>
              <tr><td>运行机组</td><td class="mono">4 / 4</td></tr>
              <tr><td>离心机</td><td class="mono">C1 · C2</td></tr>
              <tr><td>螺杆机</td><td class="mono">C3 · C4</td></tr>
              <tr><td>目标压力</td><td class="mono">0.72 MPa</td></tr>
              <tr><td>调度模式</td><td><span class="pill pill-info">MINLP 最优</span></td></tr>
              <tr><td>节能率</td><td><span class="pill pill-ok">7.8%</span></td></tr>
            </tbody></table>
          </div>
        </div>`;
      },
      init() { drawPressure("ov-press"); },
      refresh() { drawPressure("ov-press"); }
    },
    {
      key: "load", label: "机组负荷分配",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19h16M6 19V9M12 19V5M18 19v-7"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>MINLP 最优负荷分配</h3><span class="sub">混合整数非线性规划求解</span>
            <div class="spacer"></div><button class="btn btn-sm btn-primary" id="btn-opt">重算最优分配</button></div>
          <div class="chart" id="c-load" style="height:240px"></div></div>
        <div class="panel"><div class="panel-head"><h3>机组明细</h3><span class="sub">负荷率 / 流量 / 功率 / 比功率</span></div>
          <div class="table-wrap" id="load-table">${loadTable()}</div>
          <div class="note" style="margin-top:8px">目标：min Σ(比功率 × 流量)；约束：母管压力 0.72±0.02 MPa、负荷率 55%~95%、离心机喘振裕度 ≥ 15%。</div></div>`;
      },
      init() {
        drawLoad("c-load"); refreshKpis();
        document.getElementById("btn-opt").addEventListener("click", () => {
          UNITS.forEach(u => { u.load = Math.round(Math.min(95, Math.max(55, u.load + norm() * 6))); u.flow = r(u.rated / 5.6 * (u.load / 100) * (u.type === "离心机" ? 1.06 : 0.96), 1); u.power = r(u.rated * (0.28 + 0.62 * (u.load / 100) ** 1.4), 1); });
          drawLoad("c-load"); document.getElementById("load-table").innerHTML = loadTable(); refreshKpis();
          toast("ok", "MINLP 已重算最优负荷分配");
        });
      }
    },
    {
      key: "surge", label: "喘振防护",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12h4l3-7 4 14 3-7h6"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>离心机喘振裕度曲线</h3><span class="sub">提前 45s 动态预警</span>
            <div class="spacer"></div><button class="btn btn-sm" id="btn-sim">模拟负荷波动</button></div>
          <div class="chart" id="c-surge" style="height:280px"></div>
          <div class="note" id="surge-note" style="margin-top:8px">当前喘振裕度 31.5%，处于安全区间（阈值 15%）。</div></div>
        <div class="grid g-3">
          <div class="metric is-green"><div class="metric-label">当前喘振裕度</div><div class="metric-value">31.5<small>%</small></div></div>
          <div class="metric is-cyan"><div class="metric-label">预警提前量</div><div class="metric-value">45<small>s</small></div></div>
          <div class="metric is-amber"><div class="metric-label">动态增载响应</div><div class="metric-value">1.2<small>s</small></div></div>
        </div>`;
      },
      init() {
        drawSurge("c-surge");
        document.getElementById("btn-sim").addEventListener("click", () => {
          const el = document.getElementById("c-surge");
          const inst = el ? echarts.getInstanceByDom(el) : null;
          const q = []; for (let i = 0; i <= 20; i++) q.push(r(6 + i * 0.9, 1));
          if (inst) inst.setOption({ series: [{ markPoint: { symbol: "pin", symbolSize: 46, data: [{ coord: [nearest(q, 12.9), 13.2], value: "45s 预警" }], itemStyle: { color: C.red }, label: { fontSize: 9, color: "#fff" } } }] });
          const note = document.getElementById("surge-note");
          if (note) note.innerHTML = `<b class="down">离心机 C1 喘振裕度降至 13.2%，低于阈值 15%，系统已提前 45 秒动态预警并联动增载。</b>`;
          toast("warn", "C1 喘振裕度低于阈值，已提前 45s 预警");
        });
      }
    },
    {
      key: "health", label: "设备健康",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 12h4l2-5 3 10 3-6 2 3h4"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>机组健康评分</h3><span class="sub">基于振动 / 温度 / 电流 / 运行时长</span></div>
          <div class="chart" id="c-health" style="height:240px"></div></div>
        <div class="panel"><div class="panel-head"><h3>维护建议</h3><span class="sub">按健康分排序</span></div>
          <div class="table-wrap" id="health-table"></div></div>`;
      },
      init() {
        const hs = UNITS.map(u => ({ id: u.id, type: u.type, h: Math.round(96 - u.rated / 20 - Math.abs(u.load - 80) * 0.25 - Math.random() * 3) }));
        chart("c-health", {
          backgroundColor: "transparent", grid: { left: 6, right: 20, top: 16, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>健康分 <b>${p[0].value}</b>` }),
          xAxis: axCat(hs.map(x => x.id)), yAxis: axVal({ min: 50, max: 100, name: "分" }),
          series: [{ type: "bar", barWidth: 26, data: hs.map(x => ({ value: x.h, itemStyle: { color: x.h >= 85 ? C.green : x.h >= 70 ? C.amber : C.red, borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: "top", color: C.txt1, fontSize: 10 } ,
            markLine: { silent: true, symbol: "none", lineStyle: { color: C.amber, type: "dashed" }, label: { formatter: "检修线 70", color: C.amber, fontSize: 9 }, data: [{ yAxis: 70 }] } }]
        });
        document.getElementById("health-table").innerHTML = `<table class="data"><thead><tr><th>机组</th><th>类型</th><th>健康分</th><th>建议点检周期</th><th>处置建议</th></tr></thead>
          <tbody>${hs.map(x => `<tr><td><b>${x.id}</b></td><td>${x.type}</td>
            <td class="mono" style="color:${x.h >= 85 ? "var(--green)" : x.h >= 70 ? "var(--amber)" : "var(--red)"}">${x.h}</td>
            <td class="mono">${x.h >= 85 ? "7 天" : x.h >= 70 ? "3 天" : "1 天"}</td>
            <td>${x.h >= 85 ? "正常运行，按计划维护" : x.h >= 70 ? "加强监测，检查润滑与冷却" : "安排停机检修"}</td></tr>`).join("")}</tbody></table>`;
      }
    }
  ];

  AgentUI.boot({
    cn: "空压站调度智能体", code: "AirStationOps", tagline: "多机协同 · 恒压供气 · 能效最优",
    kpis: [
      { label: "比功率", value: "5.40" }, { label: "母管压力", value: "0.72MPa" },
      { label: "能效提升", value: "7.8%" }, { label: "喘振裕度", value: "31.5%" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>机组 <b>4</b> 台<br/>调度 <b>MINLP</b>`
  });
})();
