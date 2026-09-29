# 8 个独立智能体应用 · 架构规划设计（v2）

> **改造动因**：原方案是「单应用 + 套件标签页」，8 个赛题模块共用一个入口 HTML 与一套侧边导航，本质上仍是**一个应用**。
> 现按「**每个赛题 = 一个独立智能体应用**」重新规划：独立目录、独立入口、独立 JS、独立端口、独立公网 URL、独立业务导航。

---

## 一、 架构可行性依据（已实测）

平台支持**多端口独立对外暴露**，每个端口有独立公网域名：

```
https://<PORT>-08fe446a69af16a6.code.cosmoplat.cn/
```

实测证据（容器内 8081~8088 启动监听后，从外部公网逐端口请求）：

| 端口 | HTTP | 返回体 |
| :--- | :--- | :--- |
| 8080 | 200 | 现有 PredictOps 应用首页 |
| 8081 | 200 | `PORT-8081-OK` |
| 8082 | 200 | `PORT-8082-OK` |
| 8083 | 200 | `PORT-8083-OK` |
| 8084 | 200 | `PORT-8084-OK` |
| 8085 | 200 | `PORT-8085-OK` |
| 8086 | 200 | `PORT-8086-OK` |
| 8087 | 200 | `PORT-8087-OK` |
| 8088 | 200 | `PORT-8088-OK` |

结论：**8 个智能体可各自独立部署、独立访问**。

---

## 二、 端口与智能体映射

| 端口 | 智能体名称 | 英文代号 | 目录 | 独立访问地址 |
| :--- | :--- | :--- | :--- | :--- |
| 8081 | 换产协同智能体 | ChangeoverOps | `agents/changeover/` | `https://8081-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8082 | 空压站调度智能体 | AirStationOps | `agents/airstation/` | `https://8082-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8083 | 图纸解析智能体 | DrawingOps | `agents/drawing/` | `https://8083-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8084 | 设备健康智能体 | PredictOps | `agents/predict/` | `https://8084-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8085 | 质量归因智能体 | QualityOps | `agents/quality/` | `https://8085-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8086 | 经营问数智能体 | DataMind BI | `agents/bimind/` | `https://8086-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8087 | 智能客服智能体 | SalesAgent | `agents/salesagent/` | `https://8087-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8088 | 协同决策中枢智能体 | SwarmOps | `agents/swarm/` | `https://8088-08fe446a69af16a6.code.cosmoplat.cn/` |
| 8080 | 智能体门户（导航） | Agent Portal | `portal/` | `https://8080-08fe446a69af16a6.code.cosmoplat.cn/` |

---

## 三、 目录结构

```
/workspace/
├── agents/
│   ├── changeover/          # :8081
│   │   ├── index.html       # 独立入口，自带品牌区 / 顶栏 / 侧边导航 / 视图
│   │   └── assets/
│   │       ├── core.css     # 共享设计系统（深色工业视觉规范）
│   │       ├── echarts.min.js
│   │       ├── core.js      # 共享运行时：图表 / 弹窗 / 抽屉 / 提示 / 格式化
│   │       └── app.js       # 该智能体专属业务逻辑（与其它智能体零耦合）
│   ├── airstation/          # :8082  同构
│   ├── drawing/             # :8083
│   ├── predict/             # :8084
│   ├── quality/             # :8085
│   ├── bimind/              # :8086
│   ├── salesagent/          # :8087
│   └── swarm/               # :8088
├── portal/                  # :8080  智能体门户
├── start-all.sh             # 一键幂等启动 9 个服务 + 端口健康自愈
├── start.sh                 # 兼容保留
└── logs/                    # 各智能体运行日志与 pid
```

**自包含原则**：每个 `agents/<name>/` 目录自带完整 `assets/`，可单独打包迁移部署，互不依赖。

---

## 四、 共享运行时 `core.js` 契约

所有智能体复用同一套底层能力，业务逻辑彼此隔离：

