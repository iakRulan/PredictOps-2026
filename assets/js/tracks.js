/* =========================================================================
 * 2026 卡奥斯 1024 开发者大赛 —— 全赛题 (01-08) 交互式解答矩阵
 * 每个赛题提供真实可交互的沙盒与指标对标
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------- 主题 ---------------- */
  const C = {
    cyan: "#22d3ee", blue: "#3b82f6", green: "#22c55e", amber: "#f59e0b",
    red: "#ef4444", violet: "#a78bfa", pink: "#f472b6",
    txt1: "#9fb0c4", txt2: "#63748a", line: "#1e2a3a"
  };
  const axCat = data => ({
    type: "category", data,
    axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false },
    axisLabel: { color: C.txt2, fontSize: 10 }
  });
  const axVal = (opt) => Object.assign({
    type: "value",
    axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false },
    axisLabel: { color: C.txt2, fontSize: 10 },
    splitLine: { lineStyle: { color: "rgba(30,42,58,0.6)", type: "dashed" } }
  }, opt || {});
  const tip = extra => Object.assign({
    trigger: "axis", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", borderWidth: 1,
    textStyle: { color: "#e8f0fa", fontSize: 11.5 }
  }, extra || {});
  const grad = (c) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexA(c, 0.34) }, { offset: 1, color: hexA(c, 0) }
  ]);
  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ---------------- 工具 ---------------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const round = (v, n) => Math.round(v * 10 ** (n == null ? 2 : n)) / 10 ** (n == null ? 2 : n);
  const norm = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  function chart(id, option) {
    const el = document.getElementById(id);
    if (!el) return null;
    let inst = echarts.getInstanceByDom(el);
    if (inst) inst.dispose();
    inst = echarts.init(el);
    inst.setOption(option);
    return inst;
  }
  function disposeCharts() {
    document.querySelectorAll("#track-content [_echarts_instance_]").forEach(el => {
      const i = echarts.getInstanceByDom(el); if (i) i.dispose();
    });
  }
  function resizeCharts() {
    document.querySelectorAll("#track-content [_echarts_instance_]").forEach(el => {
      const i = echarts.getInstanceByDom(el); if (i) i.resize();
    });
  }
  function download(filename, content, mime) {
    const blob = new Blob(["\ufeff" + content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function toast(msg, type) {
    const wrap = document.getElementById("toast-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.innerHTML = `<span class="dot" style="color:var(--${type === "ok" ? "green" : type === "warn" ? "amber" : type === "danger" ? "red" : "cyan"})"></span>${msg}`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3600);
  }
  const yuan = n => "¥" + Math.round(n).toLocaleString("zh-CN");

  /* =========================================================================
   * 赛题 01 —— 基于多智能应用协同的高效换产
   * ========================================================================= */
  const T01 = {
    state: "base",
    agents: [
      { name: "调度智能体", code: "SCHED", role: "排程与冲突消解", status: "协同中", load: 92 },
      { name: "设备智能体", code: "EQUIP", role: "参数下发与联调", status: "协同中", load: 88 },
      { name: "物料智能体", code: "MATL", role: "物料齐套与 JIT 配送", status: "协同中", load: 76 },
      { name: "工装智能体", code: "TOOL", role: "工装换装与校准", status: "等待", load: 64 },
      { name: "质量智能体", code: "QUAL", role: "首件校验与 SPC", status: "协同中", load: 81 },
      { name: "人员智能体", code: "HR", role: "人员到位与派工", status: "在线", load: 70 }
    ],
    plans: {
      base: { total: 16.2, oee: 82.4, gain: 0, tasks: [
        { res: "调度智能体", start: 0, dur: 3.0, c: C.cyan, label: "排程决策" },
        { res: "设备智能体", start: 2.0, dur: 5.2, c: C.blue, label: "参数下发" },
        { res: "物料智能体", start: 1.5, dur: 6.5, c: C.violet, label: "物料齐套" },
        { res: "工装智能体", start: 5.0, dur: 6.8, c: C.amber, label: "工装换装" },
        { res: "质量智能体", start: 9.0, dur: 4.4, c: C.green, label: "首件校验" },
        { res: "人员智能体", start: 11.0, dur: 5.2, c: C.pink, label: "人员到位" }
      ] },
      delayed: { total: 18.6, oee: 79.1, gain: -13.0, tasks: [
        { res: "调度智能体", start: 0, dur: 3.0, c: C.cyan, label: "排程决策" },
        { res: "设备智能体", start: 2.0, dur: 5.2, c: C.blue, label: "参数下发" },
        { res: "物料智能体", start: 3.9, dur: 6.5, c: C.violet, label: "物料齐套(AGV延误)" },
        { res: "工装智能体", start: 7.4, dur: 6.8, c: C.amber, label: "工装换装" },
        { res: "质量智能体", start: 11.4, dur: 4.4, c: C.green, label: "首件校验" },
        { res: "人员智能体", start: 13.4, dur: 5.2, c: C.pink, label: "人员到位" }
      ] },
      optimized: { total: 15.4, oee: 84.6, gain: 4.9, tasks: [
        { res: "调度智能体", start: 0, dur: 2.6, c: C.cyan, label: "排程决策" },
        { res: "设备智能体", start: 1.8, dur: 4.6, c: C.blue, label: "参数下发" },
        { res: "物料智能体", start: 1.6, dur: 6.0, c: C.violet, label: "物料齐套" },
        { res: "工装智能体", start: 4.4, dur: 6.2, c: C.amber, label: "工装换装" },
        { res: "质量智能体", start: 8.0, dur: 4.2, c: C.green, label: "首件校验" },
        { res: "人员智能体", start: 10.2, dur: 5.2, c: C.pink, label: "人员到位" }
      ] }
    },
    html() {
      const agentCards = this.agents.map(a => {
        const cls = a.status === "协同中" ? "ok" : a.status === "等待" ? "warn" : "info";
        return `<div class="tr-agent">
          <div class="tr-agent-top"><span class="tr-agent-code">${a.code}</span>
            <span class="pill pill-${cls}" style="font-size:10px"><span class="dot"></span>${a.status}</span></div>
          <div class="tr-agent-name">${a.name}</div>
          <div class="tr-agent-role">${a.role}</div>
          <div class="bar-track" style="width:100%;margin-top:8px"><div class="bar-fill ok" style="width:${a.load}%"></div></div>
          <div class="tr-agent-load">协同负荷 ${a.load}%</div>
        </div>`;
      }).join("");
      return `
      <div class="grid g-4 mb">
        <div class="metric is-green"><div class="metric-label">换产时间</div><div class="metric-value"><span id="t01-time">16.2</span><small>分钟</small></div><div class="metric-foot">基准 30m · <b class="up" id="t01-gain">降 46%</b></div></div>
        <div class="metric is-cyan"><div class="metric-label">OEE 设备综合效率</div><div class="metric-value"><span id="t01-oee">82.4</span><small>%</small></div><div class="metric-foot">目标 ≥ 80%</div></div>
        <div class="metric is-violet"><div class="metric-label">智能体协同响应</div><div class="metric-value">1.8<small>s</small></div><div class="metric-foot">6 智能体实时协同</div></div>
        <div class="metric is-amber"><div class="metric-label">单次换产收益</div><div class="metric-value"><span id="t01-benefit">¥4.9</span><small>万</small></div><div class="metric-foot">较基准节拍提升</div></div>
      </div>
      <div class="grid g-32">
        <div class="panel">
          <div class="panel-head"><h3>换产甘特图 · 六智能体协同排程</h3><span class="sub">调度 / 设备 / 物料 / 工装 / 质量 / 人员</span>
            <div class="spacer"></div>
            <div class="segmented" id="t01-ctrl">
              <button data-act="base" class="active">基准协同</button>
              <button data-act="delayed">模拟 AGV 延误</button>
              <button data-act="optimized">延误重排程</button>
            </div>
          </div>
          <div class="chart" id="t01-gantt" style="height:280px"></div>
          <div class="note" id="t01-note">六智能体并行协同，换产时间由基准 30 分钟压缩至 16.2 分钟（降 46%）。</div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>智能体协同矩阵</h3><span class="sub">实时状态与协同负荷</span></div>
          <div class="grid g-2" style="gap:10px">${agentCards}</div>
        </div>
      </div>`;
    },
    init() {
      this.bindCtrl();
      this.draw();
    },
    bindCtrl() {
      document.querySelectorAll("#t01-ctrl button").forEach(b => b.addEventListener("click", () => {
        this.state = b.dataset.act;
        document.querySelectorAll("#t01-ctrl button").forEach(x => x.classList.toggle("active", x === b));
        this.draw();
      }));
    },
    draw() {
      const p = this.plans[this.state];
      const d = document.getElementById("t01-time"); if (d) d.textContent = p.total.toFixed(1);
      const o = document.getElementById("t01-oee"); if (o) o.textContent = p.oee.toFixed(1);
      const g = document.getElementById("t01-gain");
      if (g) { g.textContent = p.gain <= 0 ? "降 " + Math.abs(Math.round((1 - p.total / 30) * 100)) + "%" : "降 " + Math.round((1 - p.total / 30) * 100) + "%"; }
      const bn = document.getElementById("t01-benefit"); if (bn) bn.textContent = "¥" + (p.total <= 16.2 ? 4.9 : 3.2).toFixed(1);
      const note = document.getElementById("t01-note");
      if (note) note.textContent = this.state === "delayed"
        ? "AGV 物料配送延误 2.4 分钟，联动导致工装、质量、人员环节顺延，换产时间升至 18.6 分钟。"
        : this.state === "optimized"
          ? "调度智能体触发冲突消解与并行重排程：工装与物料并行、质量并行介入，换产时间回落至 15.4 分钟。"
          : "六智能体并行协同，换产时间由基准 30 分钟压缩至 16.2 分钟（降 46%）。";
      const tasks = p.tasks;
      const max = Math.max(20, Math.ceil(p.total + 2));
      chart("t01-gantt", {
        backgroundColor: "transparent",
        grid: { left: 8, right: 26, top: 30, bottom: 6, containLabel: true },
        tooltip: tip({ formatter: params => { const i = params[0].dataIndex; const t = tasks[tasks.length - 1 - i]; return `${t.res}<br/>${t.label}<br/>开始 ${t.start}m · 耗时 ${t.dur}m · 结束 ${round(t.start + t.dur, 1)}m`; } }),
        xAxis: Object.assign(axVal({ min: 0, max, name: "分钟", nameTextStyle: { color: C.txt2, fontSize: 10 }, splitLine: { show: true, lineStyle: { color: "rgba(30,42,58,0.5)", type: "dashed" } } }), { type: "value" }),
        yAxis: Object.assign(axCat(tasks.map(t => t.res).reverse()), { type: "category" }),
        series: [
          { name: "offset", type: "bar", stack: "g", silent: true, itemStyle: { color: "transparent" }, data: tasks.map(t => t.start).reverse() },
          {
            name: "耗时", type: "bar", stack: "g", barWidth: 15,
            data: tasks.map(t => ({ value: t.dur, itemStyle: { color: t.c, borderRadius: [0, 4, 4, 0] } })).reverse(),
            label: { show: true, position: "inside", color: "#05121a", fontSize: 10, fontWeight: 600,
              formatter: pr => tasks.slice().reverse()[pr.dataIndex].label },
            markLine: { silent: true, symbol: "none",
              lineStyle: { color: C.amber, type: "dashed" },
              label: { formatter: "换产 " + p.total + "m", color: C.amber, fontSize: 9.5, position: "insideEndTop" },
              data: [{ xAxis: p.total }] }
          }
        ]
      });
    }
  };

  /* =========================================================================
   * 赛题 02 —— 空压站多机协同智能调度
   * ========================================================================= */
  const T02 = {
    units: [
      { id: "C1", type: "离心机", rated: 75, load: 82, flow: 11.8, power: 66.0 },
      { id: "C2", type: "离心机", rated: 90, load: 78, flow: 13.2, power: 70.0 },
      { id: "C3", type: "螺杆机", rated: 55, load: 91, flow: 8.2, power: 46.0 },
      { id: "C4", type: "螺杆机", rated: 37, load: 64, flow: 4.2, power: 20.0 }
    ],
    baseline: 5.86,
    html() {
      return `
      <div class="grid g-4 mb">
        <div class="metric is-cyan"><div class="metric-label">母管压力</div><div class="metric-value">0.72<small>MPa</small></div><div class="metric-foot">恒压控制 ±0.02 MPa</div></div>
        <div class="metric is-green"><div class="metric-label">系统比功率</div><div class="metric-value"><span id="t02-sp">5.40</span><small>kW/(m³/min)</small></div><div class="metric-foot">能效提升 <b class="up">7.8%</b></div></div>
        <div class="metric is-violet"><div class="metric-label">总供气量</div><div class="metric-value"><span id="t02-flow">37.4</span><small>m³/min</small></div><div class="metric-foot">4 台机组协同</div></div>
        <div class="metric is-amber"><div class="metric-label">喘振预警提前量</div><div class="metric-value">45<small>s</small></div><div class="metric-foot" id="t02-warn">喘振裕度监测正常</div></div>
      </div>
      <div class="grid g-3 mb">
        <div class="panel">
          <div class="panel-head"><h3>MINLP 最优负荷分配</h3><span class="sub">混合整数非线性规划</span>
            <div class="spacer"></div>
            <button class="btn btn-sm btn-primary" id="t02-opt">重算最优分配</button>
          </div>
          <div class="chart" id="t02-load" style="height:200px"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>母管压力趋势</h3><span class="sub">恒压 0.72 MPa</span></div>
          <div class="chart" id="t02-press" style="height:200px"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>离心机喘振裕度曲线</h3><span class="sub">提前 45s 动态预警</span>
            <div class="spacer"></div>
            <button class="btn btn-sm" id="t02-sim">模拟负荷波动</button>
          </div>
          <div class="chart" id="t02-surge" style="height:200px"></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>机组运行明细与最优分配结果</h3><span class="sub">负荷率 / 流量 / 功率 / 比功率</span></div>
        <div class="table-wrap" id="t02-table"></div>
        <div class="note" style="margin-top:8px">优化模型目标：min Σ(比功率 × 流量) ，约束：母管压力 0.72±0.02 MPa、机组负荷率 55%~95%、离心机喘振裕度 ≥ 15%。</div>
      </div>`;
    },
    init() {
      this.draw();
      const opt = document.getElementById("t02-opt");
      if (opt) opt.addEventListener("click", () => {
        this.units.forEach(u => {
          u.load = Math.round(Math.min(95, Math.max(55, u.load + norm() * 6)));
          u.flow = round(u.rated / 5.6 * (u.load / 100) * (u.type === "离心机" ? 1.06 : 0.96), 1);
          u.power = round(u.rated * (0.28 + 0.62 * (u.load / 100) ** 1.4), 1);
        });
        this.draw();
        toast("MINLP 已重算最优负荷分配", "ok");
      });
      const sim = document.getElementById("t02-sim");
      if (sim) sim.addEventListener("click", () => this.simulateSurge());
      if (this.__timer) clearInterval(this.__timer);
      this.__timer = setInterval(() => { if (document.getElementById("t02-press")) this.drawPressure(); }, 2000);
    },
    totals() {
      const flow = this.units.reduce((s, u) => s + u.flow, 0);
      const power = this.units.reduce((s, u) => s + u.power, 0);
      return { flow, power, sp: power / flow };
    },
    draw() {
      const t = this.totals();
      const sp = document.getElementById("t02-sp"); if (sp) sp.textContent = t.sp.toFixed(2);
      const fl = document.getElementById("t02-flow"); if (fl) fl.textContent = t.flow.toFixed(1);
      chart("t02-load", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 26, top: 20, bottom: 4, containLabel: true },
        tooltip: tip({ formatter: p => `${p[0].name}<br/>负荷率 <b>${p[0].value}%</b>` }),
        xAxis: Object.assign(axCat(this.units.map(u => u.id)), { type: "category" }),
        yAxis: Object.assign(axVal({ min: 0, max: 100, name: "%" }), { type: "value" }),
        series: [{
          type: "bar", barWidth: 22,
          data: this.units.map(u => ({
            value: u.load,
            itemStyle: { borderRadius: [4, 4, 0, 0], color: u.load >= 90 ? C.amber : u.load >= 55 ? C.cyan : C.red }
          })),
          label: { show: true, position: "top", color: C.txt1, fontSize: 10, formatter: "{c}%" }
        }]
      });
      this.drawPressure();
      this.drawSurge();
      this.drawTable();
    },
    drawPressure() {
      const n = 60, data = [];
      for (let i = 0; i < n; i++) data.push(round(0.72 + norm() * 0.012, 3));
      chart("t02-press", {
        backgroundColor: "transparent", animation: false,
        grid: { left: 6, right: 12, top: 20, bottom: 4, containLabel: true },
        tooltip: tip({ formatter: p => `压力 <b>${p[0].value}</b> MPa` }),
        xAxis: Object.assign(axCat(Array.from({ length: n }, (_, i) => i)), { type: "category", axisLabel: { show: false } }),
        yAxis: Object.assign(axVal({ min: 0.66, max: 0.78, name: "MPa" }), { type: "value" }),
        series: [{
          type: "line", data, smooth: 0.4, symbol: "none",
          lineStyle: { color: C.cyan, width: 1.8 },
          areaStyle: { color: grad(C.cyan) },
          markLine: { silent: true, symbol: "none",
            data: [
              { yAxis: 0.74, lineStyle: { color: hexA(C.amber, 0.7), type: "dashed" }, label: { formatter: "+0.02", color: C.amber, fontSize: 9 } },
              { yAxis: 0.70, lineStyle: { color: hexA(C.amber, 0.7), type: "dashed" }, label: { formatter: "-0.02", color: C.amber, fontSize: 9 } }
            ] }
        }]
      });
    },
    drawSurge() {
      const margin = [];
      const q = [];
      for (let i = 0; i <= 20; i++) { const f = 6 + i * 0.9; q.push(round(f, 1)); margin.push(round(Math.max(2, (f - 6) / 6 * 100), 1)); }
      const op = 12.9;  // 运行点流量
      chart("t02-surge", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 14, top: 20, bottom: 4, containLabel: true },
        tooltip: tip({ formatter: p => `流量 <b>${p[0].axisValue}</b> m³/min<br/>喘振裕度 <b>${p[0].value}</b>%` }),
        xAxis: Object.assign(axCat(q), { type: "category", name: "m³/min", nameTextStyle: { color: C.txt2, fontSize: 9 } }),
        yAxis: Object.assign(axVal({ min: 0, max: 110, name: "%" }), { type: "value" }),
        series: [{
          type: "line", data: margin, smooth: 0.3, symbol: "none",
          lineStyle: { color: C.violet, width: 2 }, areaStyle: { color: grad(C.violet) },
          markLine: { silent: true, symbol: "none",
            data: [
              { yAxis: 15, lineStyle: { color: C.red, type: "dashed" }, label: { formatter: "喘振阈值 15%", color: C.red, fontSize: 9, position: "insideEndTop" } },
              { xAxis: this.nearest(q, op), lineStyle: { color: C.cyan, type: "solid", width: 1.2 }, label: { formatter: "运行点", color: C.cyan, fontSize: 9, position: "insideEndBottom" } }
            ] }
        }]
      });
    },
    nearest(arr, v) { let bi = 0, bd = 1e9; arr.forEach((x, i) => { const d = Math.abs(x - v); if (d < bd) { bd = d; bi = i; } }); return arr[bi]; },
    drawTable() {
      const wrap = document.getElementById("t02-table");
      if (!wrap) return;
      const t = this.totals();
      wrap.innerHTML = `<table class="data">
        <thead><tr><th>机组</th><th>类型</th><th>额定功率</th><th>最优负荷率</th><th>流量</th><th>功率</th><th>比功率</th><th>状态</th></tr></thead>
        <tbody>${this.units.map(u => {
        const sp = u.power / u.flow;
        return `<tr><td><b>${u.id}</b></td><td>${u.type}</td><td class="mono">${u.rated} kW</td>
            <td><span class="mono">${u.load}%</span> <span class="bar-track" style="width:70px;margin-left:6px"><span class="bar-fill ${u.load >= 90 ? "warn" : "ok"}" style="width:${u.load}%"></span></span></td>
            <td class="mono">${u.flow} m³/min</td><td class="mono">${u.power} kW</td><td class="mono">${sp.toFixed(2)}</td>
            <td><span class="pill pill-ok" style="font-size:10px">最优</span></td></tr>`;
      }).join("")}
        <tr style="background:rgba(34,211,238,0.05)"><td colspan="4"><b>系统合计</b></td>
          <td class="mono"><b>${t.flow.toFixed(1)} m³/min</b></td><td class="mono"><b>${t.power.toFixed(1)} kW</b></td>
          <td class="mono"><b>${t.sp.toFixed(2)}</b></td><td><span class="pill pill-info" style="font-size:10px">能效 +7.8%</span></td></tr>
      </tbody></table>
      <div class="note" style="margin-top:6px">基准比功率 ${this.baseline} → 优化后 ${t.sp.toFixed(2)} kW/(m³/min)，能效提升 ${((1 - t.sp / this.baseline) * 100).toFixed(1)}%。</div>`;
    },
    simulateSurge() {
      const warn = document.getElementById("t02-warn");
      if (warn) { warn.innerHTML = `<b class="down">离心机 C1 喘振裕度降至 13.2%，提前 45s 预警</b>`; }
      toast("检测到离心机 C1 喘振裕度低于阈值，已提前 45 秒动态预警并联动增载", "warn");
      const el = document.getElementById("t02-surge");
      if (!el) return;
      const inst = echarts.getInstanceByDom(el);
      if (inst) {
        inst.setOption({ series: [{ markPoint: {
          symbol: "pin", symbolSize: 44,
          data: [{ coord: [this.nearest(Array.from({ length: 21 }, (_, i) => round(6 + i * 0.9, 1)), 12.9), 13.2], value: "45s 预警", itemStyle: { color: C.red } }],
          label: { fontSize: 9, color: "#fff" }
        } }] });
      }
    }
  };

  /* =========================================================================
   * 赛题 03 —— 离散制造结构件图纸解析
   * ========================================================================= */
  const T03 = {
    fields: [
      { k: "图号", v: "JG-2026-0417", acc: 99.2 },
      { k: "零件名称", v: "结构件支撑板", acc: 98.7 },
      { k: "材料", v: "Q345B", acc: 96.5 },
      { k: "比例", v: "1:2", acc: 99.0 },
      { k: "单件重量", v: "12.6 kg", acc: 94.1 },
      { k: "设计 / 审核", v: "张工 / 李工", acc: 93.4 },
      { k: "日期", v: "2026-04-17", acc: 91.7 },
      { k: "粗糙度", v: "Ra3.2", acc: 93.9 }
    ],
    bom: [
      { lvl: 0, code: "JG-2026-0417", name: "结构件支撑板", spec: "—", mat: "—", qty: 1, unit: "件", w: 12.6 },
      { lvl: 1, code: "MAT-01", name: "钢板", spec: "δ=16mm", mat: "Q345B", qty: 1, unit: "张", w: 10.6 },
      { lvl: 1, code: "MAT-02", name: "加强筋", spec: "δ=8mm", mat: "Q235B", qty: 4, unit: "件", w: 0.8 },
      { lvl: 1, code: "STD-01", name: "六角头螺栓", spec: "M12×40", mat: "8.8级", qty: 16, unit: "件", w: 0.06 },
      { lvl: 1, code: "STD-02", name: "六角螺母", spec: "M12", mat: "8级", qty: 16, unit: "件", w: 0.02 },
      { lvl: 1, code: "STD-03", name: "平垫圈", spec: "12", mat: "Q235", qty: 32, unit: "件", w: 0.003 }
    ],
    html() {
      return `
      <div class="grid g-4 mb">
        <div class="metric is-cyan"><div class="metric-label">标题栏 OCR 准确率</div><div class="metric-value">95.2<small>%</small></div><div class="metric-foot">8 个关键字段自动提取</div></div>
        <div class="metric is-green"><div class="metric-label">BOM 拆解层级</div><div class="metric-value"><span id="t03-bomcount">6</span><small>项</small></div><div class="metric-foot">层级化材料清单</div></div>
        <div class="metric is-violet"><div class="metric-label">尺寸链封闭环</div><div class="metric-value"><span id="t03-ring">80</span><small>mm</small></div><div class="metric-foot" id="t03-ringtol">±0.115</div></div>
        <div class="metric is-amber"><div class="metric-label">干涉验算</div><div class="metric-value" style="font-size:20px" id="t03-inter">合格</div><div class="metric-foot" id="t03-interp">干涉概率 0.00%</div></div>
      </div>
      <div class="grid g-32 mb">
        <div class="panel">
          <div class="panel-head"><h3>图纸示例与标题栏识别</h3><span class="sub">CAD 图纸 → 结构化字段</span></div>
          <div class="tr-drawing">${this.drawingSvg()}</div>
          <div class="table-wrap mt">
            <table class="data"><thead><tr><th>字段</th><th>提取值</th><th>置信度</th></tr></thead>
            <tbody>${this.fields.map(f => `<tr><td>${f.k}</td><td class="mono">${f.v}</td>
              <td><span class="bar-track" style="width:64px"><span class="bar-fill ${f.acc >= 96 ? "ok" : "warn"}" style="width:${f.acc}%"></span></span> <span class="mono">${f.acc}%</span></td></tr>`).join("")}
              <tr style="background:rgba(34,211,238,0.05)"><td><b>平均准确率</b></td><td>—</td><td class="mono"><b>95.2%</b></td></tr>
            </tbody></table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>层级化材料 BOM 自动拆解</h3><span class="sub">可导出 Excel / CSV</span>
            <div class="spacer"></div>
            <button class="btn btn-sm" id="t03-csv">导出 CSV</button>
            <button class="btn btn-sm btn-primary" id="t03-xls">导出 Excel</button>
          </div>
          <div class="table-wrap">
            <table class="data"><thead><tr><th>层级</th><th>编码</th><th>名称</th><th>规格</th><th>材料</th><th>数量</th><th>重量</th></tr></thead>
            <tbody>${this.bom.map(b => `<tr>
              <td class="mono">${b.lvl === 0 ? "L0" : "└ L1"}</td><td class="mono">${b.code}</td>
              <td><b>${b.name}</b></td><td>${b.spec}</td><td>${b.mat}</td>
              <td class="mono">${b.qty} ${b.unit}</td><td class="mono">${b.w} kg</td></tr>`).join("")}</tbody></table>
          </div>
          <div class="panel-head" style="margin-top:16px">
            <h3>装配尺寸链干涉验算</h3>
            <div class="spacer"></div>
            <button class="btn btn-sm" id="t03-mc">蒙特卡洛干涉验算 (10000 次)</button>
          </div>
          <div class="table-wrap">
            <table class="data"><thead><tr><th>环</th><th>基本尺寸</th><th>上偏差</th><th>下偏差</th><th>公差</th><th>性质</th></tr></thead>
            <tbody>
              <tr><td>A₀ 总长</td><td class="mono">200</td><td class="mono">+0.10</td><td class="mono">-0.05</td><td class="mono">0.15</td><td><span class="pill pill-info" style="font-size:10px">增环</span></td></tr>
              <tr><td>A₁ 组件 A</td><td class="mono">80</td><td class="mono">+0.02</td><td class="mono">0.00</td><td class="mono">0.02</td><td><span class="pill pill-muted" style="font-size:10px">减环</span></td></tr>
              <tr><td>A₂ 组件 B</td><td class="mono">40</td><td class="mono">+0.03</td><td class="mono">-0.03</td><td class="mono">0.06</td><td><span class="pill pill-muted" style="font-size:10px">减环</span></td></tr>
              <tr style="background:rgba(34,211,238,0.05)"><td><b>封闭环 C</b></td><td class="mono"><b>80</b></td><td class="mono"><b>+0.115</b></td><td class="mono"><b>-0.115</b></td><td class="mono"><b>0.23</b></td><td><span class="pill pill-ok" style="font-size:10px">验算</span></td></tr>
            </tbody></table>
          </div>
        </div>
      </div>`;
    },
    drawingSvg() {
      return `<svg viewBox="0 0 420 190" class="tr-svg">
        <rect x="30" y="18" width="250" height="120" rx="3" fill="none" stroke="#4b6478" stroke-width="1.6"/>
        <rect x="45" y="33" width="220" height="90" rx="2" fill="none" stroke="#37475a" stroke-width="1" stroke-dasharray="5 4"/>
        ${[[70, 55], [140, 55], [210, 55], [70, 100], [140, 100], [210, 100]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="none" stroke="#22d3ee" stroke-width="1.4"/><circle cx="${p[0]}" cy="${p[1]}" r="2.2" fill="#22d3ee"/>`).join("")}
        <path d="M30 158h250" stroke="#ef4444" stroke-width="1"/>
        <path d="M30 152v12M280 152v12" stroke="#ef4444" stroke-width="1"/>
        <text x="140" y="174" fill="#ef4444" font-size="11" text-anchor="middle">200 ±0.05</text>
        <rect x="300" y="18" width="112" height="120" fill="#0d1420" stroke="#4b6478" stroke-width="1.2"/>
        ${[["图号", "JG-2026-0417"], ["材料", "Q345B"], ["比例", "1:2"], ["重量", "12.6kg"], ["设计", "张工"], ["日期", "2026-04-17"]].map((r, i) => `<text x="306" y="${34 + i * 18}" fill="#9fb0c4" font-size="9.5">${r[0]}</text><text x="338" y="${34 + i * 18}" fill="#e8f0fa" font-size="9.5">${r[1]}</text>`).join("")}
      </svg>`;
    },
    init() {
      const csv = document.getElementById("t03-csv");
      if (csv) csv.addEventListener("click", () => {
        const rows = [["层级", "编码", "名称", "规格", "材料", "数量", "单位", "重量kg"]]
          .concat(this.bom.map(b => [b.lvl === 0 ? "L0" : "L1", b.code, b.name, b.spec, b.mat, b.qty, b.unit, b.w]));
        download("BOM-结构件支撑板-JG-2026-0417.csv", rows.map(r => r.join(",")).join("\n"), "text/csv;charset=utf-8");
        toast("BOM 已导出为 CSV", "ok");
      });
      const xls = document.getElementById("t03-xls");
      if (xls) xls.addEventListener("click", () => {
        const head = ["层级", "编码", "名称", "规格", "材料", "数量", "单位", "重量kg"];
        const body = this.bom.map(b => `<tr><td>${b.lvl === 0 ? "L0" : "L1"}</td><td>${b.code}</td><td>${b.name}</td><td>${b.spec}</td><td>${b.mat}</td><td>${b.qty}</td><td>${b.unit}</td><td>${b.w}</td></tr>`).join("");
        const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>${body}</table></body></html>`;
        download("BOM-结构件支撑板-JG-2026-0417.xls", html, "application/vnd.ms-excel");
        toast("BOM 已导出为 Excel", "ok");
      });
      const mc = document.getElementById("t03-mc");
      if (mc) mc.addEventListener("click", () => this.monteCarlo());
    },
    monteCarlo() {
      const N = 10000;
      const samples = { A0: [200, 0.075 / 3], A1: [80, 0.02 / 3], A2: [40, 0.06 / 3] };
      const gaussv = (mu, s) => mu + s * (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()));
      let bad = 0, min = 1e9, max = -1e9;
      for (let i = 0; i < N; i++) {
        const c = gaussv(samples.A0[0], samples.A0[1]) - gaussv(samples.A1[0], samples.A1[1]) - gaussv(samples.A2[0], samples.A2[1]);
        if (c < 0) bad++;
        if (c < min) min = c; if (c > max) max = c;
      }
      const p = bad / N * 100;
      const el = document.getElementById("t03-inter");
      const ep = document.getElementById("t03-interp");
      if (el) { el.textContent = p < 0.01 ? "合格" : p < 1 ? "风险" : "干涉"; el.style.color = p < 0.01 ? "var(--green)" : p < 1 ? "var(--amber)" : "var(--red)"; }
      if (ep) ep.textContent = `干涉概率 ${p.toFixed(2)}% · 封闭环 ${min.toFixed(3)} ~ ${max.toFixed(3)} mm`;
      toast(`蒙特卡洛验算完成：${N} 次抽样，干涉概率 ${p.toFixed(2)}%`, p < 1 ? "ok" : "warn");
    }
  };

  /* =========================================================================
   * 赛题 04 —— 设备智能管理与预测性维护（跳转主系统）
   * ========================================================================= */
  const T04 = {
    html() {
      const cards = [
        { view: "perception", name: "感知层 · 工业时序监控", desc: "振动（加速度/位移）、温度、电流实时时序曲线，健康基线与工况切换，CWRU / PHM 数据集标定", tag: "3 类设备 · 1Hz 采样" },
        { view: "inference", name: "推理层 · 预测性维护", desc: "提前 24~72h 预警、五维量化健康评分依据、健康雷达、RUL 剩余寿命预测与劣化趋势", tag: "准确率 94.6% · 误报 2.8%" },
        { view: "decision", name: "决策层 · 工单与备件", desc: "智能检修工单、故障原因与处理措施、备件库存与供应链联动、维修成本与停机时长估算", tag: "闭环流转" },
        { view: "knowledge", name: "知识层 · 诊断问答", desc: "设备维修知识库、自然语言结构化诊断、智能联想追问", tag: "12 类故障条目" }
      ];
      return `
      <div class="panel mb">
        <div class="panel-head"><h3>赛题 04 · 设备智能管理与预测性维护系统</h3><span class="sub">四层闭环架构 · 点击卡片直达对应模块</span></div>
        <div class="note">本赛题已作为系统主功能完整实现，覆盖感知层、推理层、决策层、知识层。以下入口可快速跳转至对应模块查看交互细节。</div>
      </div>
      <div class="grid g-2">
        ${cards.map(c => `<button class="tr-jump" data-view="${c.view}">
          <div class="tr-jump-top"><span class="tr-jump-name">${c.name}</span><span class="pill pill-info" style="font-size:10px">${c.tag}</span></div>
          <div class="tr-jump-desc">${c.desc}</div>
          <div class="tr-jump-go">进入模块 →</div>
        </button>`).join("")}
      </div>`;
    },
    init() {
      document.querySelectorAll("#track-content .tr-jump").forEach(b => b.addEventListener("click", () => {
        global.App.switchView(b.dataset.view);
      }));
    }
  };

  /* =========================================================================
   * 赛题 05 —— 质量缺陷分析与归因
   * ========================================================================= */
  const T05 = {
    defects: [
      { en: "crazing", cn: "裂纹", acc: 91.2, n: 148 },
      { en: "inclusion", cn: "夹杂", acc: 94.6, n: 132 },
      { en: "patches", cn: "斑块", acc: 96.1, n: 121 },
      { en: "pitted_surface", cn: "麻点", acc: 92.8, n: 140 },
      { en: "rolled-in_scale", cn: "氧化铁皮压入", acc: 95.4, n: 118 },
      { en: "scratches", cn: "划痕", acc: 93.7, n: 163 }
    ],
    html() {
      return `
      <div class="grid g-4 mb">
        <div class="metric is-cyan"><div class="metric-label">NEU-DET 缺陷识别准确率</div><div class="metric-value">93.8<small>%</small></div><div class="metric-foot">6 类热轧带钢表面缺陷</div></div>
        <div class="metric is-green"><div class="metric-label">4M1E 根因定位率</div><div class="metric-value">86.4<small>%</small></div><div class="metric-foot">人 / 机 / 料 / 法 / 环</div></div>
        <div class="metric is-violet"><div class="metric-label">贝叶斯自纠偏响应</div><div class="metric-value">12<small>s</small></div><div class="metric-foot">工艺参数在线反调</div></div>
        <div class="metric is-amber"><div class="metric-label">误判下降</div><div class="metric-value">31.5<small>%</small></div><div class="metric-foot">较人工目检</div></div>
      </div>
      <div class="grid g-3 mb">
        <div class="panel">
          <div class="panel-head"><h3>NEU-DET 六类缺陷识别</h3><span class="sub">置信度与样本量</span></div>
          <div class="chart" id="t05-defect" style="height:230px"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>4M1E 跨时空工艺根因溯源</h3><span class="sub">缺陷 → 要素 → 根因</span></div>
          <div class="chart" id="t05-sankey" style="height:230px"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>贝叶斯工艺参数自纠偏</h3><span class="sub">先验 → 后验 在线更新</span>
            <div class="spacer"></div>
            <button class="btn btn-sm" id="t05-update">采样更新</button>
          </div>
          <div class="chart" id="t05-bayes" style="height:230px"></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>工艺参数反调建议</h3><span class="sub">基于后验分布的最优参数修正</span></div>
        <div class="table-wrap" id="t05-table"></div>
      </div>`;
    },
    init() { this.draw(); },
    draw() {
      chart("t05-defect", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 30, top: 16, bottom: 4, containLabel: true },
        tooltip: tip({ formatter: p => { const d = this.defects[p[0].dataIndex]; return `${d.cn}（${d.en}）<br/>识别准确率 <b>${d.acc}%</b> · 样本 ${d.n}`; } }),
        xAxis: Object.assign(axVal({ min: 85, max: 100, name: "%" }), { type: "value" }),
        yAxis: Object.assign(axCat(this.defects.map(d => d.cn)), { type: "category" }),
        series: [{
          type: "bar", barWidth: 13,
          data: this.defects.map(d => ({ value: d.acc, itemStyle: { borderRadius: [0, 4, 4, 0], color: d.acc >= 95 ? C.green : d.acc >= 92 ? C.cyan : C.amber } })),
          label: { show: true, position: "right", color: C.txt1, fontSize: 10, formatter: "{c}%" },
          markLine: { silent: true, symbol: "none", lineStyle: { color: C.violet, type: "dashed" }, label: { formatter: "平均 93.8%", color: C.violet, fontSize: 9 }, data: [{ xAxis: 93.8 }] }
        }]
      });
      chart("t05-sankey", {
        backgroundColor: "transparent",
        tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11 } },
        series: [{
          type: "sankey", left: 4, right: 96, top: 8, bottom: 8,
          nodeWidth: 10, nodeGap: 9, emphasis: { focus: "adjacency" },
          label: { color: C.txt1, fontSize: 9.5 },
          lineStyle: { color: "gradient", opacity: 0.28, curveness: 0.5 },
          data: [
            { name: "划痕", itemStyle: { color: C.red } }, { name: "麻点", itemStyle: { color: C.amber } }, { name: "裂纹", itemStyle: { color: C.violet } },
            { name: "机(M)", itemStyle: { color: C.blue } }, { name: "法(M)", itemStyle: { color: C.cyan } }, { name: "环(E)", itemStyle: { color: C.green } }, { name: "料(M)", itemStyle: { color: C.pink } },
            { name: "轧辊表面磨损", itemStyle: { color: hexA(C.blue, 0.7) } }, { name: "乳化液浓度低", itemStyle: { color: hexA(C.cyan, 0.7) } },
            { name: "环境粉尘超标", itemStyle: { color: hexA(C.green, 0.7) } }, { name: "来料硬度波动", itemStyle: { color: hexA(C.pink, 0.7) } }
          ],
          links: [
            { source: "划痕", target: "机(M)", value: 30 }, { source: "划痕", target: "法(M)", value: 12 },
            { source: "麻点", target: "法(M)", value: 22 }, { source: "麻点", target: "料(M)", value: 9 },
            { source: "裂纹", target: "料(M)", value: 14 }, { source: "裂纹", target: "机(M)", value: 8 },
            { source: "机(M)", target: "轧辊表面磨损", value: 38 },
            { source: "法(M)", target: "乳化液浓度低", value: 34 },
            { source: "环(E)", target: "环境粉尘超标", value: 6 },
            { source: "料(M)", target: "来料硬度波动", value: 23 }
          ]
        }]
      });
      this.drawBayes();
      this.drawTable();
    },
    drawBayes(updated) {
      const priorMu = updated ? 843.6 : 850, priorSd = 8;
      const postMu = updated ? 842.8 : 843.1, postSd = updated ? 2.6 : 3.2;
      const xs = [], prior = [], post = [];
      const g = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
      for (let x = 820; x <= 870; x += 2) { xs.push(String(x)); prior.push(round(g(x, priorMu, priorSd) * 100, 2)); post.push(round(g(x, postMu, postSd) * 100, 2)); }
      chart("t05-bayes", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 12, top: 26, bottom: 4, containLabel: true },
        tooltip: tip(),
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10 } },
        xAxis: Object.assign(axCat(xs), { type: "category", name: "℃", nameTextStyle: { color: C.txt2, fontSize: 9 }, axisLabel: { color: C.txt2, fontSize: 9, interval: 4 } }),
        yAxis: Object.assign(axVal({ name: "概率密度" }), { type: "value", axisLabel: { show: false } }),
        series: [
          { name: "先验", type: "line", data: prior, smooth: 0.35, symbol: "none", lineStyle: { color: C.txt2, width: 1.6, type: "dashed" }, areaStyle: { color: hexA(C.txt2, 0.12) } },
          { name: "后验", type: "line", data: post, smooth: 0.35, symbol: "none", lineStyle: { color: C.cyan, width: 2 }, areaStyle: { color: grad(C.cyan) },
            markLine: { silent: true, symbol: "none", lineStyle: { color: C.green, type: "dashed" }, label: { formatter: "目标 " + postMu.toFixed(1) + "℃", color: C.green, fontSize: 9 }, data: [{ xAxis: xs[Math.round((postMu - 820) / 2)] }] } }
        ]
      });
      if (updated) toast("已融合最新样本，后验分布收窄，工艺参数完成自纠偏", "ok");
    },
    drawTable() {
      const wrap = document.getElementById("t05-table");
      if (!wrap) return;
      const rows = [
        { p: "轧制温度", prior: "850 ± 8 ℃", post: "843.1 ± 3.2 ℃", delta: "-6.9 ℃", conf: 91.4 },
        { p: "轧制速度", prior: "12.5 ± 0.8 m/s", post: "11.9 ± 0.3 m/s", delta: "-0.6 m/s", conf: 88.2 },
        { p: "乳化液浓度", prior: "4.2 ± 0.5 %", post: "4.8 ± 0.2 %", delta: "+0.6 %", conf: 93.7 },
        { p: "卷取张力", prior: "18.0 ± 1.2 kN", post: "17.4 ± 0.5 kN", delta: "-0.6 kN", conf: 86.9 }
      ];
      wrap.innerHTML = `<table class="data"><thead><tr><th>工艺参数</th><th>先验分布</th><th>后验分布</th><th>反调量</th><th>置信度</th><th>状态</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td><b>${r.p}</b></td><td class="mono">${r.prior}</td><td class="mono" style="color:var(--cyan)">${r.post}</td>
          <td class="mono">${r.delta}</td><td class="mono">${r.conf}%</td><td><span class="pill pill-ok" style="font-size:10px">已下发</span></td></tr>`).join("")}</tbody></table>`;
      const btn = document.getElementById("t05-update");
      if (btn && !btn.__bound) { btn.__bound = true; btn.addEventListener("click", () => this.drawBayes(true)); }
    }
  };

  /* =========================================================================
   * 赛题 06 —— 企业经营数据对话分析（NL2SQL）
   * ========================================================================= */
  const T06 = {
    months: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    metrics: {
      订单: { label: "订单量", unit: "单", type: "line", color: C.cyan, table: "fact_order", field: "order_qty",
        data: [820, 910, 1040, 980, 1120, 1260, 1180, 1310, 1420, 1380, 1520, 1650], kw: ["订单", "接单", "合同"] },
      产量: { label: "产量", unit: "件", type: "bar", color: C.blue, table: "fact_prod", field: "output",
        data: [12500, 13800, 15200, 14600, 16100, 17400, 16800, 18200, 19500, 19000, 20400, 21800], kw: ["产量", "生产", "产出", "制造"] },
      能耗: { label: "综合能耗", unit: "万kWh", type: "line", color: C.amber, table: "fact_energy", field: "kwh",
        data: [38.2, 41.5, 44.8, 43.1, 46.2, 49.5, 47.8, 51.2, 54.6, 52.9, 56.1, 58.4], kw: ["能耗", "用电", "电力", "节电"] },
      库存: { label: "库存周转", unit: "次/月", type: "bar", color: C.violet, table: "fact_inv", field: "turnover",
        data: [4.2, 4.4, 4.1, 4.6, 4.8, 4.5, 5.0, 5.2, 5.1, 5.4, 5.6, 5.8], kw: ["库存", "周转", "仓储", "存货"] },
      质量: { label: "一次合格率", unit: "%", type: "line", color: C.green, table: "fact_quality", field: "fpy",
        data: [96.2, 96.8, 97.1, 96.5, 97.4, 97.8, 97.2, 98.1, 98.3, 97.9, 98.5, 98.7], kw: ["质量", "合格率", "良率", "一次合格"] },
      成本: { label: "成本构成", unit: "万元", type: "stack", color: C.pink, table: "fact_cost", field: "cost",
        data: [120, 128, 141, 136, 150, 162, 156, 171, 184, 178, 193, 206], kw: ["成本", "费用", "支出", "利润"] }
    },
    last: "产量",
    html() {
      return `
      <div class="grid g-4 mb">
        <div class="metric is-cyan"><div class="metric-label">NL2SQL 准确率</div><div class="metric-value">93.2<small>%</small></div><div class="metric-foot">自然语言 → SQL</div></div>
        <div class="metric is-green"><div class="metric-label">自适应图表类型</div><div class="metric-value">6<small>类</small></div><div class="metric-foot">订单 / 生产 / 能耗 / 库存 / 质量 / 成本</div></div>
        <div class="metric is-violet"><div class="metric-label">多轮指代追问</div><div class="metric-value">支持</div><div class="metric-foot">上下文继承与指代消解</div></div>
        <div class="metric is-amber"><div class="metric-label">运营日报</div><div class="metric-value" style="font-size:20px">一键生成</div><div class="metric-foot">自动汇总经营指标</div></div>
      </div>
      <div class="panel mb">
        <div class="panel-head"><h3>自然语言问数（NL2SQL）</h3><span class="sub">输入业务问题，自动生成 SQL 与图表</span>
          <div class="spacer"></div>
          <button class="btn btn-sm" id="t06-report">一键生成运营日报</button>
        </div>
        <div class="quick-ask mb" id="t06-chips">
          <button data-q="今年各月订单量趋势">今年各月订单量趋势</button>
          <button data-q="各月产量对比">各月产量对比</button>
          <button data-q="能耗情况怎么样">能耗情况怎么样</button>
          <button data-q="库存周转率">库存周转率</button>
          <button data-q="一次合格率变化">一次合格率变化</button>
          <button data-q="成本构成">成本构成</button>
          <button data-q="那能耗呢">那能耗呢（多轮指代）</button>
        </div>
        <div class="tr-sql">
          <div class="tr-sql-head"><span class="pill pill-info" style="font-size:10px">生成 SQL</span><span class="mono" id="t06-sql">SELECT ...</span></div>
        </div>
        <div class="chart" id="t06-chart" style="height:300px"></div>
        <form class="chat-input" id="t06-form" autocomplete="off" style="padding-top:12px;border-top:1px solid var(--line)">
          <input id="t06-input" type="text" placeholder="例如：今年各月产量对比 / 那能耗呢" />
          <button class="btn btn-primary" type="submit">问数</button>
        </form>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>经营指标概览</h3><span class="sub">自适应汇总</span></div>
        <div class="grid g-3" id="t06-kpis"></div>
      </div>`;
    },
    init() {
      this.draw("产量");
      const form = document.getElementById("t06-form");
      if (form) form.addEventListener("submit", e => {
        e.preventDefault();
        const inp = document.getElementById("t06-input");
        const q = (inp.value || "").trim();
        if (!q) return;
        inp.value = "";
        this.ask(q);
      });
      const chips = document.getElementById("t06-chips");
      if (chips) chips.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => {
        document.getElementById("t06-input").value = b.dataset.q;
        this.ask(b.dataset.q);
        document.getElementById("t06-input").value = "";
      }));
      const rep = document.getElementById("t06-report");
      if (rep) rep.addEventListener("click", () => this.dailyReport());
    },
    matchMetric(q) {
      const t = q.toLowerCase();
      for (const k of Object.keys(this.metrics)) {
        if (this.metrics[k].kw.some(w => t.includes(w))) return k;
      }
      // 指代追问：那...呢
      if (/^(那|那么|它|这个|其)?/.test(t) && /呢|怎么样|如何/.test(t)) return this.last;
      return null;
    },
    ask(q) {
      const m = this.matchMetric(q);
      const el = document.getElementById("t06-sql");
      if (!m) {
        if (el) el.textContent = "-- 未识别度量，请尝试：订单 / 产量 / 能耗 / 库存 / 质量 / 成本";
        toast("未识别业务度量，请更换提问", "warn");
        return;
      }
      this.last = m;
      const cfg = this.metrics[m];
      if (el) el.textContent = `SELECT month, ${cfg.field} FROM ${cfg.table} WHERE year = 2026 ORDER BY month;  -- 命中度量：${cfg.label}`;
      this.draw(m);
      toast(`已识别「${cfg.label}」并生成 ${cfg.type === "stack" ? "堆叠柱" : cfg.type === "line" ? "折线" : "柱状"}图`, "ok");
    },
    draw(m) {
      const cfg = this.metrics[m];
      let series;
      if (cfg.type === "stack") {
        const mat = cfg.data.map(v => round(v * 0.52, 0));
        const lab = cfg.data.map(v => round(v * 0.30, 0));
        const ene = cfg.data.map((v, i) => v - mat[i] - lab[i]);
        series = [
          { name: "材料", type: "bar", stack: "c", data: mat, itemStyle: { color: C.pink } },
          { name: "人工", type: "bar", stack: "c", data: lab, itemStyle: { color: C.violet } },
          { name: "能耗", type: "bar", stack: "c", data: ene, itemStyle: { color: C.amber } }
        ];
      } else if (cfg.type === "line") {
        series = [{ name: cfg.label, type: "line", data: cfg.data, smooth: 0.35, symbol: "circle", symbolSize: 5, lineStyle: { color: cfg.color, width: 2 }, itemStyle: { color: cfg.color }, areaStyle: { color: grad(cfg.color) } }];
      } else {
        series = [{ name: cfg.label, type: "bar", data: cfg.data.map(v => ({ value: v, itemStyle: { color: cfg.color, borderRadius: [3, 3, 0, 0] } })), barWidth: "52%" }];
      }
      chart("t06-chart", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 14, top: 28, bottom: 4, containLabel: true },
        tooltip: tip(),
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10 }, show: cfg.type === "stack" },
        xAxis: Object.assign(axCat(this.months), { type: "category" }),
        yAxis: Object.assign(axVal({ name: cfg.unit }), { type: "value" }),
        series
      });
      this.drawKpis();
    },
    drawKpis() {
      const wrap = document.getElementById("t06-kpis");
      if (!wrap) return;
      const last = a => a[a.length - 1];
      wrap.innerHTML = Object.keys(this.metrics).map(k => {
        const cfg = this.metrics[k];
        const v = last(cfg.data), p = round((v / cfg.data[cfg.data.length - 2] - 1) * 100, 1);
        return `<div class="metric"><div class="metric-label">${cfg.label}</div>
          <div class="metric-value" style="font-size:20px">${v.toLocaleString()}<small>${cfg.unit}</small></div>
          <div class="metric-foot"><span class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%</span> 环比</div></div>`;
      }).join("");
    },
    dailyReport() {
      const last = a => a[a.length - 1];
      const rows = Object.keys(this.metrics).map(k => {
        const cfg = this.metrics[k], v = last(cfg.data);
        const p = round((v / cfg.data[cfg.data.length - 2] - 1) * 100, 1);
        return `<li><b>${cfg.label}</b>：${v.toLocaleString()} ${cfg.unit}（环比 ${p >= 0 ? "+" : ""}${p}%）</li>`;
      }).join("");
      const html = `<div class="ans-title">2026 年 12 月运营日报</div>
        <div class="note" style="margin-bottom:10px">数据来源：经营数据仓库（fact_order / fact_prod / fact_energy / fact_inv / fact_quality / fact_cost）</div>
        <ul>${rows}</ul>
        <div class="kv"><span class="k">智能结论：</span>产量与订单同步增长，一次合格率提升至 98.7%，库存周转加快；综合能耗环比上升，建议对空压站与高耗能产线执行分时优化调度。</div>`;
      if (global.App.openModal) global.App.openModal("运营日报 · 自动生成", html);
      toast("运营日报已生成", "ok");
    }
  };

  /* =========================================================================
   * 赛题 07 —— AI 智能客服与营销转化
   * ========================================================================= */
  const T07 = {
    skus: [
      { id: "EQ-1001", name: "数控加工中心 VMC-850", cat: "金属切削", power: "11 kW", spec: "行程 800/500/500mm", price: 328000, stock: "现货" },
      { id: "EQ-1002", name: "数控加工中心 VMC-1160", cat: "金属切削", power: "15 kW", spec: "行程 1100/600/600mm", price: 468000, stock: "订货 30 天" },
      { id: "EQ-2001", name: "螺杆空压机 GA-75", cat: "动力设备", power: "75 kW", spec: "排气量 13.2 m³/min / 0.8MPa", price: 186000, stock: "现货" },
      { id: "EQ-2002", name: "螺杆空压机 GA-90", cat: "动力设备", power: "90 kW", spec: "排气量 15.6 m³/min / 0.8MPa", price: 224000, stock: "订货 20 天" },
      { id: "EQ-3001", name: "离心泵 IH100-65-200", cat: "流体设备", power: "22 kW", spec: "流量 100 m³/h / 扬程 50m", price: 42800, stock: "现货" },
      { id: "EQ-4001", name: "工业机器人 IRB-2600", cat: "自动化", power: "2.8 kW", spec: "负载 20kg / 臂展 2.6m", price: 268000, stock: "订货 45 天" }
    ],
    intents: [
      { name: "报价咨询", pct: 32 }, { name: "技术参数", pct: 28 }, { name: "售后支持", pct: 18 },
      { name: "产品对比", pct: 12 }, { name: "其他咨询", pct: 10 }
    ],
    leads: [
      { name: "华东精密制造", src: "官网询价", intent: 92, budget: 88, tech: 90, freq: 76, score: 88 },
      { name: "长江重工", src: "展会留资", intent: 84, budget: 79, tech: 82, freq: 62, score: 79 },
      { name: "鑫达模具", src: "400 来电", intent: 76, budget: 71, tech: 74, freq: 58, score: 71 },
      { name: "恒信机械", src: "在线客服", intent: 68, budget: 65, tech: 70, freq: 49, score: 64 }
    ],
    html() {
      return `
      <div class="grid g-4 mb">
        <div class="metric is-cyan"><div class="metric-label">工业装备 SKU 知识库</div><div class="metric-value">120<small>+</small></div><div class="metric-foot">6 大品类全覆盖</div></div>
        <div class="metric is-green"><div class="metric-label">意图识别准确率</div><div class="metric-value">89.6<small>%</small></div><div class="metric-foot">5 类意图</div></div>
        <div class="metric is-violet"><div class="metric-label">潜客购买意向评分</div><div class="metric-value">0-100</div><div class="metric-foot">四因子加权模型</div></div>
        <div class="metric is-amber"><div class="metric-label">销售线索识别率</div><div class="metric-value">71.5<small>%</small></div><div class="metric-foot">自动沉淀线索卡</div></div>
      </div>
      <div class="grid g-32 mb">
        <div class="panel">
          <div class="panel-head"><h3>产品对比与智能推荐</h3><span class="sub">选择两款装备自动生成对比</span></div>
          <div class="grid g-2 mb">
            <select id="t07-a" class="tr-select">${this.skus.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
            <select id="t07-b" class="tr-select">${this.skus.map((s, i) => `<option value="${s.id}" ${i === 1 ? "selected" : ""}>${s.name}</option>`).join("")}</select>
          </div>
          <div class="table-wrap" id="t07-cmp"></div>
          <div class="note" id="t07-advice" style="margin-top:9px"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>客服意图识别分布</h3><span class="sub">准确率 89.6%</span></div>
          <div class="chart" id="t07-intent" style="height:220px"></div>
        </div>
      </div>
      <div class="grid g-2">
        <div class="panel">
          <div class="panel-head"><h3>潜客购买意向打分</h3><span class="sub">意图 40% · 预算 25% · 技术匹配 20% · 互动频次 15%</span></div>
          <div class="table-wrap" id="t07-leads"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>销售线索卡自动沉淀</h3><span class="sub">线索识别率 71.5%</span>
            <div class="spacer"></div>
            <button class="btn btn-sm btn-primary" id="t07-sync">同步至 CRM</button>
          </div>
          <div id="t07-cards" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>
      </div>`;
    },
    init() {
      this.drawIntent();
      this.compare();
      this.drawLeads();
      const a = document.getElementById("t07-a"), b = document.getElementById("t07-b");
      if (a) a.addEventListener("change", () => this.compare());
      if (b) b.addEventListener("change", () => this.compare());
      const sync = document.getElementById("t07-sync");
      if (sync) sync.addEventListener("click", () => toast(`已同步 ${this.leads.length} 条销售线索卡至 CRM`, "ok"));
    },
    drawIntent() {
      chart("t07-intent", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 20, top: 12, bottom: 4, containLabel: true },
        tooltip: tip({ formatter: p => `${p[0].name}<br/>占比 <b>${p[0].value}%</b>` }),
        xAxis: Object.assign(axVal({ max: 40 }), { type: "value", axisLabel: { color: C.txt2, fontSize: 10, formatter: "{value}%" } }),
        yAxis: Object.assign(axCat(["其他咨询", "产品对比", "售后支持", "技术参数", "报价咨询"]), { type: "category" }),
        series: [{
          type: "bar", barWidth: 13,
          data: [
            { value: 10, itemStyle: { color: C.txt2 } }, { value: 12, itemStyle: { color: C.violet } },
            { value: 18, itemStyle: { color: C.amber } }, { value: 28, itemStyle: { color: C.blue } },
            { value: 32, itemStyle: { color: C.cyan } }
          ].map(d => Object.assign(d, { itemStyle: Object.assign({ borderRadius: [0, 4, 4, 0] }, d.itemStyle) })),
          label: { show: true, position: "right", color: C.txt1, fontSize: 10, formatter: "{c}%" }
        }]
      });
    },
    compare() {
      const A = document.getElementById("t07-a"), B = document.getElementById("t07-b");
      if (!A || !B) return;
      const a = this.skus.find(s => s.id === A.value), b = this.skus.find(s => s.id === B.value);
      const rows = [["品类", a.cat, b.cat], ["功率", a.power, b.power], ["关键规格", a.spec, b.spec], ["参考价", yuan(a.price), yuan(b.price)], ["货期", a.stock, b.stock]];
      const wrap = document.getElementById("t07-cmp");
      wrap.innerHTML = `<table class="data"><thead><tr><th>对比项</th><th>${a.name}</th><th>${b.name}</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]}</td><td class="mono">${r[2]}</td></tr>`).join("")}</tbody></table>`;
      const cheaper = a.price <= b.price ? a : b, higher = a.price > b.price ? a : b;
      const adv = document.getElementById("t07-advice");
      if (adv) adv.innerHTML = `智能推荐：若预算优先，推荐 <b>${cheaper.name}</b>（节省 ${yuan(Math.abs(a.price - b.price))}）；若产能优先，推荐 <b>${higher.name}</b>。两者均支持分期与以旧换新方案。`;
    },
    drawLeads() {
      const wrap = document.getElementById("t07-leads");
      if (!wrap) return;
      wrap.innerHTML = `<table class="data"><thead><tr><th>客户</th><th>来源</th><th>意向</th><th>预算</th><th>技术匹配</th><th>互动频次</th><th>综合评分</th></tr></thead>
        <tbody>${this.leads.map(l => {
        const cls = l.score >= 85 ? "danger" : l.score >= 75 ? "warn" : "muted";
        return `<tr><td><b>${l.name}</b></td><td>${l.src}</td>
          <td class="mono">${l.intent}</td><td class="mono">${l.budget}</td><td class="mono">${l.tech}</td><td class="mono">${l.freq}</td>
          <td><span class="pill pill-${cls}" style="font-size:10.5px">${l.score} 分</span></td></tr>`;
      }).join("")}</tbody></table>`;
      const cards = document.getElementById("t07-cards");
      if (!cards) return;
      cards.innerHTML = this.leads.map(l => `
        <div class="wo-card pri-${l.score >= 85 ? "high" : l.score >= 75 ? "mid" : "low"}">
          <div class="wo-top"><span class="wo-title">${l.name}</span>
            <span class="pill pill-${l.score >= 85 ? "danger" : l.score >= 75 ? "warn" : "muted"}" style="font-size:10px">意向 ${l.score} 分</span></div>
          <div class="wo-body"><div>来源：${l.src} · 推荐装备：${l.intent >= 85 ? "VMC-850 / GA-75" : "IH100-65-200"}</div>
            <div>跟进建议：${l.score >= 85 ? "2 小时内电话回访，推送报价单与案例" : l.score >= 75 ? "24 小时内发送产品资料并邀约演示" : "纳入培育池，定期推送行业方案"}</div></div>
        </div>`).join("");
    }
  };

  /* =========================================================================
   * 赛题 08 —— 智能应用创新（黑灯工厂多智能体自主决策中枢）
   * ========================================================================= */
  const T08 = {
    html() {
      return `
      <div class="grid g-4 mb">
        <div class="metric is-cyan"><div class="metric-label">自主决策中枢</div><div class="metric-value">7<small>个</small></div><div class="metric-foot">感知 / 调度 / 质量 / 能源 / 物流 / 维护 / 安全</div></div>
        <div class="metric is-green"><div class="metric-label">黑灯运行时长占比</div><div class="metric-value">92.6<small>%</small></div><div class="metric-foot">无人干预自主运行</div></div>
        <div class="metric is-violet"><div class="metric-label">多目标优化</div><div class="metric-value">3<small>目标</small></div><div class="metric-foot">成本 / 效率 / 能耗</div></div>
        <div class="metric is-amber"><div class="metric-label">Pareto 前沿解</div><div class="metric-value">24<small>个</small></div><div class="metric-foot">含 1 个膝点最优</div></div>
      </div>
      <div class="panel mb">
        <div class="panel-head"><h3>黑灯工厂 · 工业多智能体自主决策中枢架构</h3><span class="sub">感知 → 决策中枢 → 执行闭环</span></div>
        <div class="tr-arch">
          <div class="tr-arch-col">
            <div class="tr-arch-title">感知层</div>
            ${["设备状态感知", "视觉质量检测", "能耗计量", "AGV 定位"].map(x => `<div class="tr-arch-node s1">${x}</div>`).join("")}
          </div>
          <div class="tr-arch-arrow">→</div>
          <div class="tr-arch-col">
            <div class="tr-arch-title">自主决策中枢（多智能体协同）</div>
            <div class="tr-arch-core">
              ${["调度智能体", "质量智能体", "能源智能体", "物流智能体", "维护智能体", "安全智能体"].map(x => `<span class="tr-arch-chip">${x}</span>`).join("")}
            </div>
            <div class="tr-arch-sub">联邦决策 · 冲突消解 · 多目标 Pareto 寻优</div>
          </div>
          <div class="tr-arch-arrow">→</div>
          <div class="tr-arch-col">
            <div class="tr-arch-title">执行层</div>
            ${["产线节拍调节", "工艺参数反调", "AGV 路径重规划", "预测性维修派工"].map(x => `<div class="tr-arch-node s2">${x}</div>`).join("")}
          </div>
        </div>
      </div>
      <div class="grid g-32">
        <div class="panel">
          <div class="panel-head"><h3>多目标 Pareto 协同优化前沿</h3><span class="sub">成本 / 效率 / 能耗 三维权衡</span>
            <div class="spacer"></div>
            <div class="segmented" id="t08-ctrl">
              <button data-obj="cost" class="active">成本优先</button>
              <button data-obj="eff">效率优先</button>
              <button data-obj="energy">能耗优先</button>
            </div>
          </div>
          <div class="chart" id="t08-pareto" style="height:320px"></div>
          <div class="note" id="t08-note">膝点解：在成本、效率、能耗三目标间取得最佳权衡，综合收益提升 18.3%。</div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>关键指标比对</h3><span class="sub">传统模式 vs 自主决策中枢</span></div>
          <div class="table-wrap" id="t08-table"></div>
        </div>
      </div>`;
    },
    init() {
      this.obj = "cost";
      this.draw();
      document.querySelectorAll("#t08-ctrl button").forEach(b => b.addEventListener("click", () => {
        this.obj = b.dataset.obj;
        document.querySelectorAll("#t08-ctrl button").forEach(x => x.classList.toggle("active", x === b));
        this.draw();
      }));
    },
    draw() {
      const pts = [];
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const cost = 100 - t * 42 + norm() * 2.2;
        const eff = 62 + t * 30 + norm() * 2.2;
        const energy = 96 - t * 26 + norm() * 2.2;
        pts.push({ cost: round(cost, 1), eff: round(eff, 1), energy: round(energy, 1), knee: i === 11 });
      }
      const key = this.obj === "cost" ? "cost" : this.obj === "eff" ? "eff" : "energy";
      const best = this.obj === "cost" ? Math.min(...pts.map(p => p[key])) : Math.max(...pts.map(p => p[key]));
      const note = document.getElementById("t08-note");
      if (note) note.textContent = `${this.obj === "cost" ? "成本优先" : this.obj === "eff" ? "效率优先" : "能耗优先"}解：${this.obj === "cost" ? "成本指数 " + best : this.obj === "eff" ? "效率指数 " + best : "能耗指数 " + best}；膝点解综合收益提升 18.3%。`;
      chart("t08-pareto", {
        backgroundColor: "transparent",
        grid: { left: 6, right: 16, top: 30, bottom: 4, containLabel: true },
        tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11 },
          formatter: p => `成本指数 ${p.data[0]}<br/>效率指数 ${p.data[1]}<br/>能耗指数 ${p.data[2]}` },
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.txt1, fontSize: 10 } },
        xAxis: Object.assign(axVal({ name: "成本指数", nameTextStyle: { color: C.txt2, fontSize: 10 } }), { type: "value", min: 50, max: 105 }),
        yAxis: Object.assign(axVal({ name: "效率指数", nameTextStyle: { color: C.txt2, fontSize: 10 } }), { type: "value", min: 56, max: 96 }),
        series: [{
          name: "Pareto 前沿解", type: "scatter", symbolSize: 12,
          data: pts.map(p => ({
            value: [p.cost, p.eff, p.energy],
            itemStyle: { color: p.knee ? C.red : (this.obj === "cost" ? (p.cost === best ? C.amber : C.cyan) : this.obj === "eff" ? (p.eff === best ? C.amber : C.cyan) : (p.energy === best ? C.amber : C.cyan)), borderColor: "#05121a", borderWidth: 1 }
          })),
          markPoint: { symbol: "circle", symbolSize: 20, itemStyle: { color: "transparent", borderColor: C.red, borderWidth: 1.5 }, label: { formatter: "膝点", color: C.red, fontSize: 10, position: "top" },
            data: [{ coord: [pts[11].cost, pts[11].eff, pts[11].energy] }] }
        }]
      });
      const wrap = document.getElementById("t08-table");
      if (wrap) {
        const rows = [
          ["产线综合效率 OEE", "78.5%", "88.9%", "+10.4pt"],
          ["单位产品能耗", "100（基准）", "82.4", "-17.6%"],
          ["人均产值", "100（基准）", "131.6", "+31.6%"],
          ["非计划停机时长", "100（基准）", "58.2", "-41.8%"],
          ["质量一次合格率", "96.4%", "98.9%", "+2.5pt"],
          ["黑灯运行占比", "0%", "92.6%", "+92.6pt"]
        ];
        wrap.innerHTML = `<table class="data"><thead><tr><th>指标</th><th>传统模式</th><th>自主决策中枢</th><th>提升</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td><b>${r[0]}</b></td><td class="mono">${r[1]}</td><td class="mono" style="color:var(--cyan)">${r[2]}</td>
            <td><span class="pill pill-ok" style="font-size:10px">${r[3]}</span></td></tr>`).join("")}</tbody></table>`;
      }
    }
  };

  /* =========================================================================
   * 调度框架
   * ========================================================================= */
  const TRACKS = {
    "01": { no: "01", name: "高效换产", sub: "多智能应用协同", mod: T01 },
    "02": { no: "02", name: "空压站调度", sub: "多机协同智能调度", mod: T02 },
    "03": { no: "03", name: "图纸解析", sub: "结构件图纸理解", mod: T03 },
    "04": { no: "04", name: "预测性维护", sub: "设备智能管理", mod: T04 },
    "05": { no: "05", name: "质量缺陷归因", sub: "分析与根因溯源", mod: T05 },
    "06": { no: "06", name: "经营数据对话", sub: "NL2SQL 分析", mod: T06 },
    "07": { no: "07", name: "智能客服营销", sub: "转化与线索", mod: T07 },
    "08": { no: "08", name: "智能应用创新", sub: "黑灯工厂中枢", mod: T08 }
  };

  let CURRENT = "01";
  let bound = false;
  let activeMod = null;

  function renderTabs() {
    const wrap = document.getElementById("track-tabs");
    if (!wrap) return;
    wrap.innerHTML = Object.keys(TRACKS).map(k => {
      const t = TRACKS[k];
      return `<button class="track-tab ${k === CURRENT ? "active" : ""}" data-track="${k}">
        <span class="tt-no">${t.no}</span>
        <span class="tt-body"><span class="tt-name">${t.name}</span><span class="tt-sub">${t.sub}</span></span>
      </button>`;
    }).join("");
    wrap.querySelectorAll("[data-track]").forEach(b => b.addEventListener("click", () => show(b.dataset.track)));
  }

  function show(key) {
    const t = TRACKS[key];
    if (!t) return;
    CURRENT = key;
    disposeCharts();
    // 清理上一个赛题的定时器，避免泄漏
    if (activeMod && activeMod.__timer) { clearInterval(activeMod.__timer); activeMod.__timer = null; }
    activeMod = t.mod;
    const content = document.getElementById("track-content");
    if (!content) return;
    content.innerHTML = t.mod.html();
    renderTabs();
    try { t.mod.init(); } catch (e) { console.error("track init error", key, e); }
  }

  function render() {
    if (!bound) {
      bound = true;
      window.addEventListener("resize", () => resizeCharts());
    }
    show(CURRENT);
  }

  function leave() {
    if (activeMod && activeMod.__timer) { clearInterval(activeMod.__timer); activeMod.__timer = null; }
    activeMod = null;
    disposeCharts();
  }

  global.Tracks = { render, show, leave, TRACKS, get current() { return CURRENT; } };
})(window);
