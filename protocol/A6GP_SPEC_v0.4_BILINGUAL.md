# A6GP v0.4 — Agent-Native 6G Protocol / Agent 原生 6G 网络协议

**Status / 状态:** Pre-standard Research Specification / 预标准研究规范  
**Date / 日期:** 2026-10-04  
**Protocol semantic version / 协议语义版本:** `0.4`  
**Language / 语言:** English + 中文

> The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are to be interpreted as normative requirements in the RFC 2119 / RFC 8174 sense when, and only when, they appear in uppercase.  
> 当上述英文关键字以大写形式出现时，采用 RFC 2119 / RFC 8174 的规范性含义。

---

## 1. Purpose and Scope / 目的与范围

**EN.** A6GP defines a semantic control protocol for autonomous agents that coordinate and change state across future 6G UE, RAN, core, transport, edge/cloud, digital-twin, security, and third-party domains. The protocol focuses on authority, network side effects, failure recovery, timing boundaries, evidence, and cross-domain transactions.

A6GP does **not** replace PHY/MAC protocols, 3GPP service-based interfaces, O-RAN interfaces, ETSI ENI interfaces, A2A, or MCP. It is designed as a safety-bounded semantic layer that can bind to those protocols.

**中文。** A6GP 定义一种面向未来 6G 的 Agent 控制语义协议，使自治 Agent 能够跨 UE、RAN、核心网、承载网、边缘/云、数字孪生、安全域和第三方域进行协同与真实网络状态变更。协议重点解决权限、网络副作用、失败恢复、时间尺度、证据与跨域事务。

A6GP **不替代** PHY/MAC、3GPP SBI、O-RAN、ETSI ENI、A2A 或 MCP，而是可绑定到这些协议之上的受安全约束语义层。

### 1.1 Normative core / 规范核心

A conforming A6GP Core implementation MUST implement:

1. principal identity separation from model identity;
2. machine-verifiable Intent Contracts;
3. scoped, short-lived, revocable Authority Leases;
4. hash-bound Action Authorization;
5. idempotent side-effect identity;
6. `UNKNOWN -> RECONCILING` semantics for ambiguous external effects;
7. independent Evidence Gates for contract completion;
8. protocol version negotiation and downgrade protection;
9. deterministic failure behavior for safety-critical paths.

一致性 A6GP Core 实现必须实现以上九项核心语义。

---

## 2. Design Goals and Non-Goals / 设计目标与非目标

### 2.1 Goals / 目标

- **Safety-bounded autonomy:** open-ended reasoning MAY propose actions; deterministic protocol logic owns authority.
- **Least privilege:** every side effect is bound to a lease, resource scope, action class, risk ceiling, and expiry.
- **Recoverability:** loss, timeout, crash, or partition MUST NOT turn into blind duplicate actuation.
- **Evidence-grounded completion:** transport success or model self-report is insufficient for objective completion.
- **Timing separation:** slower reasoning MAY influence faster control only through admitted artifacts or bounded controllers.
- **Domain sovereignty:** each network domain retains local authorization for local side effects.
- **Interoperability:** the semantic model can be mapped to A2A, MCP, ETSI ENI, O-RAN, 3GPP SBI, and future 6G interfaces.

### 2.2 Non-goals / 非目标

A6GP does not standardize:

- the internal architecture of an LLM, RL agent, optimizer, or world model;
- a new 6G radio interface;
- a universal distributed consensus protocol;
- exactly-once semantics for arbitrary external systems;
- a claim that simulation results equal live-network truth.

A6GP does **not** guarantee liveness under an indefinitely partitioned or unreachable execution domain. It guarantees that ambiguity is represented explicitly rather than silently converted to success.

---

## 3. Core Safety Invariants / 核心安全不变量

A conforming implementation MUST preserve the following invariants:

1. **No authority, no side effect. / 无权限，不得产生副作用。**
2. **Authorization binds the exact canonical action hash. / 授权绑定精确动作哈希。**
3. **Contract revision, topology version, policy version, and precondition snapshot are part of authorization context. / 合同版本、拓扑版本、策略版本、前置条件快照进入授权上下文。**
4. **Stable idempotency identity represents one logical effect. / 稳定幂等身份对应一个逻辑副作用。**
5. **A lost or ambiguous reply creates `UNKNOWN`, not an automatic retry. / 丢失或模糊结果进入 UNKNOWN，不得自动盲重试。**
6. **Delegated authority is monotonically narrower than parent authority. / 委托权限只能单调收窄。**
7. **Lease or principal revocation invalidates outstanding authority. / 租约或主体吊销必须使未使用权限失效。**
8. **Missing evidence is `UNKNOWN`, never `PASS`. / 缺证据不得视为成功。**
9. **Executor self-report is not independent completion evidence unless policy explicitly allows it. / 执行器自报默认不算独立完成证据。**
10. **Reasoning systems do not own final safety authority. / 推理系统不得拥有最终安全授权权。**
11. **High-risk actions require stronger prechecks and authorization than low-risk actions. / 高风险动作必须有更强预检与授权。**
12. **Safety-critical operation has deterministic fallback or fail-closed behavior. / 安全关键运行必须有确定性回退或 fail-closed。**

