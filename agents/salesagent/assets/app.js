/* 智能客服智能体 SalesAgent —— 会话 · 产品推荐 · 线索沉淀 */
(function () {
  "use strict";
  const { chart, toast, theme } = AgentUI;
  const { C, axCat, axVal, tip, grad } = theme;

  const SKUS = [
    { id: "EQ-1001", name: "数控加工中心 VMC-850", cat: "金属切削", power: "11 kW", spec: "行程 800/500/500mm", price: 328000, stock: "现货" },
    { id: "EQ-1002", name: "数控加工中心 VMC-1160", cat: "金属切削", power: "15 kW", spec: "行程 1100/600/600mm", price: 468000, stock: "订货 30 天" },
    { id: "EQ-2001", name: "螺杆空压机 GA-75", cat: "动力设备", power: "75 kW", spec: "排气量 13.2 m³/min / 0.8MPa", price: 186000, stock: "现货" },
    { id: "EQ-2002", name: "螺杆空压机 GA-90", cat: "动力设备", power: "90 kW", spec: "排气量 15.6 m³/min / 0.8MPa", price: 224000, stock: "订货 20 天" },
    { id: "EQ-3001", name: "离心泵 IH100-65-200", cat: "流体设备", power: "22 kW", spec: "流量 100 m³/h / 扬程 50m", price: 42800, stock: "现货" },
    { id: "EQ-4001", name: "工业机器人 IRB-2600", cat: "自动化", power: "2.8 kW", spec: "负载 20kg / 臂展 2.6m", price: 268000, stock: "订货 45 天" }
  ];
  const INTENTS = [
    { name: "报价咨询", pct: 32 }, { name: "技术参数", pct: 28 }, { name: "售后支持", pct: 18 },
    { name: "产品对比", pct: 12 }, { name: "其他咨询", pct: 10 }
  ];
  const LEADS = [
    { name: "华东精密制造", src: "官网询价", intent: 92, budget: 88, tech: 90, freq: 76, score: 88 },
    { name: "长江重工", src: "展会留资", intent: 84, budget: 79, tech: 82, freq: 62, score: 79 },
    { name: "鑫达模具", src: "400 来电", intent: 76, budget: 71, tech: 74, freq: 58, score: 71 },
    { name: "恒信机械", src: "在线客服", intent: 68, budget: 65, tech: 70, freq: 49, score: 64 }
  ];
  const RULES = [
    { kw: ["价格", "报价", "多少钱", "贵"], intent: "报价咨询", reply: "该机型参考价如下，量大可申请阶梯折扣与分期方案，我先为您生成正式报价单。" },
    { kw: ["参数", "功率", "行程", "排气量", "扬程", "规格"], intent: "技术参数", reply: "已调取完整技术参数表，关键规格与选型建议如下，可下载 PDF 手册。" },
    { kw: ["对比", "区别", "哪个好", "vs"], intent: "产品对比", reply: "已生成横向对比，结合您的预算与产能给出推荐。" },
    { kw: ["售后", "维修", "保修", "配件"], intent: "售后支持", reply: "整机质保 12 个月，核心部件 24 个月，已为您登记服务工单。" }
  ];
  function classify(text) {
    const t = String(text || "");
    for (const r of RULES) if (r.kw.some(k => t.includes(k))) return r;
    return { intent: "其他咨询", reply: "已记录您的需求，稍后由专属顾问跟进。" };
  }
  function bubble(role, html) {
    const log = document.getElementById("session-log");
    if (!log) return;
    const d = document.createElement("div");
    d.className = "msg " + (role === "user" ? "user" : "ai");
    d.innerHTML = `<div class="avatar">${role === "user" ? "客" : "AI"}</div><div class="bubble">${html}</div>`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }

  const views = [
    {
      key: "session", label: "会话工作台",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z"/></svg>`,
      html() {
        return `<div class="grid g-4 mb">
          <div class="metric is-cyan"><div class="metric-label">意图识别率</div><div class="metric-value">89.6<small>%</small></div><div class="metric-foot">5 类意图</div></div>
          <div class="metric is-green"><div class="metric-label">推荐命中率</div><div class="metric-value">76.3<small>%</small></div><div class="metric-foot">客户采纳比例</div></div>
          <div class="metric is-violet"><div class="metric-label">线索识别率</div><div class="metric-value">71.5<small>%</small></div><div class="metric-foot">自动沉淀线索卡</div></div>
          <div class="metric is-amber"><div class="metric-label">首响时间</div><div class="metric-value">1.2<small>s</small></div><div class="metric-foot">平均首次响应</div></div>
        </div>
        <div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>智能会话工作台</h3><span class="sub">多轮对话与意图识别</span></div>
            <div class="chat" style="height:360px">
              <div class="chat-log" id="session-log"></div>
              <form class="chat-input" id="session-form" autocomplete="off">
                <input id="session-input" type="text" placeholder="例如：GA-75 多少钱？ / 和 GA-90 有什么区别？" />
                <button class="btn btn-primary" type="submit">发送</button>
              </form>
            </div>
            <div class="quick-ask mt">
              <button data-say="GA-75 空压机多少钱？">报价咨询</button>
              <button data-say="VMC-850 的主轴功率和行程参数？">技术参数</button>
              <button data-say="GA-75 和 GA-90 有什么区别？">产品对比</button>
              <button data-say="设备保修和配件怎么处理？">售后支持</button>
            </div>
          </div>
          <div class="panel"><div class="panel-head"><h3>意图识别分布</h3><span class="sub">实时统计</span></div><div class="chart chart-lg" id="c-intent"></div></div>
        </div>`;
      },
      init() {
        chart("c-intent", {
          backgroundColor: "transparent", grid: { left: 6, right: 22, top: 12, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>占比 <b>${p[0].value}%</b>` }),
          xAxis: axVal({ max: 40, axisLabel: { color: C.txt2, fontSize: 10, formatter: "{value}%" } }),
          yAxis: axCat(INTENTS.map(i => i.name).reverse(), { type: "category" }),
          series: [{ type: "bar", barWidth: 15, data: INTENTS.map((i, k) => ({ value: i.pct, itemStyle: { color: [C.cyan, C.blue, C.amber, C.violet, C.txt2][k], borderRadius: [0, 4, 4, 0] } })).reverse(), label: { show: true, position: "right", color: C.txt1, fontSize: 10, formatter: "{c}%" } }]
        });
        bubble("ai", `<div class="ans-title">SalesAgent 已就绪</div>您好，我是工业装备智能客服，可咨询报价、技术参数、产品对比与售后支持。`);
        document.getElementById("session-form").addEventListener("submit", e => { e.preventDefault(); const i = document.getElementById("session-input"); const v = (i.value || "").trim(); if (!v) return; i.value = ""; reply(v); });
        document.querySelectorAll("[data-say]").forEach(b => b.addEventListener("click", () => reply(b.dataset.say)));
      },
      refresh() { }
    },
    {
      key: "recommend", label: "产品推荐",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3l2.6 5.6L21 9.4l-4.5 4.2L17.7 20 12 16.9 6.3 20l1.2-6.4L3 9.4l6.4-.8z"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>产品对比与智能推荐</h3><span class="sub">选择两款装备自动生成对比</span></div>
          <div class="grid g-2 mb">
            <select id="cmp-a" class="tr-select">${SKUS.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
            <select id="cmp-b" class="tr-select">${SKUS.map((s, i) => `<option value="${s.id}" ${i === 1 ? "selected" : ""}>${s.name}</option>`).join("")}</select>
          </div>
          <div class="table-wrap" id="cmp-table"></div>
          <div class="note" id="cmp-advice" style="margin-top:9px"></div></div>
        <div class="panel"><div class="panel-head"><h3>产品目录</h3><span class="sub">120+ SKU · 示例</span></div>
          <div class="grid g-3">${SKUS.map(s => `<div class="tr-agent">
            <div class="tr-agent-top"><span class="tr-agent-code">${s.id}</span><span class="pill pill-${s.stock === "现货" ? "ok" : "warn"}" style="font-size:10px">${s.stock}</span></div>
            <div class="tr-agent-name">${s.name}</div><div class="tr-agent-role">${s.cat} · ${s.power}</div>
            <div class="tr-agent-load">${s.spec}</div>
            <div class="mono" style="margin-top:6px;color:var(--cyan)">${AgentUI.fmt.yuan(s.price)}</div></div>`).join("")}</div></div>`;
      },
      init() {
        const paint = () => {
          const a = SKUS.find(s => s.id === document.getElementById("cmp-a").value);
          const b = SKUS.find(s => s.id === document.getElementById("cmp-b").value);
          const rows = [["品类", a.cat, b.cat], ["功率", a.power, b.power], ["关键规格", a.spec, b.spec], ["参考价", AgentUI.fmt.yuan(a.price), AgentUI.fmt.yuan(b.price)], ["货期", a.stock, b.stock]];
          document.getElementById("cmp-table").innerHTML = `<table class="data"><thead><tr><th>对比项</th><th>${a.name}</th><th>${b.name}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]}</td><td class="mono">${r[2]}</td></tr>`).join("")}</tbody></table>`;
          const cheap = a.price <= b.price ? a : b, big = a.price > b.price ? a : b;
          document.getElementById("cmp-advice").innerHTML = `智能推荐：预算优先推荐 <b>${cheap.name}</b>（节省 ${AgentUI.fmt.yuan(Math.abs(a.price - b.price))}）；产能优先推荐 <b>${big.name}</b>。均支持分期与以旧换新。`;
        };
        document.getElementById("cmp-a").addEventListener("change", paint);
        document.getElementById("cmp-b").addEventListener("change", paint);
        paint();
      }
    },
    {
      key: "leads", label: "线索管理",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0112 0M17 11l2 2 3-3"/></svg>`,
      html() {
        return `<div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>潜客购买意向打分</h3><span class="sub">意图 40% · 预算 25% · 技术匹配 20% · 互动 15%</span></div>
            <div class="chart" id="c-lead" style="height:220px"></div>
            <div class="table-wrap mt" id="lead-table"></div>
          </div>
          <div class="panel"><div class="panel-head"><h3>销售线索卡沉淀</h3><span class="sub">识别率 71.5%</span>
              <div class="spacer"></div><button class="btn btn-sm btn-primary" id="btn-sync">同步至 CRM</button></div>
            <div id="lead-cards" style="display:flex;flex-direction:column;gap:10px"></div>
          </div>
        </div>`;
      },
      init() {
        chart("c-lead", {
          backgroundColor: "transparent", grid: { left: 6, right: 24, top: 16, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>综合意向 <b>${p[0].value}</b> 分` }),
          xAxis: axVal({ max: 100, name: "分" }), yAxis: axCat(LEADS.map(l => l.name).reverse(), { type: "category" }),
          series: [{ type: "bar", barWidth: 16, data: LEADS.map(l => ({ value: l.score, itemStyle: { color: l.score >= 85 ? C.red : l.score >= 75 ? C.amber : C.cyan, borderRadius: [0, 4, 4, 0] } })).reverse(), label: { show: true, position: "right", color: C.txt1, fontSize: 10 } }]
        });
        document.getElementById("lead-table").innerHTML = `<table class="data"><thead><tr><th>客户</th><th>来源</th><th>意向</th><th>预算</th><th>技术</th><th>互动</th><th>综合</th></tr></thead>
          <tbody>${LEADS.map(l => `<tr><td><b>${l.name}</b></td><td>${l.src}</td><td class="mono">${l.intent}</td><td class="mono">${l.budget}</td><td class="mono">${l.tech}</td><td class="mono">${l.freq}</td><td><span class="pill pill-${l.score >= 85 ? "danger" : l.score >= 75 ? "warn" : "muted"}" style="font-size:10.5px">${l.score}</span></td></tr>`).join("")}</tbody></table>`;
        document.getElementById("lead-cards").innerHTML = LEADS.map(l => {
          const rank = l.score >= 85 ? "high" : l.score >= 75 ? "mid" : "low";
          const advice = l.score >= 85 ? "2 小时内电话回访，推送报价单与案例" : l.score >= 75 ? "24 小时内发送产品资料并邀约演示" : "纳入培育池，定期推送行业方案";
          return `<div class="wo-card pri-${rank}"><div class="wo-top"><span class="wo-title">${l.name}</span>
            <span class="pill pill-${l.score >= 85 ? "danger" : l.score >= 75 ? "warn" : "muted"}" style="font-size:10px">意向 ${l.score} 分</span></div>
            <div class="wo-body"><div>来源：${l.src} · 推荐装备：${l.intent >= 85 ? "VMC-850 / GA-75" : "IH100-65-200"}</div><div>跟进建议：${advice}</div></div></div>`;
        }).join("");
        document.getElementById("btn-sync").addEventListener("click", () => toast("ok", `已同步 ${LEADS.length} 条销售线索卡至 CRM`));
      }
    }
  ];

  function reply(text) {
    bubble("user", AgentUI.escapeHtml(text));
    const r = classify(text);
    setTimeout(() => {
      bubble("ai", `<div class="ans-title">意图识别：${r.intent}</div>${r.reply}
        ${r.intent === "产品对比" ? `<div class="kv"><span class="k">对比结论：</span>GA-75 适合常规产线（13.2 m³/min），GA-90 适合高峰产能（15.6 m³/min），价格差 ${AgentUI.fmt.yuan(38000)}。</div>` : ""}
        <div class="kv" style="color:var(--txt-2)">已记录会话，若识别为商机将自动沉淀销售线索卡。</div>`);
    }, 320);
  }

  AgentUI.boot({
    cn: "智能客服智能体", code: "SalesAgent", tagline: "多轮会话 · 产品推荐 · 线索沉淀",
    kpis: [
      { label: "意图识别率", value: "89.6%" }, { label: "推荐命中率", value: "76.3%" },
      { label: "线索识别率", value: "71.5%" }, { label: "首响时间", value: "1.2s" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>SKU <b>120+</b><br/>意图 <b>5 类</b>`
  });
})();
