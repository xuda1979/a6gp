# A6GP：Agent 原生 6G 网络协议——协议规范、架构、安全与一致性验证

**版本：4.0（协议技术规范增强版）**  
**日期：2026-10-04**  
**协议状态：Pre-standard Research Specification / 预标准研究规范**  
**语义版本：A6GP 0.4**

## 摘要

本规范提出一个面向 6G 的 Agent 原生协议体系 **A6GP（Agent-Native 6G Protocol）**。这里的“Agent 原生”不是在现有 5G/6G 网络管理系统上增加一个大模型聊天入口，而是把 **Agent 身份、能力、意图、委托、权限、动作事务、证据、恢复和治理**提升为协议级原语，使自治智能体能够在 UE、RAN、核心网、边缘计算、云、网络数字孪生以及第三方业务之间进行可验证的协作。

本报告的核心判断是：6G 很可能会从“AI-assisted network”进一步演进到“agent-mediated / agent-native network”，但一般大模型不应直接进入 PHY/MAC 的最紧实时闭环。真正可落地的架构应采用“**推理智能与确定性执行分离**”：智能体负责目标理解、跨域协商、规划、分解、推演与策略生成；安全内核负责权限审查、动作校验、事务提交、冲突控制、证据验收与回滚；PHY/MAC 等亚毫秒级闭环继续由确定性算法、编译后的策略或经过验证的轻量模型执行。

A6GP 因此不是 A2A 或 MCP 的重复实现。A2A 解决异构 Agent 的任务交互与协作，MCP 解决模型/Agent 与工具和数据之间的标准连接；A6GP 增加电信网络控制所必须的语义：**短时可撤销的权限租约、作用域继承、风险等级、时间等级、prepare/authorize/commit/reconcile/compensate 事务、未知副作用状态、证据门、拓扑绑定、数字孪生预检、阈值授权和失效安全策略**。

截至 2026 年 10 月，这一方向与标准演进高度一致。ITU IMT-2030 已把 AI and Communication（AIAC）与 ubiquitous intelligence 纳入 6G 框架；3GPP Release 20 已建立 TR 29.832《Study on the Protocol for Artificial Intelligence in 6G》，其 0.2.0 版本在 2026-09-14 上传；ETSI 在 2026-09-14 发布 GS ENI 059 V4.1.1，明确研究 AI Agent 与其他 Agent、工具、数据源、UE、基站和算力平台之间的接口，并专门分析 A2A/MCP 在电信环境中的差距；O-RAN Release 5 已增加跨 Non-RT RIC 与 Near-RT RIC 的 AI/ML workflow。A6GP 的研究价值因此不在于宣称“6G 会有 Agent”，而在于提出更严格的 **transactional, evidence-grounded, safety-bounded agent networking**。

为了使协议从“研究型架构”进一步走向“可实现协议”，v4.0 把若干此前只在概念层出现的机制提升为明确的规范性约束：统一 `a6gp://` 层级资源作用域；协议版本与 critical extension 协商；RFC 8785 风格的规范化消息哈希；合同 revision、topology version、policy version 与 precondition snapshot 的 TOCTOU 绑定；R3 多权威域阈值授权；稳定幂等身份；`UNKNOWN -> RECONCILE` 执行对账；证据来源独立性与 freshness；以及 Core / Telecom-Control / Federation / Policy-Artifact / Secure-Binding 五类 conformance profile。

参考运行时也同步升级：协议 Envelope、代码版本与文档版本统一为 0.4；资源权限不再依赖模糊字符串前缀；真正实现 ACK 丢失后的 UNKNOWN/对账；加入父租约吊销级联、跨租户隔离、R3 quorum、拓扑/合同版本漂移拒绝等测试。当前 reference runtime 的核心一致性测试扩展为 14 项并全部通过。

---

## 1. 研究问题：什么才叫“Agent 原生 6G”

### 1.1 从 AI-assisted 到 Agent-native

传统 AI 网络优化通常仍然以现有网元和控制器为中心。AI 模型被放在某个分析、预测或优化模块中，输出一个参数、告警、策略或推荐。网络本身并不理解“一个自治 Agent 正在代表谁、拥有什么权限、承担什么目标、可以把什么任务委托给谁、动作执行成功的证据是什么”。

Agent 原生网络改变的是**控制抽象**。网络中的自治实体成为可追责的协议主体。一个 RAN Agent 不只是“调用模型的进程”，它需要拥有可验证身份、租户/运营商归属、能力声明、权限边界、任务合同、动作历史、证据历史和可撤销状态。另一个 Core Agent 可以发现它、协商目标、授予受限能力、要求其提交证据，并在它异常时撤销权限或转移任务。

因此，本报告把 Agent-native 定义为：

> **网络协议能够原生表达、约束和验证自治智能体之间的目标协商、能力发现、权限委托、动作执行、证据验收和故障恢复，而不是仅把 Agent 当作协议之外的应用程序。**

### 1.2 为什么普通 RPC、A2A 或 MCP 还不够

通用 Agent 协议已经解决了很多重要问题。A2A 1.0 已把 AgentCard、Task、Message、Artifact 以及多协议绑定做成正式协议，并以 Protobuf 作为规范数据定义；MCP 2026-07-28 则进一步转向 stateless protocol core，引入 `server/discover`、扩展框架、授权增强与长任务机制。但电信控制还需要额外的强约束：

- 动作是否会影响真实网络资源，而不仅是产生文本或调用普通 SaaS 工具；
- 一个动作是读取、可逆优化、跨域变更，还是可能导致大面积业务影响；
- 同一动作是否因为网络分区/丢包被重复执行；
- 模型输出“成功”是否有独立测量证据；
- 当前 Agent 对某个 cell、slice、UPF、edge cluster 是否真的有权限；
- 一个父 Agent 是否把比自己更大的权限委托给了子 Agent；
- 当 RAN 和 Core 的两个动作只有一半成功时，如何补偿；
- 当执行结果未知时，是重试、查询原动作、回滚还是人工接管；
- LLM 服务不可用时，网络是否还能按照安全退化策略运行。

这些问题决定了 A6GP 必须以**事务、安全、证据和时间尺度**为中心。

### 1.3 Agent-native 不等于 LLM-native

这是整个设计中最重要的边界。电信网络是强实时、强状态、强安全系统。LLM 的 token-by-token 生成、随机性、上下文漂移和秒级推理不适合直接控制亚毫秒级物理层闭环。A6GP 因此明确区分：

- **Reasoning Plane**：Agent/LLM/World Model 进行理解、协商、计划、反事实推演和策略生成；
- **Safety & Transaction Plane**：确定性地做权限、冲突、预算、预条件、回滚能力和数字孪生校验；
- **Execution Plane**：将已授权动作转换为网元 API、RIC policy、编译策略、控制参数或数据面程序；
- **Evidence Plane**：通过独立测量判断动作是否真的达到合同目标。

这使 6G 的“智能”可以很强，同时保证最底层执行仍然可证明、可审计、可回退。

---

