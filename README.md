# A6GP — Agent-Native 6G Protocol

A6GP is a pre-standard research protocol for safe, interoperable autonomous agents across future 6G RAN, core, transport, edge/cloud, digital-twin, and third-party domains.

**Core principle:** models may reason freely; real-network side effects require verifiable contracts, least-privilege authority leases, hash-bound authorization, transactional execution, reconciliation, and independent evidence.

> Status: Research Draft v0.4 core with optional ACN Services v1 extension (package 0.4.1). This repository is not a 3GPP, ETSI, O-RAN, or ITU standard.

## Why A6GP

Generic agent interoperability and tool protocols are useful, but telecom control adds requirements that cannot be treated as ordinary RPC:

- heterogeneous time scales from sub-millisecond execution to multi-minute planning;
- high-impact physical/network side effects;
- partial failure and lost acknowledgements;
- strict tenant/domain sovereignty;
- dynamic delegation without privilege amplification;
- topology and policy drift between plan and commit;
- independent proof that an SLO was actually achieved;
- deterministic fallback when reasoning systems are unavailable.

A6GP turns these constraints into protocol semantics.

## Protocol model

```text
Reasoning & Coordination
        |
        | proposes intent / plan / action
        v
Protocol Control Plane
  Intent Contract
  Authority Lease Chain
  Risk + Timing Policy
  Action Transaction
  R3 Quorum / Precheck
        |
        | hash-bound authorization
        v
Deterministic Execution
  RAN / Core / Edge adapters
  idempotent logical action identity
        |
        v
Evidence & Recovery
  independent evidence gate
  UNKNOWN -> RECONCILING
  conflict adjudication
  compensation / saga
```

## What is implemented

The reference runtime is intentionally dependency-light and model-vendor-neutral. It currently implements:

- Intent Contracts with revision control and completion gates;
- hierarchical, tenant-bound Authority Leases with monotonic delegation and revocation propagation;
- exact canonical action hashing;
- R0-R3 risk classes and T0-T4 timing semantics;
- R2/R3 digital-twin/shadow precheck requirements;
- R3 multi-authority approval quorum;
- topology, policy, precondition, contract-revision and lease-chain TOCTOU binding;
- logical idempotency across failover agents;
- `UNKNOWN -> RECONCILING` semantics for ambiguous external effects;
- independent evidence gates and strong-evidence conflict detection;
- cross-domain Saga compensation without blindly compensating ambiguous effects;
- T0/T1 validated Policy Artifacts with deterministic fallback;
- v0.4 version/profile negotiation;
- Ed25519-signed JSON envelopes, body hashes, replay guard and critical-extension fail-closed behavior;
- JSON Schemas and a conformance test kit;
- optional ACN Services v1: governed multi-vendor discovery, task groups with directional QoS admission, shared network/compute reservations, a bounded data lifecycle, structured task planning, fourteen network tools, and signed fresh network contexts. See [ACN integration](docs/ACN_SERVICES.md) and the [Chinese source-requirement mapping](docs/ACN_REQUIREMENTS_CN.md).

## Verification status

Current local release gate:

```text
JSON Schemas: 7/7 syntax PASS; 14 tool/catalog schema bindings PASS
A6GP tests:  74/74 PASS (28 core + 46 ACN extension cases)
Stadium E2E: PASS (contract -> action -> evidence -> close)
Lost-ACK:    PASS (UNKNOWN -> RECONCILE, physical apply count = 1)
ACN E2E:     PASS (6 service effects -> synthetic probe assertions -> close)
```

Run the same gate:

```bash
npm run check
```

Validated locally on Node.js 22.23.4 and 24.19.0; all new ACN results are synthetic software checks. See [validation record](reports/ACN_Validation_2026-10-23.json).

Requires Node.js 22.6+; the current zero-dependency runtime uses Node's type-stripping path.

## Quick start

```bash
npm test
npm run demo
npm run demo:lost-ack
npm run demo:acn
```