---

## 4. Conformance Profiles / 一致性 Profile

A6GP defines composable conformance profiles.

| Profile | Required semantics / 必需语义 |
|---|---|
| `A6GP-Core` | identity, contract, lease, authorization, commit identity, evidence gate, versioning |
| `A6GP-Telecom-Control` | timing/risk classes, topology binding, precondition snapshots, deterministic fallback |
| `A6GP-Federation` | multi-domain local authority, saga, compensation, cross-domain evidence |
| `A6GP-Policy-Artifact` | T0/T1 policy artifact schema, validation envelope, rollback/fallback |
| `A6GP-Secure-Binding` | signed envelopes, replay protection, canonicalization, critical-extension handling |

An implementation MUST advertise the profiles and extensions it supports. A peer MUST reject a request containing an unknown **critical** extension.

实现必须声明其支持的 profile 与扩展；包含未知关键扩展的消息必须被拒绝。

---

## 5. Timing Classes / 时间等级

Timing classes express **control semantics**, not fixed 3GPP-standard latency boundaries. The ranges below are indicative research defaults.

| Class | Indicative budget | Normative control semantics |
|---|---:|---|
| T0 | `<0.1 ms` | deterministic dataplane/PHY artifact only; no free-form agent deliberation |
| T1 | `0.1-10 ms` | admitted compiled policy, bounded controller, deterministic guard |
| T2 | `10 ms-1 s` | bounded near-RT agent/controller; no unconstrained long reasoning chain |
| T3 | `1 s-minutes` | general reasoning, multi-agent negotiation, cross-domain planning |
| T4 | `minutes-days` | training, large simulation, offline optimization, policy discovery |

A deployment MAY configure different numeric budgets. It MUST preserve the semantic restriction that T0/T1 execution is not dependent on unconstrained general-purpose model calls.

部署可以改变数值区间，但必须保持 T0/T1 不依赖开放式通用大模型调用的语义约束。

---

## 6. Risk Classes / 风险等级

| Risk | Meaning | Minimum requirements |
|---|---|---|
| R0 | read-only observation | authentication + read policy + audit |
| R1 | bounded, reversible local change | lease + exact action authorization + idempotency + postcheck |
| R2 | material service or multi-resource impact | shadow/twin precheck + rollback/compensation plan + independent evidence |
| R3 | safety, billing, sovereignty, security-critical, or wide-area impact | multi-authority approval + staged rollout + immutable audit + explicit fallback |

The proposing agent MUST NOT lower the host-assigned risk class. A host MAY raise risk based on scope, topology, tenant, change magnitude, or current incident state.

提出动作的 Agent 不得降低宿主判定的风险等级；系统可按作用域、拓扑、租户、变更幅度或事故状态提高风险。

---

## 7. Agent Principal / Agent 协议主体

An `AgentPrincipal` identifies the authority-bearing protocol actor independently of the model implementation.

```json
{
  "agentId": "agent:operator-a:ran-optimizer-17",
  "principalType": "RAN",
  "tenant": "operator-a",
  "operatorDomain": "region-west",
  "identityKeyId": "key-42",
  "trustTier": "TIER_2",
  "status": "ACTIVE",
  "attestationHash": "sha256:...",
  "capabilityDescriptorHash": "sha256:..."
}
```

Changing the LLM or inference endpoint MUST NOT silently change network authority. Model identity MAY be recorded for audit, but authority MUST bind to the protocol principal.

更换模型或推理服务不得自动改变网络权限。模型身份可用于审计，但协议权威必须绑定 AgentPrincipal。

---

## 8. Resource Scope Namespace / 网络资源作用域命名空间

A6GP v0.4 replaces ambiguous free-form path-prefix authority with a canonical hierarchical URI namespace.

```text
a6gp://<authority>/<domain>/<resource-segment>[/<resource-segment>...]
```

Examples:

```text
a6gp://operator-a/ran/site-17
a6gp://operator-a/ran/site-17/cell-3
a6gp://operator-a/core/upf-west-2
a6gp://operator-a/edge/zone-3/gpu-pool-2
```

### 8.1 Containment / 包含关系

Scope `P` contains `C` only if:

1. authority matches exactly;
2. domain matches exactly;
3. every segment of `P` is an exact prefix segment of `C`.

Therefore `a6gp://operator-a/ran/site-17` contains `.../site-17/cell-3` but does not contain `.../site-170` or an ancestor such as `a6gp://operator-a/ran`.

### 8.2 Wildcards / 通配符

The Core profile MUST NOT infer wildcard authority from string matching. A wildcard extension, if supported, MUST define explicit wildcard semantics and MUST be advertised as a critical extension.

Core profile 不得通过字符串匹配推断通配权限；如支持通配，必须通过显式关键扩展定义。

