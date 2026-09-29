# 智维 · 工业智能体集群（PredictOps Agent Cluster）

> **8 个各自独立部署、独立访问、独立管理的工业智能体应用**
> 每个智能体一套独立目录、独立入口 HTML、独立业务逻辑、独立运行端口与独立公网 URL，可按需单独迁移或下线，互不影响。

**集群门户（总入口）**：[https://8080-08fe446a69af16a6.code.cosmoplat.cn/](https://8080-08fe446a69af16a6.code.cosmoplat.cn/)

---

## 一、 智能体清册

| # | 智能体 | 英文代号 | 端口 | 独立访问地址 | 核心业务视图 |
| :- | :--- | :--- | :--- | :--- | :--- |
| 01 | 换产协同智能体 | ChangeoverOps | 8081 | [打开](https://8081-08fe446a69af16a6.code.cosmoplat.cn/) | 换产总览 / 智能体协同 / 排程甘特 / 异常重排 |
| 02 | 空压站调度智能体 | AirStationOps | 8082 | [打开](https://8082-08fe446a69af16a6.code.cosmoplat.cn/) | 站房总览 / 机组负荷分配 / 喘振防护 / 设备健康 |
| 03 | 图纸解析智能体 | DrawingOps | 8083 | [打开](https://8083-08fe446a69af16a6.code.cosmoplat.cn/) | 图纸解析 / 三维预览 / 尺寸链校验 / BOM 与导出 |
| 04 | 设备健康智能体 | PredictOps | 8084 | [打开](https://8084-08fe446a69af16a6.code.cosmoplat.cn/) | 感知层 / 推理层 / 决策层 / 知识层 / 数据集与评估 |
| 05 | 质量归因智能体 | QualityOps | 8085 | [打开](https://8085-08fe446a69af16a6.code.cosmoplat.cn/) | 缺陷识别 / 根因溯源 / 工艺纠偏 / 闭环验证 |
| 06 | 经营问数智能体 | DataMind BI | 8086 | [打开](https://8086-08fe446a69af16a6.code.cosmoplat.cn/) | 对话问数 / 图表分析 / 运营日报 |
| 07 | 智能客服智能体 | SalesAgent | 8087 | [打开](https://8087-08fe446a69af16a6.code.cosmoplat.cn/) | 会话工作台 / 产品推荐 / 线索管理 |
| 08 | 协同决策中枢 | SwarmOps | 8088 | [打开](https://8088-08fe446a69af16a6.code.cosmoplat.cn/) | 中枢拓扑 / 多目标寻优 / 可解释决策 / 策略迭代 |

---

## 二、 目录结构

```
.
├── agents/                     # 8 个独立智能体（每个目录自包含、可单独部署）
│   ├── changeover/             #   :8081  index.html + assets/{core.css, core.js, app.js}
│   ├── airstation/             #   :8082
│   ├── drawing/                #   :8083
│   ├── predict/                #   :8084  （含 data.js / dataset.js / knowledge.js / charts.js / eval.js）
│   ├── quality/                #   :8085
│   ├── bimind/                 #   :8086
│   ├── salesagent/             #   :8087
│   └── swarm/                  #   :8088
├── portal/                     # 集群门户 :8080（8 张卡片导航，链接运行时按 host 推导）
├── shared/
│   └── echarts.min.js          # 单一第三方依赖源（部署时各智能体各自持有一份副本）
├── docs/
│   └── ARCHITECTURE_8_AGENTS.md# 架构规划与验收记录
├── solutions/                  # 各智能体对应的技术方案报告
├── legacy/                     # 早期单应用版本（已归档，保留历史）
└── start.sh                    # 单服务启动脚本（兼容保留）
```

**自包含原则**：每个 `agents/<name>/` 自带完整 `assets/`，可整目录打包迁移，不依赖其它智能体。

---

## 三、 共享运行时契约 `core.js`

8 个智能体复用同一套底层能力，业务逻辑彼此隔离：

| 接口 | 说明 |
| :--- | :--- |
| `AgentUI.chart(id, option)` | ECharts 实例生命周期统一管理（init / resize / dispose） |
| `AgentUI.toast(type, msg)` | 轻提示（ok / warn / info） |
| `AgentUI.modal(title, html)` / `closeModal()` | 通用模态框 |
| `AgentUI.drawer(title, html)` / `closeDrawer()` | 通用抽屉面板 |
| `AgentUI.download(name, content, mime)` | 前端导出（CSV / Excel / HTML） |
| `AgentUI.fmt.{yuan, pct, num, clockStr}` | 数值与时间格式化 |
| `AgentUI.router(navMap)` / `boot(cfg)` | 视图切换与外壳装配 |

---

## 四、 快速启动

```bash
# 单个智能体（以其自身目录为站点根）
cd agents/changeover && python3 -m http.server 8081 --bind 0.0.0.0

# 门户
cd portal && python3 -m http.server 8080 --bind 0.0.0.0
```

浏览器访问：[http://localhost:8080/](http://localhost:8080/)

---

## 五、 开源许可

本项目代码遵循 [Apache-2.0 License](LICENSE) 开源协议。