| 接口 | 说明 |
| :--- | :--- |
| `AgentUI.chart(id, option)` | ECharts 实例管理（init / resize / dispose 生命周期统一） |
| `AgentUI.toast(type, msg)` | 轻提示（ok / warn / info） |
| `AgentUI.modal(title, html)` / `closeModal()` | 通用模态框 |
| `AgentUI.drawer(title, html)` / `closeDrawer()` | 通用抽屉面板 |
| `AgentUI.download(name, content, mime)` | 前端文件导出（CSV / Excel / HTML） |
| `AgentUI.fmt.{yuan, pct, num, clockStr}` | 统一数值与时间格式化 |
| `AgentUI.mod.router(navMap)` | 各智能体自己的视图切换器 |

---

## 五、 各智能体业务视图与 KPI 规格

| 智能体 | 业务视图（侧边导航） | 顶栏核心 KPI | 关键交互模块 |
| :--- | :--- | :--- | :--- |
| **changeover** 换产协同 | 换产总览 / 智能体协同 / 排程甘特 / 异常重排 | 换产时间、OEE、协同响应、单次换产收益 | 六智能体负荷矩阵；基准协同 / AGV 延误 / 延误重排程三态甘特图 |
| **airstation** 空压站调度 | 站房总览 / 机组负荷分配 / 喘振防护 / 设备健康 | 比功率、母管压力、能效提升率、喘振裕度 | MINLP 负荷分配表；母管压力趋势；喘振裕度曲线与提前预警 |
| **drawing** 图纸解析 | 图纸解析 / 三维预览 / 尺寸链校验 / BOM 与导出 | 字段识别率、BOM 条目、干涉概率、解析耗时 | 工程图字段抽取；参数化三维预览；蒙特卡洛公差验算；CSV/Excel 导出 |
| **predict** 设备健康 | 感知层 / 推理层 / 决策层 / 知识层 | 预警准确率、误报率、在监设备、实时告警 | CWRU/PHM 基准数据集面板；五维健康评分依据；RUL 预测；工单闭环；知识库问答；报表导出 |
| **quality** 质量归因 | 缺陷识别 / 根因溯源 / 工艺纠偏 / 闭环验证 | 识别准确率、根因定位率、建议可执行率、缺陷率 | 多类别缺陷识别；4M1E 因果溯源桑基图；贝叶斯工艺参数反调 |
| **bimind** 经营问数 | 对话问数 / 图表分析 / 运营日报 | 问数准确率、平均响应、图表类型数、上下文轮数 | NL2SQL 输入与 SQL 展示；图表类型自适应；多轮指代追问；日报生成 |
| **salesagent** 智能客服 | 会话工作台 / 产品推荐 / 线索管理 | 意图识别率、推荐命中率、线索识别率、首响时间 | 多轮对话；产品横向对比卡；意向打分与线索卡沉淀 |
| **swarm** 协同决策中枢 | 中枢拓扑 / 多目标寻优 / 可解释决策 / 策略迭代 | 综合收益、决策耗时、可解释评分、迭代周期 | 智能体拓扑图；Pareto 前沿与膝点解；因果推理链展示 |

---

## 六、 部署与守护

1. `start-all.sh`：幂等启动 9 个静态服务，各写 pid 与日志到 `logs/`，启动后逐个 curl 健康检查；
2. supervisor 循环：每 30s 巡检端口，异常自动拉起，日志落盘；
3. 平台「进程守护」：注册守护条目（健康检查端口 8080），实现容器级自动恢复；
4. 门户 `:8080` 的 8 张卡片链接在**运行时由 `location.host` 推导**（替换主机名中的端口段），保证整体可移植。

---

## 七、 与提报信息的联动

- 各赛题提交的应用链接改为对应智能体的独立 URL（例：设备健康智能体 → `https://8084-...`）；
- 门户 `:8080` 作为总入口，可放在作品说明文章的「快速体验」处；
- 大赛官网作品链接在 **2026-10-15 23:59:59 前**仍可修改，需同步更新。