---

## 9. Capability Descriptor / 能力描述

Capability advertisement is discoverability metadata, not authority.

A descriptor SHOULD contain:

- typed action names and schema hashes;
- readable and writable resource-scope templates;
- supported timing classes;
- maximum supported risk class;
- evidence requirements;
- delegation capability;
- cost/resource ceilings;
- supported bindings and extensions;
- model/runtime implementation metadata where useful, without granting authority.

An Agent Card or ETSI-style repository entry MAY carry the descriptor. Actual permission still requires an Authority Lease.

能力声明可由 A2A Agent Card 或类似 ETSI Agent Repository 承载，但真实权限仍必须由 Authority Lease 授予。

---

## 10. Intent Contract / 意图合同

Any R1-R3 side effect MUST be traceable to an admitted `IntentContract`.

```json
{
  "contractId": "ctr-2042",
  "tenant": "operator-a",
  "revision": 3,
  "goal": "Maintain stadium AR P99 latency < 20 ms",
  "scope": [
    "a6gp://operator-a/ran/site-17",
    "a6gp://operator-a/edge/zone-3"
  ],
  "hardConstraints": ["drop_rate < 0.005", "energy_delta < 0.08"],
  "allowedActions": ["ran.prb.reweight", "ran.beam.policy.update", "edge.model.scale"],
  "riskClass": "R2",
  "timingClass": "T3",
  "topologyVersion": "topo-8842",
  "policyVersion": "policy-17",
  "evidencePolicy": {
    "requiredKinds": ["precheck", "postcheck"],
    "minimumStrength": 0.9,
    "minimumIndependentSources": 1,
    "maxAgeMs": 60000,
    "allowExecutorSelfEvidence": false
  },
  "authorityPolicy": {"requiredApprovals": 1},
  "fallbackPolicy": {"mode": "rollback", "deadlineMs": 1000},
  "validUntil": "2026-10-04T22:30:00Z"
}
```

### 10.1 Revision concurrency / 修订并发

A contract amendment MUST increment `revision`. An action prepared against revision `N` MUST NOT commit after the active contract has changed to revision `N+1` unless it is explicitly re-prepared and re-authorized.

合同修订必须递增版本；旧版本动作不得跨版本直接提交。

---

## 11. Authority Lease / 权限租约

An Authority Lease is short-lived, revocable, scope-bounded, action-bounded, tenant-bound, and risk-bounded.

```text
Lease = {
  leaseId,
  subject,
  tenant,
  contractId,
  scope[],
  actionSet[],
  riskCeiling,
  issuedAt,
  expiresAt,
  parentLeaseId?,
  parentLeaseHash?
}
```

### 11.1 Delegation monotonicity / 委托单调性

For child lease `C` and parent lease `P`:

```text
C.tenant        == P.tenant
C.scope         within P.scope
C.actionSet     subset_of P.actionSet
C.riskCeiling   <= P.riskCeiling
C.expiresAt     <= P.expiresAt
```

A child MUST NOT receive a parent raw credential as a substitute for delegation.

不得复制父 Agent 原始凭证来模拟委托。

### 11.2 Revocation propagation / 吊销传播

Revoking a parent lease MUST invalidate all live descendant leases no later than the deployment's revocation propagation bound. Outstanding authorizations derived from the revoked chain MUST be rejected at commit.

父租约吊销必须使所有后代租约与基于该链的未使用授权失效。

---

## 12. Protocol Versioning and Negotiation / 版本与协商

A6GP uses `major.minor` semantic protocol versions. v0.x remains pre-standard and MAY contain breaking changes.

A peer SHOULD advertise:

```json
{
  "protocolVersions": ["0.4"],
  "profiles": ["A6GP-Core", "A6GP-Telecom-Control"],
  "extensions": ["ext.example"],
  "bindings": ["json-https", "grpc-protobuf"]
}
```

The selected version, profiles, and critical extensions MUST be included in signed protocol context to prevent downgrade attacks.

所选择的版本、profile 与关键扩展必须进入签名上下文，以防降级攻击。

---

## 13. Canonical Message Envelope / 通用消息封装

```json
{
  "protocolVersion": "0.4",
  "messageType": "ACTION_PREPARE",
  "messageId": "msg-018f...",
  "correlationId": "ctr-2042",
  "transactionId": "tx-77",
  "sender": "agent:operator-a:ran-optimizer-17",
  "receiver": "authority:operator-a:region-west",
  "sentAt": 1791166800120,
  "expiresAt": 1791166802120,
  "timingClass": "T2",
  "riskClass": "R2",
  "tenant": "operator-a",
  "contractId": "ctr-2042",
  "contractRevision": 3,
  "topologyVersion": "topo-8842",
  "leaseId": "lease-7c1",
  "idempotencyKey": "site17-prb-window-0001",
  "bodyHash": "sha256:...",
  "hashAlg": "sha-256",
  "signatureAlg": "ES256",
  "keyId": "key-42",
  "criticalExtensions": [],
  "extensions": {},
  "signature": "...",
  "body": {}
}
```

