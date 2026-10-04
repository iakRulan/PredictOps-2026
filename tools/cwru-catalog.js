/* 解析 CWRU 官方目录页，得到 .mat 编号 → 故障要素 + 标称转速
 * 用法: node tools/cwru-catalog.js <html文件> <输出json> <来源URL>
 *
 * 目录是「理论侧」的唯一输入源：转速与故障要素取官方标称，识别值取波形实测，
 * 两者互不依赖，比对才有意义。
 * 单元格标识文本（IR007_0 / OR021@3_2 / B014_1）自描述了元件类型+直径+负载，
 * 比沿行推断更稳，因此以它为主、href 提供编号。
 */
const fs = require("fs");
const crypto = require("crypto");

const KIND = { IR: "内圈", OR: "外圈", B: "滚珠" };

function strip(h) {
  return h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/\s+/g, " ").trim();
}

/* IR007_0 / OR021@3_2 / B014_1 / Normal_0 */
function decodeLabel(lab) {
  const nm = lab.match(/^Normal_(\d)$/i);
  if (nm) return { element: "NO", diameter: null, loadZone: null, hp: +nm[1] };
  const m = lab.match(/^(IR|OR|B|NO)(\d{3})(?:@(\d{1,2}))?_(\d)$/i);
  if (!m) return null;
  const [, el, dia, zone, hp] = m;
  return {
    element: el.toUpperCase(),
    diameter: el === "NO" ? null : "0." + dia,
    loadZone: el === "OR" && zone ? zone + ":00" : null,
    hp: +hp
  };
}

function parse(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
  const out = {};
  let carriedDia = null, carriedHp = null, carriedRpm = null;
  for (const r of rows) {
    const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (cells.length < 3) continue;
    const txt = cells.map(strip);
    // 行首三列：故障直径 / 电机负载 HP / 近似转速——部分表格把它们与数据分行书写，需沿用
    const dm = txt[0].match(/(0\.\d{3})"|^(NO)$/);
    const hpM = txt.find(t => /^\d$/.test(t));
    const rpmM = txt.find(t => /^1[67]\d\d$/.test(t));
    if (dm && dm[1]) carriedDia = dm[1];
    if (hpM) carriedHp = +hpM;
    if (rpmM) carriedRpm = +rpmM;

    cells.forEach((raw, ci) => {
      const idm = raw.match(/files\/(\d{2,4})\.mat/i);
      if (!idm) return;
      const lab = (strip(raw).match(/(?:IR|OR|B)\d{3}(?:@\d{1,2})?_\d|Normal_\d/) || [])[0];
      const dec = lab ? decodeLabel(lab) : null;
      out[idm[1]] = {
        label: lab || txt[ci] || null,
        element: dec ? dec.element : null,
        diameter: dec ? dec.diameter : carriedDia,
        loadZone: dec ? dec.loadZone : null,
        hp: dec ? dec.hp : carriedHp,
        rpm: carriedRpm || null
      };
    });
  }
  return out;
}

const [,, inFile, outFile, url] = process.argv;
const html = fs.readFileSync(inFile, "utf8");
const table = parse(html);
// 采样率由所在目录页决定（官方按 12k / 48k 分页），抽取时再用谱结构做一致性校验
const pageFs = /48k/i.test(url || inFile) ? 48000 : 12000;
Object.values(table).forEach(v => { v.fs = pageFs; });
fs.writeFileSync(outFile, JSON.stringify({
  source: url || "", fs: pageFs,
  htmlSha256: crypto.createHash("sha256").update(html).digest("hex"),
  fetchedAt: new Date().toISOString(), map: table
}, null, 1));

const keys = Object.keys(table);
console.log(outFile + " → " + keys.length + " 条");
keys.forEach(k => {
  const v = table[k];
  console.log("  " + k.padEnd(5) + [v.element || "?", v.diameter || "-", v.loadZone || "-", (v.hp ?? "?") + "HP", (v.rpm || "?") + "rpm"].join(" "));
});
