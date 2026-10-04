# `tools/` —— 真实数据接入与复现构建

这个目录是「数据集与评估」视图里**真实数据那一半**的来源。页面显示的每一条实测数字，
都可以从这里重新跑出来；仿真那一半在运行时由 `assets/data.js` 的 `SimEngine` 生成，不经过这里。

## 文件

| 文件 | 作用 |
| :--- | :--- |
| `fetch-cwru.sh` | 从 CWRU 官网下载 `.mat` 原始文件，并与 `assets/data/cwru.json` 记录的 SHA-256 比对 |
| `cwru-catalog.js` | 解析官网目录页 HTML → 「`.mat` 编号 → 故障元件 / 直径 / 负载 / 标称转速」映射 |
| `mat5.js` | MAT v5 解析器（支持 PCWIN 版 MATLAB 导出的 zlib 压缩数据元素） |
| `cwru-extract.js` | 抽取真实波形窗口 + 现场解调标定 → 产出 `assets/data/cwru.{bin,json}` |
| `cwru-cv.js` | 交叉验证协议对照：窗口级留一 vs 样本级留一 |

`assets/dsp.js`（FFT / 带通 / Hilbert 包络 / 亚 bin 细化）被构建期与本仓库的浏览器端**共用同一份文件**，
所以离线跑出来的数与页面上显示的数是同一个算法的同一个结果。

## 复现

```bash
# 1) 下载原始 .mat（22 只约 70 MB，官网单连接限速 ~6.5 KB/s，脚本内并发 3 并做 SHA-256 校验）
./tools/fetch-cwru.sh /tmp/cwru

# 2) 目录映射：先保存三个官网目录页，再解析成一张 编号→工况 表
curl -o /tmp/cwru/normal.html https://engineering.case.edu/bearingdatacenter/normal-baseline-data
curl -o /tmp/cwru/12k.html    https://engineering.case.edu/bearingdatacenter/12k-drive-end-bearing-fault-data
curl -o /tmp/cwru/48k.html    https://engineering.case.edu/bearingdatacenter/48k-drive-end-bearing-fault-data
node tools/cwru-catalog.js /tmp/cwru/normal.html /tmp/cN.json  https://engineering.case.edu/bearingdatacenter/normal-baseline-data
node tools/cwru-catalog.js /tmp/cwru/12k.html    /tmp/c12.json https://engineering.case.edu/bearingdatacenter/12k-drive-end-bearing-fault-data
node tools/cwru-catalog.js /tmp/cwru/48k.html    /tmp/c48.json https://engineering.case.edu/bearingdatacenter/48k-drive-end-bearing-fault-data
# 三份合并为 assets/data/cwru-catalog.json（116 条映射，记录页面 HTML 的 SHA-256）

# 3) 抽取 + 标定（产出 assets/data/cwru.bin 与 cwru.json）
node tools/cwru-extract.js /tmp/cwru assets/data

# 4) 交叉验证对照
node tools/cwru-cv.js
```

## 数据布局

`cwru.bin` 是**纯 Int16 PCM 串联**，无头部；`cwru.json` 记录每一段的 `offset`（采样点）、`length` 与 `scale`
（`原始值 = Int16 × scale`，`scale = 该段峰值 / 32767`，因此量级无损还原到官方量纲 g）。
浏览器侧由 `assets/cwru.js` 直接 `new Int16Array(arrayBuffer, offset*2, length)` 零拷贝取段。

每个（设备 × 工况）单元包含：

- **1 段标定窗**，时长 1.365 s（12k → 16,384 点；48k → 65,536 点），频率分辨率 `df ≈ 0.73 Hz`
- **8 段评测窗**，时长 0.341 s（12k → 4,096 点；48k → 16,384 点），互不重叠、按录制顺序连续切取

> 窗口一律按**等时长**而非等点数取。否则 48 kHz 数据沿用 16,384 点窗，`df` 从 0.73 Hz 变成 2.93 Hz，
> 在 30 Hz 转频处的量化误差本身就有 ±5%，会把「偏差 ≤ 2%」的判定变成伪命题。

## 两条必须知道的实现约束

1. **60 Hz 工频干扰**。CWRU 驱动端信号里 60 Hz 线噪很强。估计转频时如果只是「跳过落在工频上的候选」，
   会连真实的 30 Hz 一起误杀（因为 2×30 ≈ 60）；正确做法是先把 50/60/100/120/150/180 Hz 邻域陷波，
   再在净化后的谱上找 1X 并用谐波族能量打分。修好后 `105.mat` 的 1X 从错的 60.02 Hz 变成 30.00 Hz
   （官方目录标称 1797 rpm = 29.95 Hz，差 0.16%）。

2. **`Buffer.from(typedArray)` 按元素数取字节**。构建期把 Int16 窗口写进二进制时，
   `Buffer.from(int16Array)` 得到的是 `length` 字节而不是 `length × 2` 字节——评测窗数据被截掉一半，
   而索引仍然按全长累加，表现为浏览器里 `new Int16Array(...)` 抛 `Invalid typed array length`。
   必须写成 `Buffer.from(int16Array.buffer)`。`tools/cwru-extract.js` 里保留了这条注释。

## 判定与验证口径

- **特征频率识别**：`|实测 − 理论| ≤ 2%` **且** 包络谱信噪比 `≥ 8`（`assets/dsp.js` 的 `DSP.RULE`）。
  理论值 = 官方目录标称转速 × 6205-2RS 系数（BPFI 5.4152 / BPFO 3.5840 / BSF 2.3569 / FTF 0.3982）；
  实测值 = 对真实波形解调后的包络谱峰。**理论侧与实测侧互不依赖，不构成循环**。
- **滚珠故障未检出是真实结果**：B007 级缺陷冲击能量低（峭度 2.97 / 3.10，健康基线约 3.0），
  低于判定门限，界面对此类样本标注为「未检出」而非粉饰。
- **0.028″ 组（3001~3008）为另一型号轴承**：其 `.mat` 内变量名不是 `X<id>_DE_time`（例如 `3004.mat` 里是 `X059_DE_time`），
  几何系数与 6205 不同，抽取阶段直接因「变量名须与文件编号一致」而被剔除，不进入比对与交叉验证。
- **抽取变量必须按编号严格匹配**：`99.mat` 内部同时打包了 `X098_DE_time`（483,903 点）与 `X099_DE_time`（485,063 点）。
  若按「取最长的 DE 变量」挑通道，换个编号就会静默取到**另一只样本**的波形，数字仍然漂亮但对应关系全错。
- **MATLAB 残留的残缺 `ans` 变量**：`99.mat` 开头是一个 48 字节的 `ans` 标量，其数值子元素被 MATLAB 写截断了。
  解析器若在「单个变量解析失败」时中断整个遍历，就会连后半部分真正的 `X099_DE_time` 一起读不到，
  表现为「文件字节数正常但变量数为 0」。正确做法是跳过该元素、按已知的元素长度继续走（`tools/mat5.js`）。
- **交叉验证必须按样本留一（LOSO）**：同一只 `.mat` 切出的多段窗口来自同一次连续录制、高度相关；
  按窗口留一时同类中心会包含被测窗口自己的兄弟样本，准确率虚高。`node tools/cwru-cv.js` 会并排给出两个数，
  对外申报只使用 LOSO，并且每类至少需要 2 只文件才能构成留一参照。