### 13.1 Freshness and replay / 新鲜度与重放

Receivers MUST reject:

- expired messages;
- invalid signatures;
- duplicate `messageId` where replay is not explicitly replay-safe;
- messages whose tenant or authority context is inconsistent;
- unknown critical extensions;
- version downgrade inconsistent with negotiation.

Clock-skew tolerance MUST be deployment-policy controlled and MUST NOT silently extend lease or authorization expiry.

---

## 14. JSON Reference Binding / JSON 参考绑定

The v0.4 package defines a reference JSON binding for conformance testing.

- media type: `application/a6gp+json`;
- transport: HTTPS over HTTP/2 or HTTP/3;
- canonical JSON: RFC 8785 JSON Canonicalization Scheme SHOULD be used;
- `bodyHash`: SHA-256 over canonical `body`;
- envelope signature: JWS-compatible signature over canonical signed fields excluding the `signature` field itself;
- TLS peer authentication SHOULD be used for inter-domain control.

Binary bindings MAY use Protobuf/gRPC or CBOR/COSE, provided the same semantic fields and state-machine behavior are preserved.

二进制绑定可使用 Protobuf/gRPC 或 CBOR/COSE，但必须保持相同语义与状态机。

---

## 15. Message Families / 消息族

### 15.1 Registration and discovery / 注册与发现

`AGENT_REGISTER`, `AGENT_ATTEST`, `AGENT_STATUS`, `CAPABILITY_ADVERTISE`, `CAPABILITY_QUERY`, `CAPABILITY_RESULT`, `AGENT_REVOKE`, `PROFILE_NEGOTIATE`.

### 15.2 Intent and contract / 意图与合同

`INTENT_SUBMIT`, `PLAN_PROPOSE`, `CONSTRAINT_CHALLENGE`, `PLAN_COUNTER`, `CONTRACT_PROPOSE`, `CONTRACT_ACCEPT`, `CONTRACT_REJECT`, `CONTRACT_AMEND`, `CONTRACT_ABORT`, `CONTRACT_STATUS`.

### 15.3 Delegation / 委托

`DELEGATION_PROPOSE`, `DELEGATION_GRANT`, `DELEGATION_REJECT`, `DELEGATION_REVOKE`, `TASK_PROGRESS`, `TASK_RESULT`.

### 15.4 Action transaction / 动作事务

`ACTION_PREPARE`, `ACTION_CHALLENGE`, `ACTION_AUTHORIZED`, `ACTION_REJECTED`, `ACTION_COMMIT`, `ACTION_ACK`, `ACTION_STATUS`, `ACTION_ROLLBACK`, `ACTION_COMPENSATE`, `RECONCILE_REQUEST`, `RECONCILE_RESULT`.

### 15.5 Evidence / 证据

`EVIDENCE_SUBMIT`, `EVIDENCE_QUERY`, `EVIDENCE_CONFLICT`, `ADJUDICATION_REQUEST`, `RESULT_ATTEST`, `CONTRACT_CLOSE`.

### 15.6 Liveness and recovery / 生命期与恢复

`LEASE_GRANT`, `LEASE_RENEW`, `LEASE_EXPIRE`, `HEARTBEAT`, `FAILOVER_CLAIM`, `QUARANTINE`, `RECOVERY_PROPOSE`, `RECOVERY_DECISION`.

---

## 16. Contract State Machine / 合同状态机

```text
PROPOSED -> NEGOTIATING -> ADMITTED -> ACTIVE
                       \-> REJECTED
ACTIVE -> VERIFYING -> COMPLETED
ACTIVE -> DEGRADED -> RECOVERING -> ACTIVE
ACTIVE -> ABORTING -> ABORTED
ACTIVE -> EXPIRED
```

A reasoning agent MUST NOT directly set `COMPLETED`. Completion authority belongs to the protocol Evidence Gate.

推理 Agent 不得直接设置 COMPLETED；完成权属于协议证据门。

---

## 17. Network Action Object / 网络动作对象

A side-effecting action MUST be structured and immutable once authorized.

```json
{
  "actionId": "act-91",
  "contractId": "ctr-2042",
  "contractRevision": 3,
  "topologyVersion": "topo-8842",
  "agentId": "agent:operator-a:ran-optimizer-17",
  "tenant": "operator-a",
  "kind": "ran.prb.reweight",
  "riskClass": "R2",
  "target": "a6gp://operator-a/ran/site-17/cell-3",
  "params": {"premium": 0.58, "bestEffort": 0.42},
  "preconditions": ["premium_p99_latency_ms < 18"],
  "preconditionSnapshotHash": "sha256:...",
  "expectedEffect": {"congestion": "down"},
  "rollback": null,
  "idempotencyKey": "site17-prb-window-0001"
}
```

Natural-language text MAY explain intent, but executable authority MUST bind to the structured action object.

自然语言可用于解释，但执行权限必须绑定结构化动作对象。