The stadium example exercises:

```text
Intent Contract
  -> Resource Snapshot
  -> Authority Lease
  -> ACTION_PREPARE
  -> Digital-Twin Precheck
  -> ACTION_AUTHORIZED
  -> COMMIT
  -> Independent Evidence
  -> Action VERIFIED
  -> Contract COMPLETED
```

## Repository layout

```text
protocol/   normative research specification (bilingual)
reports/    full Chinese and English technical reports (DOCX + Markdown)
docs/       architecture, standards mapping, research hypotheses, implementation notes
src/        reference protocol runtime
schemas/    JSON Schema reference binding
examples/   executable protocol scenarios
tests/      A6GP conformance test kit
figures/    protocol architecture diagrams
.github/    CI
```

## Key files

- [`protocol/A6GP_SPEC_v0.4_BILINGUAL.md`](protocol/A6GP_SPEC_v0.4_BILINGUAL.md) — protocol specification
- [`reports/A6GP_Protocol_CN_v4.0.docx`](reports/A6GP_Protocol_CN_v4.0.docx) — Chinese technical report
- [`reports/A6GP_Protocol_EN_v4.0.docx`](reports/A6GP_Protocol_EN_v4.0.docx) — English technical report
- [`reports/A6GP_Progress_Report_CN_2026-10-23.md`](reports/A6GP_Progress_Report_CN_2026-10-23.md) — current project status and next-stage priorities
- [`docs/CONFORMANCE.md`](docs/CONFORMANCE.md) — TCK and profile expectations
- [`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md) — adapter and deployment guidance
- [`tests/tck.test.ts`](tests/tck.test.ts) — executable safety/conformance tests

## Conformance profiles

A6GP v0.4 defines composable profiles:

- `A6GP-Core`
- `A6GP-Telecom-Control`
- `A6GP-Federation`
- `A6GP-Policy-Artifact`
- `A6GP-Secure-Binding`

The reference runtime exercises substantial parts of all five, but v0.4 remains research-grade. Real deployments still need production identity, durable storage, hardware/TEE attestation where appropriate, real RAN/Core adapters, operational key management, rate limiting, audit retention, and formal policy governance.

## Research positioning

A6GP is designed as a semantic control layer that can bind to emerging 6G standards and existing programmable-network mechanisms. It is explicitly not a replacement for PHY/MAC, 3GPP SBI, O-RAN interfaces, A2A, or MCP. See [`docs/STANDARDS_MAPPING.md`](docs/STANDARDS_MAPPING.md).

## 中文简介

A6GP 是面向 6G 的 Agent 原生网络协议研究方案。通过 Agent 身份、意图合同、能力/权限租约、委托、动作事务、证据、恢复与跨域治理，建立网络能力的可校验调用路径。

A6GP 将开放式智能与真实网络控制权分离：Agent 可以提出计划、协商和恢复策略，但真实网络状态改变必须通过结构化动作、最小权限租约、精确动作哈希授权、幂等提交、TOCTOU 再校验和独立证据闭环。对于 ACK 丢失或外部副作用未知的情况，协议进入 `UNKNOWN -> RECONCILING`，而不是简单重试。

当前参考实现包含 74 项可执行测试（28 项核心、46 项 ACN 扩展）。新增能力覆盖注册发现、动态群组、通算联合准入、数据生命周期及任务工具编排；原有跨域 Saga、R3 多方授权、数字孪生预检、快速策略制品、版本协商和签名 Envelope 继续保留。

本次 ACN 演示采用合成输入与内存资源模型，25 ms 为卸载时延预测值。真实 RAN 适配、推理任务执行、分布式持久化与生产身份服务仍需后续接入。详见[中文进展报告](reports/A6GP_Progress_Report_CN_2026-10-23.md)。

## License

No open-source license has been selected yet. Until a license is added, copyright and other rights remain reserved by the repository owner. This is intentional while the protocol, publication strategy, standards contributions, and potential patent families are still being evaluated.