## 2. 2023-2026 标准与产业演进：为什么现在值得做

### 2.1 ITU IMT-2030：AI 已成为 6G 使用场景与设计原则

ITU-R M.2160 在 2023 年建立 IMT-2030 框架。2026 年 2 月，ITU-R WP 5D 完成 IMT-2030 技术性能要求草案。公开材料列出六类使用场景：Immersive Communication、HRLLC、Massive Communication、Ubiquitous Connectivity、AI and Communication（AIAC）以及 ISAC，并把 security/resilience、ubiquitous intelligence、sustainability 等列为总体设计原则。

这意味着 AI 在 6G 中不再只是运营侧优化算法，而是进入了系统能力定义。A6GP 的定位仍然是系统/控制协议，不替代无线空口候选技术，但可成为 AIAC 和 ubiquitous intelligence 的控制语义层。

### 2.2 3GPP Release 20：已经出现“AI in 6G protocol”专门研究

3GPP Portal 显示 TR 29.832《Study on the Protocol for Artificial Intelligence in 6G》于 2026-06-16 建立，责任组为 CT3，Release 20，2026-09-14 已上传 0.2.0。该事实非常重要：它证明“AI 协议”已经从架构讨论进入 3GPP 核心网协议研究域。

与 A6GP 相关的更广泛 6G 工作还包括 6G system architecture、network capability exposure、core control-plane protocols、management/orchestration 和 6G security。A6GP 应把这些工作当成对接边界，避免自成孤岛。

### 2.3 ETSI ENI：Agent 接口已从研究进入可实现规范

ETSI GS ENI 059 V4.1.1 在 2026-09-14 发布。其官方 scope 明确覆盖 Agent 与：

- 其他 Agent；
- tools 和 data sources；
- centralized agent repository function；
- UE；
- 第三方应用；
- 基站、计算平台等网络基础设施。

更关键的是，ENI 059 明确分析 A2A、MCP 与电信 Agent interface/protocol requirements 的 gap。其公开内容还覆盖六类主要接口、面向 RAN 的 NGAP 扩展分析以及 HTTP/JSON-REST、JSON-RPC、gRPC 等绑定，并推荐面向未来的 HTTP/3 + gRPC 方向。因此 A6GP v4.0 不再把“定义 Agent 接口”本身视作差异化，而把重点收敛到 ENI/A2A/MCP 之上的 **network side-effect transaction、lease-chain authority、TOCTOU binding、UNKNOWN reconciliation、evidence-gated completion 与 domain-sovereign saga**。

ENI 还形成了一个连续研究链：AI-Agent core use cases（ENI 055）、multi-agent core frameworks（ENI 056）、intent pre-processing（ENI 057）、LLM tool usage（ENI 058）、Agent protocol（ENI 059）、network AI-agent training（ENI 060）以及 AI-agent core security（ENI 062）。因此未来标准研究很可能从“接口”继续向“自治控制和安全治理”推进。

### 2.4 O-RAN：最适合做早期实验的现实载体

O-RAN Release 5 于 2026-06 完成，其中明确包含 AI RAN framework enhancement 与跨 Non-RT RIC、Near-RT RIC 的 AI/ML workflow。O-RAN 具备：

- SMO / Non-RT RIC / Near-RT RIC 的时间尺度分层；
- R1/A1/E2/O1/O2 等开放接口；
- xApp/rApp、策略、遥测与模型生命周期；
- 可以在不改 PHY 标准的情况下做控制语义实验。

因此第一阶段 A6GP 实验不应从“重新定义整个 6G”开始，而应做一个 **A6GP-over-O-RAN** 的实验系统：Agent 负责 intent/contract/delegation，RIC/SMO 执行受约束策略，Evidence Fabric 验证 KPI。

### 2.5 对标准竞争态势的判断

A6GP 不应声称“最早提出 6G Agent 协议”，因为 2025-2026 ETSI/3GPP 已经公开进入这一方向。真正可能形成原创贡献的是：

1. 把 Agent action 明确定义为**网络事务**而非普通 tool call；
2. 把授权定义为**短生命周期、可撤销、hash-bound 的 capability lease**；
3. 把成功定义为**独立 evidence gate**而非模型自报；
4. 把 lost reply / unknown side effect 定义为**协议一等状态**；
5. 把通用 Agent 推理编译到**不同网络时间尺度**；
6. 把跨 RAN/Core/Edge 协作定义为**federated saga**；
7. 把每次自治控制沉淀为**episode/outcome graph**，形成可学习的运营知识资产。

---

## 3. 第一性原理：6G Agent 协议必须解决的七个矛盾

### 3.1 自主性 vs. 确定性

Agent 要有能力在未知情况下制定新计划；网络又要求同一输入和状态下得到可预测动作。解决办法是让“计划”开放，让“执行准入”确定。模型可以提出任何候选方案，但真正进入网络的动作必须通过 schema、policy、lease、precondition 和 safety gate。

### 3.2 全局最优 vs. 域自治

RAN、Core、Transport、Edge、Cloud、Security 的目标不同，也不应由一个超级 Agent 统一掌权。A6GP 采用**域自治 + 合同协商**：每个域保留 commit 权，跨域 Agent 只能协调 saga，不能越权覆盖本地 safety authority。

### 3.3 高级语义 vs. 二进制协议

用户或业务表达可能是“保障这个工业控制业务，同时最低能耗”，而网元只接受结构化字段。A6GP 在 Intent Contract 中把自然语言目标编译为机器可验证的约束、SLO、allowed actions 和 evidence policy。自然语言不直接下沉为信令。

### 3.4 持续学习 vs. 稳定运行

自治网络需要学习，但在线学习不能随意改变安全边界。A6GP 把 learned policy 和 authority policy 分离。学习系统可以建议新阈值、新策略、新分解方式；安全核决定它是否被 admit。

### 3.5 多 Agent 并行 vs. 动作冲突

多个 Agent 可能同时优化功率、PRB、波束、切片和算力，局部最优会互相破坏。A6GP 把网络资源作用域与动作冲突写入 transaction admission，在 commit 前进行 conflict detection 和 dependency ordering。

### 3.6 故障恢复 vs. 重复副作用

软件 Agent 常见的“失败就重试”在网络控制中可能非常危险。例如第一次动作已经执行，只是 ACK 丢失，再次执行可能把参数翻倍或重复切换。A6GP 强制 side-effect 操作使用稳定 idempotency key，并把 UNKNOWN 结果导向 RECONCILE，而不是盲重提新动作。

### 3.7 模型速度 vs. 网络实时性

最强的通用模型可能需要数百毫秒到数十秒，但 RAN 最底层控制是微秒到毫秒。解决方法不是放弃 Agent，而是做 **time-scale compilation**：T3/T4 Agent 生成经过验证的 policy artifact，在 T0/T1 由确定性执行器或小模型运行。

---

## 4. A6GP 总体架构：6G Agent Fabric

A6GP 建议将 6G 智能控制体系分为八个逻辑平面。它们可以物理共址，也可以分布部署。