---

## 18. Prepare and Authorization / Prepare 与授权

`ACTION_PREPARE` asks the authority plane to evaluate a candidate action.

For R1-R3, the authority plane MUST check at least:

1. principal and tenant validity;
2. live lease and lease-chain validity;
3. scope containment;
4. action class permission;
5. action risk <= lease risk ceiling;
6. contract revision and topology version freshness;
7. precondition snapshot binding;
8. active resource conflicts;
9. required twin/shadow precheck for R2/R3;
10. required authorization quorum;
11. fallback/rollback or compensation policy where required.

The resulting authorization MUST bind:

```text
(actionHash,
 leaseChainHash,
 contractId,
 contractRevision,
 topologyVersion,
 policyVersion,
 preconditionSnapshotHash,
 targetScope,
 actionRisk,
 approvals,
 expiresAt,
 nonce)
```

Any material difference at commit MUST invalidate the authorization.

提交时任何实质字段发生改变都必须使授权失效。

---

## 19. Action Transaction State Machine / 动作事务状态机

```text
PROPOSED
  -> PREPARED
     -> AUTHORIZED -> COMMITTING -> APPLIED -> VERIFYING -> VERIFIED
     -> REJECTED
COMMITTING/APPLIED/VERIFYING -> UNKNOWN -> RECONCILING
RECONCILING -> APPLIED | VERIFIED | REVERSED | FAILED | UNRESOLVED
APPLIED/VERIFYING -> REVERSING -> REVERSED
```

### 19.1 No exactly-once claim / 不宣称任意系统 exactly-once

A6GP provides stable logical action identity and reconciliation. It MUST NOT claim exactly-once physical execution unless the underlying executor can prove it.

A6GP 提供稳定逻辑动作身份与对账语义；除非底层执行器可证明，否则不得宣称物理执行 exactly-once。

---

## 20. Idempotency Semantics / 幂等语义

For R1-R3 actions, `idempotencyKey` is REQUIRED.

The default logical idempotency scope is:

```text
(tenant, contractId, targetAuthorityDomain, idempotencyKey)
```

This intentionally does **not** require the original agent identity, so an authorized failover agent can reconcile the same logical action after the original agent disappears.

同一逻辑动作的幂等范围默认不绑定原 Agent 身份，使故障切换 Agent 可以对账原动作。

Reusing the same scope with a different action hash MUST return `IDEMPOTENCY_CONFLICT`.

---

## 21. Commit and Execution Receipt / 提交与执行回执

An executor SHOULD return a stable `ExecutionReceipt`:

```json
{
  "executionId": "exec-77",
  "actionId": "act-91",
  "actionHash": "sha256:...",
  "idempotencyScope": "operator-a|ctr-2042|operator-a/ran|site17-prb-window-0001",
  "status": "APPLIED",
  "appliedAt": 1791166801500,
  "effectHash": "sha256:..."
}
```

`ACTION_ACK` means the executor has accepted or observed a state. It does **not** by itself prove that the Intent Contract succeeded.

ACTION_ACK 仅表示执行器接受或观察到执行状态，不代表合同目标已经成功。

---

## 22. UNKNOWN and Reconciliation / UNKNOWN 与对账

If the caller cannot prove whether an external side effect occurred, the action MUST enter `UNKNOWN`.

The caller MUST:

1. preserve the original `actionId`, action hash, and idempotency identity;
2. issue `ACTION_STATUS` or `RECONCILE_REQUEST` against the original identity;
3. MUST NOT create a fresh logical action that could duplicate the same effect;
4. reserve relevant authority/resource budget while the effect remains unresolved;
5. escalate to `UNRESOLVED` if the execution domain cannot provide a trustworthy status oracle within policy bounds.

如果无法证明副作用是否发生，必须保留原动作身份并进行对账，不能用新动作盲重试。

---

## 23. Precondition and Topology TOCTOU Control / 前置条件与拓扑 TOCTOU 控制

A6GP explicitly addresses time-of-check/time-of-use drift.

An R1-R3 authorization SHOULD bind:

- `topologyVersion`;
- `preconditionSnapshotHash`;
- `contractRevision`;
- `policyVersion`.

If any bound condition is stale at commit, the executor or authority plane MUST reject with `TOPOLOGY_STALE`, `PRECONDITION_STALE`, or `CONTRACT_REVISION_STALE`, unless an explicitly configured revalidation policy performs a fresh prepare/authorize cycle.

---

## 24. Evidence Model / 证据模型

```json
{
  "evidenceId": "ev-32",
  "contractId": "ctr-2042",
  "actionId": "act-91",
  "kind": "postcheck",
  "verdict": "PASS",
  "strength": 0.97,
  "source": "probe:stadium-e2e-1",
  "sourcePrincipal": "probe:operator-a:stadium-e2e-1",
  "sourceClass": "ACTIVE_PROBE",
  "independenceGroup": "probe-fleet-a",
  "measurementContractHash": "sha256:...",
  "artifactHash": "sha256:...",
  "observedAt": 1791167100000,
  "validUntil": 1791167160000,
  "windowStart": 1791166800000,
  "windowEnd": 1791167100000
}
```

