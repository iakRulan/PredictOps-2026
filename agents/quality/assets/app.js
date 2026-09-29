/* 质量归因智能体 QualityOps —— 缺陷识别 · 根因溯源 · 工艺纠偏 */
(function () {
  "use strict";
  const { chart, toast, theme } = AgentUI;
  const { C, axCat, axVal, tip, grad, hexA } = theme;

  const DEFECTS = [
    { en: "crazing", cn: "裂纹", acc: 91.2, n: 148 },
    { en: "inclusion", cn: "夹杂", acc: 94.6, n: 132 },
    { en: "patches", cn: "斑块", acc: 96.1, n: 121 },
    { en: "pitted_surface", cn: "麻点", acc: 92.8, n: 140 },
    { en: "rolled-in_scale", cn: "氧化铁皮压入", acc: 95.4, n: 118 },
    { en: "scratches", cn: "划痕", acc: 93.7, n: 163 }
  ];
  let bayesUpd = false;

  function drawDefect(id) {
    chart(id, {
      backgroundColor: "transparent", grid: { left: 6, right: 32, top: 16, bottom: 4, containLabel: true },
      tooltip: tip({ formatter: p => { const d = DEFECTS[p[0].dataIndex]; return `${d.cn}（${d.en}）<br/>识别准确率 <b>${d.acc}%</b> · 样本 ${d.n}`; } }),
      xAxis: axVal({ min: 85, max: 100, name: "%" }), yAxis: axCat(DEFECTS.map(d => d.cn), { type: "category" }),
      series: [{ type: "bar", barWidth: 14, data: DEFECTS.map(d => ({ value: d.acc, itemStyle: { color: d.acc >= 95 ? C.green : d.acc >= 92 ? C.cyan : C.amber, borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", color: C.txt1, fontSize: 10, formatter: "{c}%" },
        markLine: { silent: true, symbol: "none", lineStyle: { color: C.violet, type: "dashed" }, label: { formatter: "平均 93.8%", color: C.violet, fontSize: 9 }, data: [{ xAxis: 93.8 }] } }]
    });
  }
  function drawSankey(id) {
    chart(id, {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11 } },
      series: [{ type: "sankey", left: 4, right: 96, top: 8, bottom: 8, nodeWidth: 10, nodeGap: 9, emphasis: { focus: "adjacency" },
        label: { color: C.txt1, fontSize: 9.5 }, lineStyle: { color: "gradient", opacity: 0.28, curveness: 0.5 },
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
          { source: "机(M)", target: "轧辊表面磨损", value: 38 }, { source: "法(M)", target: "乳化液浓度低", value: 34 },
          { source: "环(E)", target: "环境粉尘超标", value: 6 }, { source: "料(M)", target: "来料硬度波动", value: 23 }
        ] }]
    });
  }
  function bayesData() {
    const priorMu = bayesUpd ? 843.6 : 850, priorSd = 8;
    const postMu = bayesUpd ? 842.8 : 843.1, postSd = bayesUpd ? 2.6 : 3.2;
    const xs = [], prior = [], post = [];
    const g = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
    for (let x = 820; x <= 870; x += 2) { xs.push(String(x)); prior.push(+(g(x, priorMu, priorSd) * 100).toFixed(2)); post.push(+(g(x, postMu, postSd) * 100).toFixed(2)); }
    return { xs, prior, post, postMu };
  }
  function drawBayes(id) {
    const d = bayesData();
    chart(id, {
      backgroundColor: "transparent", grid: { left: 6, right: 12, top: 26, bottom: 4, containLabel: true },
      tooltip: tip(), legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10 } },
      xAxis: axCat(d.xs, { name: "℃", nameTextStyle: { color: C.txt2, fontSize: 9 }, axisLabel: { color: C.txt2, fontSize: 9, interval: 4 } }),
      yAxis: axVal({ name: "概率密度", axisLabel: { show: false } }),
      series: [
        { name: "先验", type: "line", data: d.prior, smooth: 0.35, symbol: "none", lineStyle: { color: C.txt2, width: 1.6, type: "dashed" }, areaStyle: { color: hexA(C.txt2, 0.12) } },
        { name: "后验", type: "line", data: d.post, smooth: 0.35, symbol: "none", lineStyle: { color: C.cyan, width: 2 }, areaStyle: { color: grad(C.cyan) },
          markLine: { silent: true, symbol: "none", lineStyle: { color: C.green, type: "dashed" }, label: { formatter: "目标 " + d.postMu.toFixed(1) + "℃", color: C.green, fontSize: 9 }, data: [{ xAxis: d.xs[Math.round((d.postMu - 820) / 2)] }] } }
      ]
    });
  }
  function paramTable() {
    const rows = [
      { p: "轧制温度", prior: "850 ± 8 ℃", post: "843.1 ± 3.2 ℃", delta: "-6.9 ℃", conf: 91.4 },
      { p: "轧制速度", prior: "12.5 ± 0.8 m/s", post: "11.9 ± 0.3 m/s", delta: "-0.6 m/s", conf: 88.2 },
      { p: "乳化液浓度", prior: "4.2 ± 0.5 %", post: "4.8 ± 0.2 %", delta: "+0.6 %", conf: 93.7 },
      { p: "卷取张力", prior: "18.0 ± 1.2 kN", post: "17.4 ± 0.5 kN", delta: "-0.6 kN", conf: 86.9 }
    ];
    return `<table class="data"><thead><tr><th>工艺参数</th><th>先验分布</th><th>后验分布</th><th>反调量</th><th>置信度</th><th>状态</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><b>${r.p}</b></td><td class="mono">${r.prior}</td><td class="mono" style="color:var(--cyan)">${r.post}</td>
        <td class="mono">${r.delta}</td><td class="mono">${r.conf}%</td><td><span class="pill pill-ok" style="font-size:10px">已下发</span></td></tr>`).join("")}</tbody></table>`;
  }

  const views = [
    {
      key: "detect", label: "缺陷识别",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
      html() {
        return `<div class="grid g-4 mb">
          <div class="metric is-cyan"><div class="metric-label">识别准确率</div><div class="metric-value">93.8<small>%</small></div><div class="metric-foot">6 类热轧带钢表面缺陷</div></div>
          <div class="metric is-green"><div class="metric-label">根因定位率</div><div class="metric-value">86.4<small>%</small></div><div class="metric-foot">人 / 机 / 料 / 法 / 环</div></div>
          <div class="metric is-violet"><div class="metric-label">建议可执行率</div><div class="metric-value">92.1<small>%</small></div><div class="metric-foot">工艺参数可下发</div></div>
          <div class="metric is-amber"><div class="metric-label">综合缺陷率</div><div class="metric-value">0.82<small>%</small></div><div class="metric-foot">较改造前下降 31.5%</div></div>
        </div>
        <div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>多类别缺陷识别</h3><span class="sub">置信度与样本量</span></div><div class="chart chart-lg" id="c-defect"></div></div>
          <div class="panel"><div class="panel-head"><h3>缺陷样本分布</h3><span class="sub">按类别统计</span></div><div class="chart chart-lg" id="c-dist"></div></div>
        </div>`;
      },
      init() {
        drawDefect("c-defect");
        chart("c-dist", {
          backgroundColor: "transparent",
          tooltip: { trigger: "item", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", textStyle: { color: "#e8f0fa", fontSize: 11 }, formatter: "{b}：{c} 张（{d}%）" },
          legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: C.txt1, fontSize: 10 } },
          series: [{ type: "pie", radius: ["50%", "72%"], center: ["50%", "44%"], itemStyle: { borderColor: "#0e141e", borderWidth: 2 },
            label: { show: false }, data: DEFECTS.map((d, i) => ({ value: d.n, name: d.cn, itemStyle: { color: [C.cyan, C.blue, C.violet, C.amber, C.green, C.pink][i] } })) }]
        });
      }
    },
    {
      key: "rootcause", label: "根因溯源",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11l8-4M8 13l8 4"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>4M1E 因果溯源</h3><span class="sub">缺陷 → 要素 → 根因</span></div>
          <div class="chart" id="c-sankey" style="height:340px"></div></div>
        <div class="panel"><div class="panel-head"><h3>关键根因贡献度</h3><span class="sub">定位率 86.4%</span></div>
          <div class="chart" id="c-cause" style="height:220px"></div></div>`;
      },
      init() {
        drawSankey("c-sankey");
        const causes = [
          { n: "轧辊表面磨损", v: 38, s: "机" }, { n: "乳化液浓度低", v: 34, s: "法" },
          { n: "来料硬度波动", v: 23, s: "料" }, { n: "环境粉尘超标", v: 6, s: "环" }
        ];
        chart("c-cause", {
          backgroundColor: "transparent", grid: { left: 6, right: 20, top: 16, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>贡献度 <b>${p[0].value}%</b>` }),
          xAxis: axVal({ max: 45, name: "%" }), yAxis: axCat(causes.map(c => c.n).reverse(), { type: "category" }),
          series: [{ type: "bar", barWidth: 16, data: causes.map(c => ({ value: c.v, itemStyle: { color: c.v >= 30 ? C.red : c.v >= 20 ? C.amber : C.cyan, borderRadius: [0, 4, 4, 0] } })).reverse(), label: { show: true, position: "right", color: C.txt1, fontSize: 10, formatter: "{c}%" } }]
        });
      }
    },
    {
      key: "correct", label: "工艺纠偏",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>贝叶斯工艺参数自纠偏</h3><span class="sub">先验 → 后验在线更新</span>
            <div class="spacer"></div><button class="btn btn-sm" id="btn-upd">采样更新</button></div>
          <div class="chart" id="c-bayes" style="height:280px"></div></div>
        <div class="panel"><div class="panel-head"><h3>工艺参数反调建议</h3><span class="sub">基于后验分布的最优修正</span></div>
          <div class="table-wrap" id="param-table">${paramTable()}</div></div>`;
      },
      init() {
        drawBayes("c-bayes");
        document.getElementById("btn-upd").addEventListener("click", () => {
          bayesUpd = true; drawBayes("c-bayes"); document.getElementById("param-table").innerHTML = paramTable();
          toast("ok", "已融合最新样本，后验分布收窄，工艺参数完成自纠偏");
        });
      }
    },
    {
      key: "verify", label: "闭环验证",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>纠偏闭环效果验证</h3><span class="sub">缺陷率趋势（%）</span></div>
          <div class="chart" id="c-verify" style="height:280px"></div></div>
        <div class="panel"><div class="panel-head"><h3>验证记录</h3><span class="sub">近 5 次纠偏</span></div>
          <div class="table-wrap" id="verify-table"></div></div>`;
      },
      init() {
        const before = [1.62, 1.55, 1.48, 1.51, 1.43, 1.38];
        const after = [1.20, 1.05, 0.96, 0.88, 0.82];
        const labels = ["T-5", "T-4", "T-3", "T-2", "T-1", "纠偏", "T+1", "T+2", "T+3", "T+4", "T+5"];
        chart("c-verify", {
          backgroundColor: "transparent", grid: { left: 6, right: 16, top: 26, bottom: 4, containLabel: true },
          tooltip: tip(), legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10 } },
          xAxis: axCat(labels), yAxis: axVal({ name: "%" }),
          series: [
            { name: "纠偏前", type: "line", data: before.concat([null, null, null, null, null]), smooth: 0.3, symbol: "circle", symbolSize: 5, lineStyle: { color: C.amber, width: 2 }, itemStyle: { color: C.amber } },
            { name: "纠偏后", type: "line", data: [null, null, null, null, null, 1.02].concat(after.slice(0, 5)), smooth: 0.3, symbol: "circle", symbolSize: 5, lineStyle: { color: C.green, width: 2 }, itemStyle: { color: C.green }, areaStyle: { color: grad(C.green) } }
          ]
        });
        document.getElementById("verify-table").innerHTML = `<table class="data"><thead><tr><th>时间</th><th>触发参数</th><th>缺陷率变化</th><th>验证结论</th></tr></thead>
          <tbody>${[["11:40", "轧制温度", "1.38% → 1.02%", "有效"], ["10:12", "乳化液浓度", "1.43% → 1.11%", "有效"], ["08:55", "卷取张力", "1.51% → 1.26%", "有效"], ["07:30", "轧制速度", "1.48% → 1.31%", "部分有效"], ["06:05", "来料分选", "1.55% → 1.42%", "有效"]].map(r => `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td class="mono">${r[2]}</td><td><span class="pill pill-${r[3] === "有效" ? "ok" : "warn"}" style="font-size:10px">${r[3]}</span></td></tr>`).join("")}</tbody></table>`;
      },
      refresh() { }
    }
  ];

  AgentUI.boot({
    cn: "质量归因智能体", code: "QualityOps", tagline: "缺陷识别 · 4M1E 溯源 · 工艺自纠偏",
    kpis: [
      { label: "识别准确率", value: "93.8%" }, { label: "根因定位率", value: "86.4%" },
      { label: "建议可执行率", value: "92.1%" }, { label: "缺陷率", value: "0.82%" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>识别 <b>NEU-DET 6 类</b><br/>溯源 <b>4M1E</b>`
  });
})();