### 4.1 Identity & Trust Plane

维护 Agent identity、operator/tenant binding、platform attestation、trust level、证书、吊销和身份映射。一个 Agent 可以代表 UE、应用、运营商、网元域或第三方，但代表关系必须可验证。

### 4.2 Capability & Registry Plane

维护 Agent Card / Capability Descriptor：Agent 能做什么、读什么、改什么、在哪个地域/切片/租户生效、支持哪些 action schema、最大风险等级、可用时间等级以及是否支持 delegation。

### 4.3 Intent & Contract Plane

把业务/网络目标转化为可验证合同。合同包含：goal、scope、SLO、hard constraints、allowed actions、required observations、risk、timing class、evidence policy、fallback、expiry 和 revision。

### 4.4 Reasoning & Planning Plane

运行 LLM、World Model、优化器、规则系统或多 Agent planner。它只能提出计划、子任务和候选动作，不拥有最终 commit 权。

### 4.5 Safety & Authority Plane

由确定性策略引擎和安全内核实现。负责 capability lease、least privilege、risk escalation、quorum authorization、conflict check、resource budget、digital-twin precheck 和 runtime guard。

### 4.6 Transaction Execution Plane

负责 ACTION_PREPARE / AUTHORIZE / COMMIT / STATUS / ROLLBACK / RECONCILE。它通过 O-RAN、3GPP SBI、Kubernetes、SDN、设备 API 或其他适配器执行真实动作。

### 4.7 Evidence & World-State Plane

维护网络观测、拓扑、数字孪生、动作前后快照、指标、测量合同、证据 provenance 和冲突记录。任何“成功”必须能追溯到该平面。

### 4.8 Learning & Governance Plane

把每次自治控制变成 episode：目标、计划、动作、失败、恢复、结果、成本、时间和证据。长期用于离线策略学习、Agent routing、故障模式挖掘、合规审计和模型评测。

---

## 5. 五级时间尺度：把 Agent 能力编译进实时网络

本报告建议 A6GP 消息携带 `timingClass`。以下区间是研究设计区间，不声称是 3GPP 规范边界。

| 等级 | 参考时间预算 | 典型任务 | Agent 行为 |
|---|---:|---|---|
| T0 | <0.1 ms | PHY/data-plane 极紧闭环 | 不运行自由推理；只执行已验证 deterministic artifact |
| T1 | 0.1-10 ms | MAC/RLC 局部控制、快速调度保护 | 轻量模型/编译 policy + deterministic guard |
| T2 | 10 ms-1 s | Near-RT RAN 控制、快速跨层决策 | 专用 Agent / optimizer，可调用有限模型 |
| T3 | 1 s-数分钟 | 跨 RAN/Core/Edge 协商、复杂规划 | 通用 Agent、多 Agent 协作、world model 推演 |
| T4 | 分钟-天 | 训练、仿真、离线优化、策略发现 | 大模型/大规模 agent swarm / 大型数字孪生 |

### 5.1 Time-Scale Compiler

T3/T4 Agent 不直接不断调用 T0/T1。它输出一个 **Policy Artifact**：

- 输入变量及范围；
- 动作空间；
- hard guard；
- fallback；
- 版本/hash；
- 适用 topology；
- 有效期；
- 验证报告；
- rollback policy。

Policy Artifact 经 Safety Plane 验证后部署到 RIC、边缘节点或设备内。这样 Agent 的高层智能被“编译”到低层可预测执行逻辑中。

### 5.2 为什么这比“边缘部署更小 LLM”更重要

仅仅把模型做小仍然不能自动解决权限、冲突、重复副作用和证据问题。时间尺度编译不仅是推理加速问题，更是把**开放式决策转换成有限状态安全控制器**的问题。

---

## 6. 协议对象模型

### 6.1 AgentPrincipal

核心字段：

- `agentId`
- `principalType`：UE / RAN / CORE / EDGE / APP / OPERATOR / SECURITY / THIRD_PARTY
- `tenant`
- `operatorDomain`
- `identityKey`
- `attestation`
- `trustTier`
- `status`
- `capabilityDescriptorHash`

### 6.2 CapabilityDescriptor

定义 Agent 能提供的能力，不使用模糊自然语言作为执行契约。包含 action schema、read resources、write resources、timing classes、risk ceiling、required evidence、cost limits 和 delegation policy。

### 6.3 IntentContract

这是 A6GP 的核心对象。必须至少包含：

- `contractId` 和 revision；
- 目标与业务上下文；
- 网络 scope；
- hard constraints；
- optimization objectives；
- SLO/SLA；
- allowed action classes；
- required observations；
- authority policy；
- risk class；
- timing class；
- evidence policy；
- fallback / compensation；
- termination conditions；
- valid-from / valid-until。

### 6.4 AuthorityLease

Lease 不是永久角色。它是一段短时、可撤销、作用域受限的执行权：

`Lease = {subject, scope, actionSet, riskCeiling, validUntil, parentLease, constraints, nonce}`

子 Lease 必须满足：

- child.scope ⊆ parent.scope
- child.actions ⊆ parent.actions
- child.risk ≤ parent.risk
- child.validUntil ≤ parent.validUntil

### 6.5 ActionProposal / ActionAuthorization

ActionProposal 是候选副作用。Authorization 必须绑定 proposal 的 canonical hash，避免 Agent 在获批后偷偷替换参数。

### 6.6 EvidenceRecord

Evidence 是可机读的结果证明：source identity、metric contract、time window、resource identity、measurement method、artifact hash、verdict（PASS/FAIL/UNKNOWN）、confidence/strength。

### 6.7 EpisodeRecord

一次合同执行结束后形成不可变 episode，包含全量 lineage。它是长期自治学习和运营知识资产的基本单元。

---


## 7. 资源命名空间、协议版本与规范消息封装

A6GP 需要同时约束语义对象与 wire-level contract。v0.4 定义协议级规范化层，使不同实现能够对同一个动作、作用域和授权得到相同解释。

### 7.1 `a6gp://` 层级资源作用域

A6GP 使用结构化 URI 作为网络资源权限命名空间：

```text
a6gp://<authority>/<domain>/<resource-segment>[/<resource-segment>...]
```

示例：

```text
a6gp://operator-a/ran/site-17
a6gp://operator-a/ran/site-17/cell-3
a6gp://operator-a/core/upf-west-2
a6gp://operator-a/edge/zone-3/gpu-pool-2
```

父 scope 只有在 authority、domain 完全相同，并且路径 segment 逐段精确匹配时才包含子 scope。`site-17` 不得因为字符串前缀误授权 `site-170`；子 lease 也不得凭借一个 cell scope 反向操作 site 或整个 RAN。Core profile 默认不允许隐式 wildcard。

### 7.2 协议版本与降级保护

A6GP 使用 `major.minor` 语义版本。每个 peer 应声明支持的 protocol versions、conformance profiles、bindings 与 extensions。协商出的版本和 critical extension 必须进入签名上下文；未知 critical extension 或未经协商的版本降级必须拒绝。