### 24.1 Evidence strength / 证据强度

`strength` is policy-defined confidence, not a universal probability. A deployment MUST define how a source class earns a given strength. Unknown or unavailable measurement MUST remain `UNKNOWN` rather than being converted to zero or PASS.

strength 是策略定义的置信度，不是通用概率。缺失测量必须保持 UNKNOWN。

### 24.2 Evidence independence / 证据独立性

An evidence policy MAY require multiple independent `independenceGroup` values. The executor's own success report MUST NOT count as independent postcondition evidence unless explicitly allowed.

证据策略可以要求多个独立来源；执行器自报默认不得算独立后验验证。

---

## 25. Evidence Conflict and Adjudication / 证据冲突与裁决

Strong contradictory evidence for the same contract/action/measurement SHOULD create `EVIDENCE_CONFLICT`.

The protocol SHOULD request a discriminating measurement, replay, active probe, counterexample, or independent reproduction. It SHOULD NOT resolve safety-relevant conflicts by agent majority vote.

安全相关的强证据冲突应通过可区分测量、回放、主动探测、反例或独立复现解决，不应采用 Agent 多数投票。

An unresolved strong conflict MUST block `CONTRACT_CLOSE` when it concerns a required evidence kind.

---

## 26. Digital-Twin and Shadow Precheck / 数字孪生与影子预检

R2/R3 action policy SHOULD require pre-commit validation in a simulator, digital twin, world model, replay system, or shadow controller when technically feasible.

The precheck record MUST identify:

- simulator/world-model identifier and version;
- topology snapshot/version;
- input hash or scenario seed;
- predicted effect and uncertainty;
- validation policy version;
- artifact hash.

A simulation PASS MUST NOT be accepted as live postcondition PASS.

仿真 PASS 不得替代真实网络后验 PASS。

---

## 27. Threshold Authorization for R3 / R3 阈值授权

R3 actions SHOULD require more than one independent authority domain. A deployment policy MAY define `m-of-n` approvals.

Example:

```text
2-of-3: operations authority + security authority + service-owner authority
```

Approval identities, authority domains, action hash, and expiry MUST be auditable. Two approvals produced by the same authority domain MUST NOT satisfy a policy that requires distinct domains.

---

## 28. Cross-Domain Saga / 跨域 Saga

A multi-domain objective MAY be decomposed into ordered local transactions. Each domain retains local commit authority.

Example:

```text
1. edge.reserve_gpu       compensation=edge.release_gpu
2. core.select_upf        compensation=core.restore_upf
3. ran.prb.reweight       compensation=ran.restore_prb
4. edge.deploy_model      compensation=edge.remove_model
```

### 28.1 Compensation semantics / 补偿语义

Compensation is **not** assumed to be a perfect inverse. Each step SHOULD declare:

- compensation action;
- compensation risk;
- compensation preconditions;
- evidence required to prove compensation;
- terminal state if compensation fails.

If a required compensation cannot be proven, the saga MUST enter a degraded/unresolved terminal state rather than report success.

补偿不是天然完美逆操作；补偿失败时必须显式进入 degraded/unresolved，而不能伪装成功。

---

## 29. Time-Scale Policy Artifact / 时间尺度策略制品

A T3/T4 agent MAY generate a policy artifact for T0/T1/T2 execution. The artifact SHOULD include:

- immutable artifact hash/version;
- target topology version/range;
- validated input envelope;
- bounded action range;
- deterministic guard conditions;
- fallback policy;
- validity interval;
- validation evidence;
- rollback/withdrawal procedure;
- implementation runtime identifier.

Inputs outside the validated envelope MUST trigger fail-closed or deterministic fallback behavior.

输入超出验证包络时，必须 fail-closed 或进入确定性 fallback。

---

## 30. Threat Model / 威胁模型

A6GP assumes any of the following can occur:

- prompt injection or compromised reasoning model;
- compromised agent process;
- confused-deputy delegation;
- cross-tenant request forgery;
- stolen or stale authorization;
- message replay;
- version downgrade;
- TOCTOU topology change;
- malicious or faulty tool/executor;
- lost ACK after real side effect;
- stale or poisoned digital twin;
- forged, correlated, or stale evidence;
- WAN partition or controller crash;
- resource conflict between multiple agents.

The Core and Telecom-Control profiles are designed so that compromising the reasoning plane alone is insufficient to obtain unconstrained network authority.

即使推理平面被攻击，也不应因此自动获得无约束网络权限。

---

## 31. Error Registry and Retry Directives / 错误码与重试指令

