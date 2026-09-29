/* 图纸解析智能体 DrawingOps —— 工程图纸理解与 BOM 拆解 */
(function () {
  "use strict";
  const { chart, toast, download, theme } = AgentUI;
  const { C, axCat, axVal, tip } = theme;

  const FIELDS = [
    { k: "图号", v: "JG-2026-0417", acc: 99.2 },
    { k: "零件名称", v: "结构件支撑板", acc: 98.7 },
    { k: "材料", v: "Q345B", acc: 96.5 },
    { k: "比例", v: "1:2", acc: 99.0 },
    { k: "单件重量", v: "12.6 kg", acc: 94.1 },
    { k: "设计 / 审核", v: "张工 / 李工", acc: 93.4 },
    { k: "日期", v: "2026-04-17", acc: 91.7 },
    { k: "粗糙度", v: "Ra3.2", acc: 93.9 }
  ];
  const BOM = [
    { lvl: 0, code: "JG-2026-0417", name: "结构件支撑板", spec: "—", mat: "—", qty: 1, unit: "件", w: 12.6 },
    { lvl: 1, code: "MAT-01", name: "钢板", spec: "δ=16mm", mat: "Q345B", qty: 1, unit: "张", w: 10.6 },
    { lvl: 1, code: "MAT-02", name: "加强筋", spec: "δ=8mm", mat: "Q235B", qty: 4, unit: "件", w: 0.8 },
    { lvl: 1, code: "STD-01", name: "六角头螺栓", spec: "M12×40", mat: "8.8级", qty: 16, unit: "件", w: 0.06 },
    { lvl: 1, code: "STD-02", name: "六角螺母", spec: "M12", mat: "8级", qty: 16, unit: "件", w: 0.02 },
    { lvl: 1, code: "STD-03", name: "平垫圈", spec: "12", mat: "Q235", qty: 32, unit: "件", w: 0.003 }
  ];
  const dims = { L: 200, W: 120, H: 24, yaw: 34 };

  function drawingSvg() {
    return `<svg viewBox="0 0 460 210" class="tr-svg">
      <rect x="24" y="16" width="280" height="130" rx="3" fill="none" stroke="#4b6478" stroke-width="1.6"/>
      <rect x="40" y="32" width="248" height="98" rx="2" fill="none" stroke="#37475a" stroke-width="1" stroke-dasharray="5 4"/>
      ${[[68, 54], [148, 54], [228, 54], [68, 108], [148, 108], [228, 108]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="none" stroke="#22d3ee" stroke-width="1.4"/><circle cx="${p[0]}" cy="${p[1]}" r="2.2" fill="#22d3ee"/>`).join("")}
      <path d="M24 170h280" stroke="#ef4444" stroke-width="1"/><path d="M24 164v12M304 164v12" stroke="#ef4444" stroke-width="1"/>
      <text x="164" y="186" fill="#ef4444" font-size="11" text-anchor="middle">200 ±0.05</text>
      <rect x="322" y="16" width="116" height="130" fill="#0d1420" stroke="#4b6478" stroke-width="1.2"/>
      ${[["图号", "JG-2026-0417"], ["材料", "Q345B"], ["比例", "1:2"], ["重量", "12.6kg"], ["设计", "张工"], ["日期", "2026-04-17"]].map((rw, i) => `<text x="328" y="${34 + i * 19}" fill="#9fb0c4" font-size="9.5">${rw[0]}</text><text x="362" y="${34 + i * 19}" fill="#e8f0fa" font-size="9.5">${rw[1]}</text>`).join("")}
    </svg>`;
  }

  function isoProject(x, y, z) {
    const a = dims.yaw * Math.PI / 180, k = Math.PI / 6;
    const rx = x * Math.cos(a) - z * Math.sin(a);
    const rz = x * Math.sin(a) + z * Math.cos(a);
    return { X: (rx - rz) * Math.cos(k), Y: (rx + rz) * Math.sin(k) - y };
  }
  function render3D() {
    const cv = document.getElementById("c3d");
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 600, H = 300;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const s = 0.7, ox = W / 2, oy = H * 0.66;
    const P = (x, y, z) => { const p = isoProject(x, y, z); return [ox + p.X * s, oy + p.Y * s]; };
    const L = dims.L * 0.55, Wd = dims.W * 0.75, Hh = dims.H * 2.4;
    const corners = [[0, 0, 0], [L, 0, 0], [L, 0, Wd], [0, 0, Wd], [0, Hh, 0], [L, Hh, 0], [L, Hh, Wd], [0, Hh, Wd]].map(c => P(c[0], c[1], c[2]));
    // 顶面
    ctx.beginPath(); ctx.moveTo(...corners[4]); ctx.lineTo(...corners[5]); ctx.lineTo(...corners[6]); ctx.lineTo(...corners[7]); ctx.closePath();
    ctx.fillStyle = "rgba(34,211,238,0.12)"; ctx.fill();
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1.4; ctx.stroke();
    // 侧面
    [[4, 5, 1, 0], [5, 6, 2, 1], [7, 4, 0, 3], [6, 7, 3, 2]].forEach(f => {
      ctx.beginPath(); ctx.moveTo(...corners[f[0]]); ctx.lineTo(...corners[f[1]]); ctx.lineTo(...corners[f[2]]); ctx.lineTo(...corners[f[3]]); ctx.closePath();
      ctx.fillStyle = "rgba(59,130,246,0.06)"; ctx.fill(); ctx.strokeStyle = "rgba(75,100,120,0.9)"; ctx.lineWidth = 1; ctx.stroke();
    });
    // 孔位
    [[L * 0.25, Wd * 0.3], [L * 0.7, Wd * 0.3], [L * 0.25, Wd * 0.72], [L * 0.7, Wd * 0.72]].forEach(h => {
      const t = P(h[0], Hh, h[1]); const b = P(h[0], 0, h[1]);
      ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = "rgba(239,68,68,0.75)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(t[0], t[1], 3.2, 0, Math.PI * 2); ctx.fillStyle = "#ef4444"; ctx.fill();
    });
    ctx.fillStyle = C.txt2; ctx.font = "11px monospace";
    ctx.fillText(`L=${dims.L}  W=${dims.W}  H=${dims.H}  方位角=${dims.yaw}°`, 12, H - 12);
  }

  function monteCarlo() {
    const N = 10000;
    const g = (mu, s) => mu + s * (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()));
    let bad = 0, min = 1e9, max = -1e9;
    for (let i = 0; i < N; i++) {
      const c = g(200, 0.075 / 3) - g(80, 0.02 / 3) - g(40, 0.06 / 3);
      if (c < 0) bad++; if (c < min) min = c; if (c > max) max = c;
    }
    return { p: bad / N * 100, min, max, N };
  }

  const views = [
    {
      key: "parse", label: "图纸解析",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 3v5h5M6 3h9l5 5v13H6z"/><path d="M9 13h6M9 17h4"/></svg>`,
      html() {
        return `<div class="grid g-4 mb">
          <div class="metric is-cyan"><div class="metric-label">字段识别率</div><div class="metric-value">95.2<small>%</small></div><div class="metric-foot">8 个标题栏关键字段</div></div>
          <div class="metric is-green"><div class="metric-label">BOM 条目</div><div class="metric-value">6<small>项</small></div><div class="metric-foot">层级化材料清单</div></div>
          <div class="metric is-violet"><div class="metric-label">干涉概率</div><div class="metric-value" id="k-inter">0.00<small>%</small></div><div class="metric-foot">蒙特卡洛验算</div></div>
          <div class="metric is-amber"><div class="metric-label">解析耗时</div><div class="metric-value">1.4<small>s</small></div><div class="metric-foot">单张工程图端到端</div></div>
        </div>
        <div class="panel"><div class="panel-head"><h3>工程图与标题栏字段抽取</h3><span class="sub">CAD 图纸 → 结构化字段</span></div>
          <div class="tr-drawing">${drawingSvg()}</div>
          <div class="table-wrap mt"><table class="data"><thead><tr><th>字段</th><th>提取值</th><th>置信度</th></tr></thead>
            <tbody>${FIELDS.map(f => `<tr><td>${f.k}</td><td class="mono">${f.v}</td><td><span class="bar-track" style="width:64px"><span class="bar-fill ${f.acc >= 96 ? "ok" : "warn"}" style="width:${f.acc}%"></span></span> <span class="mono">${f.acc}%</span></td></tr>`).join("")}
            <tr style="background:rgba(34,211,238,0.05)"><td><b>平均识别率</b></td><td>—</td><td class="mono"><b>95.2%</b></td></tr></tbody></table></div>
        </div>`;
      }
    },
    {
      key: "preview", label: "三维预览",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>`,
      html() {
        return `<div class="grid g-32">
          <div class="panel"><div class="panel-head"><h3>参数化三维预览</h3><span class="sub">实时等轴测投影</span>
              <div class="spacer"></div><button class="btn btn-sm" id="btn-spin">旋转视角</button></div>
            <canvas id="c3d" class="c3d"></canvas></div>
          <div class="panel"><div class="panel-head"><h3>零件参数</h3><span class="sub">拖动实时重建</span></div>
            <div class="field"><label>长度 L (mm)：<span class="mono" id="v-L">${dims.L}</span></label><input type="range" id="r-L" min="120" max="280" value="${dims.L}" /></div>
            <div class="field"><label>宽度 W (mm)：<span class="mono" id="v-W">${dims.W}</span></label><input type="range" id="r-W" min="60" max="180" value="${dims.W}" /></div>
            <div class="field"><label>厚度 H (mm)：<span class="mono" id="v-H">${dims.H}</span></label><input type="range" id="r-H" min="12" max="48" value="${dims.H}" /></div>
            <div class="note">支撑板体积约 <b id="v-vol" class="mono">0</b> cm³ · 估算重量 <b id="v-wt" class="mono">0</b> kg（Q345B 密度 7.85 g/cm³）</div>
          </div>
        </div>`;
      },
      init() {
        render3D();
        const upd = () => {
          dims.L = +document.getElementById("r-L").value; dims.W = +document.getElementById("r-W").value; dims.H = +document.getElementById("r-H").value;
          document.getElementById("v-L").textContent = dims.L; document.getElementById("v-W").textContent = dims.W; document.getElementById("v-H").textContent = dims.H;
          const vol = dims.L * dims.W * dims.H / 1000;
          document.getElementById("v-vol").textContent = vol.toFixed(1);
          document.getElementById("v-wt").textContent = (vol * 7.85 / 1000).toFixed(2);
          render3D();
        };
        ["r-L", "r-W", "r-H"].forEach(id => document.getElementById(id).addEventListener("input", upd));
        upd();
        let timer = null;
        document.getElementById("btn-spin").addEventListener("click", () => {
          if (timer) return;
          timer = setInterval(() => { dims.yaw = (dims.yaw + 6) % 360; render3D(); }, 60);
          setTimeout(() => { clearInterval(timer); timer = null; }, 1800);
        });
        window.addEventListener("resize", render3D);
      },
      refresh() { render3D(); }
    },
    {
      key: "tolerance", label: "尺寸链校验",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h18M3 16h18M6 5v6M18 13v6"/></svg>`,
      html() {
        return `<div class="panel mb"><div class="panel-head"><h3>装配尺寸链与公差验算</h3><span class="sub">封闭环计算</span>
            <div class="spacer"></div><button class="btn btn-sm btn-primary" id="btn-mc">蒙特卡洛干涉验算 (10000 次)</button></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>环</th><th>基本尺寸</th><th>上偏差</th><th>下偏差</th><th>公差</th><th>性质</th></tr></thead>
            <tbody>
              <tr><td>A₀ 总长</td><td class="mono">200</td><td class="mono">+0.10</td><td class="mono">-0.05</td><td class="mono">0.15</td><td><span class="pill pill-info" style="font-size:10px">增环</span></td></tr>
              <tr><td>A₁ 组件 A</td><td class="mono">80</td><td class="mono">+0.02</td><td class="mono">0.00</td><td class="mono">0.02</td><td><span class="pill pill-muted" style="font-size:10px">减环</span></td></tr>
              <tr><td>A₂ 组件 B</td><td class="mono">40</td><td class="mono">+0.03</td><td class="mono">-0.03</td><td class="mono">0.06</td><td><span class="pill pill-muted" style="font-size:10px">减环</span></td></tr>
              <tr style="background:rgba(34,211,238,0.05)"><td><b>封闭环 C</b></td><td class="mono"><b>80</b></td><td class="mono"><b>+0.115</b></td><td class="mono"><b>-0.115</b></td><td class="mono"><b>0.23</b></td><td><span class="pill pill-ok" style="font-size:10px">验算</span></td></tr>
            </tbody></table></div></div>
          <div class="grid g-3">
            <div class="metric is-green"><div class="metric-label">干涉判定</div><div class="metric-value" id="mc-verdict" style="font-size:20px">合格</div><div class="metric-foot" id="mc-range">—</div></div>
            <div class="metric is-cyan"><div class="metric-label">干涉概率</div><div class="metric-value"><span id="mc-p">0.00</span><small>%</small></div></div>
            <div class="metric is-violet"><div class="metric-label">抽样次数</div><div class="metric-value">10000<small>次</small></div></div>
          </div>`;
      },
      init() {
        document.getElementById("btn-mc").addEventListener("click", () => {
          const res = monteCarlo();
          const v = res.p < 0.01 ? "合格" : res.p < 1 ? "风险" : "干涉";
          const ve = document.getElementById("mc-verdict");
          ve.textContent = v; ve.style.color = res.p < 0.01 ? "var(--green)" : res.p < 1 ? "var(--amber)" : "var(--red)";
          document.getElementById("mc-range").textContent = `封闭环 ${res.min.toFixed(3)} ~ ${res.max.toFixed(3)} mm`;
          document.getElementById("mc-p").textContent = res.p.toFixed(2);
          document.querySelector("#k-inter").innerHTML = res.p.toFixed(2) + "<small>%</small>";
          toast(res.p < 1 ? "ok" : "warn", `蒙特卡洛完成：干涉概率 ${res.p.toFixed(2)}%`);
        });
      }
    },
    {
      key: "bom", label: "BOM 与导出",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`,
      html() {
        return `<div class="panel">
          <div class="panel-head"><h3>层级化材料 BOM</h3><span class="sub">可导出 Excel / CSV</span>
            <div class="spacer"></div>
            <button class="btn btn-sm" id="btn-csv">导出 CSV</button>
            <button class="btn btn-sm btn-primary" id="btn-xls">导出 Excel</button></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>层级</th><th>编码</th><th>名称</th><th>规格</th><th>材料</th><th>数量</th><th>重量</th></tr></thead>
            <tbody>${BOM.map(b => `<tr><td class="mono">${b.lvl === 0 ? "L0" : "└ L1"}</td><td class="mono">${b.code}</td><td><b>${b.name}</b></td><td>${b.spec}</td><td>${b.mat}</td><td class="mono">${b.qty} ${b.unit}</td><td class="mono">${b.w} kg</td></tr>`).join("")}</tbody></table></div>
          <div class="chart mt" id="c-bom" style="height:220px"></div>
        </div>`;
      },
      init() {
        chart("c-bom", {
          backgroundColor: "transparent", grid: { left: 6, right: 20, top: 16, bottom: 4, containLabel: true },
          tooltip: tip({ formatter: p => `${p[0].name}<br/>重量 <b>${p[0].value}</b> kg` }),
          xAxis: axCat(BOM.filter(b => b.lvl === 1).map(b => b.name)), yAxis: axVal({ name: "kg" }),
          series: [{ type: "bar", barWidth: 26, data: BOM.filter(b => b.lvl === 1).map(b => ({ value: b.w, itemStyle: { color: C.violet, borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: "top", color: C.txt1, fontSize: 10 } }]
        });
        document.getElementById("btn-csv").addEventListener("click", () => {
          const rows = [["层级", "编码", "名称", "规格", "材料", "数量", "单位", "重量kg"]].concat(BOM.map(b => [b.lvl === 0 ? "L0" : "L1", b.code, b.name, b.spec, b.mat, b.qty, b.unit, b.w]));
          download("BOM-结构件支撑板-JG-2026-0417.csv", rows.map(r => r.join(",")).join("\n"), "text/csv;charset=utf-8");
          toast("ok", "BOM 已导出为 CSV");
        });
        document.getElementById("btn-xls").addEventListener("click", () => {
          const head = ["层级", "编码", "名称", "规格", "材料", "数量", "单位", "重量kg"];
          const body = BOM.map(b => `<tr><td>${b.lvl === 0 ? "L0" : "L1"}</td><td>${b.code}</td><td>${b.name}</td><td>${b.spec}</td><td>${b.mat}</td><td>${b.qty}</td><td>${b.unit}</td><td>${b.w}</td></tr>`).join("");
          download("BOM-结构件支撑板-JG-2026-0417.xls", `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>${body}</table></body></html>`, "application/vnd.ms-excel");
          toast("ok", "BOM 已导出为 Excel");
        });
      }
    }
  ];

  AgentUI.boot({
    cn: "图纸解析智能体", code: "DrawingOps", tagline: "工程图纸理解 · BOM 拆解 · 公差验算",
    kpis: [
      { label: "字段识别率", value: "95.2%" }, { label: "BOM 条目", value: "6" },
      { label: "干涉概率", value: "0.00%" }, { label: "解析耗时", value: "1.4s" }
    ],
    nav: views,
    foot: `版本 <b>v1.0.0</b><br/>识别 <b>OCR + 结构化</b><br/>验算 <b>Monte-Carlo</b>`
  });
})();