### 7.3 Canonical Envelope

v4.0 的所有控制消息共享统一封装：`protocolVersion`、`messageType`、`messageId`、`transactionId`、sender/receiver、tenant、timing/risk class、contract/revision、topologyVersion、leaseId、idempotencyKey、`bodyHash`、签名算法、keyId、critical extensions 和 body。

JSON reference binding 建议使用 RFC 8785 JSON Canonicalization Scheme 计算 canonical bytes，并对 `bodyHash` 与 envelope 签名。这样同一动作在不同语言实现里可以生成稳定哈希，避免“字段顺序不同导致授权不一致”。二进制实现可以采用 Protobuf/gRPC 或 CBOR/COSE，但必须保持完全相同的语义字段与状态机。

### 7.4 消息新鲜度与 replay 防护

接收方必须拒绝过期消息、非法签名、未声明的关键扩展、租户/authority 上下文不一致以及禁止重放的重复 `messageId`。时钟偏差容忍必须由部署策略明确配置，而且不能通过 clock-skew 容忍延长 lease 或 authorization 的有效期。

### 7.5 为什么这一步重要

如果协议只定义“有哪些对象”，而不定义 canonicalization、版本、scope、replay、critical extension 和签名上下文，那么两个实现即使都声称支持 A6GP，也可能对“同一个授权究竟授权了什么”产生不同解释。v4.0 把这些问题提升为协议兼容性的核心部分。

## 8. A6GP 消息族与协议流程

### 8.1 身份/注册/能力发现

- `AGENT_REGISTER`
- `AGENT_ATTEST`
- `AGENT_STATUS`
- `CAPABILITY_ADVERTISE`
- `CAPABILITY_QUERY`
- `CAPABILITY_RESULT`
- `AGENT_REVOKE`

目标是让“谁能做什么”成为协议事实，而不是 prompt 中的口头描述。

### 8.2 意图与协商

- `INTENT_SUBMIT`
- `INTENT_OFFER`
- `PLAN_PROPOSE`
- `CONSTRAINT_CHALLENGE`
- `PLAN_COUNTER`
- `CONTRACT_PROPOSE`
- `CONTRACT_ACCEPT`
- `CONTRACT_REJECT`
- `CONTRACT_AMEND`

Agent 可以在这里自由推理，但合同的最终 admission 由 host/safety authority 决定。

### 8.3 委托与协作

- `DELEGATION_PROPOSE`
- `DELEGATION_GRANT`
- `DELEGATION_REJECT`
- `DELEGATION_REVOKE`
- `TASK_PROGRESS`
- `TASK_RESULT`

委托使用 capability lease 而不是把父 Agent 的完整 credential 复制给子 Agent。

### 8.4 动作事务

- `ACTION_PREPARE`
- `ACTION_CHALLENGE`
- `ACTION_AUTHORIZED`
- `ACTION_REJECTED`
- `ACTION_COMMIT`
- `ACTION_ACK`
- `ACTION_STATUS`
- `ACTION_ROLLBACK`
- `ACTION_COMPENSATE`
- `RECONCILE_REQUEST`
- `RECONCILE_RESULT`

### 8.5 证据与完成

- `EVIDENCE_SUBMIT`
- `EVIDENCE_QUERY`
- `EVIDENCE_CONFLICT`
- `ADJUDICATION_REQUEST`
- `RESULT_ATTEST`
- `CONTRACT_CLOSE`

### 8.6 生命期与恢复

- `LEASE_GRANT`
- `LEASE_RENEW`
- `LEASE_EXPIRE`
- `HEARTBEAT`
- `FAILOVER_CLAIM`
- `QUARANTINE`
- `RECOVERY_PROPOSE`

---

## 9. Action Transaction：Agent 网络控制的核心创新

### 9.1 为什么网络动作必须事务化

普通 Agent 工具调用通常认为“HTTP 200 = 完成”。但真实网络控制存在 partial failure、stale state、race condition、packet loss、controller failover 和 cross-domain inconsistency。A6GP 把真实网络动作视为事务。

### 9.2 PREPARE

Agent 提交：action kind、target、parameters、preconditions、expected effect、risk estimate、evidence plan、rollback/compensation。

Safety Plane 验证：

- identity 和 attestation；
- lease 是否有效；
- target 是否在 scope；
- action 是否被 contract 允许；
- topology/version 是否匹配；
- 是否与其他 pending action 冲突；
- resource/cost/budget 是否超限；
- 高风险动作是否通过 digital-twin/shadow test；
- 是否存在 rollback/compensation。

### 9.3 AUTHORIZE

Authorization 生成一个短时 token：

`AuthToken = Sign(authority, actionHash, leaseChainHash, contractRevision, topologyVersion, policyVersion, preconditionSnapshotHash, approvals, expiresAt, nonce)`

只要 action 的一个参数改变，hash 改变，原 token 立即失效。

### 9.4 COMMIT

执行器收到 token 后再执行副作用。Commit 必须带稳定 `idempotencyKey`。相同 key + 相同 action hash 重放时必须返回原结果或当前状态，而不能再次制造副作用。

### 9.5 VERIFY

动作执行完成不等于合同成功。Evidence Plane 要验证 KPI、guardrail、拓扑和时间窗口。没有证据时是 `UNKNOWN`，不能被模型解释为 PASS。

### 9.6 UNKNOWN 与 RECONCILE

如果 Commit 请求发出后连接断开，控制器不知道远端是否执行：

`COMMITTING -> UNKNOWN -> RECONCILING`

系统必须使用原 actionId/idempotencyKey 查询原动作状态，而不是生成新动作。最终只能进入 VERIFIED、ROLLED_BACK、FAILED 或人工升级。

### 9.7 跨域 Saga

例如一个低时延 AI 业务要同时完成：RAN PRB 调整、UPF 选择、edge GPU 预留、模型部署。任何一个步骤失败都可能造成资源浪费或 SLA 下降。A6GP 用 saga：每一步有 local commit authority、evidence 和 compensation。全局 Agent 负责协调顺序，本地域仍保留否决权。

---


### 9.8 Stable Idempotency Scope

幂等键不应简单绑定“当前 Agent”，因为 Agent 故障切换后仍需要由新的已授权主体查询和对账旧动作。v4.0 默认把逻辑幂等范围定义为：

```text
(tenant, contractId, targetAuthorityDomain, idempotencyKey)
```

同一幂等范围如出现不同 action hash，必须返回 `IDEMPOTENCY_CONFLICT`，而不是挑一个执行。

### 9.9 Execution Receipt

执行器应返回稳定 `executionId`、`actionId`、`actionHash`、idempotency scope、执行状态、effect hash 和时间戳。`ACTION_ACK` 只能证明“执行器接受/观察到了动作状态”，不能证明合同业务目标已经达成。

### 9.10 TOCTOU：Prepare 与 Commit 之间的状态漂移