| Error | Default directive / 默认处理 |
|---|---|
| `VERSION_UNSUPPORTED` | renegotiate / 重新协商 |
| `CRITICAL_EXTENSION_UNSUPPORTED` | reject / 拒绝 |
| `AUTHORITY_MISSING` | obtain lease; do not retry commit |
| `LEASE_EXPIRED` | obtain new lease + reprepare |
| `LEASE_REVOKED` | stop; re-authorize through new chain |
| `SCOPE_VIOLATION` | never retry unchanged |
| `ACTION_NOT_ALLOWED` | change plan, not credentials |
| `RISK_POLICY_REJECTED` | escalate or reduce action |
| `CONTRACT_REVISION_STALE` | reprepare |
| `TOPOLOGY_STALE` | refresh topology + reprepare |
| `PRECONDITION_STALE` | refresh observation + reprepare |
| `AUTH_HASH_MISMATCH` | reject; security event |
| `IDEMPOTENCY_CONFLICT` | reconcile; do not create duplicate |
| `EXECUTION_UNKNOWN` | same-identity reconcile only |
| `EVIDENCE_MISSING` | wait/query/measure |
| `EVIDENCE_CONFLICT` | adjudication measurement |
| `COMPENSATION_FAILED` | degraded/unresolved + escalation |
| `MODEL_UNAVAILABLE_FALLBACK` | deterministic fallback |

---

## 32. Bindings to Existing Agent and Telecom Protocols / 与现有协议的绑定

### 32.1 A2A

A6GP MAY reuse A2A discovery, Agent Card, task, message, artifact, and protocol-binding patterns. A network-changing A2A task is not sufficient authority by itself; side effects MUST still traverse A6GP lease and action-transaction semantics.

A6GP 可复用 A2A 发现与任务模型，但 A2A 任务本身不能替代网络动作授权。

### 32.2 MCP

A6GP MAY expose read tools/resources through MCP-compatible interfaces. A side-effecting MCP tool call MUST NOT bypass A6GP authorization when it changes protected network state.

MCP 可用于工具/资源连接，但会改变受保护网络状态的 tool call 必须经过 A6GP 动作事务。

### 32.3 ETSI ENI

ETSI GS ENI 059 defines AI-agent interfaces for next-generation mobile systems across agent, UE, repository, tool, data, third-party, and infrastructure interactions. A6GP SHOULD be positioned as a transaction/authority/evidence extension or experimental semantic profile, not as a duplicate interface taxonomy.

ETSI ENI 059 已覆盖多类 Agent 接口；A6GP 应定位为事务、权限、证据和恢复语义的扩展/实验 profile，而不是重复接口分类。

### 32.4 O-RAN

A6GP contracts and reasoning MAY map to SMO/Non-RT RIC and selected Near-RT functions; actual RAN actuation remains through appropriate O-RAN mechanisms such as A1/E2/O1/O2/R1 according to the implementation. This mapping is experimental and interface-specific.

### 32.5 3GPP

A6GP SHOULD map future objects and procedures to 3GPP Release 20/21 architecture, capability exposure, AI-protocol, management, and security work as those specifications mature. A6GP v0.4 is not a 3GPP-standardized protocol.

---

## 33. Minimal Conformance Test Suite / 最小一致性测试集

An `A6GP-Core + Telecom-Control` implementation MUST demonstrate at least:

1. missing lease rejects side effect;
2. expired/revoked lease rejects commit;
3. child lease cannot widen scope/action/risk/expiry;
4. hierarchical descendant scope is allowed while ancestor/sibling escalation is rejected;
5. cross-tenant authority is rejected;
6. authorization binds exact action hash;
7. contract revision and topology drift invalidate authorization;
8. R2/R3 lacks required precheck -> reject;
9. R3 quorum rules are enforced;
10. duplicate commit creates no duplicate logical effect;
11. same idempotency scope + different action hash -> conflict;
12. lost ACK -> UNKNOWN -> RECONCILE using original action identity;
13. evidence for unapplied action cannot satisfy completion;
14. executor self-report cannot satisfy independent-evidence policy by default;
15. stale evidence cannot satisfy a freshness policy;
16. strong contradictory evidence blocks completion;
17. model endpoint outage invokes deterministic fallback/fail-closed behavior;
18. unknown critical extension is rejected;
19. version downgrade inconsistent with negotiation is rejected;
20. contract cannot close while unresolved UNKNOWN side effects remain.

---

## 34. Formal Safety Properties / 形式化安全性质

A6GP research implementations SHOULD attempt to verify at least the following properties:

### P1 — Authorization safety

```text
COMMIT(action) => validLease(action) AND validAuthorization(hash(action))
```

### P2 — Delegation monotonicity

```text
Authority(child) subset_of Authority(parent)
```

### P3 — No false closure

```text
CONTRACT_CLOSE => requiredEvidenceSatisfied AND noRequiredStrongConflict AND noUnresolvedEffect
```

### P4 — Ambiguity preservation

```text
uncertain(externalEffect) => state = UNKNOWN
```

### P5 — No blind duplicate creation

```text
UNKNOWN(action) => nextSafetyOperation in {STATUS, RECONCILE, ESCALATE}
                   and not NEW_EQUIVALENT_ACTION
```

