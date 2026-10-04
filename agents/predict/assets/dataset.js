/* =========================================================================
 * 基准数据集层 —— NASA CWRU 公开数据集（真实波形）+ 本系统参数化仿真
 *
 * 两条数据路径严格分开，不再混为一谈：
 *   实测：assets/data/cwru.bin 里的官方原始加速度窗，经 assets/dsp.js 现场解调
 *   仿真：SimEngine 生成的 1 Hz 时序，其频谱为模型合成，仅用于交互演示
 * ========================================================================= */
(function (global) {
  "use strict";

  /* 特征频率理论系数（6205-2RS）—— 单一来源，避免各处取值分叉 */
  const FACTORS = global.DSP ? global.DSP.CWRU_6205 : { BPFI: 5.4152, BPFO: 3.5840, BSF: 2.3569, FTF: 0.3982 };

  const NAMES = {
    BPFI: "内圈通过频率", BPFO: "外圈通过频率", BSF: "滚珠自转频率", FTF: "保持架频率",
    "1X": "转频", "2X": "二倍频"
  };

  const ELEMENT_LABEL = { IR: "内圈故障", OR: "外圈故障", B: "滚珠故障", NO: "正常基线" };

  /* 目录元数据：真实样本清单由 assets/data/cwru.json（构建期从官网 .mat 抽取）提供 */
  const META = {
    cwru: {
      key: "cwru", short: "CWRU",
      name: "NASA CWRU 轴承故障基准数据集",
      source: "Case Western Reserve University Bearing Data Center（电机驱动端 DE 加速度）",
      url: "https://engineering.case.edu/bearingdatacenter",
      bearing: "6205-2RS 深沟球轴承 · BPFI 5.4152X / BPFO 3.5840X / BSF 2.3569X / FTF 0.3982X",
      sampling: "12 kHz / 48 kHz",
      load: "0 ~ 3 HP（标称转速 1730 ~ 1797 rpm）",
      real: true
    },
    phm: {
      key: "phm", short: "PHM",
      name: "PHM Society 公开挑战赛数据",
      source: "PHM Society Data Challenge（2012 轴承全寿命 / 2018 刀具磨损 / 2020 齿轮箱）",
      bearing: "多型号", sampling: "20 ~ 50 kHz", load: "多工况变载",
      real: false,
      note: "本作品未载入 PHM 原始波形，仅登记目录信息，不参与实测比对。"
    }
  };

  function theory(speedRpm) {
    const rot = speedRpm / 60;
    return ["BPFI", "BPFO", "BSF", "FTF"].map(code =>
      ({ code, name: NAMES[code], factor: FACTORS[code], hz: rot * FACTORS[code] }));
  }

  /**
   * 仿真路径的特征频率"识别"表。
   * 注意：本表来自本系统合成频谱（charts.js buildSpectrum），属模型输出，
   * 不是对任何真实信号的测量；真实测量见 CWRU.measured 表。
   */
  function identifySim(stateKey, speedRpm) {
    const t = theory(speedRpm);
    const active = { "fault-bpfi": "BPFI", "fault-bpfo": "BPFO" }[stateKey] || null;
    return t.map(x => {
      const detected = x.code === active;
      const dev = detected ? (0.3 + Math.random() * 1.5) : (3.5 + Math.random() * 3);
      const measured = x.hz * (1 + dev / 100);
      return {
        code: x.code, name: x.name, factor: x.factor,
        theory: Math.round(x.hz * 10) / 10,
        measured: Math.round(measured * 10) / 10,
        dev: Math.round(dev * 10) / 10,
        detected,
        verdict: detected ? "模型置入该分量" : (stateKey === "normal" ? "无故障分量" : "未置入")
      };
    });
  }

  global.Datasets = {
    FACTORS, NAMES, ELEMENT_LABEL, META, theory, identifySim,
    /** 真实样本清单（波形到位时返回，否则空数组） */
    realSamples() {
      return global.CWRU && global.CWRU.ready() ? global.CWRU.samples() : [];
    }
  };
})(window);