真实网络在 PREPARE 到 COMMIT 之间可能发生 topology、负载、策略或告警变化。v4.0 要求 R1-R3 授权绑定 `contractRevision`、`topologyVersion`、`policyVersion` 和 `preconditionSnapshotHash`。如果提交时这些条件过期，必须返回 `CONTRACT_REVISION_STALE`、`TOPOLOGY_STALE` 或 `PRECONDITION_STALE`，并重新进行 prepare/authorize；不得让模型自行“估计应该还没变”。

## 10. Risk Class：把“快不快”和“危险不危险”分开

Timing Class 和 Risk Class 是独立维度。

| 风险级 | 示例 | 最低要求 |
|---|---|---|
| R0 | 查询 KPI、读取 topology、仿真 | 身份认证 + read policy |
| R1 | 单小区可逆优化、低影响参数调节 | lease + idempotency + postcheck |
| R2 | 多网元/多资源变更、业务可见影响 | digital-twin/shadow precheck + rollback + independent evidence |
| R3 | 安全、计费、主权、大范围网络动作 | 多方阈值授权 + staged rollout + immutable audit + human/independent authority 可选 |

Agent 可以建议风险升高，但不能自行降低系统判定的风险等级。

---

## 11. Agent 原生安全模型

### 11.1 威胁一：Prompt Injection 变成网络动作注入

来自日志、用户文本、第三方 API 的内容可能诱导 Agent 调用高风险工具。A6GP 不把 prompt 视为权限。只有结构化 ActionProposal + lease + safety policy 才能执行。

### 11.2 威胁二：Agent 身份冒充

需要 Agent identity 与 workload/platform identity 绑定；高风险场景可要求远程 attestation。Agent Card 的 capability 不代表自动获得权限。

### 11.3 威胁三：权限扩张

通过嵌套 delegation，子 Agent 可能试图扩大 scope。协议必须在 host 侧计算 containment，而不是相信模型生成的 claims。

### 11.4 威胁四：Replay 与重复 Commit

每个 action 都有 message id、nonce、expiry、idempotency key 和 canonical action hash。历史授权不可对新的参数复用。

### 11.5 威胁五：Evidence 欺骗

Agent 不能自己说“优化成功”。Evidence 应尽量来自独立 telemetry、verifier、counter 或第三方 measurement。高风险动作的 producer 与 verifier 最好逻辑分离。

### 11.6 威胁六：多 Agent 合谋或集体错误

多数票不是事实。强证据冲突应触发 adjudication：minimal reproduction、counterexample、shadow replay 或独立 measurement。

### 11.7 威胁七：模型服务不可用

网络必须 fail-operational / fail-safe。A6GP 要定义 deterministic fallback：保持 last-known-good policy、收窄权限、退出自治优化或回到传统控制器，而不是让网络控制停摆。

---


### 11.8 Confused Deputy 与跨租户权限混淆

Agent A 拥有某个租户的合法能力，并不意味着它可以代表 Agent B 或其他租户执行动作。A6GP 把 tenant、authority domain、scope 与 lease chain 同时纳入授权验证；跨租户 lease 默认禁止，第三方 Agent 必须通过显式 federation policy 获得最小化能力。

### 11.9 Version Downgrade 与 Critical Extension

如果攻击者把支持新安全语义的连接降级到旧版本，可能绕过新约束。因此协商后的 protocol version、profile 和 critical extension 必须进入签名上下文。任何 peer 遇到未知关键扩展都必须 fail closed。

### 11.10 R3 多权威域阈值授权

安全、计费、主权或大范围网络变更不应由单一 Agent/单一控制服务独立授权。v4.0 引入 `m-of-n` authorization policy；例如 operations、security 和 service-owner 三个 authority domain 中至少两个独立域批准。来自同一 authority domain 的多个签名不能冒充“多方批准”。

## 12. Agentic RAN：A6GP 在无线接入网中的具体落地

### 12.1 可由 Agent 决策的动作层级

建议从慢到快逐步推进：

1. 运营/配置：energy mode、carrier activation、policy、model deployment；
2. Non-RT optimization：长期切片配额、模型/策略选择、节能计划；
3. Near-RT control：功率/PRB/波束/移动性策略参数；
4. T1 compiled policy：基于已验证 policy artifact 的局部快速动作；
5. T0 PHY：保留确定性或专门硬实时算法，不允许自由 Agent loop。

### 12.2 建议第一版 action taxonomy

- `ran.prb.allocate`
- `ran.power.adjust`
- `ran.beam.policy.update`
- `ran.handover.bias.update`
- `ran.energy.mode.set`
- `ran.admission.policy.update`
- `ran.measurement.policy.update`
- `ran.model.deploy`

每个 action 都应有 JSON/ASN.1/Proto schema、范围、上下限、冲突规则和回滚定义。

### 12.3 与 O-RAN 的映射原则

A6GP 不取代 O-RAN。它是智能体控制语义层：

- Agent Registry/Intent 可位于 SMO/Non-RT 层；
- T2 Agent 可映射到 Near-RT RIC service/xApp；
- Policy Artifact 可通过 A1/R1 等管理/策略机制下发；
- 实际 RAN 控制仍通过 E2 或未来 6G 接口；
- Evidence 可从 O1/E2 telemetry、RIC metric 和外部探针汇聚。

---

## 13. Agent 原生 Core / Edge / Cloud

### 13.1 Core Agent

Core Agent 可负责 slice admission、UPF selection、QoS policy、service exposure、mobility policy 和异常恢复。任何影响计费、鉴权或大范围用户的动作应至少 R2/R3。

### 13.2 Edge Compute Agent

面向 6G AI service，网络目标和算力目标会耦合。Edge Agent 可以处理：GPU/NPU placement、model replica、inference routing、cache、offload、energy budget。

### 13.3 Network + Compute 联合合同

例如：

> “在 20 分钟内保障体育场 AR 服务 P99 E2E latency < 20ms，成本不超过 X，网络能耗增量 < Y%。”

合同会被分解为 RAN、Core、Transport、Edge 多个子合同，并由 Evidence Fabric 统一验收，而不是每个域只看自己的局部 KPI。

---

## 14. World Model / Digital Twin 在 A6GP 中的角色

数字孪生不只是可视化工具，而是高风险 action 的 pre-commit oracle 之一。

### 14.1 Shadow validation

R2/R3 action 在真实 commit 前，可以先在：

- O-RAN digital twin；
- ns-3 / OMNeT++ / srsRAN 仿真；
- learned world model；
- operator replay environment

中验证 guardrail。

### 14.2 不能把仿真 PASS 当成真实 PASS

数字孪生只能提高 action 的先验可信度，不能替代真实 evidence。A6GP 应记录 simulator/model version、scenario seed、topology snapshot 和 uncertainty。

### 14.3 反事实证据

Agent 可提交“如果不执行动作会怎样”的 counterfactual 预测，但最终仍需要真实观察区分预测是否准确。长期 episode 数据可用于训练更好的 world model。

---

## 15. A6GP 协议运行时架构