### P6 — Revocation safety

```text
revoked(leaseChain) => no future COMMIT authorized by that chain
```

These properties are suitable candidates for TLA+, PlusCal, model checking, or property-based state-machine testing.

---

## 35. Performance and Scaling Considerations / 性能与扩展性

A6GP adds safety metadata and control-plane transactions; it is not intended for every PHY symbol or packet.

Implementations SHOULD:

- keep T0/T1 execution local and artifact-based;
- cache signed capability descriptors under bounded TTL;
- shard registries and evidence stores by authority domain/tenant;
- use compact binary bindings where message overhead matters;
- avoid global consensus on every local actuation;
- retain local commit authority while federating only contract/saga metadata;
- define bounded retention for raw evidence while preserving immutable hashes and audit lineage.

The protocol SHOULD be benchmarked for transaction throughput, P99 authorization latency, reconciliation latency, evidence-gate latency, and metadata overhead.

---

## 36. Privacy, Data Minimization, and Audit / 隐私、数据最小化与审计

Evidence and episode ledgers MAY contain sensitive network or user information. Implementations SHOULD:

- separate audit hashes from raw telemetry;
- apply tenant isolation and purpose limitation;
- avoid copying raw prompts or model chain-of-thought into protocol evidence;
- retain only fields required for authorization, reproducibility, and governance;
- protect cross-operator data with policy and cryptographic controls;
- record who authorized, executed, measured, reconciled, and closed each action/contract.

协议证据不应依赖保存模型私有推理过程；应保存可验证的协议输入、动作、测量与授权谱系。

---

## 37. Standards Position / 标准定位

As of 2026-10-04:

- ITU IMT-2030 includes AI and Communication (AIAC), ubiquitous intelligence, security/resilience, and sustainability in the 6G framework;
- 3GPP TR 29.832, Release 20, is a draft *Study on the Protocol for Artificial Intelligence in 6G*; portal version 0.2.0 was uploaded 2026-09-14;
- ETSI GS ENI 059 V4.1.1 was published 2026-09-14 and specifies AI-agent interface/protocol design for next-generation mobile systems, including gaps in A2A/MCP and multiple transport/interface types;
- O-RAN Release 5 includes AI/ML workflow services spanning Non-RT and Near-RT RIC;
- A2A 1.0 is a released agent interoperability standard with normative Protobuf definitions and multiple protocol bindings;
- MCP 2026-07-28 introduced a stateless protocol core, discovery, authorization changes, extensions, and long-running interaction mechanisms.

A6GP's intended novelty is therefore **not** “agents communicate in 6G.” Its research contribution is the combination of **transactional network side effects, lease-chain authority, TOCTOU binding, explicit UNKNOWN reconciliation, evidence-gated completion, time-scale compilation, and domain-sovereign sagas**.

A6GP 的创新定位不是“6G 中有 Agent”，而是把网络副作用事务、权限租约链、TOCTOU 绑定、UNKNOWN 对账、证据完成门、时间尺度编译与域自治 Saga 组合成一个严格协议语义。

---

## 38. Research Status and Next Normative Steps / 研究状态与下一步

A6GP v0.4 remains pre-standard. Before freezing a normative binary wire format, the recommended sequence is:

1. publish executable schemas and a protocol TCK;
2. run property-based and model-based state-machine tests;
3. evaluate packet loss, process crash, stale topology, evidence conflict, and cross-domain partial failure;
4. benchmark reference JSON and Protobuf/gRPC bindings;
5. build an O-RAN/srsRAN or simulator-backed gateway;
6. produce explicit mapping contributions against 3GPP/ETSI/O-RAN objects rather than duplicating them;
7. only then freeze field numbering, binary encoding, registry governance, and backward-compatibility rules.

A6GP v0.4 仍是预标准规范。应先完成可执行 schema、TCK、状态机/故障实验和现有标准映射，再冻结二进制字段编号与长期兼容规则。

---

## References / 参考资料

1. RFC 2119, *Key words for use in RFCs to Indicate Requirement Levels*.
2. RFC 8174, *Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words*.
3. RFC 8785, *JSON Canonicalization Scheme (JCS)*.
4. ITU, *IMT-2030: Technical requirements for the 6G future*, 17 Mar 2026, https://www.itu.int/hub/2026/03/imt-2030-technical-requirements-for-the-6g-future/
5. 3GPP, TR 29.832, *Study on the Protocol for Artificial Intelligence in 6G*, Release 20, https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=5548
6. ETSI, GS ENI 059 V4.1.1, *AI Agent Interface and Protocol Specification for Next-Generation Mobile Communication System*, 2026-09.
7. O-RAN ALLIANCE, *O-RAN ALLIANCE Completed its Specification Release 5*, 8 Jun 2026.
8. A2A Protocol, Specification v1.0.0, https://a2a-protocol.org/v1.0.0/
9. Model Context Protocol, Specification 2026-07-28, https://modelcontextprotocol.io/
