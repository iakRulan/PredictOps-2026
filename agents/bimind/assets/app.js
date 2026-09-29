/* 经营问数智能体 DataMind BI —— 自然语言问数与经营分析 */
(function () {
  "use strict";
  const { chart, toast, modal, download, theme } = AgentUI;
  const { C, axCat, axVal, tip, grad } = theme;

  const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const METRICS = {
    订单: { label: "订单量", unit: "单", type: "line", color: C.cyan, table: "fact_order", field: "order_qty", kw: ["订单", "接单", "合同"], data: [820, 910, 1040, 980, 1120, 1260, 1180, 1310, 1420, 1380, 1520, 1650] },
    产量: { label: "产量", unit: "件", type: "bar", color: C.blue, table: "fact_prod", field: "output", kw: ["产量", "生产", "产出", "制造"], data: [12500, 13800, 15200, 14600, 16100, 17400, 16800, 18200, 19500, 19000, 20400, 21800] },
    能耗: { label: "综合能耗", unit: "万kWh", type: "line", color: C.amber, table: "fact_energy", field: "kwh", kw: ["能耗", "用电", "电力", "节电"], data: [38.2, 41.5, 44.8, 43.1, 46.2, 49.5, 47.8, 51.2, 54.6, 52.9, 56.1, 58.4] },
    库存: { label: "库存周转", unit: "次/月", type: "bar", color: C.violet, table: "fact_inv", field: "turnover", kw: ["库存", "周转", "仓储", "存货"], data: [4.2, 4.4, 4.1, 4.6, 4.8, 4.5, 5.0, 5.2, 5.1, 5.4, 5.6, 5.8] },
    质量: { label: "一次合格率", unit: "%", type: "line", color: C.green, table: "fact_quality", field: "fpy", kw: ["质量", "合格率", "良率", "一次合格"], data: [96.2, 96.8, 97.1, 96.5, 97.4, 97.8, 97.2, 98.1, 98.3, 97.9, 98.5, 98.7] },
    成本: { label: "成本构成", unit: "万元", type: "stack", color: C.pink, table: "fact_cost", field: "cost", kw: ["成本", "费用", "支出", "利润"], data: [120, 128, 141, 136, 150, 162, 156, 171, 184, 178, 193, 206] }
  };
  const KEY = Object.keys(METRICS);
  let last = "产量";
  const hist = [];

  function metricOption(m) {
    const cfg = METRICS[m];
    let series;
    if (cfg.type === "stack") {
      const mat = cfg.data.map(v => Math.round(v * 0.52)), lab = cfg.data.map(v => Math.round(v * 0.30));
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
    return {
      backgroundColor: "transparent", grid: { left: 6, right: 14, top: 28, bottom: 4, containLabel: true },
      tooltip: tip(), legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: C.txt1, fontSize: 10 }, show: cfg.type === "stack" },
      xAxis: axCat(MONTHS), yAxis: axVal({ name: cfg.unit }), series
    };
  }
  function detect(q) {
    const t = String(q || "").toLowerCase();
    for (const k of KEY) if (METRICS[k].kw.some(w => t.includes(w))) return k;
    if (/呢|怎么样|如何|趋势/.test(t)) return last;
    return null;
  }
  function pushMsg(role, html) {
    const log = document.getElementById("chatlog");
    if (!log) return;
    const d = document.createElement("div");
    d.className = "msg " + (role === "user" ? "user" : "ai");
    d.innerHTML = `<div class="avatar">${role === "user" ? "我" : "AI"}</div><div class="bubble">${html}</div>`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  function ask(q) {
    pushMsg("user", AgentUI.escapeHtml(q));
    const m = detect(q);
    if (!m) { pushMsg("ai", "未识别业务度量，可尝试：订单 / 产量 / 能耗 / 库存 / 质量 / 成本。"); return; }
    last = m; hist.push({ q, m });
    const cfg = METRICS[m];
    const sql = `SELECT month, ${cfg.field} FROM ${cfg.table} WHERE year = 2026 ORDER BY month;`;
    const sqlEl = document.getElementById("sql-out");
    if (sqlEl) sqlEl.textContent = sql;
    const chartEl = document.getElementById("c-chat");
    if (chartEl) chart("c-chat", metricOption(m));
    const lastVal = cfg.data[cfg.data.length - 1], prev = cfg.data[cfg.data.length - 2];
    const pct = ((lastVal / prev - 1) * 100).toFixed(1);
    pushMsg("ai", `<div class="ans-title">已识别度量：${cfg.label}</div>
      <div class="kv"><span class="k">生成 SQL：</span><code>${AgentUI.escapeHtml(sql)}</code></div>
      <div class="kv"><span class="k">最新值：</span><b>${lastVal.toLocaleString()} ${cfg.unit}</b> · 环比 <b class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "+" : ""}${pct}%</b></div>
      <div class="kv" style="color:var(--txt-2)">图表类型：${cfg.type === "stack" ? "堆叠柱状图" : cfg.type === "line" ? "折线图" : "柱状图"}（自适应）</div>`);
  }
  function kpiGrid() {
    const lastOf = a => a[a.length - 1];
    return KEY.map(k => {
      const cfg = METRICS[k], v = lastOf(cfg.data), p = ((v / cfg.data[cfg.data.length - 2] - 1) * 100).toFixed(1);
      return `<div class="metric"><div class="metric-label">${cfg.label}</div>
        <div class="metric-value" style="font-size:20px">${v.toLocaleString()}<small>${cfg.unit}</small></div>
        <div class="metric-foot"><span class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%</span> 环比</div></div>`;
    }).join("");
  }
  function reportHtml() {
    const lastOf = a => a[a.length - 1];
    const rows = KEY.map(k => { const c = METRICS[k], v = lastOf(c.data), p = ((v / c.data[c.data.length - 2] - 1) * 100).toFixed(1); return `<li><b>${c.label}</b>：${v.toLocaleString()} ${c.unit}（环比 ${p >= 0 ? "+" : ""}${p}%）</li>`; }).join("");
    return `<div class="ans-title">2026 年 12 月运营日报</div>
      <div class="note" style="margin-bottom:10px">数据来源：经营数据仓库（fact_order / fact_prod / fact_energy / fact_inv / fact_quality / fact_cost）</div>
      <ul>${rows}</ul>
      <div class="kv"><span class="k">智能结论：</span>产量与订单同步增长，一次合格率提升至 98.7%，库存周转加快；综合能耗环比上升，建议对空压站与高耗能产线执行分时优化调度。</div>`;
  }

  const views = [
    {
      key: "chat", label: "对话问数",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z"/></svg>`,
      html() {
        return `<div class="grid g-4 mb">
          <div class="metric is-cyan"><div class="metric-label">问数准确率</div><div class="metric-value">93.2<small>%</small></div><div class="metric-foot">自然语言 → SQL</div></div>
          <div class="metric is-green"><div class="metric-label">平均响应</div><div class="metric-value">0.8<small>s</small></div><div class="metric-foot">端到端</div></div>
          <div class="metric is-violet"><div class="metric-label">支持图表类型</div><div class="metric-value">6<small>类</small></div><div class="metric-foot">自适应生成</div></div>
          <div class="metric is-amber"><div class="metric-label">上下文轮数</div><div class="metric-value">5<small>轮</small></div><div class="metric-foot">指代追问</div></div>
        </div>
        <div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>自然语言问数</h3><span class="sub">输入业务问题，自动生成 SQL 与图表</span></div>
            <div class="quick-ask mb" id="chips">
              <button data-q="今年各月订单量趋势">订单量趋势</button>
              <button data-q="各月产量对比">产量对比</button>
              <button data-q="能耗情况怎么样">能耗情况</button>
              <button data-q="库存周转率">库存周转</button>
              <button data-q="一次合格率变化">一次合格率</button>
              <button data-q="成本构成">成本构成</button>
              <button data-q="那产量呢">那产量呢（多轮指代）</button>
            </div>
            <div class="tr-sql"><div class="tr-sql-head"><span class="pill pill-info" style="font-size:10px">生成 SQL</span><span class="mono" id="sql-out">SELECT ...</span></div></div>
            <div class="chart" id="c-chat" style="height:280px"></div>
            <form class="chat-input" id="askform" autocomplete="off" style="padding-top:12px;border-top:1px solid var(--line)">
              <input id="askq" type="text" placeholder="例如：今年各月产量对比 / 那能耗呢" />
              <button class="btn btn-primary" type="submit">问数</button>
            </form>
          </div>
          <div class="panel"><div class="panel-head"><h3>问数会话</h3><span class="sub">SQL 与结果解析</span></div>
            <div class="chat"><div class="chat-log" id="chatlog"></div></div>
          </div>
        </div>`;
      },
      init() {
        chart("c-chat", metricOption(last));
        pushMsg("ai", `<div class="ans-title">经营问数助手已就绪</div>可询问订单 / 产量 / 能耗 / 库存 / 质量 / 成本 6 类经营度量，支持多轮指代追问（如「那能耗呢」）。`);
        document.getElementById("askform").addEventListener("submit", e => { e.preventDefault(); const i = document.getElementById("askq"); const v = (i.value || "").trim(); if (!v) return; i.value = ""; ask(v); });
        document.getElementById("chips").addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (b) ask(b.dataset.q); });
      },
      refresh() { const c = document.getElementById("c-chat"); if (c) chart("c-chat", metricOption(last)); }
    },
    {
      key: "charts", label: "图表分析",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19h16M6 19V9M12 19V5M18 19v-7"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>经营指标分析</h3><span class="sub">选择度量自动切换图表</span>
            <div class="spacer"></div><div class="segmented" id="metric-seg">${KEY.map((k, i) => `<button data-m="${k}" class="${i === 1 ? "active" : ""}">${METRICS[k].label}</button>`).join("")}</div></div>
          <div class="chart" id="c-analysis" style="height:320px"></div></div>
        <div class="panel"><div class="panel-head"><h3>指标概览</h3><span class="sub">自适应汇总</span></div><div class="grid g-3" id="kpi-grid">${kpiGrid()}</div></div>`;
      },
      init() {
        chart("c-analysis", metricOption("产量"));
        document.getElementById("metric-seg").addEventListener("click", e => {
          const b = e.target.closest("[data-m]"); if (!b) return;
          document.querySelectorAll("#metric-seg button").forEach(x => x.classList.toggle("active", x === b));
          last = b.dataset.m; chart("c-analysis", metricOption(last));
        });
      }
    },
    {
      key: "report", label: "运营日报",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 3h9l5 5v13H6z"/><path d="M9 12h6M9 16h4"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>运营日报生成</h3><span class="sub">自动汇总当月经营指标</span>
            <div class="spacer"></div>
            <button class="btn btn-sm" id="btn-preview">预览日报</button>
            <button class="btn btn-sm btn-primary" id="btn-download">导出日报</button></div>
          <div id="report-preview" class="panel" style="background:var(--bg-0)">${reportHtml()}</div></div>
        <div class="panel"><div class="panel-head"><h3>日报要素</h3><span class="sub">覆盖维度</span></div>
          <table class="data"><tbody>
            <tr><td>订单交付</td><td>订单量与环比变化</td></tr>
            <tr><td>生产运营</td><td>产量与产能利用率</td></tr>
            <tr><td>能耗管理</td><td>综合能耗与单位能耗</td></tr>
            <tr><td>库存周转</td><td>周转次数与呆滞预警</td></tr>
            <tr><td>质量表现</td><td>一次合格率与缺陷率</td></tr>
            <tr><td>成本结构</td><td>材料 / 人工 / 能耗构成</td></tr>
          </tbody></table></div>`;
      },
      init() {
        document.getElementById("btn-preview").addEventListener("click", () => { modal("运营日报 · 预览", reportHtml()); });
        document.getElementById("btn-download").addEventListener("click", () => {
          const txt = ["2026 年 12 月运营日报", ""].concat(KEY.map(k => { const c = METRICS[k], v = c.data[c.data.length - 1], p = ((v / c.data[c.data.length - 2] - 1) * 100).toFixed(1); return `${c.label}：${v.toLocaleString()} ${c.unit}（环比 ${p >= 0 ? "+" : ""}${p}%）`; })).join("\n");
          download("运营日报-2026-12.csv", txt, "text/csv;charset=utf-8");
          toast("ok", "运营日报已导出");
        });
      }
    }
  ];

  AgentUI.boot({
    cn: "经营问数智能体", code: "DataMind BI", tagline: "自然语言问数 · 经营分析 · 日报生成",
    kpis: [
      { label: "问数准确率", value: "93.2%" }, { label: "平均响应", value: "0.8s" },
      { label: "图表类型", value: "6 类" }, { label: "上下文", value: "5 轮" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>引擎 <b>NL2SQL</b><br/>数据源 <b>6 主题域</b>`
  });
})();