A6GP 不应依赖某一个特定 Agent 框架或大模型产品。协议本身必须定义足够清晰的运行时语义，使不同厂商、不同模型、不同 RAN/Core/Edge 实现都能互操作。建议把 A6GP Runtime 分成四个互相制衡的平面：**Reasoning & Coordination、Protocol Control、Deterministic Execution、Evidence & Recovery**。

### 15.1 Reasoning & Coordination Plane

该平面负责开放式智能：理解业务 Intent、发现 Agent、拆分目标、生成候选计划、跨域协商、调用数字孪生和世界模型、提出恢复策略。它可以由 LLM、VLM、RL policy、优化器、传统算法或混合系统实现。协议不规定内部模型结构，只要求输出符合 A6GP 对象模型。

关键限制是：**该平面没有直接修改真实网络状态的最终权力**。它只能产生 `PLAN_PROPOSE`、`DELEGATE_REQUEST`、`ACTION_PREPARE` 等候选对象。

### 15.2 Protocol Control Plane

这是 A6GP 的权威核心，必须尽量确定性、可审计、可重放。它维护：

- Intent Contract 与 revision；
- Agent identity、attestation 与 capability registry；
- Authority Lease 与 delegated scope；
- Risk Class、Timing Class 与预算；
- Action Transaction 状态机；
- resource/action conflict；
- cross-domain saga；
- completion gate 与 evidence policy。

外部模型可以建议变更，但不能绕过这些状态机。任何能够改变真实网络的 `COMMIT` 都必须由该平面产生或验证授权。

### 15.3 Deterministic Execution Plane

执行平面把已授权动作映射为真实系统能力，包括 RIC policy、E2 node control、5GC SBI、UPF/transport policy、Kubernetes/edge compute 操作以及本地编译策略。这里强调两个原则：

1. `COMMIT` 必须幂等，或具有稳定 idempotency key；
2. T0/T1 动作应由确定性执行器或已验证策略执行，而不是临时调用通用 LLM。

### 15.4 Evidence & Recovery Plane

A6GP 将“执行成功”和“目标达成”严格区分。控制器 ACK 只能证明请求被接受或执行，不能证明业务 SLO 已改善。因此协议需要独立证据平面，接收 telemetry window、active probe、SLO verifier、energy measurement、security attestation、digital-twin result 等证据。

当动作结果不确定时，该平面启动 reconciliation；当多个强证据矛盾时，创建 evidence conflict；当跨域事务部分失败时，驱动 compensation 或重新规划。

### 15.5 持久化目标与动态委托图

长期网络目标不能只存在于聊天上下文。`IntentContract` 必须有持久 ID、版本、范围、SLO、预算、失效时间和证据策略。复杂目标可展开为动态 delegation graph，但子任务只能继承并收窄父级权限；任何新增节点都必须经过 admission。

这种设计允许大规模多 Agent 协作，同时避免“一个超级 manager Agent”成为单点故障和单点权威。

### 15.6 Host-owned Completion

A6GP 的完成判定属于协议控制平面，而不是模型。Agent 可以说“任务完成”，但 `CONTRACT_CLOSE` 只有在必需动作已提交、必需证据满足阈值、强冲突已解决、未决外部副作用已 reconcile 后才允许发生。

> **模型拥有建议权；协议拥有授权权；证据拥有完成权。**

## 16. A6GP v0.4 参考运行时与协议 TCK

参考实现的角色不是规定产品架构，而是把规范中的安全不变量变成可执行测试。v4.0 reference runtime 明确分离：`AgentRegistry`、`SafetyKernel`、`ProtocolRuntimeAdapter`、`ActionExecutor`、Evidence Gate 和协议对象类型。

### 16.1 结构化 Resource Scope

资源权限统一使用 `a6gp://authority/domain/...` URI，并以 segment 语义判断祖先/后代关系。这样避免 `site-17` 与 `site-170` 之类的前缀误授权，也允许父 lease 对一个 site 授权、子 lease 精确收窄到 cell。

### 16.2 Lease Chain 与级联吊销

子租约记录 parent lease；委托时必须同时收窄 scope、action set、risk ceiling 和 expiry。父 lease 被 revoke 后，所有后代 lease 和基于该链生成但尚未使用的 authorization 都必须失效。

### 16.3 ActionExecutor：真正实现 UNKNOWN/Reconcile

参考运行时通过 `ActionExecutor.ensure()` 与 `inspect()` 实现真实的 UNKNOWN/RECONCILE 语义：第一次 ensure 可以在真实效果已经 applied 后返回 `UNKNOWN`；runtime 保存原 action identity，随后只允许 `reconcile()` 查询原动作，而不是创建新动作。reference executor 可故障注入“apply 后丢 ACK”，用于证明不会产生第二次逻辑副作用。

### 16.4 Evidence Independence

EvidenceRecord 现在显式包含 `sourcePrincipal`、`sourceClass`、`independenceGroup`、`measurementContractHash`、`observedAt`、`validUntil`。协议默认不允许 executor 自报成功直接满足独立 evidence policy；过期证据、未执行动作的证据或强 FAIL 证据都必须阻塞完成门。

### 16.5 R3 Authorization Quorum

reference runtime 支持 required approvals 和 distinct authority domains。R3 测试验证“一份批准不够”“同一 authority domain 的两份批准也不够”“两个独立 authority domain 才通过”。

### 16.6 当前可执行测试结果

v4.0 核心测试共 **14 项，14/14 PASS**，包括：hash-bound authorization、duplicate commit、lost ACK -> UNKNOWN -> RECONCILE、evidence fail-closed、executor self-report rejection、strong failure evidence、unapplied-action evidence rejection、层级 scope、委托收窄、父租约吊销级联、Agent revoke、contract/topology stale rejection、R2/R3 twin precheck、R3 distinct-domain quorum、cross-tenant isolation。

规范附带 JSON Schema：`contract.schema.json`、`action.schema.json`、`lease.schema.json`、`evidence.schema.json`、`envelope.schema.json`。这些 schema 与 reference runtime 共同构成早期 TCK 的基础。


## 17. 三个完整场景

### 17.1 场景 A：体育场突发热点的 RAN + Edge 联合优化

**Intent**：15 分钟内保障 AR 直播用户 P99 latency < 20ms，掉线率 < 0.5%，能耗增量 < 8%。

**Agent**：Service Agent、RAN Agent、Core Agent、Edge Agent、Energy Agent。

**流程**：

1. Service Agent 提交 Intent；
2. Contract Plane 把 SLO、预算、作用域写入合同；
3. RAN Agent 预测热点并提出 PRB/beam 策略；
4. Edge Agent 提出模型副本扩容；
5. Energy Agent 对总功耗提出约束；
6. Planner 形成跨域 saga；
7. Digital Twin 预检；
8. TSEF 分域 authorize；
9. RAN/Edge/Core commit；
10. Evidence Fabric 对 E2E latency、RAN KPI、GPU load、能耗进行联合验收；
11. 如果 Edge 成功但 RAN 失败，执行 compensation/re-plan。

