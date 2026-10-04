/* MAT v5 (.mat) 解析 —— 构建期读取 NASA CWRU 原始文件用
 * 支持 PCWIN 版 MATLAB 导出的 zlib 压缩数据元素（CWRU 全部 12k/48k 文件均为该格式）
 * 容忍截断：逐元素 try/catch，便于在下载未完成时先检查已到达的变量
 */

const miINT8 = 0, miUINT8 = 1, miINT16 = 2, miUINT16 = 3, miINT32 = 4, miUINT32 = 5,
  miSINGLE = 7, miDOUBLE = 9, miINT64 = 12, miUINT64 = 13, miMATRIX = 14, miCOMPRESSED = 15;

const NUMERIC = {
  [miINT8]: 1, [miUINT8]: 1, [miINT16]: 2, [miUINT16]: 2,
  [miINT32]: 4, [miUINT32]: 4, [miSINGLE]: 4, [miDOUBLE]: 8, [miINT64]: 8, [miUINT64]: 8
};

/* 返回 {dtype, nbytes, dataAt, next}；兼容小格式(长度内联高16位)与大格式 */
function tag(buf, at, le = true) {
  const w = buf.readUInt32LE(at);
  const dtype = w & 0xffff;
  if (dtype !== 0 && (w >>> 16) !== 0) {
    const nbytes = w >>> 16;
    return { dtype, nbytes, dataAt: at + 4, next: at + 4 + pad(nbytes) };
  }
  const nbytes = buf.readUInt32LE(at + 4);
  return { dtype, nbytes, dataAt: at + 8, next: at + 8 + pad(nbytes) };
}
const pad = n => n + (n % 8 ? 8 - (n % 8) : 0);

function readNumeric(buf, t) {
  const n = Math.floor(t.nbytes / NUMERIC[t.dtype]);
  const out = new Float64Array(n);
  const dv = buf;
  for (let i = 0; i < n; i++) {
    const at = t.dataAt + i * NUMERIC[t.dtype];
    switch (t.dtype) {
      case miDOUBLE: out[i] = dv.readDoubleLE(at); break;
      case miSINGLE: out[i] = dv.readFloatLE(at); break;
      case miINT32: case miUINT32: out[i] = dv.readInt32LE(at); break;
      case miINT16: out[i] = dv.readInt16LE(at); break;
      case miUINT16: out[i] = dv.readUInt16LE(at); break;
      case miINT8: out[i] = dv.readInt8(at); break;
      case miUINT8: out[i] = dv.readUInt8(at); break;
      default: out[i] = Number(dv.readBigInt64LE(at));
    }
  }
  return out;
}

function parseMatrix(p) {
  let o = 0;
  const flags = tag(p, o);
  const cls = p.readUInt32LE(flags.dataAt) & 0xff;   // 6 = mxDOUBLE_CLASS, 7 = mxSINGLE ...
  o = flags.next;
  const dimsEl = tag(p, o);
  const nd = Math.floor(dimsEl.nbytes / 4);
  const dims = [];
  for (let i = 0; i < nd; i++) dims.push(p.readInt32LE(dimsEl.dataAt + i * 4));
  o = dimsEl.next;
  const nameEl = tag(p, o);
  const name = p.slice(nameEl.dataAt, nameEl.dataAt + nameEl.nbytes).toString("latin1");
  o = nameEl.next;

  let values = null;
  while (o + 4 <= p.length) {
    const e = tag(p, o);
    if (NUMERIC[e.dtype] != null && values === null) values = readNumeric(p, e);
    o = e.next;
  }
  return { name, class: cls, dims, values };
}

/* 顶层：返回 [{name, dims, values}]；truncated 容忍——逐元素 try/catch，遇不完整即停 */
function readMat(buf, tolerant = true) {
  const header = buf.slice(0, 116).toString("latin1").replace(/\0+$/, "").trim();
  const subsys = buf.length > 126 ? buf.readUInt16LE(124) : 0x100;
  const endian = subsys === 0x4d49 ? "BE" : "LE";
  let o = 128;
  const variables = [];
  while (o + 8 <= buf.length) {
    let t;
    try { t = tag(buf, o); } catch (e) { break; }
    if (!isFinite(t.nbytes) || t.dataAt + t.nbytes > buf.length) {
      if (!tolerant) throw new Error("truncated element @" + o);
      break;
    }
    try {
      const payload = t.dtype === miCOMPRESSED
        ? zlib.inflateSync(buf.slice(t.dataAt, t.dataAt + t.nbytes))
        : t.dtype === miMATRIX ? buf.slice(t.dataAt, t.dataAt + t.nbytes) : null;
      if (payload) {
        const v = parseMatrix(payload);
        if (v && v.name) variables.push(v);
      }
    } catch (e) {
      // 个别官方文件（如 99.mat）开头带 MATLAB 残留的残缺 ans 变量；
      // 单个变量解析失败只应跳过它，元素长度是已知的，继续往后走才能读到大文件后半部的真实数据
      if (!tolerant) throw e;
    }
    if (t.next <= o) break;
    o = t.next;
  }
  return { header, endian, variables };
}

module.exports = { readMat, parseMatrix };
