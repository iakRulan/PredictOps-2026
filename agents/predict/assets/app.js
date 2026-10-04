/* =========================================================================
 * 应用主逻辑 —— 视图切换 / 实时循环 / 工单闭环 / 智能问答
 * ========================================================================= */
(function (global) {
  "use strict";
  const U = global.IOT.util;

  /* ---------------- 备件库存 ---------------- */
  const PARTS = [
    { id: "SP-1001", name: "主轴轴承 7014C", code: "BRG-7014C", stock: 6, min: 4, unit: "套", supplier: "SKF 授权经销", lead: 15, price: 3200, rate: 0.6, devices: ["CNC-01"], chain: "正常" },
    { id: "SP-1002", name: "轴承 NU214", code: "BRG-NU214", stock: 2, min: 4, unit: "套", supplier: "SKF 授权经销", lead: 18, price: 2600, rate: 0.8, devices: ["AC-01"], chain: "紧张" },
    { id: "SP-1003", name: "轴承 6308/C3", code: "BRG-6308", stock: 9, min: 5, unit: "套", supplier: "NSK 华东仓", lead: 7, price: 480, rate: 1.2, devices: ["PMP-01"], chain: "正常" },
    { id: "SP-1004", name: "机械密封 M37", code: "SEAL-M37", stock: 3, min: 3, unit: "件", supplier: "博格曼", lead: 12, price: 1800, rate: 0.5, devices: ["PMP-01"], chain: "正常" },
    { id: "SP-1005", name: "叶轮 IH100", code: "IMP-IH100", stock: 1, min: 2, unit: "件", supplier: "南方泵业", lead: 21, price: 4200, rate: 0.35, devices: ["PMP-01"], chain: "预警" },
    { id: "SP-1006", name: "油气分离芯 GA75", code: "SEP-GA75", stock: 4, min: 4, unit: "件", supplier: "阿特拉斯", lead: 10, price: 950, rate: 0.7, devices: ["AC-01"], chain: "正常" },
    { id: "SP-1007", name: "温控阀 TC75", code: "VLV-TC75", stock: 2, min: 2, unit: "件", supplier: "阿特拉斯", lead: 14, price: 1250, rate: 0.3, devices: ["AC-01"], chain: "正常" },
    { id: "SP-1008", name: "滚珠丝杠副 40", code: "SCREW-40", stock: 1, min: 2, unit: "套", supplier: "上银 HIWIN", lead: 25, price: 8600, rate: 0.18, devices: ["CNC-01"], chain: "预警" },
    { id: "SP-1009", name: "联轴器弹性块 EL80", code: "CPL-EL80", stock: 12, min: 6, unit: "组", supplier: "国产通用", lead: 5, price: 260, rate: 0.9, devices: ["PMP-01", "AC-01"], chain: "正常" },
    { id: "SP-1010", name: "润滑脂 LGHP2", code: "LUB-LGHP2", stock: 18, min: 10, unit: "kg", supplier: "SKF", lead: 3, price: 180, rate: 2.5, devices: ["CNC-01", "PMP-01", "AC-01"], chain: "正常" }
  ];

  /* 备件预计可用天数 = 库存 / 月均消耗 × 30 */
  function availableDays(p) {
    if (!p.rate) return Infinity;
    return Math.round(p.stock / p.rate * 30);
  }

  /* 故障模式 → 备件映射 */
  const FAULT_PARTS = {
    "fault-bpfi": ["轴承", "润滑脂"],
    "fault-bpfo": ["轴承", "润滑脂"],
    "fault-unbalance": ["叶轮", "联轴器", "平衡"],
    degraded: ["润滑脂", "过滤器", "密封"]
  };
  const FAULT_MEASURE = {
    "fault-bpfi": "包络谱确认 BPFI 特征频率；补充/更换润滑脂后复测，冲击能量持续上升则停机更换内圈侧轴承并复核预紧力。",
    "fault-bpfo": "解调分析锁定 BPFO；检查轴承座配合与紧固力矩，更换外圈侧轴承并做轴电压检测。",
    "fault-unbalance": "清理叶轮结垢并执行动平衡校正，复核联轴器对中（径向/角向 ≤0.05mm）。",
    degraded: "加强点检频次至 3 天一次，补充润滑脂、清洗过滤器，持续跟踪温升与振动趋势。"
  };

  const WO_FLOW = ["pending", "processing", "done", "closed"];
  const WO_FLOW_LABEL = { pending: "待处理", processing: "处理中", done: "已完成", closed: "已闭环" };

  function recommendParts(deviceId, stateKey) {
    const keys = FAULT_PARTS[stateKey] || [];
    const out = [];
    PARTS.forEach(p => {
      if (!p.devices.includes(deviceId)) return;
      if (keys.some(k => p.name.includes(k)) && !out.some(x => x.id === p.id)) {
        out.push(Object.assign({}, p, { qty: p.name.includes("轴承") ? 2 : 1 }));
      }
    });
    if (!out.length) {
      PARTS.filter(p => p.devices.includes(deviceId)).slice(0, 2)
        .forEach(p => out.push(Object.assign({}, p, { qty: 1 })));
    }
    return out;
  }

  /* 工单成本与停机排修估算 */
  function estimateCost(parts, priority) {
    const partsCost = parts.reduce((s, p) => s + p.qty * (p.price || 0), 0);
    const labor = priority === "high" ? 2800 : 1400;                 // 人工 + 技术服务费（元）
    const downtime = Math.round((1.5 + parts.length * 1.5 + (priority === "high" ? 2 : 0)) * 2) / 2; // 小时
    return { partsCost, labor, total: partsCost + labor, downtime };
  }
  function yuan(n) { return "¥" + n.toLocaleString("zh-CN"); }

  /* =========================================================================
   * App
   * ========================================================================= */
  const App = {
    engine: null,
    tickCount: 0,
    workOrders: [],
    woSeq: 1001,
    currentView: "perception",
    paused: false,
    kbCat: "全部",

    init() {
      this.engine = new global.IOT.SimEngine();
      this.seedHistoryOrders();
      this.bindNav();
      this.bindTopbarActions();
      this.buildDeviceStrip();
      this.buildStateSelector();
      this.bindCursor();
      this.buildKB();
      this.buildChat();
      this.bindShortcuts();
      this.renderDatasetPanel();
      this.renderPerception(true);
      this.updateTopbar();
      this.bindDrawer();
      this.start();
      global.addEventListener("resize", () => global.Charts.resizeAll());
      setTimeout(() => this.pushAi(this.greeting()), 400);
      this.loadRealData();
    },

    /* 真实波形异步载入：感知层先渲染，波形到位后无感升级到实测路径 */
    loadRealData() {
      if (!global.CWRU) return;
      global.CWRU.ensure().then(() => {
        this._dsRendered = null;
        this.renderDatasetPanel();
        const n = global.CWRU.samples().length, w = global.CWRU.state.index.windows.length;
        this.toast("ok", `已载入 NASA CWRU 真实波形：${n} 只 .mat 样本 / ${w} 段评测窗，特征频率改为实测`);
      }).catch(() => {
        this.toast("warn", "CWRU 真实波形未随包提供（assets/data/cwru.bin 缺失），基准数据集视图停留在模型仿真路径");
      });
    },

    /* ---------------- 实时循环 ---------------- */
    start() {
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.tickCount++;
        this.engine.tick();
        this.updateTopbar();
        if (this.currentView === "perception") this.updatePerception();
        else if (this.currentView === "inference") { if (this.tickCount % 3 === 0) this.updateInference(); }
        else if (this.currentView === "decision") { if (this.tickCount % 5 === 0) this.updateDecision(); }
      }, 1400);
    },

    setPaused(v) {
      this.paused = v;
      if (v) clearInterval(this.timer);
      else this.start();
      const btn = document.getElementById("btn-pause");
      const label = document.getElementById("pause-label");
      const badge = document.getElementById("live-badge");
      if (btn) btn.setAttribute("aria-pressed", String(v));
      if (label) label.textContent = v ? "继续" : "暂停";
      if (badge) {
        badge.className = "pill pill-" + (v ? "muted" : "info");
        badge.innerHTML = v
          ? `<span class="dot"></span>数据流已暂停`
          : `<span class="dot pulse"></span>数据采集中`;
      }
      document.body.classList.toggle("is-paused", v);
      this.toast("info", v ? "实时数据流已暂停，图表与读数保持当前帧" : "实时数据流已恢复");
    },

    updateTopbar() {
      const o = this.engine.overview();
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("kpi-accuracy", o.accuracy + "%");
      set("kpi-alerts", o.alertCount);
      set("kpi-devices", global.IOT.DEVICES.length);
      const badge = document.getElementById("nav-alert-badge");
      if (badge) {
        badge.textContent = o.alertCount;
        const crit = this.engine.alertLog.some(a => a.level === "critical" && !a.handled);
        badge.classList.toggle("hot", crit);
        badge.closest(".nav-item")?.setAttribute("aria-label", `推理层 · 预测维护，${o.alertCount} 条预警`);
      }
      const chip = document.querySelector('.kpi-chip[data-goto="inference"]');
      if (chip) chip.classList.toggle("alert", o.alertCount > 0);
      const clock = document.getElementById("clock");
      if (clock) clock.textContent = U.clockStr(new Date());
      const trend = document.getElementById("m-trend");
      if (trend) {
        const ch = this.engine.current();
        const st = global.IOT.STATES[ch.state];
        const map = { 0: ["平稳", "var(--green)"], 1: ["缓慢下降", "var(--amber)"], 2: ["快速劣化", "var(--red)"] };
        const m = map[st.level];
        trend.innerHTML = `<b style="color:${m[1]}">${m[0]}</b> · 累计运行 ${ch.def.runHours.toLocaleString()} h`;
      }
    },

    /* ---------------- 导航 ---------------- */
    bindNav() {
      document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => this.switchView(btn.dataset.view));
      });
      document.querySelectorAll(".kpi-chip[data-goto]").forEach(chip => {
        chip.addEventListener("click", () => {
          this.switchView(chip.dataset.goto);
          if (chip.dataset.goto === "inference") {
            setTimeout(() => document.getElementById("alert-list")
              ?.scrollIntoView({ behavior: "smooth", block: "center" }), 220);
          }
        });
      });
    },

    /* ---------------- 顶栏快捷操作 ---------------- */
    bindTopbarActions() {
      const qf = document.getElementById("btn-quick-fault");
      if (qf) {
        qf.addEventListener("click", () => this.injectFault());
      }
      const qn = document.getElementById("btn-quick-normal");
      if (qn) {
        qn.addEventListener("click", () => this.restoreNormal());
      }
      const exp = document.getElementById("btn-topbar-export");
      if (exp) exp.addEventListener("click", () => this.exportReport());
      const pause = document.getElementById("btn-pause");
      if (pause) pause.addEventListener("click", () => this.setPaused(!this.paused));

      const fs = document.getElementById("btn-fullscreen");
      if (fs) {
        fs.addEventListener("click", () => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        });
        global.addEventListener("fullscreenchange", () => {
          const on = !!document.fullscreenElement;
          fs.innerHTML = on ? "⛶ 退出全屏" : "🖥 全屏演示";
          fs.classList.toggle("pill-ok", on);
          fs.classList.toggle("pill-info", !on);
        });
      }
    },

    injectFault() {
      const id = this.engine.selected;
      if (this.engine.get(id).state === "fault-bpfi") {
        this.toast("info", `${this.engine.get(id).def.name} 已处于轴承内圈故障工况`);
        return;
      }
      this.engine.setState(id, "fault-bpfi");
      this.buildStateSelector();
      this.onStateChanged(id, "fault-bpfi");
      this.renderPerception(true);
      this.renderDatasetPanel();
      this.toast("warn", "⚡ 已快速注入轴承内圈故障，早期预警已触发，工单自动生成！", {
        label: "查看工单", view: "decision"
      });
    },

    restoreNormal() {
      const id = this.engine.selected;
      if (this.engine.get(id).state === "normal") {
        this.toast("info", `${this.engine.get(id).def.name} 已处于正常态健康基线`);
        return;
      }
      this.engine.setState(id, "normal");
      this.buildStateSelector();
      this.onStateChanged(id, "normal");
      this.renderPerception(true);
      this.renderDatasetPanel();
      this.toast("ok", "✅ 设备已恢复正常运行态健康基线");
    },

    switchView(view) {
      this.currentView = view;
      document.querySelectorAll(".nav-item").forEach(b => {
        const on = b.dataset.view === view;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      });
      document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
      // 设备上下文只对数据视图有意义，知识/数据集视图收起，避免占用视线
      const ctx = document.getElementById("context-bar");
      if (ctx) ctx.hidden = (view === "knowledge" || view === "dataset");
      global.scrollTo({ top: 0, behavior: "auto" });

      if (view === "perception") this.renderPerception();
      if (view === "inference") this.renderInference();
      if (view === "decision") this.renderDecision();
      if (view === "knowledge") this.renderKnowledge();
      if (view === "dataset" && global.PredictEval) global.PredictEval.render();
      requestAnimationFrame(() => global.Charts.resizeAll());
    },

    /* ---------------- 设备选择（全局上下文条） ---------------- */
    buildDeviceStrip() {
      const wrap = document.getElementById("device-strip");
      if (!wrap) return;
      wrap.innerHTML = global.IOT.DEVICES.map(d => {
        const ch = this.engine.get(d.id);
        const lv = global.IOT.STATES[ch.state].level;
        return `<button class="device-card lv-${lv}${d.id === this.engine.selected ? " active" : ""}"
          data-device="${d.id}" aria-pressed="${d.id === this.engine.selected}"
          title="${d.name} · ${d.id} · ${d.model} · ${d.location}">
          <span class="device-icon">${icon(d.icon)}</span>
          <span class="device-meta">
            <span class="name">${d.name}</span>
            <span class="code">${d.id} · ${global.IOT.STATES[ch.state].label}</span>
          </span>
          <span class="device-state">
            <span class="hi" data-hi="${d.id}">${ch.health()}</span>
            <span class="lbl">健康分</span>
          </span>
        </button>`;
      }).join("");
      wrap.querySelectorAll(".device-card").forEach(card => {
        card.addEventListener("click", () => {
          if (card.dataset.device === this.engine.selected) {
            if (this.currentView !== "perception") this.switchView("perception");
            return;
          }
          this.selectDevice(card.dataset.device);
          const ch = this.engine.current();
          this.toast("info", `已切换监控对象：${ch.def.name}（${ch.def.id}）· ${global.IOT.STATES[ch.state].label}`);
        });
      });
      this.buildSpecSnap();
    },

    /** 切换当前监控设备并联动全部下游视图；返回 false 表示目标即当前设备 */
    selectDevice(id) {
      if (!this.engine.get(id) || id === this.engine.selected) return false;
      this.engine.select(id);
      const ch = this.engine.current();
      ch.cursor = null;
      this.syncCursorSlider(ch);
      this.syncDeviceCards();
      this.buildStateSelector();
      this.renderPerception(true);
      this.renderDatasetPanel();
      if (this.currentView === "decision") { this.renderWorkOrders(); this.updateDecisionMetrics(); }
      return true;
    },

    syncDeviceCards() {
      document.querySelectorAll("#device-strip .device-card").forEach(c => {
        const on = c.dataset.device === this.engine.selected;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", String(on));
        const lv = global.IOT.STATES[this.engine.get(c.dataset.device).state].level;
        c.classList.toggle("lv-0", lv === 0);
        c.classList.toggle("lv-1", lv === 1);
        c.classList.toggle("lv-2", lv === 2);
      });
    },

    /* ---------------- 频谱游标快速定位 ---------------- */
    buildSpecSnap() {
      const wrap = document.getElementById("spec-snap");
      if (!wrap) return;
      const ch = this.engine.current();
      const rot = ch.def.base.speed / 60;
      const st = global.IOT.STATES[ch.state];
      const pts = [["1X", rot], ["2X", rot * 2]];
      if (st.freq === "BPFI") pts.push(["BPFI", rot * 5.42]);
      if (st.freq === "BPFO") pts.push(["BPFO", rot * 3.58]);
      wrap.innerHTML = pts.map(([k, f]) =>
        `<button data-snap="${Math.round(f / 20) * 20}" title="游标定位到 ${k} ≈ ${f.toFixed(0)} Hz">${k}</button>`
      ).join("");
      wrap.querySelectorAll("[data-snap]").forEach(b => b.addEventListener("click", () => {
        const cur = this.engine.current();
        cur.cursor = Number(b.dataset.snap);
        const slider = document.getElementById("spec-cursor");
        if (slider) slider.value = cur.cursor;
        global.Charts.renderSpectrum("chart-spectrum", cur);
        this.updateCursorReadout(cur);
      }));
    },

    /* ---------------- 频谱告警游标 ---------------- */
    bindCursor() {
      const slider = document.getElementById("spec-cursor");
      if (!slider) return;
      slider.addEventListener("input", () => {
        const ch = this.engine.current();
        ch.cursor = Number(slider.value);
        global.Charts.renderSpectrum("chart-spectrum", ch);
        this.updateCursorReadout(ch);
      });
      this.syncCursorSlider(this.engine.current());
    },
    syncCursorSlider(ch) {
      const slider = document.getElementById("spec-cursor");
      if (!slider) return;
      const rot = ch.def.base.speed / 60;
      const def = Math.round(rot / 20) * 20;
      slider.value = ch.cursor == null ? def : ch.cursor;
      this.updateCursorReadout(ch);
    },
    updateCursorReadout(ch) {
      const el = document.getElementById("spec-cursor-readout");
      if (!el) return;
      const spec = ch.__spec;
      const slider = document.getElementById("spec-cursor");
      const f = ch.cursor == null ? (slider ? Number(slider.value) : 0) : ch.cursor;
      if (!spec) { el.textContent = "拖动游标查看频点幅值"; return; }
      const idx = Math.max(0, Math.min(spec.vals.length - 1, Math.round(f / 20)));
      el.innerHTML = `游标 <b>${idx * 20} Hz</b> · 幅值 <b>${spec.vals[idx]}</b> m/s²`;
    },

    /* ---------------- 基准数据集：实测（真实波形）/ 模型仿真 双路径 ---------------- */
    dsMode: "real",
    dsSample: "105",

    switchMode(mode) {
      this.dsMode = mode;
      this.renderDatasetPanel();
    },

    cvNoteHtml() {
      const b = global.CWRU.validate().bySample, w = global.CWRU.validate().byWindow;
      const dg = b.degenerate.length
        ? `；${b.degenerate.map(L => global.Datasets.ELEMENT_LABEL[L] || L).join("、")} 类可用文件不足 2 只，无法留一，已从准确率中剔除`
        : "";
      return `<b>留一法实测分类</b>：按样本文件（LOSO，申报口径）<b>${(b.accuracy * 100).toFixed(1)}%</b>（${b.correct}/${b.n} 段窗口 · ${b.files} 只 .mat），宏平均 F1 <b>${b.macroF1.toFixed(3)}</b>${dg}；
        按窗口留一（LOO，同文件窗口相关，偏乐观，仅对照）${(w.accuracy * 100).toFixed(1)}%。逐类明细见「数据集与评估」视图。`;
    },

    /** 空闲时补算交叉验证并回填占位，避免解调上百段窗口阻塞首屏 */
    scheduleCrossValidation() {
      if (!global.CWRU || !global.CWRU.ready() || global.CWRU.isCrossValidated()) return;
      const run = () => {
        global.CWRU.validate();                       // 空闲时段解调，不阻塞任何一次交互
        const slot = document.getElementById("ds-cv");
        if (slot) slot.outerHTML = this.cvNoteHtml();
        if (this.currentView === "dataset" && global.PredictEval) global.PredictEval.refresh();
      };
      (global.requestIdleCallback || (fn => setTimeout(fn, 200)))(run, { timeout: 4000 });
    },

    renderDatasetPanel() {
      const wrap = document.getElementById("dataset-panel");
      if (!wrap) return;
      const realAvailable = !!(global.CWRU && global.CWRU.ready() && global.CWRU.samples().length);
      const mode = realAvailable ? this.dsMode : "sim";
      const ch0 = this.engine.current();
      // 守卫的 key 必须覆盖面板真正依赖的输入：实测只看所选样本，仿真随设备与工况变化
      const key = mode === "real"
        ? "real:" + this.dsSample
        : "sim:" + ch0.def.id + ":" + ch0.state;
      if (this._dsRendered === key) return;
      this._dsRendered = key;
      const ch = ch0;
      const meta = global.Datasets.META.cwru;

      const tabs = `<div class="segmented segmented-xs" id="ds-mode" role="group" aria-label="数据来源">
        <button data-ds-mode="real" class="${mode === "real" ? "active" : ""}" ${realAvailable ? "" : "disabled"}
          title="构建期从官网 .mat 抽取的真实加速度窗口，页面现场做 FFT 与 Hilbert 包络解调">
          实测 · CWRU${realAvailable ? "（" + global.CWRU.samples().length + " 只真实样本）" : "（波形未载入）"}</button>
        <button data-ds-mode="sim" class="${mode === "sim" ? "active" : ""}"
          title="本系统 SimEngine 生成的 1 Hz 时序；频谱为模型合成，用于交互演示">模型仿真</button>
      </div>`;
      const head = `<div class="panel-head"><h3>基准数据集验证</h3><div class="spacer"></div>${tabs}</div>`;

      if (mode === "sim") {
        const rows = global.Datasets.identifySim(ch.state, meta.simSpeed || 1797);
        wrap.innerHTML = head + `
          <div class="ds-source">${meta.name} · ${meta.bearing}<br/>
            ${meta.source} · ${meta.sampling} · ${meta.load}</div>
          <div class="ds-flag warn-flag">当前为<b>模型仿真</b>路径：下表数值来自本系统合成的频谱，
            仅演示判读逻辑，不构成对真实信号的测量。</div>
          <div class="table-wrap mt">
            <table class="data">
              <thead><tr><th>特征分量</th><th>理论系数</th><th>理论值 (Hz)</th><th>模型输出 (Hz)</th><th>差值</th><th>说明</th></tr></thead>
              <tbody>${rows.map(r => `<tr>
                <td><b>${r.code}</b> <span class="ds-td-sub">${r.name}</span></td>
                <td class="mono">${r.factor.toFixed(4)}X</td>
                <td class="mono">${r.theory}</td>
                <td class="mono" style="color:${r.detected ? "var(--red)" : "var(--txt-1)"};font-weight:${r.detected ? 700 : 400}">${r.measured}</td>
                <td class="mono">±${r.dev}%</td>
                <td><span class="pill pill-${r.detected ? "danger" : "muted"}" style="font-size:10px">${r.verdict}</span></td>
              </tr>`).join("")}</tbody>
            </table>
          </div>
          <div class="ds-formula">当前仿真工况：<b>${global.IOT.STATES[ch.state].label}</b>（${ch.def.name} / ${ch.def.id}）·
            理论系数取自 6205-2RS 几何参数：BPFI = 5.4152·f<sub>r</sub>，BPFO = 3.5840·f<sub>r</sub>，BSF = 2.3569·f<sub>r</sub>，FTF = 0.3982·f<sub>r</sub>。</div>`;
        wrap.querySelectorAll("[data-ds-mode]").forEach(b => b.addEventListener("click", () => this.switchMode(b.dataset.dsMode)));
        return;
      }

      /* ---------- 实测路径：真实波形 ---------- */
      const list = global.CWRU.samples();
      if (!list.some(s => s.id === this.dsSample)) this.dsSample = list[0].id;
      const chips = list.map(s => {
        const el = s.catalog ? s.catalog.element : "?";
        return `<button class="ds-sample ${s.id === this.dsSample ? "active" : ""}" data-real-sample="${s.id}"
          title="${s.file} · SHA-256 ${s.sha256.slice(0, 16)}… · 变量 ${s.variable} · ${s.sampleCount} 点">
          <span class="ds-sample-label">${s.id}.mat</span>
          <span class="ds-sample-meta">${global.Datasets.ELEMENT_LABEL[el] || el}${s.catalog.diameter ? " " + s.catalog.diameter + "″" : ""} · ${s.catalog.hp}HP · ${(s.fs / 1000)}k</span>
        </button>`;
      }).join("");

      wrap.innerHTML = head + `
        <div class="ds-source">${meta.name} · ${meta.bearing}<br/>
          ${meta.source} · ${meta.sampling} · ${meta.load} ·
          <a href="${meta.url}" target="_blank" rel="noopener">${meta.url.replace("https://", "")}</a></div>
        <div class="ds-samples">${chips}</div>
        <div class="grid g-2 mt">
          <div><div class="ds-chart-cap">真实时域波形 · 驱动端加速度</div><div class="chart chart-sm" id="chart-real-wave"></div></div>
          <div><div class="ds-chart-cap">原始频谱（机械分量 1X / 2X 可见）</div><div class="chart chart-sm" id="chart-real-raw"></div></div>
        </div>
        <div class="ds-chart-cap mt">包络谱 · Hilbert 解调 —— 特征频率实测所在</div>
        <div class="chart" id="chart-real-env" style="height:230px"></div>
        <div class="table-wrap mt" id="ds-real-table"></div>
        <div id="ds-real-foot"></div>`;

      wrap.querySelectorAll("[data-ds-mode]").forEach(b => b.addEventListener("click", () => this.switchMode(b.dataset.dsMode)));
      wrap.querySelectorAll("[data-real-sample]").forEach(b => b.addEventListener("click", () => {
        this.dsSample = b.dataset.realSample;
        this.renderDatasetPanel();
        const s = global.CWRU.sample(this.dsSample);
        this.toast("info", `已载入真实样本 ${s.file}（${s.variable}，${s.sampleCount.toLocaleString()} 点 @ ${s.fs} Hz）`);
      }));
      this.renderRealViews();
      this.scheduleCrossValidation();
    },

    renderRealViews() {
      const a = global.CWRU.analyze(this.dsSample);
      if (!a) return;
      const s = a.sample, C = global.Charts;
      C.renderRealWave("chart-real-wave", a.x, a.fs);
      C.renderSpectrumLine("chart-real-raw", a.rawSpec, Math.min(2000, a.fs / 2 - 200), [
        { freq: a.fr, label: "1X " + a.fr.toFixed(1), color: "#22d3ee", type: "dashed" },
        { freq: 2 * a.fr, label: "2X", color: "#3b82f6", type: "dotted" }
      ], { yName: "g" });
      const marks = a.table.filter(t => t.code !== "1X" && t.code !== "2X").map(t =>
        ({
          freq: t.measured || t.theory,
          label: t.code + (t.valid ? " ✓" : "") + " " + (t.measured || 0).toFixed(1) + "Hz",
          color: t.valid ? "#ef4444" : "#63748a", width: t.valid ? 1.4 : 1,
          type: t.valid ? "solid" : "dotted", pos: "insideEndBottom"
        }));
      C.renderSpectrumLine("chart-real-env", a.envSpec, 1500, marks, { yName: "包络幅值", color: "#f472b6" });

      document.getElementById("ds-real-table").innerHTML = `
        <table class="data">
          <thead><tr><th>特征分量</th><th>系数</th><th>理论值 (Hz)</th><th>实测值 (Hz)</th><th>偏差</th><th>包络SNR</th><th>判定</th></tr></thead>
          <tbody>${a.table.map(t => `<tr>
            <td><b>${t.code}</b> <span class="ds-td-sub">${t.name}</span></td>
            <td class="mono">${t.factor.toFixed(4)}X</td>
            <td class="mono">${t.theory.toFixed(1)}</td>
            <td class="mono" style="color:${t.valid ? "var(--red)" : "var(--txt-1)"};font-weight:${t.valid ? 700 : 400}">${t.measured ? t.measured.toFixed(1) : "—"}</td>
            <td class="mono">${t.measured ? (t.dev >= 0 ? "+" : "") + t.dev.toFixed(2) + "%" : "—"}</td>
            <td class="mono">${t.snr ? t.snr.toFixed(1) : "—"}</td>
            <td><span class="pill pill-${t.valid ? "danger" : "muted"}" style="font-size:10px">${t.valid ? "检出 · 吻合" : (t.detected ? "峰值不足" : "未检出")}</span></td>
          </tr>`).join("")}</tbody>
        </table>`;

      const RULE = global.DSP.RULE;
      const truth = s.catalog ? global.Datasets.ELEMENT_LABEL[s.catalog.element] : "—";
      const pred = a.dominant ? a.dominant.code : "NORMAL";
      // 交叉验证需解调上百段真实窗口（约 3 s），不能卡在首屏渲染里，先占位后回填
      const cvNote = global.CWRU.isCrossValidated()
        ? this.cvNoteHtml() : `<span id="ds-cv">留一法交叉验证计算中…</span>`;
      document.getElementById("ds-real-foot").innerHTML = `
        <div class="ds-flag ${s.agree === false ? "warn-flag" : "ok-flag"}">
          算法判定 <b>${pred}</b> 对照官方目录真值 <b>${truth}${s.catalog.diameter ? " " + s.catalog.diameter + "″" : ""} @ ${s.catalog.hp}HP</b> →
          ${s.agree === null ? "不计入比对（该组为另一型号轴承，6205 系数不适用）" : (s.agree ? "一致 ✓" : "不一致 ✗（弱冲击特征低于判定门限）")}
        </div>
        <div class="ds-formula">
          判定规则：|偏差| ≤ ${RULE.devTol}% 且 包络谱信噪比 ≥ ${RULE.snrTol}。理论值由官方目录标称转速 ${s.rpmTheory} rpm 导出，
          实测值由本页面 JS 对真实波形现场解调得到，两侧互不依赖。<br/>
          解调带 ${s.demodBand[0]}–${s.demodBand[1]} Hz（共振峰 ${s.resonanceHz} Hz 自动选取）· 分析窗 ${s.windowSec} s · 峭度 K=${s.kurtosis} ·
          理论转速取官方目录标称值（本样本 ${s.rpmTheory} rpm = ${s.fr ? s.fr.toFixed(2) : (s.rpmTheory / 60).toFixed(2)} Hz）。<br/>
          ${cvNote}
        </div>
        <div class="ds-prov mono">溯源：${s.file} · ${s.bytes.toLocaleString()} 字节 · SHA-256 ${s.sha256.slice(0, 32)}… ·
          变量 ${s.variable} · ${s.sampleCount.toLocaleString()} 点 / ${(s.sampleCount / s.fs).toFixed(2)} s @ ${s.fs} Hz
          ${s.fsCheck.pageDeclared ? ` · 目录页标注 ${s.fsCheck.pageDeclared / 1000}k，与长度反推${s.fsCheck.agree ? "一致" : "不一致（以长度反推为准）"}` : ""}</div>`;
    },

    buildStateSelector() {
      const wrap = document.getElementById("state-selector");
      if (!wrap) return;
      const ch = this.engine.current();
      wrap.innerHTML = Object.values(global.IOT.STATES).map(s =>
        `<button data-state="${s.key}" class="${ch.state === s.key ? "active" : ""}"
          aria-pressed="${ch.state === s.key}" title="${s.desc}">${s.label}</button>`
      ).join("");
      wrap.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = this.engine.selected;
          if (this.engine.get(id).state === btn.dataset.state) return;
          this.engine.setState(id, btn.dataset.state);
          wrap.querySelectorAll("button").forEach(b => {
            const on = b === btn;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
          });
          this.onStateChanged(id, btn.dataset.state);
          this.renderPerception(true);
          this.renderDatasetPanel();
        });
      });
      this.updateStateBanner();
    },

    updateStateBanner() {
      const ch = this.engine.current();
      const st = global.IOT.STATES[ch.state];
      const banner = document.getElementById("state-banner");
      if (!banner) return;
      const cls = st.level === 0 ? "ok" : st.level === 1 ? "warn" : "danger";
      banner.className = "pill pill-" + cls;
      banner.innerHTML = `<span class="dot${st.level > 0 ? " pulse" : ""}"></span>${st.label} · ${ch.def.name}`;
      const desc = document.getElementById("state-desc");
      if (desc) {
        desc.textContent = st.desc;
        desc.classList.remove("lv-1", "lv-2");
        if (st.level > 0) desc.classList.add("lv-" + st.level);
      }
      this.syncDeviceCards();
    },

    onStateChanged(deviceId, stateKey) {
      const ch = this.engine.get(deviceId);
      const alert = ch.alert();
      if (alert) {
        const res = this.createWorkOrder(alert);
        this.toast(alert.level === "critical" ? "danger" : "warn",
          `[${alert.level === "critical" ? "故障预警" : "劣化预警"}] ${alert.deviceName} 触发告警，提前 ${alert.leadHours}h，置信度 ${alert.confidence}%`,
          { label: "查看工单", view: "decision" });
        if (res.duplicate) {
          this.toast("info", `${res.wo.id} 已在流转中，未重复派工`, { label: "前往处理", view: "decision" });
        }
      } else {
        this.toast("ok", `${ch.def.name} 已回归正常工况`);
      }
      if (this.currentView === "inference") { this.renderAlertList(); this.renderHealthTable(); this.updateInference(true); }
      if (this.currentView === "decision") { this.renderWorkOrders(); this.updateDecisionMetrics(); }
      const st = global.IOT.STATES[stateKey];
      if (st.level > 0) setTimeout(() => this.pushAi(this.proactiveAnalysis(ch)), 300);
    },

    /* ---------------- 感知层 ---------------- */
    renderPerception(force) {
      const ch = this.engine.current();
      this.updateStateBanner();
      global.Charts.renderTrend("chart-vib", ch, force);
      global.Charts.renderTrend("chart-temp", ch, force);
      global.Charts.renderTrend("chart-current", ch, force);
      global.Charts.renderSpectrum("chart-spectrum", ch);
      this.syncCursorSlider(ch);
      this.updateMetrics(ch);
      this.updateDeviceHealth();
      this.buildSpecSnap();
    },

    updatePerception() {
      const ch = this.engine.current();
      global.Charts.renderTrend("chart-vib", ch);
      global.Charts.renderTrend("chart-temp", ch);
      global.Charts.renderTrend("chart-current", ch);
      if (this.tickCount % 2 === 0) {
        global.Charts.renderSpectrum("chart-spectrum", ch);
        this.updateCursorReadout(ch);
      }
      this.updateMetrics(ch);
      this.updateDeviceHealth();
    },

    updateMetrics(ch) {
      const h = ch.hist;
      const last = arr => arr[arr.length - 1];
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("m-acc", U.round(last(h.acc), 2));
      set("m-disp", U.round(last(h.disp), 1));
      set("m-temp", U.round(last(h.temp), 1));
      set("m-current", U.round(last(h.current), 1));
      const hi = ch.health();
      set("m-health", hi);
      const el = document.getElementById("m-health");
      if (el) el.style.color = hi >= 85 ? "var(--green)" : hi >= 60 ? "var(--amber)" : "var(--red)";
      // 实时 sparkline 趋势微图
      if (window.Charts) {
        global.Charts.renderSparkline("spark-acc", h.acc, "#22d3ee");
        global.Charts.renderSparkline("spark-disp", h.disp, "#a78bfa");
        global.Charts.renderSparkline("spark-temp", h.temp, "#f59e0b");
        global.Charts.renderSparkline("spark-current", h.current, "#22c55e");
      }
      // 说明性小字已折叠为悬停提示，保持版面简洁同时可查阈值
      const tip = (id, txt) => {
        const el = document.getElementById(id);
        const card = el && el.closest(".metric");
        if (card) card.title = txt;
      };
      const d = ch.def;
      tip("m-acc", `振动加速度 · 近 60s 滚动窗口\n健康基线 ${d.base.acc.toFixed(2)} m/s² · 报警上限 ${d.limits.acc} m/s²`);
      tip("m-disp", `振动位移 · 峰峰值监测\n健康基线 ${d.base.disp.toFixed(1)} µm`);
      tip("m-temp", `轴承温度\n健康基线 ${d.base.temp} ℃ · 预警 ${d.limits.temp} ℃ · 停机 ${d.limits.temp + 12} ℃`);
      tip("m-current", `运行电流\n额定 ${d.base.current} A · 上限 ${d.limits.current} A`);
    },

    updateDeviceHealth() {
      global.IOT.DEVICES.forEach(d => {
        const ch = this.engine.get(d.id);
        const el = document.querySelector(`[data-hi="${d.id}"]`);
        if (!el) return;
        const h = ch.health();
        el.textContent = h;
        el.style.color = h >= 85 ? "var(--green)" : h >= 60 ? "var(--amber)" : "var(--red)";
        const card = el.closest(".device-card");
        const lv = global.IOT.STATES[ch.state].level;
        if (card) {
          ["lv-0", "lv-1", "lv-2"].forEach((c, i) => card.classList.toggle(c, i === lv));
          const code = card.querySelector(".code");
          if (code) code.textContent = `${d.id} · ${global.IOT.STATES[ch.state].label}`;
        }
      });
    },

    /* ---------------- 推理层 ---------------- */
    renderInference() {
      this.updateInference(true);
      this.renderAlertList();
      this.renderHealthTable();
    },

    updateInference(force) {
      const ch = this.engine.current();
      global.Charts.renderGauge("chart-gauge", ch);
      global.Charts.renderRadar("chart-radar", ch);
      global.Charts.renderRul("chart-rul", ch);
      if (force) global.Charts.renderDegrade("chart-degrade", ch);
      else if (this.tickCount % 4 === 0) global.Charts.renderDegrade("chart-degrade", ch);

      // 预警指标：优先当前设备，否则回退到全厂最近一次预警
      const ownAlert = ch.alert();
      const lastAlert = ownAlert || this.engine.alertLog[0] || null;
      const lead = lastAlert ? lastAlert.leadHours : "--";
      const conf = lastAlert ? lastAlert.confidence : "--";
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("i-lead", lead);
      set("i-conf", conf);
      set("i-rul", this.humanRul(ch.rul()));
      const srcEl = document.getElementById("i-alert-src");
      if (srcEl) {
        if (lastAlert) {
          const own = !!ownAlert;
          const tag = own ? "" : (lastAlert.historical ? " · 历史记录" : " · 全厂最近");
          srcEl.innerHTML = `来源：<b>${lastAlert.deviceName}（${lastAlert.device}）</b> · ${lastAlert.stateLabel}${tag}`;
        } else {
          srcEl.textContent = "暂无预警记录";
        }
      }
      const badge = document.getElementById("infer-state-badge");
      if (badge) {
        const st = global.IOT.STATES[ch.state];
        badge.className = "pill pill-" + (st.level === 0 ? "ok" : st.level === 1 ? "warn" : "danger");
        badge.innerHTML = `<span class="dot pulse"></span>${ch.def.name} · ${st.label}`;
      }
      const ft = document.getElementById("infer-feature");
      if (ft) {
        ft.textContent = ownAlert ? ownAlert.feature : "频谱无异常特征频率，各维度指标正常";
        ft.classList.toggle("lv-2", !!ownAlert && ownAlert.level === "critical");
        ft.classList.toggle("lv-1", !!ownAlert && ownAlert.level !== "critical");
      }
    },

    humanRul(rul) {
      return rul >= 720 ? (rul / 24).toFixed(0) + " 天" : rul + " 小时";
    },

    renderAlertList() {
      const wrap = document.getElementById("alert-list");
      if (!wrap) return;
      const alerts = this.engine.alertLog;
      if (!alerts.length) {
        wrap.innerHTML = `<div class="empty">${svgEmpty()}暂无预警，全部设备处于健康基线范围内</div>`;
        return;
      }
      wrap.innerHTML = alerts.map(a => {
        const crit = a.level === "critical";
        return `<div class="alert-row ${crit ? "critical" : ""}" data-focus-device="${a.device}" role="button" tabindex="0"
          title="点击切换到 ${a.deviceName}（${a.device}）的监控视图">
          <div class="ar-top">
            <span class="pill ${crit ? "pill-danger" : "pill-warn"}">${crit ? "故障预警" : "劣化预警"}</span>
            ${a.historical ? `<span class="pill pill-muted" style="font-size:10px">历史</span>` : ""}
            <span class="ar-device">${a.deviceName}（${a.device}）</span>
            <span class="ar-id">${a.id}</span>
            <div class="spacer" style="flex:1"></div>
            <span class="ar-time">${a.time}${a.ts ? " · " + relTime(a.ts) : ""}</span>
          </div>
          <div class="ar-fields">
            <div class="ar-field"><span class="k">故障类型</span><span class="v ${crit ? "danger" : "warn"}">${a.stateLabel}</span></div>
            <div class="ar-field"><span class="k">提前预警时长</span><span class="v">${a.leadHours} h</span></div>
            <div class="ar-field"><span class="k">模型置信度</span><span class="v">${a.confidence}%</span></div>
          </div>
          <div class="ar-note">特征：${a.feature} · 误报率 ${a.falseRate}%${a.handled ? " · 已复位" : ""}</div>
        </div>`;
      }).join("");
      const focus = el => {
        const id = el.dataset.focusDevice;
        if (id === this.engine.selected) { this.switchView("perception"); return; }
        this.selectDevice(id);
        this.switchView("perception");
        this.toast("info", `已按预警定位到 ${this.engine.current().def.name}（${id}）`);
      };
      wrap.querySelectorAll("[data-focus-device]").forEach(el => {
        el.addEventListener("click", () => focus(el));
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focus(el); } });
      });
    },

    renderHealthTable() {
      const wrap = document.getElementById("health-table");
      if (!wrap) return;
      wrap.innerHTML = `<table class="data">
        <thead><tr><th>设备</th><th>工况</th><th>健康分</th><th>RUL</th><th>劣化速率</th><th>状态</th></tr></thead>
        <tbody>${global.IOT.DEVICES.map(d => {
        const ch = this.engine.get(d.id);
        const st = global.IOT.STATES[ch.state];
        const h = ch.health();
        const rate = ch.degradeRate().toFixed(2);
        return `<tr data-focus-device="${d.id}" tabindex="0" title="点击切换到 ${d.name} 的监控视图"
            class="${d.id === this.engine.selected ? "row-active" : ""}">
            <td><b>${d.name}</b><br/><span class="mono" style="color:var(--txt-2);font-size:11px">${d.id}</span></td>
            <td><span class="pill pill-${st.level === 0 ? "ok" : st.level === 1 ? "warn" : "danger"}">${st.label}</span></td>
            <td><span class="mono" style="font-weight:700;color:${h >= 85 ? "var(--green)" : h >= 60 ? "var(--amber)" : "var(--red)"}">${h}</span>
              <span class="bar-track"><span class="bar-fill ${h >= 85 ? "ok" : h >= 60 ? "warn" : "danger"}" style="width:${h}%"></span></span></td>
            <td class="mono">${this.humanRul(ch.rul())}</td>
            <td class="mono">${rate} 分/天</td>
            <td>${h >= 85 ? "正常运行" : h >= 60 ? "加强监测" : "需停机检修"}</td>
          </tr>`;
      }).join("")}</tbody></table>`;
      const gotoDevice = id => {
        this.selectDevice(id);
        this.switchView("perception");
      };
      wrap.querySelectorAll("[data-focus-device]").forEach(tr => {
        tr.addEventListener("click", () => gotoDevice(tr.dataset.focusDevice));
        tr.addEventListener("keydown", e => { if (e.key === "Enter") gotoDevice(tr.dataset.focusDevice); });
      });
    },

    /* ---------------- 决策层 ---------------- */
    /** 预置历史工单：与预置历史预警对应，避免决策层首访空白 */
    seedHistoryOrders() {
      const mk = (id, device, deviceName, stateKey, agoH, partsIds, downtime, labor, conf) => {
        const st = global.IOT.STATES[stateKey];
        const t0 = Date.now() - agoH * 3600 * 1000;
        const parts = partsIds.map(pid => {
          const p = PARTS.find(x => x.id === pid);
          return p && Object.assign({}, p, { qty: p.name.includes("轴承") ? 2 : 1 });
        }).filter(Boolean);
        const partsCost = parts.reduce((s, p) => s + p.qty * (p.price || 0), 0);
        return {
          id, device, deviceName, title: deviceName + " " + st.label + " 检修",
          priority: st.level === 2 ? "high" : "mid", status: "closed",
          cause: st.desc,
          feature: st.freq ? st.freq + " 特征频率 + 谐波能量上升" : "全频段能量抬升",
          measure: FAULT_MEASURE[stateKey] || FAULT_MEASURE.degraded,
          parts, cost: { partsCost, labor, total: partsCost + labor, downtime },
          leadHours: 48, confidence: conf, createdAt: stamp(new Date(t0)), historical: true,
          timeline: WO_FLOW.map((s, i) =>
            ({ t: stamp(new Date(t0 + i * 2.5 * 3600 * 1000)), e: WO_FLOW_LABEL[s] })),
          hasInventoryRisk: false
        };
      };
      // 历史单沿用低位编号，新派工单仍自 WO-1001 起
      this.workOrders.push(
        mk("WO-0912", "AC-01", "螺杆空压机", "degraded", 74, ["SP-1006", "SP-1007"], 3.5, 1400, 91.6),
        mk("WO-0918", "PMP-01", "离心泵", "fault-bpfo", 30, ["SP-1003", "SP-1010"], 6, 2800, 94.2)
      );
    },

    createWorkOrder(alert) {
      const dup = this.workOrders.find(w =>
        w.device === alert.device && w.status !== "closed" && w.title === alert.deviceName + " " + alert.stateLabel + " 检修");
      if (dup) {
        dup.timeline.push({ t: U.clockStr(new Date()), e: "重复预警归并至当前工单" });
        return { wo: dup, duplicate: true };
      }
      const parts = recommendParts(alert.device, alert.state);
      const priority = alert.level === "critical" ? "high" : "mid";
      const cost = estimateCost(parts, priority);
      const wo = {
        id: "WO-" + (this.woSeq++),
        device: alert.device,
        deviceName: alert.deviceName,
        title: alert.deviceName + " " + alert.stateLabel + " 检修",
        priority: priority,
        status: "pending",
        cause: global.IOT.STATES[alert.state].desc,
        feature: alert.feature,
        measure: FAULT_MEASURE[alert.state] || FAULT_MEASURE.degraded,
        parts: parts,
        cost: cost,
        leadHours: alert.leadHours,
        confidence: alert.confidence,
        createdAt: U.clockStr(new Date()),
        timeline: [{ t: U.clockStr(new Date()), e: "系统自动生成工单（预警触发）" }],
        hasInventoryRisk: parts.some(p => p.stock < p.min)
      };
      this.workOrders.unshift(wo);
      this.woFilter = "open";                   // 新单落地后默认聚焦待办
      if (this.currentView !== "decision") return { wo };
      this.renderWorkOrders();
      this.updateDecisionMetrics();
      return { wo };
    },

    renderDecision() {
      this.renderWorkOrders();
      this.renderPartsTable();
      this.renderSupplyChain();
      this.updateDecisionMetrics();
      global.Charts.renderParts("chart-parts", PARTS);
    },

    updateDecision() {
      this.updateDecisionMetrics();
      this.renderPartsTable();
    },

    updateDecisionMetrics() {
      const counts = this.woCounts();
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("d-pending", counts.pending + counts.processing);
      set("d-done", counts.done + counts.closed);
      const total = counts.pending + counts.processing + counts.done + counts.closed;
      set("d-closerate", (total ? Math.round((counts.done + counts.closed) / total * 100) : 100) + "%");
      const low = PARTS.filter(p => p.stock < p.min).length;
      set("d-lowparts", low);
      const risk = PARTS.filter(p => p.stock < p.min * 1.4).length;
      set("d-chain", risk);
      global.Charts.renderWoPie("chart-wopie", counts);
    },

    woCounts() {
      const c = { pending: 0, processing: 0, done: 0, closed: 0 };
      this.workOrders.forEach(w => c[w.status]++);
      return c;
    },

    woFilter: "open",

    renderWoFilter() {
      const wrap = document.getElementById("wo-filter");
      if (!wrap) return;
      const c = this.woCounts();
      const defs = [
        ["open", "待办", c.pending + c.processing],
        ["done", "已完成", c.done],
        ["closed", "已闭环", c.closed],
        ["all", "全部", this.workOrders.length]
      ];
      wrap.innerHTML = defs.map(([k, label, n]) =>
        `<button data-wo-filter="${k}" class="${this.woFilter === k ? "active" : ""}" aria-pressed="${this.woFilter === k}">${label} <b>${n}</b></button>`
      ).join("");
      wrap.querySelectorAll("[data-wo-filter]").forEach(b => b.addEventListener("click", () => {
        this.woFilter = b.dataset.woFilter;
        this.renderWorkOrders();
      }));
    },

    woVisible() {
      const f = this.woFilter;
      if (f === "all") return this.workOrders;
      if (f === "open") return this.workOrders.filter(w => w.status === "pending" || w.status === "processing");
      if (f === "done") return this.workOrders.filter(w => w.status === "done");
      return this.workOrders.filter(w => w.status === "closed");
    },

    renderWorkOrders() {
      const wrap = document.getElementById("wo-list");
      if (!wrap) return;
      // 默认聚焦待办，但无待办可看时自动回落到「全部」，避免首访面对空列表
      if (this.woFilter === "open" && !this.woVisible().length && this.workOrders.length) this.woFilter = "all";
      this.renderWoFilter();
      const list = this.woVisible();
      if (!list.length) {
        const other = this.workOrders.length - list.length;
        wrap.innerHTML = `<div class="empty">${svgEmpty()}${this.woFilter === "open" && !this.workOrders.length
          ? `当前无派工单<br/><button class="btn btn-sm btn-primary" data-act="demo-wo">模拟异常触发工单</button>`
          : `「${{ open: "待办", done: "已完成", closed: "已闭环", all: "全部" }[this.woFilter]}」分类下暂无工单${other ? `<br/><button class="btn btn-sm btn-ghost" data-act="wo-all">查看全部 ${this.workOrders.length} 条</button>` : ""}`}</div>`;
        const a = wrap.querySelector("[data-act]");
        if (a) a.addEventListener("click", () => {
          if (a.dataset.act === "demo-wo") this.simulateFaultWO();
          else { this.woFilter = "all"; this.renderWorkOrders(); }
        });
        return;
      }
      wrap.innerHTML = list.map(w => {
        const idx = WO_FLOW.indexOf(w.status);
        const flow = WO_FLOW.map((f, i) =>
          `<span class="flow-step ${i < idx ? "done" : i === idx ? "now" : ""}">${WO_FLOW_LABEL[f]}</span>`
        ).join('<span class="flow-arrow">→</span>');
        const partsHtml = w.parts.length
          ? w.parts.map(p => {
            const live = PARTS.find(x => x.id === p.id) || p;
            const low = live.stock < live.min;
            return `<span class="pill ${low ? "pill-danger" : "pill-muted"}" style="font-size:10.5px"
              title="${p.name} · 库存 ${live.stock}${p.unit} / 安全 ${p.min}${p.unit} · ${p.supplier} · 交期 ${p.lead} 天">${p.name} ×${p.qty}${low ? " · 告急" : ""}</span>`;
          }).join(" ")
          : `<span class="pill pill-muted" style="font-size:10.5px">无需备件</span>`;
        const c = w.cost || { partsCost: 0, labor: 0, total: 0, downtime: 0 };
        const next = w.status === "pending" ? "受理派工" : w.status === "processing" ? "完成维修" : "确认闭环";
        return `<div class="wo-card pri-${w.priority}">
          <div class="wo-top">
            <span class="wo-id">${w.id}</span>
            <span class="wo-title">${w.title}</span>
            <span class="pill ${w.priority === "high" ? "pill-danger" : "pill-warn"}">${w.priority === "high" ? "高优先级" : "中优先级"}</span>
          </div>
          <div class="wo-meta">创建于 ${w.createdAt}${w.historical ? " · 历史记录" : ""} · 提前预警 ${w.leadHours}h${w.partsReserved ? " · <b class=\"ok\">备件已出库</b>" : ""}</div>
          <div class="wo-body">
            <div><b>故障特征：</b>${w.feature}</div>
            <div><b>可能原因：</b>${w.cause}</div>
            <div><b>处理措施：</b>${w.measure}</div>
            <div style="margin-top:7px"><b>推荐备件：</b>${partsHtml}</div>
            ${w.hasInventoryRisk ? `<div style="margin-top:6px;color:var(--amber)">⚠ 存在备件库存风险，已联动供应链加急采购</div>` : ""}
          </div>
          <div class="wo-cost">
            <div class="ci"><span class="k">维修成本估算（人工+备件）</span><span class="v">${yuan(c.total)}</span></div>
            <div class="ci hi"><span class="k">预计停机排修时长</span><span class="v">${c.downtime} 小时</span></div>
            <div class="ci"><span class="k">其中备件 ${yuan(c.partsCost)} · 人工 ${yuan(c.labor)}</span><span class="v" style="font-size:12px;color:var(--txt-1)">置信度 ${w.confidence}%</span></div>
          </div>
          <div class="wo-flow">${flow}</div>
          <div class="wo-actions">
            ${w.status !== "closed" ? `<button class="btn btn-sm btn-primary" data-wo-adv="${w.id}">${next}</button>` : ""}
            <button class="btn btn-sm btn-ghost" data-wo-view="${w.id}">查看详情</button>
            ${w.status === "closed" ? `<span class="pill pill-ok">已于 ${w.timeline[w.timeline.length - 1].t} 闭环</span>` : ""}
          </div>
        </div>`;
      }).join("");
      wrap.querySelectorAll("[data-wo-adv]").forEach(b => b.addEventListener("click", () => this.advanceWo(b.dataset.woAdv)));
      wrap.querySelectorAll("[data-wo-view]").forEach(b => b.addEventListener("click", () => this.openWoDrawer(b.dataset.woView)));
    },

    /** 受理派工时按工单清单实扣备件库存，形成 预警 → 工单 → 备件 闭环 */
    reserveParts(w) {
      const taken = [];
      w.parts.forEach(p => {
        const live = PARTS.find(x => x.id === p.id);
        if (!live || w.partsReserved) return;
        const n = Math.min(p.qty, live.stock);
        if (n > 0) { live.stock -= n; taken.push(`${live.name} −${n}${live.unit}（余 ${live.stock}）`); }
      });
      if (taken.length && !w.partsReserved) w.partsReserved = true;
      return taken;
    },

    advanceWo(id) {
      const w = this.workOrders.find(x => x.id === id);
      if (!w) return;
      const idx = WO_FLOW.indexOf(w.status);
      if (idx >= WO_FLOW.length - 1) return;
      const prev = WO_FLOW_LABEL[w.status];
      w.status = WO_FLOW[idx + 1];
      w.timeline.push({ t: U.clockStr(new Date()), e: WO_FLOW_LABEL[w.status] });
      let taken = [];
      if (w.status === "processing") taken = this.reserveParts(w);
      // 流转后若已不属于当前筛选分类，自动切到「全部」，避免卡片从眼前凭空消失
      const still = this.woVisible().some(x => x.id === w.id);
      if (!still) this.woFilter = "all";
      this.renderWorkOrders();
      this.updateDecisionMetrics();
      this.renderPartsTable();
      this.renderSupplyChain();
      global.Charts.renderParts("chart-parts", PARTS);
      if (!still) {
        const btn = document.querySelector(`[data-wo-view="${w.id}"]`);
        const card = btn && btn.closest(".wo-card");
        if (card) { card.classList.add("just-updated"); setTimeout(() => card.classList.remove("just-updated"), 1600); }
      }
      const last = w.status === "closed";
      this.toast(last ? "ok" : "info",
        `${w.id} ${prev} → ${WO_FLOW_LABEL[w.status]}${last ? " · 累计闭环 " + this.woCounts().closed + " 单" : ""}`);
      if (taken.length) {
        this.toast("warn", `已预占备件：${taken.join("，")}，库存低于安全线项 ${PARTS.filter(p => p.stock < p.min).length} 个`);
      }
    },

    openWoDrawer(id) {
      const w = this.workOrders.find(x => x.id === id);
      if (!w) return;
      const body = document.getElementById("drawer-body");
      const c = w.cost || { partsCost: 0, labor: 0, total: 0, downtime: 0 };
      document.getElementById("drawer-title").textContent = w.id + " · " + w.title;
      body.innerHTML = `
        <div class="grid g-2 mb">
          <div class="metric"><div class="metric-label">优先级</div><div class="metric-value" style="font-size:18px">${w.priority === "high" ? "高" : "中"}</div></div>
          <div class="metric"><div class="metric-label">当前状态</div><div class="metric-value" style="font-size:18px">${WO_FLOW_LABEL[w.status]}</div></div>
        </div>
        <div class="grid g-2 mb">
          <div class="metric is-amber"><div class="metric-label">维修成本估算（人工+备件）</div><div class="metric-value" style="font-size:22px">${yuan(c.total)}</div><div class="metric-foot">备件 ${yuan(c.partsCost)} · 人工 ${yuan(c.labor)}</div></div>
          <div class="metric is-violet"><div class="metric-label">预计停机排修时长</div><div class="metric-value" style="font-size:22px">${c.downtime}<small>小时</small></div><div class="metric-foot">含拆装、更换与复测</div></div>
        </div>
        <div class="field"><label>故障特征</label><div class="note">${w.feature}</div></div>
        <div class="field"><label>可能原因</label><div class="note">${w.cause}</div></div>
        <div class="field"><label>处理措施</label><div class="note">${w.measure}</div></div>
        <div class="field"><label>推荐备件清单</label>
          ${w.parts.map(p => {
          const live = PARTS.find(x => x.id === p.id) || p;
          return `<div class="note">· ${p.name}（${p.code}）× ${p.qty} · 单价 ${yuan(p.price)} · 库存 ${live.stock}${p.unit} / 安全 ${p.min}${p.unit} · ${p.supplier} · 交期 ${p.lead} 天${live.stock < live.min ? ` <b style="color:var(--red)">告急</b>` : ""}</div>`;
        }).join("") || "<div class='note'>—</div>"}
        </div>
        <div class="field"><label>流转记录</label>
          <div class="timeline">${w.timeline.map(t => `<div class="tl-item"><div class="tl-time">${t.t}</div><div class="tl-text">${t.e}</div></div>`).join("")}</div>
        </div>
        <div class="drawer-actions">
          ${w.status !== "closed" ? `<button class="btn btn-primary" data-drawer-adv="${w.id}">${w.status === "pending" ? "受理派工（并出库备件）" : w.status === "processing" ? "完成维修" : "确认闭环"}</button>` : `<span class="pill pill-ok">工单已闭环</span>`}
          <button class="btn" data-drawer-device="${w.device}">定位到该设备</button>
        </div>`;
      this.openDrawer();
      body.querySelectorAll("[data-drawer-adv]").forEach(b => b.addEventListener("click", () => {
        this.advanceWo(b.dataset.drawerAdv);
        this.openWoDrawer(b.dataset.drawerAdv);
      }));
      body.querySelectorAll("[data-drawer-device]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.drawerDevice;
        this.closeDrawer();
        this.selectDevice(id);
        this.switchView("perception");
      }));
    },

    renderPartsTable() {
      const wrap = document.getElementById("parts-table");
      if (!wrap) return;
      wrap.innerHTML = `<table class="data">
        <thead><tr><th>备件名称</th><th>库存</th><th>预计可用</th><th>状态</th></tr></thead>
        <tbody>${PARTS.map(p => {
        const ratio = p.stock / p.min;
        const st = ratio < 1 ? ["告急", "danger"] : ratio < 1.4 ? ["偏低", "warn"] : ["充足", "ok"];
        const days = availableDays(p);
        const dayCls = days < 30 ? "color:var(--red)" : days < 90 ? "color:var(--amber)" : "color:var(--txt-1)";
        return `<tr>
            <td><b>${p.name}</b></td>
            <td class="mono">${p.stock} ${p.unit}</td>
            <td class="mono" style="${dayCls}">${days >= 999 ? "—" : days + " 天"}</td>
            <td><span class="pill pill-${st[1]}">${st[0]}</span></td>
          </tr>`;
      }).join("")}</tbody></table>`;
    },

    renderSupplyChain() {
      const wrap = document.getElementById("supply-chain");
      if (!wrap) return;
      const risky = PARTS.filter(p => p.stock < p.min * 1.4);
      wrap.innerHTML = risky.map(p => {
        const crit = p.stock < p.min;
        return `<div class="tl-item ${crit ? "danger" : "warn"}">
          <div class="tl-time">${p.code} · ${p.supplier}</div>
          <div class="tl-text">${p.name} ${crit ? "库存低于安全线，已触发加急采购" : "库存偏低，建议补货"}</div>
          <div class="tl-text tl-sub">当前 ${p.stock}${p.unit} / 安全 ${p.min}${p.unit} · 标准交期 ${p.lead} 天 · ETA ${crit ? Math.max(1, Math.round(p.lead * 0.6)) : p.lead} 天</div>
        </div>`;
      }).join("") || `<div class="empty">供应链状态正常，无预警项</div>`;
    },

    simulateFaultWO() {
      const ch = this.engine.current();
      if (ch.state === "normal") {
        this.engine.setState(this.engine.selected, "fault-bpfi");
        this.buildStateSelector();
        this.updateStateBanner();
      }
      const alert = this.engine.get(this.engine.selected).alert();
      const res = alert ? this.createWorkOrder(alert) : null;
      this.woFilter = "open";
      this.switchView("decision");
      if (res && alert) {
        this.toast(res.duplicate ? "info" : "warn", res.duplicate
          ? `${res.wo.id} 已在流转中，已跳到该工单`
          : `已按「${alert.stateLabel}」生成示范工单 ${res.wo.id}`);
      }
    },

    /* ---------------- 知识层 ---------------- */
    buildKB() {
      const wrap = document.getElementById("kb-list");
      const tags = document.getElementById("kb-tags");
      if (!wrap || !tags) return;
      const cats = ["全部", ...global.KB.categories];
      tags.innerHTML = cats.map(c =>
        `<button class="kb-tag ${c === this.kbCat ? "active" : ""}" data-cat="${c}" aria-pressed="${c === this.kbCat}">${c}</button>`
      ).join("");
      tags.querySelectorAll(".kb-tag").forEach(b => b.addEventListener("click", () => {
        this.kbCat = b.dataset.cat;
        this.renderKBTags();
        this.renderKBList(this.kbCat);
      }));
      this.renderKBList(this.kbCat);
    },

    renderKBTags() {
      const tags = document.getElementById("kb-tags");
      if (!tags) return;
      tags.querySelectorAll(".kb-tag").forEach(x => {
        const on = x.dataset.cat === this.kbCat;
        x.classList.toggle("active", on);
        x.setAttribute("aria-pressed", String(on));
      });
    },

    bindKBList(wrap) {
      wrap.querySelectorAll("[data-kb]").forEach(el => {
        const pick = () => {
          wrap.querySelectorAll(".kb-item").forEach(x => x.classList.toggle("picked", x === el));
          this.pushAi(this.kbAnswer(global.KB.byId(el.dataset.kb)));
        };
        el.addEventListener("click", pick);
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
    },

    renderKBList(cat) {
      const wrap = document.getElementById("kb-list");
      if (!wrap) return;
      this.kbCat = cat;
      const list = cat === "全部" ? global.KB.entries : global.KB.byCategory(cat);
      wrap.innerHTML = list.map(e => `
        <div class="kb-item" data-kb="${e.id}" role="button" tabindex="0" title="${escapeHtml(e.summary).replace(/"/g, "'")} · 点击查看完整处置流程">
          <div class="t">${e.title}</div>
          <div class="d">${e.summary}</div>
          <div class="tags"><span>${e.cat}</span><span>风险：${e.severity}</span>${e.tags.slice(0, 3).map(t => `<span>${t}</span>`).join("")}</div>
        </div>`).join("");
      this.bindKBList(wrap);
    },

    renderKnowledge() {
      this.renderKBList(this.kbCat);
      this.renderKBTags();
      this.markChatUnread(false);
    },

    buildChat() {
      const form = document.getElementById("chat-form");
      const input = document.getElementById("chat-input");
      if (form) form.addEventListener("submit", e => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        input.value = "";
        this.askQuestion(q);
      });
      const clear = document.getElementById("btn-chat-clear");
      if (clear) clear.addEventListener("click", () => {
        const log = document.getElementById("chat-log");
        if (!log) return;
        log.innerHTML = "";
        this.pushAi(this.greeting());
        this.toast("info", "对话记录已清空");
      });
      // 事件委托：覆盖静态快捷胶囊与动态联想气泡（均带 data-ask）
      document.addEventListener("click", e => {
        const btn = e.target.closest("[data-ask]");
        if (!btn) return;
        const q = btn.dataset.ask;
        const el = document.getElementById("chat-input");
        if (el) { el.value = q; el.focus(); }
        this.askQuestion(q);
        if (el) el.value = "";
      });
    },

    askQuestion(q) {
      this.pushUser(q);
      const intent = global.KB.detectIntent(q);
      this.pushAi(this.answerQuestion(q));
      const rel = this.relatedFor(intent);
      if (rel.length) this.pushRelated(rel);
    },

    trimChat() {
      const log = document.getElementById("chat-log");
      if (!log) return;
      const MAX = 60;
      while (log.children.length > MAX) log.removeChild(log.firstChild);
    },

    pushRelated(list) {
      const log = document.getElementById("chat-log");
      if (!log) return;
      const div = document.createElement("div");
      div.className = "msg ai";
      div.innerHTML = `<div class="avatar">AI</div><div class="bubble bubble-rel">
        <div class="rel-title">智能联想 · 你可能还想了解</div>
        <div class="quick-ask">${list.map(q => `<button data-ask="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("")}</div>
      </div>`;
      log.appendChild(div);
      this.scrollChat(log);
    },

    relatedFor(intent) {
      const M = {
        diagnose: ["设备综合健康分是如何计算的？", "当前健康最差设备是谁？", "有哪些备件库存告急？"],
        cwru: ["轴承温度过高排查SOP", "剩余寿命如何预测？", "当前预警准确率和误报率多少？"],
        score: ["NASA CWRU 轴承故障特征如何判断？", "当前健康最差设备是谁？", "空压机排气温度报警怎么处理？"],
        worst: ["设备综合健康分是如何计算的？", "有哪些备件库存告急？", "离心泵振动超标诊断"],
        rul: ["设备综合健康分是如何计算的？", "有哪些备件库存告急？", "当前健康最差设备是谁？"],
        health: ["设备综合健康分是如何计算的？", "剩余寿命如何预测？", "当前健康最差设备是谁？"],
        parts: ["当前健康最差设备是谁？", "空压机排气温度报警怎么处理？", "轴承温度过高排查SOP"],
        alert: ["NASA CWRU 轴承故障特征如何判断？", "当前健康最差设备是谁？", "离心泵振动超标诊断"],
        workorder: ["有哪些备件库存告急？", "当前健康最差设备是谁？", "离心泵振动超标诊断"]
      };
      return M[intent] || M.diagnose;
    },

    scrollChat(log) {
      this.trimChat();
      log.scrollTop = log.scrollHeight;
      if (this.currentView !== "knowledge") this.markChatUnread(true);
    },

    markChatUnread(on) {
      const nav = document.querySelector('.nav-item[data-view="knowledge"]');
      if (!nav) return;
      nav.classList.toggle("has-new", on);
    },

    pushUser(text) {
      const log = document.getElementById("chat-log");
      if (!log) return;
      const div = document.createElement("div");
      div.className = "msg user";
      div.innerHTML = `<div class="avatar">我</div><div class="bubble">${escapeHtml(text)}</div>`;
      log.appendChild(div);
      this.scrollChat(log);
    },

    pushAi(html) {
      const log = document.getElementById("chat-log");
      if (!log) return;
      const div = document.createElement("div");
      div.className = "msg ai";
      div.innerHTML = `<div class="avatar">AI</div><div class="bubble">${html}</div>`;
      log.appendChild(div);
      this.scrollChat(log);
    },

    greeting() {
      const real = global.CWRU && global.CWRU.ready()
        ? `并已接入 <b>${global.CWRU.samples().length} 只</b> NASA CWRU 真实轴承波形（特征频率与分类指标由页面现场解调实测）。`
        : "";
      return `<div class="ans-title">设备智能运维助手已就绪</div>
        我已接入 <b>3 台</b>关键设备（数控机床 / 空压机 / 离心泵）的振动、温度、电流实时数据与 <b>${global.KB.entries.length} 条</b>维修知识条目${real}<br/>
        你可以直接提问，例如：<br/>
        · 轴承温度过高怎么排查？<br/>
        · PMP-01 的剩余寿命还有多久？<br/>
        · NASA CWRU 轴承故障特征如何判断？<br/>
        · 当前预警准确率和误报率多少？`;
    },

    proactiveAnalysis(ch) {
      const st = global.IOT.STATES[ch.state];
      const alert = ch.alert();
      if (!alert) return `<div class="ans-title">${ch.def.name} 已恢复健康工况</div>健康指数 <b>${ch.health()}</b>，各维度指标回归基线。`;
      const kb = global.KB.search(ch.def.name + " " + st.label, 1)[0];
      return `<div class="ans-title">检测到 ${ch.def.name} 进入「${st.label}」</div>
        <div class="kv"><span class="k">特征：</span>${alert.feature}</div>
        <div class="kv"><span class="k">预警：</span>提前 <b>${alert.leadHours}h</b>，置信度 <b>${alert.confidence}%</b>，误报率 <b>${alert.falseRate}%</b></div>
        <div class="kv"><span class="k">建议：</span>${alert.desc}</div>
        ${kb ? `<div class="kv"><span class="k">关联知识：</span><b>${kb.title}</b>（可在知识库查看完整排查流程）</div>` : ""}
        <div class="kv"><span class="k">下一步：</span>已自动生成检修工单并联动备件库存，前往「决策层」跟进闭环。</div>`;
    },

    kbAnswer(e) {
      if (!e) return "未找到相关知识条目。";
      return `<div class="ans-title">${e.title}</div>
        <div class="kv"><span class="k">知识编号：</span><code>${e.id}</code> · 风险等级 <b>${e.severity}</b> · 分类 ${e.cat}</div>
        <div class="kv"><span class="k">概述：</span>${e.summary}</div>
        <b>典型征兆</b>
        <ul>${e.symptoms.map(s => `<li>${s}</li>`).join("")}</ul>
        <b>可能原因</b>
        <ul>${e.causes.map(s => `<li>${s}</li>`).join("")}</ul>
        <b>排查与处置步骤</b>
        <ol>${e.steps.map(s => `<li>${s}</li>`).join("")}</ol>
        <div class="kv"><span class="k">推荐备件：</span>${e.parts.join("、") || "—"}</div>
        <div class="kv"><span class="k">参考标准：</span><code>${e.reference}</code></div>`;
    },

    answerQuestion(q) {
      const intent = global.KB.detectIntent(q);
      const devId = global.KB.detectDevice(q);
      const dev = devId ? this.engine.get(devId) : null;

      if (intent === "worst") {
        const ranked = global.IOT.DEVICES
          .map(d => ({ d, ch: this.engine.get(d.id) }))
          .sort((a, b) => a.ch.health() - b.ch.health());
        const worst = ranked[0];
        const wst = global.IOT.STATES[worst.ch.state];
        return `<div class="ans-title">全厂设备健康排名（由差到优）</div>
          <ol>${ranked.map(x => {
            const st = global.IOT.STATES[x.ch.state];
            return `<li><b>${x.d.name}（${x.d.id}）</b>：健康分 <b style="color:${x.ch.health() >= 85 ? "var(--green)" : x.ch.health() >= 60 ? "var(--amber)" : "var(--red)"}">${x.ch.health()}</b> · ${st.label} · RUL ${this.humanRul(x.ch.rul())}</li>`;
          }).join("")}</ol>
          <div class="kv"><span class="k">结论：</span>当前健康最差设备为 <b>${worst.d.name}（${worst.d.id}）</b>，健康分 <b>${worst.ch.health()}</b>，工况「${wst.label}」，预计剩余寿命 <b>${this.humanRul(worst.ch.rul())}</b>。</div>
          <div class="kv"><span class="k">建议：</span>${worst.ch.health() < 60 ? "立即生成高优先级工单，锁定停机窗口并预占备件。" : "纳入近期检修计划，缩短点检周期至 3 天。"}</div>`;
      }

      if (intent === "cwru") {
        const meta = global.Datasets.META.cwru;
        const real = global.CWRU && global.CWRU.ready();
        if (real) {
          const list = global.CWRU.samples();
          const rows = list.map(s => {
            const a = global.CWRU.analyze(s.id);
            const hit = a.dominant;
            return `<li><b>${s.id}.mat</b>（目录真值 ${global.Datasets.ELEMENT_LABEL[s.catalog.element]}${s.catalog.diameter ? " " + s.catalog.diameter + "″" : ""} / ${s.catalog.hp}HP / ${s.rpmTheory} rpm，${s.fs / 1000}k）→ 实测判定 <b>${hit ? hit.code : "NORMAL"}</b>${hit ? `，实测 ${hit.measured.toFixed(1)} Hz，偏差 ${hit.dev >= 0 ? "+" : ""}${hit.dev.toFixed(2)}%，SNR ${hit.snr.toFixed(1)}` : ""} → ${s.agree === null ? "异型号不计入" : (s.agree ? "一致 ✓" : "不一致 ✗")}</li>`;
          }).join("");
          const cv = global.CWRU.validate();
          const agree = list.filter(s => s.agree !== null && s.comparable !== false);
          return `<div class="ans-title">NASA CWRU 真实波形 · 特征频率实测结果</div>
            <div class="kv"><span class="k">数据源：</span>${meta.name}（${meta.source}）· ${meta.sampling}</div>
            <div class="kv"><span class="k">理论模型：</span>${meta.bearing}</div>
            <b>逐样本实测（包络解调，${list.length} 只 .mat 原始驱动端加速度）</b>
            <ol>${rows}</ol>
            <div class="kv"><span class="k">判定规则：</span>|实测 − 理论| ≤ ${global.DSP.RULE.devTol}% 且包络信噪比 ≥ ${global.DSP.RULE.snrTol}；理论侧用官方目录标称转速，实测侧由页面 JS 现场解调，两侧互不依赖。</div>
            <div class="kv"><span class="k">元素判定一致率：</span><b>${agree.filter(s => s.agree).length} / ${agree.length}</b></div>
            <div class="kv"><span class="k">留一法分类：</span>按样本文件（LOSO，申报口径）<b>${(cv.bySample.accuracy * 100).toFixed(1)}%</b>（${cv.bySample.correct}/${cv.bySample.n} 段窗口 · ${cv.bySample.files} 只文件），宏平均 F1 <b>${cv.bySample.macroF1.toFixed(3)}</b>；按窗口留一（LOO）${(cv.byWindow.accuracy * 100).toFixed(1)}% 仅作对照 —— 同一只文件切出的窗口高度相关，按窗口留一会虚高。</div>
            ${cv.bySample.degenerate.length ? `<div class="kv"><span class="k">参照不足：</span>${cv.bySample.degenerate.map(L => global.Datasets.ELEMENT_LABEL[L] || L).join("、")} 类可用文件不足 2 只，已从 LOSO 中剔除。</div>` : ""}
            <div class="kv"><span class="k">弱项说明：</span>滚珠故障（B007）包络信噪比低于门限、部分窗口判入相邻类；0.028″ 组为另一型号轴承，6205 系数不适用，已剔除 —— 均如实标注，未做粉饰。</div>
            <div class="kv"><span class="k">溯源：</span>每只样本记录 .mat 文件名、字节数与 SHA-256，见「感知层 → 基准数据集验证 → 实测」。</div>`;
        }
        const speed = 1797, rot = speed / 60;
        const rows = global.Datasets.theory(speed);
        return `<div class="ans-title">NASA CWRU 轴承故障特征频率判定</div>
          <div class="kv"><span class="k">数据源：</span>${meta.name}（${meta.source}）</div>
          <div class="kv"><span class="k">基准转速：</span>${speed} rpm，转频 f<sub>r</sub> = <b>${rot.toFixed(2)} Hz</b></div>
          <b>特征频率理论模型</b>
          <ul>${rows.map(r => `<li>${r.code}（${r.name}）= ${r.factor.toFixed(4)} × f<sub>r</sub> = <b>${r.hz.toFixed(1)} Hz</b></li>`).join("")}</ul>
          <div class="kv"><span class="k">判定方法：</span>对振动信号做带通 + Hilbert 包络解调，提取特征频率峰值，与理论值偏差 ≤ 2% 且信噪比 ≥ 8 判定为有效识别。</div>
          <div class="kv"><span class="k">当前状态：</span>真实波形尚未载入（assets/data/cwru.bin 缺失），以上为理论模型。</div>`;
      }

      if (intent === "score") {
        const ch = dev || this.engine.current();
        const m = ch.metrics();
        const h = m.reduce((s, x) => s + x.weight * x.score, 0);
        return `<div class="ans-title">设备综合健康分计算模型</div>
          <div class="kv"><span class="k">评分公式：</span><code>H = Σ ( wᵢ × Sᵢ )</code>，${ch.def.name} 当前 H = <b>${h.toFixed(1)}</b> 分</div>
          <b>五维量化评分依据（权重 / 实时子分数）</b>
          <ul>${m.map(x => `<li><b>${x.label}</b>（权重 ${(x.weight * 100)}%）：子分数 <b>${Math.round(x.score)}</b> · ${x.basis}</li>`).join("")}</ul>
          <b>计算公式</b>
          <ol>${m.map(x => `<li><code>${x.formula}</code></li>`).join("")}</ol>
          <div class="kv"><span class="k">判断阈值：</span>H ≥ 85 正常运行 · 60 ≤ H &lt; 85 亚健康（加强监测） · H &lt; 60 需停机检修</div>
          <div class="kv"><span class="k">说明：</span>点击「推理层 → 健康指数卡片」的「查看评分依据」可展开完整明细与实时子分数。</div>`;
      }

      if (intent === "rul") {
        if (!dev) {
          return `<div class="ans-title">剩余寿命（RUL）预测汇总</div>` +
            global.IOT.DEVICES.map(d => {
              const ch = this.engine.get(d.id);
              return `<div class="kv"><span class="k">${d.name}（${d.id}）：</span>RUL <b>${this.humanRul(ch.rul())}</b>，健康分 <b>${ch.health()}</b>，工况 ${global.IOT.STATES[ch.state].label}</div>`;
            }).join("") +
            `<div class="kv"><span class="k">说明：</span>RUL 基于振动/温度/电流劣化趋势与历史失效样本推演，按 24h 步长滚动更新。</div>`;
        }
        return `<div class="ans-title">${dev.def.name}（${dev.def.id}）剩余寿命预测</div>
          <div class="kv"><span class="k">预计可运行：</span><b>${this.humanRul(dev.rul())}</b></div>
          <div class="kv"><span class="k">健康指数：</span><b>${dev.health()}</b> 分（0-100）</div>
          <div class="kv"><span class="k">劣化速率：</span>${dev.degradeRate().toFixed(2)} 分/天（${global.IOT.STATES[dev.state].level === 0 ? "平稳" : global.IOT.STATES[dev.state].level === 1 ? "缓慢劣化" : "快速劣化"}）</div>
          <div class="kv"><span class="k">建议：</span>${dev.rul() < 72 ? "立即生成高优先级工单，备件预占并安排停机窗口。" : dev.rul() < 300 ? "纳入近期检修计划，缩短点检周期至 3 天。" : "按计划维护即可，持续跟踪趋势。"}</div>`;
      }

      if (intent === "health") {
        const ch = dev || this.engine.current();
        const weakest = ch.radar().sort((a, b) => a.value - b.value)[0];
        return `<div class="ans-title">${ch.def.name} 健康评估</div>
          <div class="kv"><span class="k">健康指数：</span><b>${ch.health()}</b> / 100 · 工况 ${global.IOT.STATES[ch.state].label}</div>
          <b>五维评估</b>
          <ul>${ch.radar().map(r => `<li>${r.name}：<b>${r.value}</b>${r === weakest ? "（薄弱项）" : ""}</li>`).join("")}</ul>
          <div class="kv"><span class="k">薄弱环节：</span><b>${weakest.name}</b>，建议优先排查。</div>`;
      }

      if (intent === "parts") {
        const list = dev ? PARTS.filter(p => p.devices.includes(dev.def.id)) : PARTS.filter(p => p.stock < p.min);
        return `<div class="ans-title">${dev ? dev.def.name + " 相关备件" : "库存告急备件"}</div>` +
          list.map(p => `<div class="kv"><span class="k">${p.name}（${p.code}）：</span>库存 <b>${p.stock}${p.unit}</b> / 安全 ${p.min}${p.unit} · ${p.supplier} · 交期 ${p.lead} 天 · ${p.stock < p.min ? "<b style='color:var(--red)'>告急</b>" : "充足"}</div>`).join("");
      }

      if (intent === "workorder") {
        const counts = this.woCounts();
        return `<div class="ans-title">工单与闭环状态</div>
          <div class="kv"><span class="k">待处理：</span><b>${counts.pending}</b> · 处理中 <b>${counts.processing}</b> · 已完成 <b>${counts.done}</b> · 已闭环 <b>${counts.closed}</b></div>
          ${this.workOrders.slice(0, 3).map(w => `<div class="kv"><span class="k">${w.id}：</span>${w.title} → ${WO_FLOW_LABEL[w.status]}</div>`).join("") || "<div class='kv'>当前无工单，可在决策层模拟异常触发。</div>"}`;
      }

      if (intent === "alert") {
        const o = this.engine.overview();
        const cv = global.CWRU && global.CWRU.ready() ? global.CWRU.validate() : null;
        return `<div class="ans-title">预警机制与指标口径</div>
          <div class="kv"><span class="k">预警窗口：</span>提前 <b>24~72 小时</b>（劣化态 48~72h，故障态 24~36h）</div>
          <div class="kv"><span class="k">赛题方向性指标：</span>准确率 ≥ 85% · 提前 ≥ 24 小时 · 误报率 ≤ 10%（官方表头为「建议目标值」，非硬性门槛）</div>
          ${cv ? `<div class="kv"><span class="k">公开数据集实测：</span>NASA CWRU ${cv.bySample.files} 只真实 .mat / ${cv.bySample.n} 段窗口，按样本留一（LOSO）准确率 <b>${(cv.bySample.accuracy * 100).toFixed(1)}%</b>，宏平均 F1 <b>${cv.bySample.macroF1.toFixed(3)}</b>；按窗口留一 ${(cv.byWindow.accuracy * 100).toFixed(1)}% 偏乐观，仅作对照</div>` : ""}
          <div class="kv"><span class="k">在线仿真运行值：</span>准确率 <b>${o.accuracy}%</b> · 误报率 <b>${o.falseRate}%</b> · 当前告警 <b>${o.alertCount}</b> 条
            <span style="color:var(--txt-2)">（SimEngine 运行态指标，随工况浮动，与上行的真实数据集测量分列，不互相替代）</span></div>
          <div class="kv"><span class="k">误报率为何不用真实数据：</span>需轴承全寿命失效记录与真实失效时刻，公开 CWRU 样本为稳态故障快照，不具备该条件。</div>`;
      }

      // 诊断类
      const hits = global.KB.search(q, 2);
      if (hits.length) {
        const main = hits[0];
        return `<div class="ans-title">诊断方案：${main.title}</div>
          <div class="kv"><span class="k">匹配依据：</span>命中知识条目 <code>${main.id}</code>（${main.cat}），相关度 ${main.score}</div>
          <div class="kv"><span class="k">故障概述：</span>${main.summary}</div>
          <b>可能原因</b>
          <ul>${main.causes.map(s => `<li>${s}</li>`).join("")}</ul>
          <b>排查步骤</b>
          <ol>${main.steps.map(s => `<li>${s}</li>`).join("")}</ol>
          <div class="kv"><span class="k">推荐备件：</span>${main.parts.join("、") || "—"}</div>
          <div class="kv"><span class="k">参考标准：</span><code>${main.reference}</code></div>
          ${dev ? `<div class="kv"><span class="k">设备上下文：</span>${dev.def.name}（${dev.def.id}）当前健康分 <b>${dev.health()}</b>，工况 ${global.IOT.STATES[dev.state].label}，RUL <b>${this.humanRul(dev.rul())}</b>。</div>` : ""}
          ${hits[1] ? `<div class="kv" style="color:var(--txt-2)"><span class="k">相关：</span>${hits[1].title}</div>` : ""}`;
      }

      return `未在知识库中匹配到「${escapeHtml(q)}」对应条目。<br/>可尝试关键词：<code>轴承内圈故障</code>、<code>轴承温度过高</code>、<code>振动频谱</code>、<code>空压机排气温度</code>、<code>离心泵汽蚀</code>、<code>备件库存</code>、<code>剩余寿命</code>。`;
    },

    /* ---------------- 通用模态框 ---------------- */
    openModal(title, html) {
      const t = document.getElementById("modal-title");
      const b = document.getElementById("modal-body");
      if (t) t.innerHTML = title;
      if (b) b.innerHTML = html;
      document.getElementById("modal-mask")?.classList.add("open");
      document.getElementById("modal")?.classList.add("open");
      this.lastFocus = document.activeElement;
      const close = document.getElementById("modal-close");
      if (close) setTimeout(() => close.focus(), 30);
    },
    closeModal() {
      document.getElementById("modal-mask")?.classList.remove("open");
      const m = document.getElementById("modal");
      const was = m?.classList.contains("open");
      m?.classList.remove("open");
      if (was && this.lastFocus) this.lastFocus.focus();
    },

    /* ---------------- 健康指数评分依据与计算公式 ---------------- */
    openScoreModal() {
      const ch = this.engine.current();
      const m = ch.metrics();
      const h = m.reduce((s, x) => s + x.weight * x.score, 0);
      const grades = m.map(x => `${x.weight.toFixed(2)}×${Math.round(x.score)}`).join(" + ");
      const cls = v => v >= 85 ? "ok" : v >= 60 ? "warn" : "danger";
      const col = v => v >= 85 ? "var(--green)" : v >= 60 ? "var(--amber)" : "var(--red)";
      const html = `
        <div class="score-formula">
          <div class="sf-title">综合健康指数评分公式</div>
          <div class="sf-eq mono">H = Σ ( w<sub>i</sub> × S<sub>i</sub> ) = ${grades} = <b>${h.toFixed(1)}</b> 分</div>
          <div class="note">其中 w<sub>i</sub> 为维度权重（Σw<sub>i</sub> = 1），S<sub>i</sub> 为该维度实时子分数（0~100）。<br/>
          评分阈值依据：H ≥ 85 正常运行 · 60 ≤ H &lt; 85 亚健康（加强监测） · H &lt; 60 需停机检修。</div>
        </div>
        ${m.map(x => `
          <div class="score-item">
            <div class="si-head">
              <span class="si-name">${x.label} <em>${x.en}</em></span>
              <span class="pill pill-info" style="font-size:10.5px">权重 ${(x.weight * 100)}%</span>
              <div class="spacer" style="flex:1"></div>
              <span class="si-score" style="color:${col(x.score)}">${Math.round(x.score)}<small>分</small></span>
            </div>
            <div class="bar-track" style="width:100%;height:7px"><div class="bar-fill ${cls(x.score)}" style="width:${Math.min(100, x.score)}%"></div></div>
            <div class="si-basis"><b>评分依据：</b>${x.basis}</div>
            <div class="si-formula"><code>${x.formula}</code></div>
            <div class="si-threshold"><b>判断阈值：</b>${x.threshold}</div>
          </div>`).join("")}`;
      this.openModal(`${ch.def.name} <span style="color:var(--txt-2);font-size:12px">${ch.def.id}</span> · 综合健康指数 <b style="color:var(--cyan)">${ch.health()}</b>`, html);
    },

    /* ---------------- 一键导出工业维护分析与工单报表 ---------------- */
    exportReport() {
      const html = this.buildReportHtml();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url; a.download = "PredictOps-工业维护分析与工单报表.html";
        document.body.appendChild(a); a.click(); a.remove();
        this.toast("warn", "浏览器拦截了新窗口，已改为下载报表文件");
      } else {
        this.toast("ok", "维护分析报表已生成，可打印或另存为 PDF");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },

    buildReportHtml() {
      const now = new Date();
      const ts = now.toLocaleString("zh-CN");
      const ds = global.Datasets.META.cwru;
      const devRows = global.IOT.DEVICES.map(d => {
        const ch = this.engine.get(d.id);
        const st = global.IOT.STATES[ch.state];
        return `<tr><td>${d.name}<br><small>${d.id}</small></td><td>${d.model}</td><td>${st.label}</td>
          <td>${ch.health()}</td><td>${this.humanRul(ch.rul())}</td><td>${ch.degradeRate().toFixed(2)} 分/天</td></tr>`;
      }).join("");
      const al = this.engine.alertLog[0];
      const woList = this.workOrders.length ? this.workOrders.map(w => {
        const c = w.cost || {};
        return `<div class="card">
          <h4>${w.id} · ${w.title} <span class="tag">${WO_FLOW_LABEL[w.status]}</span></h4>
          <p><b>故障特征：</b>${w.feature}</p>
          <p><b>可能原因：</b>${w.cause}</p>
          <p><b>处理措施（SOP）：</b>${w.measure}</p>
          <p><b>推荐备件：</b>${w.parts.map(p => `${p.name} ×${p.qty}（库存 ${p.stock}${p.unit} / 安全 ${p.min}${p.unit} / ${p.supplier} / 交期 ${p.lead}天 / 单价 ¥${p.price}）`).join("；") || "无"}</p>
          <p><b>维修成本估算：</b>备件 ¥${c.partsCost || 0} + 人工 ¥${c.labor || 0} = <b>¥${c.total || 0}</b> · <b>预计停机 ${c.downtime || 0} 小时</b> · 预警置信度 ${w.confidence}%</p>
        </div>`;
      }).join("") : "<p>当前无工单。</p>";
      const partsRows = PARTS.map(p => {
        const st = p.stock < p.min ? "告急" : p.stock < p.min * 1.4 ? "偏低" : "充足";
        const days = availableDays(p);
        return `<tr><td>${p.name}<br><small>${p.code}</small></td><td>${p.stock} ${p.unit}</td><td>${p.min} ${p.unit}</td>
          <td>${p.rate} ${p.unit}/月</td><td>${days >= 999 ? "—" : days + " 天"}</td><td>${p.supplier}</td><td>${p.lead} 天</td><td>${st}</td></tr>`;
      }).join("");
      const theo = (global.CWRU && global.CWRU.ready())
        ? global.CWRU.samples().map(s => {
          const a = global.CWRU.analyze(s.id);
          const hit = a.dominant;
          return `<tr><td>${s.id}.mat<br><small>${s.fs / 1000}k · ${s.sampleCount.toLocaleString()} 点</small></td>
            <td>${global.Datasets.ELEMENT_LABEL[s.catalog.element]}${s.catalog.diameter ? " " + s.catalog.diameter + "″" : ""} / ${s.catalog.hp}HP</td>
            <td class="mono">${s.rpmTheory} rpm</td>
            <td><b>${hit ? hit.code : "NORMAL"}</b></td>
            <td class="mono">${hit ? hit.theory.toFixed(1) + " Hz" : "—"}</td>
            <td class="mono">${hit ? hit.measured.toFixed(1) + " Hz" : "—"}</td>
            <td class="mono">${hit ? (hit.dev >= 0 ? "+" : "") + hit.dev.toFixed(2) + "%" : "—"}</td>
            <td>${s.agree === null ? "异型号不计入" : (s.agree ? "一致" : "不一致")}</td>
            <td><small>${s.sha256.slice(0, 16)}…</small></td></tr>`;
        }).join("")
        : `<tr><td colspan="9">真实波形未载入（assets/data/cwru.bin 缺失），本节仅保留理论系数模型：${global.Datasets.theory(1797).map(r => r.code + "=" + r.hz.toFixed(1) + "Hz").join("，")}。</td></tr>`;
      const looRep = (global.CWRU && global.CWRU.ready()) ? global.CWRU.leaveOneOut() : null;

      return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>PredictOps 工业维护分析与工单报表</title>
<style>
  *{box-sizing:border-box} body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#1a1a1a;margin:0;padding:32px;background:#fff;font-size:13px;line-height:1.7}
  .head{border-bottom:3px solid #0b7285;padding-bottom:14px;margin-bottom:20px}
  .head h1{margin:0;font-size:22px;color:#0b7285}
  .head .meta{color:#666;font-size:12px;margin-top:6px}
  h2{font-size:15px;color:#0b7285;border-left:4px solid #0b7285;padding-left:9px;margin:24px 0 10px}
  table{width:100%;border-collapse:collapse;margin:6px 0}
  th,td{border:1px solid #d0d7de;padding:7px 9px;text-align:left;font-size:12px;vertical-align:top}
  th{background:#f0f6f8;color:#0b7285}
  .card{border:1px solid #d0d7de;border-radius:6px;padding:12px 14px;margin:8px 0;background:#fafcfd}
  .card h4{margin:0 0 8px;font-size:13px}
  .tag{font-size:11px;background:#e7f5f8;color:#0b7285;padding:1px 8px;border-radius:9px;margin-left:6px}
  p{margin:3px 0} small{color:#888}
  .foot{margin-top:28px;padding-top:12px;border-top:1px solid #d0d7de;color:#888;font-size:11px}
  .ok{color:#1a7f37}.warn{color:#9a6700}.bad{color:#cf222e}
  @media print{body{padding:0}}
</style></head><body>
<div class="head">
  <h1>工业设备智能管理与预测性维护分析报告</h1>
  <div class="meta">生成时间：${ts} · 系统：智维 PredictOps v1.0.0 · 数据源：${ds.name}</div>
  <div class="meta">预警准确率 ${U.round(this.engine.globalAccuracy, 1)}% · 误报率 ${U.round(this.engine.globalFalseRate, 1)}% · 在监设备 ${global.IOT.DEVICES.length} 台</div>
</div>

<h2>一、设备健康基线与实时状态</h2>
<table><thead><tr><th>设备</th><th>型号</th><th>当前工况</th><th>健康指数</th><th>RUL</th><th>劣化速率</th></tr></thead>
<tbody>${devRows}</tbody></table>

<h2>二、故障分析</h2>
${al ? `<div class="card">
  <p><b>告警编号：</b>${al.id} · <b>时间：</b>${al.time}</p>
  <p><b>设备：</b>${al.deviceName}（${al.device}） · <b>故障类型：</b>${al.stateLabel} · <b>等级：</b>${al.level === "critical" ? "故障预警" : "劣化预警"}</p>
  <p><b>特征：</b>${al.feature}</p>
  <p><b>提前预警：</b>${al.leadHours} 小时 · <b>模型置信度：</b>${al.confidence}% · <b>误报率：</b>${al.falseRate}%</p>
  <p><b>机理说明：</b>${al.desc}</p></div>` : "<p>当前无预警记录，全部设备处于健康基线范围内。</p>"}

<h2>三、维修 SOP 与工单闭环</h2>
${woList}

<h2>四、备件清单与供应链状态</h2>
<table><thead><tr><th>备件</th><th>库存</th><th>安全线</th><th>月均消耗</th><th>预计可用</th><th>供应商</th><th>交期</th><th>状态</th></tr></thead>
<tbody>${partsRows}</tbody></table>

<h2>五、基准数据集特征频率实测（${ds.short} 真实波形）</h2>
<table><thead><tr><th>样本文件</th><th>官方目录真值</th><th>标称转速</th><th>算法实测判定</th><th>理论值</th><th>实测值</th><th>偏差</th><th>一致性</th><th>SHA-256（截）</th></tr></thead>
<tbody>${theo}</tbody></table>
<p>${looRep ? `留一法实测分类（按样本文件 LOSO，同类中心排除同一 .mat 的全部窗口）：${looRep.files} 只可比样本 / ${looRep.windows} 段真实窗口，最近中心分类，准确率 <b>${(looRep.accuracy * 100).toFixed(1)}%</b>（${looRep.correct}/${looRep.n}），宏平均 F1 <b>${looRep.macroF1.toFixed(3)}</b>${looRep.degenerate.length ? `；${looRep.degenerate.join("/")} 类可用文件不足 2 只，已剔除` : ""}。按窗口留一（LOO，含同文件相关窗口，偏乐观）仅作对照，不作为申报口径。` : ""}
理论侧取官方目录标称转速，实测侧由页面 JS 对原始波形做带通 + Hilbert 包络解调得出，两侧互不依赖。判定门限：|偏差| ≤ ${U.round(global.DSP.RULE.devTol, 0)}% 且包络信噪比 ≥ ${global.DSP.RULE.snrTol}。</p>

<h2>六、维护建议</h2>
<p>1. 对健康指数低于 60 的设备立即生成高优先级工单，锁定停机窗口并预占备件。</p>
<p>2. 健康指数 60~85 的设备将点检周期缩短至 3 天，重点跟踪振动峭度与温升趋势。</p>
<p>3. 库存告急备件（库存低于安全线）请立即启动加急采购，避免影响排修计划。</p>
<p>4. 持续以公开基准数据集（CWRU / PHM）校准特征频率识别算法，保持识别偏差 &lt; 2%。</p>

<div class="foot">本报告由智维 PredictOps 设备智能管理与预测性维护系统自动生成，数据为系统仿真结果，用于日常运维演示。</div>
</body></html>`;
    },
    bindDrawer() {
      const mask = document.getElementById("drawer-mask");
      if (mask) mask.addEventListener("click", () => this.closeDrawer());
      const close = document.getElementById("drawer-close");
      if (close) close.addEventListener("click", () => this.closeDrawer());
      const demo = document.getElementById("btn-demo-wo");
      if (demo) demo.addEventListener("click", () => this.simulateFaultWO());
      const refresh = document.getElementById("btn-refresh");
      if (refresh) refresh.addEventListener("click", () => {
        refresh.classList.add("spin");
        this.renderDecision();
        setTimeout(() => refresh.classList.remove("spin"), 520);
        this.toast("info", "决策层数据已同步");
      });
      // 通用模态框
      const mmask = document.getElementById("modal-mask");
      if (mmask) mmask.addEventListener("click", () => this.closeModal());
      const mclose = document.getElementById("modal-close");
      if (mclose) mclose.addEventListener("click", () => this.closeModal());
      // 健康指数评分依据
      const scoreBtn = document.getElementById("btn-score-detail");
      if (scoreBtn) scoreBtn.addEventListener("click", () => this.openScoreModal());
      // 一键导出报表
      const exportBtn = document.getElementById("btn-export");
      if (exportBtn) exportBtn.addEventListener("click", () => this.exportReport());
      document.addEventListener("keydown", e => { if (e.key === "Escape") { this.closeModal(); this.closeDrawer(); } });
    },

    /* ---------------- 键盘快捷键 ---------------- */
    bindShortcuts() {
      const VIEWS = ["perception", "inference", "decision", "knowledge", "dataset"];
      document.addEventListener("keydown", e => {
        const t = e.target, tag = t.tagName || "";
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || t.isContentEditable;
        if (e.key === "Escape") { this.closeModal(); this.closeDrawer(); return; }
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
        // 焦点停在按钮上时，空格/回车属于原生激活，不再叠加全局快捷键
        const activating = tag === "BUTTON" || tag === "A" || (t.getAttribute && t.getAttribute("role") === "button");
        if (activating && (e.key === " " || e.key === "Enter")) return;

        if (e.key >= "1" && e.key <= "5") { this.switchView(VIEWS[Number(e.key) - 1]); return; }
        switch (e.key.toLowerCase()) {
          case " ":
          case "spacebar":
            e.preventDefault(); this.setPaused(!this.paused); return;
          case "f": this.injectFault(); return;
          case "n": this.restoreNormal(); return;
          case "e": this.exportReport(); return;
          case "d": this.simulateFaultWO(); return;
          case "/": {
            e.preventDefault();
            this.switchView("knowledge");
            const el = document.getElementById("chat-input");
            if (el) setTimeout(() => el.focus(), 60);
            return;
          }
          case "?": this.openShortcuts(); return;
        }
      });
      const btn = document.getElementById("btn-shortcuts");
      if (btn) btn.addEventListener("click", () => this.openShortcuts());
    },

    openShortcuts() {
      const rows = [
        ["1 ~ 5", "切换 感知层 / 推理层 / 决策层 / 知识层 / 数据集与评估"],
        ["空格", "暂停 / 继续 实时数据流"],
        ["F", "对当前设备注入轴承内圈故障"],
        ["N", "当前设备恢复正常态健康基线"],
        ["D", "按当前工况模拟生成检修工单"],
        ["E", "导出维护分析与工单报表"],
        ["/", "聚焦智能诊断问答输入框"],
        ["Esc", "关闭抽屉 / 弹窗"],
        ["?", "打开本快捷键面板"]
      ];
      this.openModal("键盘快捷键 <span style=\"color:var(--txt-2);font-size:12px\">演示提效</span>",
        `<div class="kbd-table">${rows.map(([k, v]) => `<div class="kbd-row"><kbd>${k}</kbd><span>${v}</span></div>`).join("")}</div>
         <div class="note" style="display:block;margin-top:14px;color:var(--txt-2);font-size:11.5px">快捷键在输入框内输入时自动让位于文本录入。</div>`);
    },
    openDrawer() {
      document.getElementById("drawer-mask")?.classList.add("open");
      document.getElementById("drawer")?.classList.add("open");
      this.lastFocus = document.activeElement;
      const close = document.getElementById("drawer-close");
      if (close) setTimeout(() => close.focus(), 30);
    },
    closeDrawer() {
      document.getElementById("drawer-mask")?.classList.remove("open");
      const d = document.getElementById("drawer");
      const was = d?.classList.contains("open");
      d?.classList.remove("open");
      if (was && this.lastFocus) this.lastFocus.focus();
    },
    toast(type, msg, action) {
      const wrap = document.getElementById("toast-wrap");
      if (!wrap) return;
      while (wrap.children.length >= 3) wrap.removeChild(wrap.firstChild);
      const color = type === "ok" ? "green" : type === "warn" ? "amber" : type === "danger" ? "red" : "cyan";
      const el = document.createElement("div");
      el.className = "toast " + (type === "info" ? "" : type);
      el.innerHTML = `<span class="dot" style="color:var(--${color})"></span>` +
        `<span class="toast-msg">${escapeHtml(msg)}</span>`;
      if (action && action.view && action.label) {
        const a = document.createElement("button");
        a.className = "toast-act";
        a.textContent = action.label + " ›";
        a.addEventListener("click", () => { this.switchView(action.view); el.remove(); });
        el.appendChild(a);
      }
      const x = document.createElement("button");
      x.className = "toast-x";
      x.setAttribute("aria-label", "关闭提示");
      x.innerHTML = "×";
      el.appendChild(x);
      wrap.appendChild(el);

      const life = type === "danger" ? 9000 : type === "ok" ? 3600 : 5200;
      let timer = setTimeout(dismiss, life);
      function dismiss() {
        el.classList.add("out");
        setTimeout(() => el.remove(), 240);
      }
      x.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
      // 悬停驻留：读得慢就不必担心提示消失
      el.addEventListener("mouseenter", () => clearTimeout(timer));
      el.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 1800); });
    },
  };

  /* ---------------- 辅助 ---------------- */
  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function stamp(d) {
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function relTime(ts) {
    if (!ts) return "";
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return "刚刚";
    if (m < 60) return m + " 分钟前";
    const h = Math.round(m / 60);
    if (h < 48) return h + " 小时前";
    return Math.round(h / 24) + " 天前";
  }
  function svgEmpty() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>`; }
  function icon(name) {
    const map = {
      cnc: `<svg viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="12" rx="1.5"/><path d="M12 15v4M7 19h10M8 7v4M16 7v4"/></svg>`,
      compressor: `<svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="14" rx="3"/><circle cx="12" cy="11" r="3.4"/><path d="M12 11h4.5M2 20h20"/></svg>`,
      pump: `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="12" r="6"/><path d="M11 6v6l4 3M17 9h4v6M3 20h6"/></svg>`
    };
    return map[name] || map.cnc;
  }

  global.App = App;
  document.addEventListener("DOMContentLoaded", () => App.init());
})(window);