### 17.2 场景 B：节能 Agent 与 SLA Agent 冲突

Energy Agent 希望关闭低负载载波，SLA Agent 预测 10 分钟后工业园负载增长。两者提交相反 strong evidence。系统不做多数票，而创建 `EVIDENCE_CONFLICT`，触发更高频观测或短时 shadow test。只有 adjudication 结果满足 measurement contract 后才修改载波状态。

### 17.3 场景 C：控制 ACK 丢失后的安全恢复

RAN Agent 已提交 handover bias 更新，但在 ACK 返回前连接中断。传统 Agent 可能立即重试。A6GP 将事务标记 UNKNOWN，恢复进程使用原 idempotency key 查询控制器；如果动作已执行则继续 VERIFY，如果未执行才重新 COMMIT。同一 action 不会被重复应用。

---

## 18. 实验系统设计：从研究概念到可发表证据

### 18.1 Testbed

推荐四层 testbed：

1. **Protocol emulator**：纯 TypeScript/Python，验证状态机和安全不变量；
2. **RAN simulator**：ns-3 / srsRAN / O-RAN SC，验证控制动作；
3. **World model/digital twin**：做 action precheck 与反事实预测；
4. **多 Agent runtime**：与具体厂商无关的 A6GP runtime + 可替换的外部/本地模型接口。

### 18.2 基线

至少对比：

- B0：规则/传统控制器；
- B1：单 Agent + direct tool call；
- B2：多 Agent + A2A/MCP 风格普通调用，但无事务/evidence gate；
- B3：A6GP full；
- B4：A6GP 去掉 reconciliation；
- B5：A6GP 去掉 evidence gate；
- B6：A6GP 去掉 timescale compiler。

### 18.3 关键指标

**网络 KPI**：throughput、P99 latency、packet loss、handover failure、PRB utilization、energy。  
**自治 KPI**：goal success rate、unsafe action rejection、duplicate side effect、recovery success、time-to-reconcile、evidence completeness。  
**Agent KPI**：token/request cost、plan depth、agent count、context bytes、decision latency。  
**系统 KPI**：availability、controller failover time、transaction throughput、ledger size、CPU/memory overhead。

### 18.4 必须做的故障注入

- 丢 ACTION_ACK；
- Agent crash；
- controller restart；
- telemetry stale；
- topology change；
- conflicting agents；
- model 429/5xx；
- malicious prompt injection；
- expired lease；
- duplicate commit；
- simulator false positive；
- WAN partition。

### 18.5 我认为最重要的论文结果

论文不能只证明“能跑”。应证明：

1. 在相同网络收益下，A6GP 显著降低重复副作用和越权动作；
2. recovery 时 UNKNOWN/reconcile 比 blind retry 更安全；
3. evidence gate 显著降低 false-success；
4. dynamic multi-agent plan 在复杂跨域任务上优于单 Agent；
5. timescale compilation 使高级 Agent 能间接服务亚秒/毫秒控制而不破坏实时性。

---

## 19. Research Hypotheses

### H1 Transactional Safety

在含 packet loss、controller crash 和 agent retry 的环境中，A6GP action transaction 能把 duplicate side effects 降到接近零，而 direct-tool baseline 会随 retry rate 明显增长。

### H2 Evidence-Grounded Completion

独立 evidence gate 能显著降低“模型报告成功但真实 SLO 未满足”的 false-positive completion。

### H3 Scoped Delegation

Capability lease + scope containment 能在多 Agent 动态裂变时阻止 privilege amplification，同时保留并行效率。

### H4 Multi-Domain Productivity

对于需要 RAN/Core/Edge 三域协同的复杂 objective，动态 DAG 与多 host worker 能降低端到端完成时间，但收益只在任务图存在真正并行度时出现。

### H5 Time-Scale Compilation

T3 Agent 生成的 verified policy artifact 在 T1/T2 执行，可获得接近专用控制器的实时性，同时保留更高层目标适应能力。

### H6 Episode Learning

基于真实 outcome graph 训练/选择 recovery policy，比纯 prompt reflection 能更快从重复失败中恢复。

---

## 20. 可标准化的协议创新点

### 20.1 Hash-bound Action Authorization

授权 token 与 action canonical hash、lease、scope、expiry 强绑定，防止“先审批后改参数”。

### 20.2 Evidence-Gated Network Intent Contract

网络合同的结束条件由独立 evidence policy 驱动，而不是 Agent self-report 或普通 API success。

### 20.3 Unknown-Side-Effect Reconciliation Protocol

把 unknown external effect 作为一等状态，使用稳定动作身份 reconcile，避免网络自动化的 blind retry。

### 20.4 Hierarchical Capability Lease for Multi-Agent Networks

将 capability delegation、资源层级 containment、风险上限和有效期统一到可验证 lease 链。

### 20.5 Time-Scale Policy Compilation

把长时 Agent reasoning 转换成低时延、可验证的 policy artifact，并绑定 topology、version、guard 和 rollback。

### 20.6 Evidence Conflict Adjudication

强证据冲突不做投票，而自动生成 discriminating experiment / active measurement task。

### 20.7 Autonomy Episode Ledger

将目标-计划-动作-证据-恢复-结果构造成不可变 outcome graph，用于运营知识沉淀和后续策略学习。

---

## 21. 与 A2A / MCP / ETSI ENI / 3GPP 的关系

| 体系 | 强项 | A6GP 复用 | A6GP 补充 |
|---|---|---|---|
| A2A 1.0 | Agent discovery、task collaboration、opaque agent interoperability | Agent card、task/message pattern | 网络作用域、risk、lease、action transaction、evidence/reconcile |
| MCP 2026-07-28 | AI app 与 tools/resources/prompts 连接、能力协商 | tool/data exposure | side-effect safety、telecom resource hierarchy、network transaction |
| ETSI ENI 059 | next-gen mobile agent interfaces、A2A/MCP gap | interface taxonomy、telecom agent architecture | 更严格的事务/证据/时间尺度/authority semantics |
| 3GPP TR 29.832 | 6G AI protocol study | 未来协议绑定与对齐目标 | 当前研究原型、可实验的 transaction/evidence semantics |
| O-RAN R5 | AI/ML workflow、RIC/SMO 可编程控制 | 第一阶段 testbed | 跨域 contract + safe agent transaction layer |

A6GP 应该被定位成研究“semantic control contract”，未来可映射到 3GPP/ETSI/O-RAN 的 normative procedures，而不是另建孤立网络协议栈。

---

## 22. 实施路线图

### Phase 0：协议不变量（0-3 个月）

- 完整 schema；
- property-based tests；
- idempotency / scope / lease / evidence invariants；
- network fault injection simulator。

### Phase 1：O-RAN / RAN 仿真（3-6 个月）

- O-RAN SC 或 srsRAN adapter；
- PRB + power + beam policy；
- near-RT action；
- digital-twin precheck。

### Phase 2：RAN + Edge 联合（6-12 个月）

