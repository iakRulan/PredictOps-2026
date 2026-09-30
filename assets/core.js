/* =========================================================================
 * AgentUI —— 智能体应用共享运行时
 * 契约：chart / toast / modal / closeModal / drawer / closeDrawer /
 *       download / fmt / router / boot / theme
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------- 主题与图表工具 ---------------- */
  const C = {
    cyan: "#22d3ee", blue: "#3b82f6", green: "#22c55e", amber: "#f59e0b",
    red: "#ef4444", violet: "#a78bfa", pink: "#f472b6",
    txt1: "#9fb0c4", txt2: "#63748a", line: "#1e2a3a"
  };
  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const axCat = (data, extra) => Object.assign({
    type: "category", data,
    axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false },
    axisLabel: { color: C.txt2, fontSize: 10 }
  }, extra || {});
  const axVal = (extra) => Object.assign({
    type: "value",
    axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false },
    axisLabel: { color: C.txt2, fontSize: 10 },
    splitLine: { lineStyle: { color: "rgba(30,42,58,0.6)", type: "dashed" } }
  }, extra || {});
  const tip = (extra) => Object.assign({
    trigger: "axis", backgroundColor: "rgba(10,15,23,0.94)", borderColor: "#26364b", borderWidth: 1,
    textStyle: { color: "#e8f0fa", fontSize: 11.5 }
  }, extra || {});
  const grad = (c) => new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexA(c, 0.34) }, { offset: 1, color: hexA(c, 0) }
  ]);

  /* ---------------- 格式化 ---------------- */
  const pad = n => String(n).padStart(2, "0");
  const fmt = {
    yuan: n => "¥" + Number(n).toLocaleString("zh-CN"),
    pct: (v, d) => Number(v).toFixed(d == null ? 1 : d) + "%",
    num: n => Number(n).toLocaleString("zh-CN"),
    round: (v, d) => Math.round(v * 10 ** (d == null ? 2 : d)) / 10 ** (d == null ? 2 : d),
    clockStr: d => pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
  };

  /* ---------------- 图表 ---------------- */
  const reg = {};
  function chart(id, option) {
    const el = document.getElementById(id);
    if (!el) return null;
    let inst = echarts.getInstanceByDom(el);
    if (inst) { try { inst.dispose(); } catch (e) {} }
    inst = echarts.init(el);
    if (option) inst.setOption(option);
    reg[id] = inst;
    return inst;
  }
  function getChart(id) {
    const el = document.getElementById(id);
    return el ? echarts.getInstanceByDom(el) : null;
  }
  function disposeScope(root) {
    (root || document).querySelectorAll("[_echarts_instance_]").forEach(el => {
      const i = echarts.getInstanceByDom(el);
      if (i) { try { i.dispose(); } catch (e) {} }
    });
  }
  function resizeAll() {
    document.querySelectorAll("[_echarts_instance_]").forEach(el => {
      const i = echarts.getInstanceByDom(el);
      if (i && el.offsetParent !== null) i.resize();
    });
  }

  /* ---------------- 容器注入 ---------------- */
  function ensureContainers() {
    if (!document.getElementById("au-toast-wrap")) {
      const t = document.createElement("div");
      t.className = "toast-wrap"; t.id = "au-toast-wrap";
      document.body.appendChild(t);
    }
    if (!document.getElementById("au-modal")) {
      const m = document.createElement("div");
      m.className = "modal-mask"; m.id = "au-modal-mask";
      m.addEventListener("click", closeModal);
      const box = document.createElement("div");
      box.className = "modal"; box.id = "au-modal";
      box.innerHTML = `<div class="modal-head"><h3 id="au-modal-title"></h3>
        <button class="drawer-close" id="au-modal-close">${closeIcon()}</button></div>
        <div class="modal-body" id="au-modal-body"></div>`;
      document.body.appendChild(m); document.body.appendChild(box);
      box.querySelector("#au-modal-close").addEventListener("click", closeModal);
    }
    if (!document.getElementById("au-drawer")) {
      const dm = document.createElement("div");
      dm.className = "drawer-mask"; dm.id = "au-drawer-mask";
      dm.addEventListener("click", closeDrawer);
      const d = document.createElement("aside");
      d.className = "drawer"; d.id = "au-drawer";
      d.innerHTML = `<div class="drawer-head"><h3 id="au-drawer-title"></h3>
        <button class="drawer-close" id="au-drawer-close">${closeIcon()}</button></div>
        <div class="drawer-body" id="au-drawer-body"></div>`;
      document.body.appendChild(dm); document.body.appendChild(d);
      d.querySelector("#au-drawer-close").addEventListener("click", closeDrawer);
    }
  }
  function closeIcon() {
    return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  }

  /* ---------------- Toast ---------------- */
  function toast(type, msg) {
    ensureContainers();
    const wrap = document.getElementById("au-toast-wrap");
    const el = document.createElement("div");
    const t = ["ok", "warn", "danger", "info"].includes(type) ? type : "info";
    const color = t === "ok" ? "green" : t === "warn" ? "amber" : t === "danger" ? "red" : "cyan";
    el.className = "toast " + (t === "info" ? "" : t);
    el.innerHTML = `<span class="dot" style="color:var(--${color})"></span>${escapeHtml(msg)}`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3600);
  }

  /* ---------------- Modal / Drawer ---------------- */
  function modal(title, html) {
    ensureContainers();
    document.getElementById("au-modal-title").innerHTML = title || "";
    document.getElementById("au-modal-body").innerHTML = html || "";
    document.getElementById("au-modal-mask").classList.add("open");
    document.getElementById("au-modal").classList.add("open");
  }
  function closeModal() {
    document.getElementById("au-modal-mask")?.classList.remove("open");
    document.getElementById("au-modal")?.classList.remove("open");
  }
  function drawer(title, html) {
    ensureContainers();
    document.getElementById("au-drawer-title").innerHTML = title || "";
    document.getElementById("au-drawer-body").innerHTML = html || "";
    document.getElementById("au-drawer-mask").classList.add("open");
    document.getElementById("au-drawer").classList.add("open");
  }
  function closeDrawer() {
    document.getElementById("au-drawer-mask")?.classList.remove("open");
    document.getElementById("au-drawer")?.classList.remove("open");
  }

  /* ---------------- 下载 ---------------- */
  function download(name, content, mime) {
    const blob = new Blob(["\ufeff" + content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  /* ---------------- 视图路由 ---------------- */
  function router(items) {
    const list = Array.isArray(items) ? items : Object.keys(items).map(k => Object.assign({ key: k }, items[k]));
    const main = document.getElementById("agent-main");
    const nav = document.getElementById("agent-nav");
    if (!main || !nav) return { show() {} };
    main.innerHTML = list.map(v => `<section class="view" id="view-${v.key}"></section>`).join("");
    nav.innerHTML = list.map(v => `<button class="nav-item" data-view="${v.key}">${v.icon || ""}${v.label}</button>`).join("");
    const done = {};
    let cur = null;
    function show(key) {
      const v = list.find(x => x.key === key) || list[0];
      if (!v) return;
      cur = v.key;
      nav.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === v.key));
      main.querySelectorAll(".view").forEach(s => s.classList.toggle("active", s.id === "view-" + v.key));
      const el = document.getElementById("view-" + v.key);
      try {
        if (!done[v.key]) { disposeScope(el); el.innerHTML = v.html ? v.html() : ""; if (v.init) v.init(el); done[v.key] = true; }
        else if (v.refresh) v.refresh(el);
      } catch (e) { console.error("view init error:", v.key, e); }
      setTimeout(() => { el.querySelectorAll("[_echarts_instance_]").forEach(x => { const i = echarts.getInstanceByDom(x); if (i) i.resize(); }); }, 60);
    }
    nav.addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) show(b.dataset.view); });
    if (list[0]) show(list[0].key);
    return { show, list, get current() { return cur; } };
  }

  /* ---------------- 应用启动 ---------------- */
  function boot(cfg) {
    ensureContainers();
    document.title = cfg.title || (cfg.cn + " · " + cfg.code);
    const brand = document.getElementById("agent-brand");
    if (brand) brand.innerHTML = cfg.brandHtml || `<div class="brand-logo">${cfg.logo || ""}</div>
      <div><div class="brand-name">${cfg.cn}</div><div class="brand-sub">${cfg.code}</div></div>`;
    const title = document.getElementById("agent-title");
    if (title) title.innerHTML = `${cfg.cn}<small>${cfg.code} · ${cfg.tagline || ""}</small>`;
    const kpis = document.getElementById("agent-kpis");
    if (kpis) kpis.innerHTML = (cfg.kpis || []).map(k =>
      `<div class="kpi-chip"><em>${k.label}</em><b ${k.id ? `id="${k.id}"` : ""}>${k.value}</b></div>`).join("");
    if (cfg.foot) { const f = document.getElementById("agent-foot"); if (f) f.innerHTML = cfg.foot; }
    const r = router(cfg.nav);
    const clock = document.getElementById("clock");
    const tick = () => { if (clock) clock.textContent = fmt.clockStr(new Date()); };
    tick(); setInterval(tick, 1000);
    window.addEventListener("resize", resizeAll);
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeDrawer(); } });
    return r;
  }

  global.AgentUI = {
    theme: { C, hexA, axCat, axVal, tip, grad },
    chart, getChart, disposeScope, resizeAll,
    toast, modal, closeModal, drawer, closeDrawer, download,
    fmt, router, boot, escapeHtml
  };
})(window);
