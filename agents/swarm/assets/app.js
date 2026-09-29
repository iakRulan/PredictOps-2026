/* 协同决策中枢 SwarmOps —— 多智能体自主决策与多目标寻优 */
(function () {
  "use strict";
  const { chart, toast, theme } = AgentUI;
  const { C, axCat, axVal, tip, grad, hexA } = theme;

  const AGENTS = ["调度智能体", "质量智能体", "能源智能体", "物流智能体", "维护智能体", "安全智能体"];
  const norm = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  let obj = "cost";
  let pareto = [];

  function genPareto() {
    pareto = [];
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      pareto.push({
        cost: +(100 - t * 42 + norm() * 2.2).toFixed(1),
        eff: +(62 + t * 30 + norm() * 2.2).toFixed(1),
        energy: +(96 - t * 26 + norm() * 2.2).toFixed(1),
        knee: i === 11
      });
    }
  }
  function drawPareto(id) {
    const key = obj === "cost" ? "cost" : obj === "eff" ? "eff" : "energy";
    const best = obj === "cost" ? Math.min(...pareto.map(p => p[key])) : Math.max(...pareto.map(p => p[key]));
    chart(id, {
      backgroundColor: "transparent", grid: { left: 6, right: 16, top: 30, bottom: 4, containLabel: true },
      tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11 },
        formatter: p => `成本指数 ${p.data[0]}<br/>效率指数 ${p.data[1]}<br/>能耗指数 ${p.data[2]}` },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.txt1, fontSize: 10 } },
      xAxis: axVal({ name: "成本指数", nameTextStyle: { color: C.txt2, fontSize: 10 }, min: 50, max: 105 }),
      yAxis: axVal({ name: "效率指数", nameTextStyle: { color: C.txt2, fontSize: 10 }, min: 56, max: 96 }),
      series: [{ name: "Pareto 前沿解", type: "scatter", symbolSize: 12,
        data: pareto.map(p => ({ value: [p.cost, p.eff, p.energy],
          itemStyle: { color: p.knee ? C.red : (p[key] === best ? C.amber : C.cyan), borderColor: "#05121a", borderWidth: 1 } })),
        markPoint: { symbol: "circle", symbolSize: 20, itemStyle: { color: "transparent", borderColor: C.red, borderWidth: 1.5 }, label: { formatter: "膝点", color: C.red, fontSize: 10, position: "top" }, data: [{ coord: [pareto[11].cost, pareto[11].eff, pareto[11].energy] }] } }]
    });
  }
  function drawTopology(id) {
    const nodes = [{ name: "决策中枢", symbolSize: 54, itemStyle: { color: C.red } }].concat(
      AGENTS.map((a, i) => ({ name: a, symbolSize: 32, itemStyle: { color: [C.cyan, C.green, C.amber, C.violet, C.blue, C.pink][i] } })))
      .concat(["产线节拍", "工艺反调", "AGV 路径", "维修派工"].map(n => ({ name: n, symbolSize: 24, itemStyle: { color: hexA(C.txt1, 0.8) } })));
    const links = AGENTS.map(a => ({ source: "决策中枢", target: a }))
      .concat([{ source: "调度智能体", target: "产线节拍" }, { source: "质量智能体", target: "工艺反调" }, { source: "物流智能体", target: "AGV 路径" }, { source: "维护智能体", target: "维修派工" }]);
    chart(id, {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11 } },
      series: [{ type: "graph", layout: "force", roam: true, draggable: true, label: { show: true, color: C.txt1, fontSize: 10 },
        force: { repulsion: 420, edgeLength: [60, 130], gravity: 0.08 },
        lineStyle: { color: hexA(C.cyan, 0.35), width: 1.2, curveness: 0.15 },
        emphasis: { focus: "adjacency", lineStyle: { width: 2.4 } }, data: nodes, links }]
    });
  }

  const views = [
    {
      key: "topology", label: "中枢拓扑",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M9.7 10.3L6.5 7.4M14.3 10.3l3.2-2.9M9.7 13.7l-3.2 2.9M14.3 13.7l3.2 2.9"/></svg>`,
      html() {
        return `<div class="grid g-4 mb">
          <div class="metric is-green"><div class="metric-label">综合收益提升</div><div class="metric-value">18.3<small>%</small></div><div class="metric-foot">多目标协同优化</div></div>
          <div class="metric is-cyan"><div class="metric-label">决策耗时</div><div class="metric-value">240<small>ms</small></div><div class="metric-foot">单次全局决策</div></div>
          <div class="metric is-violet"><div class="metric-label">可解释评分</div><div class="metric-value">91.6<small>%</small></div><div class="metric-foot">决策链路可追溯</div></div>
          <div class="metric is-amber"><div class="metric-label">策略迭代周期</div><div class="metric-value">6<small>h</small></div><div class="metric-foot">在线自学习</div></div>
        </div>
        <div class="panel mb"><div class="panel-head"><h3>多智能体自治决策拓扑</h3><span class="sub">感知 → 决策中枢 → 执行（可拖拽 / 缩放）</span></div>
          <div class="chart" id="c-topo" style="height:400px"></div></div>
        <div class="panel"><div class="panel-head"><h3>智能体职责</h3><span class="sub">联邦决策 · 冲突消解</span></div>
          <div class="grid g-3">${AGENTS.map((a, i) => `<div class="tr-agent">
            <div class="tr-agent-top"><span class="tr-agent-code">AGENT-${i + 1}</span><span class="pill pill-ok" style="font-size:10px"><span class="dot"></span>在线</span></div>
            <div class="tr-agent-name">${a}</div>
            <div class="tr-agent-role">${["节拍与排程自治", "质量预测与反调", "能耗优化与调度", "AGV 路径规划", "预测性维修派工", "风险识别与联锁"][i]}</div></div>`).join("")}</div></div>`;
      },
      init() { drawTopology("c-topo"); }
    },
    {
      key: "optimize", label: "多目标寻优",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 20L20 4M4 12a8 8 0 008 8"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>多目标 Pareto 协同优化前沿</h3><span class="sub">成本 / 效率 / 能耗 三维权衡</span>
            <div class="spacer"></div><div class="segmented" id="obj-seg">
              <button data-obj="cost" class="active">成本优先</button>
              <button data-obj="eff">效率优先</button>
              <button data-obj="energy">能耗优先</button></div></div>
          <div class="chart" id="c-pareto" style="height:360px"></div>
          <div class="note" id="pareto-note" style="margin-top:8px"></div></div>
        <div class="grid g-3">
          <div class="metric is-cyan"><div class="metric-label">前沿解数量</div><div class="metric-value">24<small>个</small></div></div>
          <div class="metric is-amber"><div class="metric-label">膝点解</div><div class="metric-value" style="font-size:18px">三分平衡</div><div class="metric-foot">综合收益最优</div></div>
          <div class="metric is-green"><div class="metric-label">寻优耗时</div><div class="metric-value">1.9<small>s</small></div></div>
        </div>`;
      },
      init() {
        genPareto(); drawPareto("c-pareto"); note();
        document.getElementById("obj-seg").addEventListener("click", e => {
          const b = e.target.closest("[data-obj]"); if (!b) return;
          obj = b.dataset.obj;
          document.querySelectorAll("#obj-seg button").forEach(x => x.classList.toggle("active", x === b));
          drawPareto("c-pareto"); note();
        });
      }
    },
    {
      key: "explain", label: "可解释决策",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 013.6 10.8c-.7.5-1.1 1.2-1.2 2.2H9.6c-.1-1-.5-1.7-1.2-2.2A6 6 0 0112 3z"/></svg>`,
      html() {
        return `<div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>决策因果推理链</h3><span class="sub">可解释评分 91.6%</span></div>
            <div class="timeline">${[
              ["感知输入", "A3 产线节拍偏差 +8.2%，能耗环比 +6.4%，来料硬度波动 σ=4.1"],
              ["目标解析", "识别到多目标冲突：提产（效率）↔ 降耗（能耗）↔ 控本（成本）"],
              ["约束评估", "设备负荷上限 92%，AGV 运力余量 18%，电网峰段 14:00-17:00"],
              ["方案生成", "生成 24 个可行解，调度/能源/物流智能体交叉校验"],
              ["冲突消解", "按权重（效率 0.4 / 能耗 0.35 / 成本 0.25）择取膝点解"],
              ["决策输出", "节拍 +5.6%、能耗 -8.1%、综合收益 +18.3%"]
            ].map((s, i) => `<div class="tl-item ${i === 4 ? "warn" : ""}"><div class="tl-time">STEP ${i + 1} · ${s[0]}</div><div class="tl-text">${s[1]}</div></div>`).join("")}</div></div>
          <div class="panel"><div class="panel-head"><h3>目标贡献度</h3><span class="sub">膝点解各目标占比</span></div>
            <div class="chart chart-lg" id="c-contrib"></div></div>
        </div>`;
      },
      init() {
        chart("c-contrib", {
          backgroundColor: "transparent", grid: { left: 6, right: 20, top: 20, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>贡献度 <b>${p[0].value}%</b>` }),
          xAxis: axVal({ max: 50, name: "%" }), yAxis: axCat(["成本", "能耗", "效率"], { type: "category" }),
          series: [{ type: "bar", barWidth: 18, data: [{ value: 25, itemStyle: { color: C.pink, borderRadius: [0, 4, 4, 0] } }, { value: 35, itemStyle: { color: C.amber, borderRadius: [0, 4, 4, 0] } }, { value: 40, itemStyle: { color: C.cyan, borderRadius: [0, 4, 4, 0] } }], label: { show: true, position: "right", color: C.txt1, fontSize: 10, formatter: "{c}%" } }]
        });
      }
    },
    {
      key: "iterate", label: "策略迭代",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>策略在线迭代曲线</h3><span class="sub">综合收益随迭代提升</span>
            <div class="spacer"></div><button class="btn btn-sm btn-primary" id="btn-iter">执行一轮迭代</button></div>
          <div class="chart" id="c-iter" style="height:300px"></div></div>
        <div class="panel"><div class="panel-head"><h3>策略版本</h3><span class="sub">迭代记录</span></div>
          <div class="table-wrap" id="iter-table"></div></div>`;
      },
      init() {
        let ver = 12, gains = [];
        for (let i = 1; i <= ver; i++) gains.push(+(100 + (1 - Math.exp(-i / 4)) * 22 + norm() * 0.6).toFixed(1));
        const draw = () => chart("c-iter", {
          backgroundColor: "transparent", grid: { left: 6, right: 16, top: 16, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `迭代 ${p[0].axisValue}<br/>综合收益指数 <b>${p[0].value}</b>` }),
          xAxis: axCat(gains.map((_, i) => "v" + (i + 1))), yAxis: axVal({ name: "收益指数", min: 95 }),
          series: [{ type: "line", data: gains, smooth: 0.35, symbol: "circle", symbolSize: 5, lineStyle: { color: C.green, width: 2 }, itemStyle: { color: C.green }, areaStyle: { color: grad(C.green) } }]
        });
        const table = () => document.getElementById("iter-table").innerHTML = `<table class="data"><thead><tr><th>版本</th><th>综合收益指数</th><th>数据样本</th><th>状态</th></tr></thead>
          <tbody>${gains.slice(-5).reverse().map((g, i) => `<tr><td class="mono">v${ver - i}</td><td class="mono">${g}</td><td class="mono">${(1200 - i * 60)} 条</td><td><span class="pill pill-${i === 0 ? "info" : "ok"}" style="font-size:10px">${i === 0 ? "当前" : "已归档"}</span></td></tr>`).join("")}</tbody></table>`;
        draw(); table();
        document.getElementById("btn-iter").addEventListener("click", () => {
          ver++; gains.push(+(gains[gains.length - 1] + Math.max(0.1, norm() * 0.9 + 0.3)).toFixed(1));
          draw(); table(); toast("ok", `完成一轮策略迭代，当前 v${ver}`);
        });
      }
    }
  ];

  function note() {
    const el = document.getElementById("pareto-note");
    if (!el) return;
    const label = obj === "cost" ? "成本优先" : obj === "eff" ? "效率优先" : "能耗优先";
    el.textContent = `${label}解已在 Pareto 前沿中以高亮标记；膝点解为三目标综合权衡最优，综合收益提升 18.3%。`;
  }

  AgentUI.boot({
    cn: "协同决策中枢", code: "SwarmOps", tagline: "多智能体自治 · 多目标寻优 · 可解释决策",
    kpis: [
      { label: "综合收益", value: "+18.3%" }, { label: "决策耗时", value: "240ms" },
      { label: "可解释评分", value: "91.6%" }, { label: "迭代周期", value: "6h" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>智能体 <b>6</b> 个<br/>寻优 <b>Pareto</b>`
  });
})();