- compute offload；
- model deployment；
- network-compute joint contract；
- cross-domain saga。

### Phase 3：多域 Agent Federation（12-18 个月）

- Core/Transport/Security Agent；
- threshold authorization；
- multi-operator / third-party agent trust。

### Phase 4：标准化、互操作与公开验证（并行）

- 把消息对象和状态机整理为 contribution；
- 形成 3GPP/ETSI/O-RAN alignment paper；
- 发表 transaction/evidence benchmark；
- 对上述 7 个创新点做专利拆分。

---

## 23. 工程 Definition of Done

一个真正可称为 A6GP prototype 的版本至少必须满足：

1. 任何副作用动作没有有效 lease 时都被拒绝；
2. authorization 与 exact action hash 绑定；
3. duplicate COMMIT 不会产生 duplicate effect；
4. UNKNOWN effect 只能 reconcile，不能 blind resubmit；
5. delegated authority 永远不能大于 parent；
6. 没有独立 evidence 不能 close contract；
7. 高风险 action 支持 digital-twin/shadow precheck；
8. RAN/Core/Edge 至少两个域可以完成 saga；
9. Agent/LLM 不可用时，网络仍可以进入 deterministic fallback；
10. 所有 action、evidence、recovery 有不可变 lineage。

---


## 附录 A：Conformance Profiles 与最小 TCK

A6GP v0.4 建议把“一致性”拆成五类 profile，避免某个只做只读 Agent 发现的实现被迫实现完整跨域 Saga，同时也避免实现只支持消息格式就宣称“完整 A6GP”。

| Profile | 最小能力 |
|---|---|
| A6GP-Core | identity、contract、lease、hash-bound auth、幂等身份、evidence gate、versioning |
| A6GP-Telecom-Control | risk/timing、topology/precondition binding、fallback、high-risk precheck |
| A6GP-Federation | 域自治 commit、Saga、compensation、跨域证据 |
| A6GP-Policy-Artifact | T0/T1 artifact、guard、validated envelope、撤回/回退 |
| A6GP-Secure-Binding | canonical envelope、签名、replay、critical extensions、downgrade protection |

最小 TCK 应覆盖不少于 20 个状态机/安全用例，包括 lease 缺失、过期/吊销、子权限扩张、跨租户、hash mismatch、topology stale、R3 quorum、duplicate commit、lost ACK、stale evidence、evidence conflict、UNKNOWN unresolved、critical extension 与 downgrade attack。

## 附录 B：可形式化验证的协议性质

A6GP 后续不应只依赖单元测试。至少应对以下性质做 TLA+/PlusCal、状态机 property-based testing 或模型检查：

```text
P1 COMMIT(a) => validLease(a) AND validAuthorization(hash(a))
P2 Authority(child) subset_of Authority(parent)
P3 CONTRACT_CLOSE => evidenceSatisfied AND noStrongConflict AND noUnresolvedEffect
P4 uncertain(externalEffect) => state = UNKNOWN
P5 UNKNOWN(a) => next in {STATUS, RECONCILE, ESCALATE}, not NEW_EQUIVALENT_ACTION
P6 revoked(leaseChain) => no future commit by that chain
```

特别是 P4/P5 是 A6GP 与普通 Agent tool-call 框架的重要差异：协议不允许把“不知道是否执行”压缩成“失败”，因为错误分类会直接诱导重复物理副作用。

## 附录 C：性能、扩展性与隐私

A6GP 不应进入每个 packet/PHY symbol。实际系统应把 T0/T1 执行留在本地 deterministic controller，把合同、权限、事务和证据放在较低频控制面。Registry/Evidence Store 可以按 tenant/authority domain 分片；能力描述可在短 TTL 下缓存；大体积原始 telemetry 不必永久写入 episode ledger，只需保存可验证 artifact hash、measurement contract、时间窗口和必要审计字段。

协议性能应至少量化：P50/P99 authorization latency、transaction throughput、reconciliation latency、evidence-gate latency、metadata bytes/action、ledger growth、CPU/memory overhead，以及相对于 direct-agent baseline 的安全收益/控制效用损失。

隐私方面，Evidence/Episode 不应记录模型私有 chain-of-thought。协议应只保存可验证的目标、结构化动作、授权、执行回执、测量合同、证据摘要和恢复谱系。

## 24. 结论

“6G 最终会不会 Agent 原生”并不取决于 LLM 是否足够快，而取决于网络是否形成一套把**智能与权威分离**的协议机制。只要 Agent 能在秒级甚至分钟级做更强的全局推理，它仍然可以通过策略编译、contract、lease 和 transaction 影响毫秒级网络；关键是不能让开放式模型直接获得无约束的物理网络控制权。

A6GP 的长期价值在于把这些约束直接协议化，而不是依赖某个智能体产品的内部实现。6G 是高强度验证环境：它迫使协议面对分布式状态、严格权限、异构时间尺度、部分失败、外部副作用、证据、恢复和安全约束。只有在这些条件下仍能保证“不越权、不重复副作用、不把未知当成功、模型失效时仍可安全运行”，Agent 原生网络才具备工程可信度。

A6GP 的最值得下注的研究主线可以概括为一句话：

> **让 Agent 可以自由思考，但只能通过可验证合同、最小权限租约、事务化动作和独立证据来改变真实 6G 网络。**

---

## 参考资料（截至 2026-10-04）

1. ITU, *IMT-2030: Technical requirements for the 6G future*, 2026-03-17. https://www.itu.int/hub/2026/03/imt-2030-technical-requirements-for-the-6g-future/
2. ITU-R, *IMT towards 2030 and beyond (IMT-2030)* portal. https://www.itu.int/en/ITU-R/study-groups/rsg5/rwp5d/IMT-2030/Pages/default.aspx
3. 3GPP, TR 29.832, *Study on the Protocol for Artificial Intelligence in 6G*, Release 20, draft; v0.2.0 uploaded 2026-09-14. https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=5548
4. ETSI, GS ENI 059 V4.1.1, *AI Agent Interface and Protocol Specification for Next-Generation Mobile Communication System*, published 2026-09-14. https://portal.etsi.org/webapp/WorkProgram/Report_WorkItem.asp?WKI_ID=75451
5. ETSI ENI work programme, ENI 055/056/057/058/059/060/062 work items. https://portal.etsi.org/webapp/WorkProgram/
6. O-RAN ALLIANCE, *O-RAN ALLIANCE Completed its Specification Release 5 (O-RAN-R005)*, 2026-06-08. https://www.o-ran.org/blog/o-ran-alliance-completed-its-specification-release-5-o-ran-r005
7. A2A Protocol, official specification, latest released v1.0.0 as observed 2026-10. https://a2a-protocol.org/v1.0.0/
8. Model Context Protocol TypeScript SDK v2 documentation, stable line implementing protocol revision 2026-07-28. https://ts.sdk.modelcontextprotocol.io/v2/

9. RFC 8785, *JSON Canonicalization Scheme (JCS)*.
10. RFC 2119 / RFC 8174, normative requirement keywords.
