/* 换产协同智能体 ChangeoverOps —— 多智能体协同柔性换产 */
(function () {
  "use strict";
  const { chart, toast, modal, fmt, theme } = AgentUI;
  const { C, axCat, axVal, tip, grad, hexA } = theme;

  const AGENTS = [
    { name: "调度智能体", code: "SCHED", role: "排程与冲突消解", load: 92, status: "协同中" },
    { name: "设备智能体", code: "EQUIP", role: "参数下发与联调", load: 88, status: "协同中" },
    { name: "物料智能体", code: "MATL", role: "物料齐套与 JIT 配送", load: 76, status: "协同中" },
    { name: "工装智能体", code: "TOOL", role: "工装换装与校准", load: 64, status: "等待" },
    { name: "质量智能体", code: "QUAL", role: "首件校验与 SPC", load: 81, status: "协同中" },
    { name: "人员智能体", code: "HR", role: "人员到位与派工", load: 70, status: "在线" }
  ];
  const PLANS = {
    base: { total: 16.2, oee: 82.4, tasks: [
      { res: "调度智能体", start: 0, dur: 3.0, c: C.cyan, label: "排程决策" },
      { res: "设备智能体", start: 2.0, dur: 5.2, c: C.blue, label: "参数下发" },
      { res: "物料智能体", start: 1.5, dur: 6.5, c: C.violet, label: "物料齐套" },
      { res: "工装智能体", start: 5.0, dur: 6.8, c: C.amber, label: "工装换装" },
      { res: "质量智能体", start: 9.0, dur: 4.4, c: C.green, label: "首件校验" },
      { res: "人员智能体", start: 11.0, dur: 5.2, c: C.pink, label: "人员到位" }
    ] },
    delayed: { total: 18.6, oee: 79.1, tasks: [
      { res: "调度智能体", start: 0, dur: 3.0, c: C.cyan, label: "排程决策" },
      { res: "设备智能体", start: 2.0, dur: 5.2, c: C.blue, label: "参数下发" },
      { res: "物料智能体", start: 3.9, dur: 6.5, c: C.violet, label: "物料齐套 · AGV延误" },
      { res: "工装智能体", start: 7.4, dur: 6.8, c: C.amber, label: "工装换装" },
      { res: "质量智能体", start: 11.4, dur: 4.4, c: C.green, label: "首件校验" },
      { res: "人员智能体", start: 13.4, dur: 5.2, c: C.pink, label: "人员到位" }
    ] },
    optimized: { total: 15.4, oee: 84.6, tasks: [
      { res: "调度智能体", start: 0, dur: 2.6, c: C.cyan, label: "排程决策" },
      { res: "设备智能体", start: 1.8, dur: 4.6, c: C.blue, label: "参数下发" },
      { res: "物料智能体", start: 1.6, dur: 6.0, c: C.violet, label: "物料齐套" },
      { res: "工装智能体", start: 4.4, dur: 6.2, c: C.amber, label: "工装换装" },
      { res: "质量智能体", start: 8.0, dur: 4.2, c: C.green, label: "首件校验" },
      { res: "人员智能体", start: 10.2, dur: 5.2, c: C.pink, label: "人员到位" }
    ] }
  };
  const MESSAGES = [
    { t: "调度智能体", m: "接收工单 WO-7721，目标机型 VMC-1160，锁定 A3 产线", k: "info" },
    { t: "设备智能体", m: "下发主轴转速 8200rpm / 进给 1200mm/min，已完成参数校验", k: "ok" },
    { t: "物料智能体", m: "齐套率 100%，JIT 配送单已下发给 AGV-07", k: "ok" },
    { t: "工装智能体", m: "夹具 C-1160 换装中，扭矩校准偏差 0.4%", k: "info" },
    { t: "质量智能体", m: "首件三坐标检测通过，CPK=1.42", k: "ok" },
    { t: "人员智能体", m: "操作员张伟已到位，权限与工艺卡已下发", k: "ok" }
  ];
  const state = { plan: "base" };

  function kpi(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
  function setPlan(p) {
    state.plan = p;
    const P = PLANS[p];
    kpi("kpi-time", P.total.toFixed(1));
    kpi("kpi-oee", P.oee.toFixed(1));
    kpi("kpi-gain", (p === "optimized" ? "5.9" : p === "delayed" ? "3.1" : "4.9"));
    drawGantt();
    const note = document.getElementById("gantt-note");
    if (note) note.textContent = p === "delayed"
      ? "AGV 物料配送延误 2.4 分钟，联动工装、质量、人员顺延，换产升至 18.6 分钟。"
      : p === "optimized"
        ? "调度智能体触发冲突消解与并行重排：工装与物料并行、质量并行介入，回落至 15.4 分钟。"
        : "六智能体并行协同，换产耗时由传统串行排产的 30 分钟压缩至 16.2 分钟。";
  }
  function drawGantt() {
    const P = PLANS[state.plan], tasks = P.tasks;
    chart("c-gantt", {
      backgroundColor: "transparent",
      grid: { left: 8, right: 26, top: 30, bottom: 6, containLabel: true },
      tooltip: tip({ formatter: pr => { const t = tasks[tasks.length - 1 - pr[0].dataIndex]; return `${t.res}<br/>${t.label}<br/>开始 ${t.start}m · 耗时 ${t.dur}m · 结束 ${fmt.round(t.start + t.dur, 1)}m`; } }),
      xAxis: axVal({ type: "value", min: 0, max: 22, name: "分钟", nameTextStyle: { color: C.txt2, fontSize: 10 } }),
      yAxis: axCat(tasks.map(t => t.res).reverse(), { type: "category" }),
      series: [
        { type: "bar", stack: "g", silent: true, itemStyle: { color: "transparent" }, data: tasks.map(t => t.start).reverse() },
        { type: "bar", stack: "g", barWidth: 15,
          data: tasks.map(t => ({ value: t.dur, itemStyle: { color: t.c, borderRadius: [0, 4, 4, 0] } })).reverse(),
          label: { show: true, position: "inside", color: "#05121a", fontSize: 10, fontWeight: 600, formatter: pr => tasks.slice().reverse()[pr.dataIndex].label },
          markLine: { silent: true, symbol: "none", lineStyle: { color: C.amber, type: "dashed" },
            label: { formatter: "换产 " + P.total + "m", color: C.amber, fontSize: 9.5, position: "insideEndTop" }, data: [{ xAxis: P.total }] } }
      ]
    });
  }

  const views = [
    {
      key: "overview", label: "换产总览",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 17l5-9 4 6 3-4 3 7"/></svg>`,
      html() {
        return `
        <div class="grid g-4 mb">
          <div class="metric is-green"><div class="metric-label">换产时间</div><div class="metric-value"><span id="ov-time">16.2</span><small>分钟</small></div><div class="metric-foot">较改造前下降 46%</div></div>
          <div class="metric is-cyan"><div class="metric-label">OEE 设备综合效率</div><div class="metric-value"><span id="ov-oee">82.4</span><small>%</small></div><div class="metric-foot">较改造前提升 14.2 个百分点</div></div>
          <div class="metric is-violet"><div class="metric-label">智能体协同响应</div><div class="metric-value">1.8<small>s</small></div><div class="metric-foot">6 智能体实时协同</div></div>
          <div class="metric is-amber"><div class="metric-label">单次换产收益</div><div class="metric-value">¥4.9<small>万</small></div><div class="metric-foot">按单线年 1200 次换产测算</div></div>
        </div>
        <div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>换产节拍趋势</h3><span class="sub">近 12 次换产耗时（分钟）</span></div><div class="chart chart-lg" id="ov-trend"></div></div>
          <div class="panel"><div class="panel-head"><h3>当前换产任务</h3><span class="sub">实时状态</span></div>
            <table class="data"><tbody>
              <tr><td>工单号</td><td class="mono">WO-7721</td></tr>
              <tr><td>目标机型</td><td class="mono">VMC-1160 立式加工中心</td></tr>
              <tr><td>产线</td><td class="mono">A3 柔性产线</td></tr>
              <tr><td>当前环节</td><td><span class="pill pill-warn">工装换装</span></td></tr>
              <tr><td>预计完成</td><td class="mono">16.2 分钟后</td></tr>
              <tr><td>齐套率</td><td><span class="pill pill-ok">100%</span></td></tr>
            </tbody></table>
          </div>
        </div>`;
      },
      init() {
        const hist = [27.5, 25.8, 24.1, 22.6, 20.9, 19.4, 18.2, 17.5, 16.9, 16.4, 16.2, 16.2];
        chart("ov-trend", {
          backgroundColor: "transparent", grid: { left: 6, right: 16, top: 20, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `第 ${Number(p[0].axisValue) + 1} 次换产：<b>${p[0].value}</b> 分钟` }),
          xAxis: axCat(hist.map((_, i) => "第" + (i + 1) + "次")), yAxis: axVal({ name: "分钟" }),
          series: [{ name: "换产耗时", type: "line", data: hist, smooth: 0.35, symbol: "circle", symbolSize: 5, lineStyle: { color: C.cyan, width: 2 }, itemStyle: { color: C.cyan }, areaStyle: { color: grad(C.cyan) },
            markLine: { silent: true, symbol: "none", lineStyle: { color: C.green, type: "dashed" }, label: { formatter: "目标 16m", color: C.green, fontSize: 9 }, data: [{ yAxis: 16 }] } }]
        });
      }
    },
    {
      key: "agents", label: "智能体协同",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
      html() {
        return `<div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>智能体协同矩阵</h3><span class="sub">实时状态与协同负荷</span></div>
            <div class="grid g-2" style="gap:10px">${AGENTS.map(a => `<div class="tr-agent">
              <div class="tr-agent-top"><span class="tr-agent-code">${a.code}</span>
                <span class="pill pill-${a.status === "协同中" ? "ok" : a.status === "等待" ? "warn" : "info"}" style="font-size:10px"><span class="dot"></span>${a.status}</span></div>
              <div class="tr-agent-name">${a.name}</div><div class="tr-agent-role">${a.role}</div>
              <div class="bar-track" style="width:100%;margin-top:8px"><div class="bar-fill ok" style="width:${a.load}%"></div></div>
              <div class="tr-agent-load">协同负荷 ${a.load}%</div></div>`).join("")}</div>
          </div>
          <div class="panel"><div class="panel-head"><h3>协同消息流</h3><span class="sub">智能体间实时交互</span></div>
            <div class="timeline">${MESSAGES.map(m => `<div class="tl-item ${m.k === "warn" ? "warn" : ""}"><div class="tl-time">${m.t}</div><div class="tl-text">${m.m}</div></div>`).join("")}</div>
          </div>
        </div>
        <div class="panel mt"><div class="panel-head"><h3>协同负荷对比</h3><span class="sub">各智能体当前负载率</span></div><div class="chart" id="c-load" style="height:220px"></div></div>`;
      },
      init() {
        chart("c-load", {
          backgroundColor: "transparent", grid: { left: 6, right: 20, top: 16, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>负荷率 <b>${p[0].value}%</b>` }),
          xAxis: axCat(AGENTS.map(a => a.code)), yAxis: axVal({ min: 0, max: 100, name: "%" }),
          series: [{ type: "bar", barWidth: 26, data: AGENTS.map(a => ({ value: a.load, itemStyle: { color: a.load >= 85 ? C.amber : C.cyan, borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: "top", color: C.txt1, fontSize: 10, formatter: "{c}%" } }]
        });
      }
    },
    {
      key: "gantt", label: "排程甘特",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 6h10M3 12h16M3 18h7"/></svg>`,
      html() {
        return `<div class="panel">
          <div class="panel-head"><h3>换产甘特图 · 六智能体协同排程</h3>
            <div class="spacer"></div>
            <div class="segmented" id="seg-plan">
              <button data-plan="base" class="active">基准协同</button>
              <button data-plan="delayed">模拟 AGV 延误</button>
              <button data-plan="optimized">延误重排程</button>
            </div></div>
          <div class="chart" id="c-gantt" style="height:320px"></div>
          <div class="note" id="gantt-note" style="margin-top:8px"></div>
        </div>
        <div class="grid g-3 mt">
          <div class="metric is-cyan"><div class="metric-label">换产时间</div><div class="metric-value"><span id="kpi-time">16.2</span><small>分钟</small></div></div>
          <div class="metric is-green"><div class="metric-label">OEE</div><div class="metric-value"><span id="kpi-oee">82.4</span><small>%</small></div></div>
          <div class="metric is-amber"><div class="metric-label">单次换产收益</div><div class="metric-value">¥<span id="kpi-gain">4.9</span><small>万</small></div></div>
        </div>`;
      },
      init() {
        document.querySelectorAll("#seg-plan button").forEach(b => b.addEventListener("click", () => {
          document.querySelectorAll("#seg-plan button").forEach(x => x.classList.toggle("active", x === b));
          setPlan(b.dataset.plan);
        }));
        setPlan("base");
      },
      refresh() { drawGantt(); }
    },
    {
      key: "reroute", label: "异常重排",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"/></svg>`,
      html() {
        return `<div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>AGV 延误重排模拟</h3><span class="sub">点击触发异常并观察重排效果</span></div>
            <div class="chart" id="c-cmp" style="height:260px"></div>
            <div class="wo-actions mt">
              <button class="btn btn-primary" id="btn-delay">模拟 AGV 延误</button>
              <button class="btn" id="btn-reroute">执行延误重排程</button>
              <button class="btn btn-ghost" id="btn-reset">重置</button>
            </div>
          </div>
          <div class="panel"><div class="panel-head"><h3>重排事件</h3><span class="sub">冲突消解与并行调度</span></div>
            <div class="timeline" id="reroute-log"><div class="tl-item"><div class="tl-time">待触发</div><div class="tl-text">点击左侧按钮模拟异常</div></div></div>
          </div>
        </div>`;
      },
      init() {
        const logs = [];
        const pushLog = (txt, k) => {
          logs.unshift({ t: AgentUI.fmt.clockStr(new Date()), txt, k });
          const el = document.getElementById("reroute-log");
          if (el) el.innerHTML = logs.map(l => `<div class="tl-item ${l.k === "warn" ? "warn" : l.k === "ok" ? "" : "danger"}"><div class="tl-time">${l.t}</div><div class="tl-text">${l.txt}</div></div>`).join("");
        };
        const drawCmp = (delayed) => {
          chart("c-cmp", {
            backgroundColor: "transparent", grid: { left: 6, right: 20, top: 26, bottom: 4, containLabel: true },
            tooltip: tip(), legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10 } },
            xAxis: axCat(["调度", "设备", "物料", "工装", "质量", "人员"]), yAxis: axVal({ name: "结束时刻 (m)" }),
            series: [
              { name: "基准", type: "bar", data: [3.0, 7.2, 8.0, 11.8, 13.4, 16.2], itemStyle: { color: hexA(C.cyan, 0.55) } },
              { name: delayed ? "延误后" : "重排后", type: "bar", data: delayed ? [3.0, 7.2, 10.4, 14.2, 15.8, 18.6] : [2.6, 6.4, 7.6, 10.6, 12.2, 15.4], itemStyle: { color: delayed ? C.red : C.green } }
            ]
          });
        };
        drawCmp(false);
        document.getElementById("btn-delay").addEventListener("click", () => { drawCmp(true); pushLog("检测到 AGV-07 物料配送延误 2.4 分钟，物料、工装、质量、人员环节顺延", "warn"); toast("warn", "AGV 延误已注入，换产预计延至 18.6 分钟"); });
        document.getElementById("btn-reroute").addEventListener("click", () => { drawCmp(false); pushLog("调度智能体触发冲突消解：工装与物料并行、质量并行介入，换产回落至 15.4 分钟", "ok"); toast("ok", "重排完成，换产 15.4 分钟（优于基准）"); });
        document.getElementById("btn-reset").addEventListener("click", () => { drawCmp(false); logs.length = 0; document.getElementById("reroute-log").innerHTML = `<div class="tl-item"><div class="tl-time">已重置</div><div class="tl-text">等待下一次异常触发</div></div>`; toast("info", "已重置"); });
      }
    }
  ];

  AgentUI.boot({
    cn: "换产协同智能体", code: "ChangeoverOps", tagline: "多智能体协同柔性换产",
    kpis: [
      { label: "换产时间", value: "16.2m" }, { label: "OEE", value: "82.4%" },
      { label: "协同响应", value: "1.8s" }, { label: "单次收益", value: "¥4.9万" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>智能体 <b>6</b> 个<br/>调度引擎 <b>ConflictSolver</b>`
  });
})();
