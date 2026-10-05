# A6GP: Agent-Native 6G Protocol — Specification, Architecture, Security, and Conformance

**Version: 4.0 Protocol Technical Specification Edition**  
**Date: 2026-10-04**  
**Status: Pre-standard Research Specification**  
**Semantic protocol version: A6GP 0.4**

## Abstract

This report proposes **A6GP (Agent-Native 6G Protocol)**, a control and coordination framework for a future 6G network in which autonomous agents are first-class protocol principals. “Agent-native” does not mean attaching an LLM chatbot to an existing network-management stack. It means making **agent identity, capability, intent, delegation, authority, action transactions, evidence, recovery, and governance** explicit protocol objects that can be authenticated, constrained, audited, and verified across UE, RAN, core, transport, edge, cloud, digital-twin, and third-party domains.

The central architectural position is that 6G may become strongly agent-mediated without placing general-purpose LLM reasoning directly into the tightest PHY/MAC loops. A viable design separates **reasoning intelligence from deterministic execution authority**. Agents interpret goals, negotiate, decompose work, simulate counterfactuals, and generate policies. A deterministic safety and transaction layer validates scope, authority, risk, conflicts, preconditions, budgets, and rollback semantics before any real network side effect occurs. Sub-millisecond control remains in deterministic algorithms, compiled policies, or bounded verified models.

A6GP therefore goes beyond a generic agent interoperability protocol. A2A provides agent discovery and task collaboration. MCP provides standard access from AI applications to tools and data. Telecom control needs stronger semantics: **short-lived revocable capability leases, resource-scope containment, risk classes, timing classes, prepare/authorize/commit/reconcile/compensate transactions, first-class unknown-side-effect states, evidence-gated completion, topology binding, digital-twin prechecks, threshold authorization, and deterministic fallback**.

The direction is consistent with standards as of October 2026. ITU IMT-2030 includes AI and Communication (AIAC) and ubiquitous intelligence. 3GPP Release 20 contains TR 29.832, *Study on the Protocol for Artificial Intelligence in 6G*, with version 0.2.0 uploaded on 14 September 2026. ETSI published GS ENI 059 V4.1.1 on 14 September 2026, explicitly covering AI-agent interfaces with agents, tools, data sources, UEs, third-party applications, base stations, and computing platforms, and analyzing A2A/MCP gaps for telecommunications. O-RAN Release 5 added AI/ML workflow enhancements across the Non-RT RIC and Near-RT RIC. The research opportunity is therefore not merely to claim that 6G will use agents, but to investigate **transactional, evidence-grounded, safety-bounded agent networking**.

To move beyond a conceptual proposal, this report also defines an A6GP protocol runtime: persistent intent contracts, dynamic delegation graphs, domain executors, a Network Evidence Fabric, action reconciliation, an autonomy episode ledger, evidence-grounded recovery, and a host-owned completion gate. These mechanisms are specified as protocol/runtime semantics independent of any particular agent framework, with a small reference implementation and conformance-oriented invariant tests.

---

## 1. Research Question: What Does “Agent-Native 6G” Actually Mean?

### 1.1 From AI-Assisted Networks to Agent-Native Networks

Most current AI-enabled telecom systems remain function-centric. A model predicts traffic, detects anomalies, recommends a parameter, or optimizes a metric, while conventional network functions retain the control abstraction. The network does not natively represent who an autonomous agent represents, which resources it may change, what objective it is pursuing, which authority it can delegate, which evidence proves success, or what happens if the agent crashes halfway through a cross-domain action.

An agent-native network changes the abstraction itself. An autonomous entity becomes an accountable protocol principal with verifiable identity, operator/tenant ownership, capability declarations, scoped authority, task contracts, action provenance, evidence history, and revocation state.

A6GP uses the following definition:

> **An agent-native network is one whose protocols can natively express, constrain, and verify goal negotiation, capability discovery, authority delegation, action execution, evidence acceptance, and failure recovery among autonomous intelligent principals.**

### 1.2 Why Ordinary RPC, A2A, or MCP Is Not Sufficient by Itself

Generic agent protocols solve important problems. A2A 1.0 provides interoperability and collaboration among heterogeneous agents. MCP’s 2026-era protocol connects AI applications to tools, resources, and prompts with capability negotiation and authorization. Telecom control introduces a stronger set of invariants:

- a tool call may change a live cell, slice, UPF, beam, energy state, or edge cluster;
- side effects may be partially completed across domains;
- lost acknowledgements can make the execution outcome unknown;
- a retry can duplicate a network effect;
- a child agent must not inherit more authority than its parent;
- an agent’s claim of success cannot be accepted without independent telemetry;
- concurrent optimizers can conflict over the same radio or compute resources;
- the correct behavior during LLM failure must be safe and deterministic.

These constraints make transaction semantics, evidence semantics, and timing semantics first-class requirements.

### 1.3 Agent-Native Does Not Mean LLM-Native

The most important architectural boundary is that free-form model reasoning is not the same thing as real-time network control. Telecom systems have strict timing, state, availability, and safety requirements. Token-by-token generation, model nondeterminism, context drift, and multi-second inference cannot directly own the tightest radio loops.

A6GP therefore separates four responsibilities:

- **Reasoning Plane:** LLMs, world models, optimizers, and multi-agent planners interpret objectives and generate candidate strategies.
- **Safety and Transaction Plane:** deterministic logic checks authority, risk, conflicts, budgets, preconditions, rollback, and policy.
- **Execution Plane:** approved actions are translated into RIC policies, SBI calls, SDN operations, device parameters, or compiled control artifacts.
- **Evidence Plane:** independent measurements determine whether the contract really succeeded.

This separation allows strong AI while preserving deterministic control boundaries.

---

## 2. Standards and Industry Direction, 2023-2026

### 2.1 ITU IMT-2030

ITU-R M.2160 established the IMT-2030 framework in 2023. In February 2026, ITU-R Working Party 5D completed draft technical performance requirements for IMT-2030. Public ITU material lists six usage scenarios: Immersive Communication, Hyper Reliable and Low-Latency Communication, Massive Communication, Ubiquitous Connectivity, AI and Communication (AIAC), and Integrated Sensing and Communication. Security/resilience, ubiquitous intelligence, and sustainability are among the broader design principles.

The implication is important: AI is becoming part of the system capability vision, not merely an operator-side implementation optimization. A6GP targets the system/control layer and does not attempt to replace a radio-interface candidate.

### 2.2 3GPP Release 20

The 3GPP Portal shows TR 29.832, *Study on the Protocol for Artificial Intelligence in 6G*, created on 16 June 2026 under CT3 for Release 20. Version 0.2.0 was uploaded on 14 September 2026. The existence of a dedicated study is evidence that AI-related protocol work is entering core-network protocol standardization rather than remaining a purely architectural discussion.

Adjacent 6G work spans architecture, capability exposure, control-plane protocols, management/orchestration, and security. A6GP should therefore be treated as an experimental semantic-control layer designed to map into future 3GPP procedures, not as a claim of current conformance.

### 2.3 ETSI ENI

ETSI GS ENI 059 V4.1.1 was published on 14 September 2026. Its scope covers AI-agent communication with other agents, tools, data sources, an agent repository function, UEs, third-party applications, base stations, and computing platforms. It explicitly analyzes gaps between existing protocols such as A2A/MCP and telecom requirements. Public material also describes six major interface types, NGAP extensions for RAN interaction, and binding analysis across JSON-REST, JSON-RPC, gRPC, with HTTP/3 + gRPC recommended for future use. A6GP therefore should not claim novelty from defining “an AI-agent interface”; its stronger distinction is transactional network side effects, lease-chain authority, TOCTOU binding, explicit UNKNOWN reconciliation, evidence-gated completion, and domain-sovereign sagas.

The broader ENI work programme forms a useful research chain: AI-agent core-network use cases, multi-agent frameworks, intent pre-processing, LLM tool usage, agent interfaces/protocols, network AI-agent training, and agent-based core-network security.

This suggests that the next frontier will likely be less about proving that telecom agents can communicate and more about how their authority, side effects, evidence, and recovery are governed.

### 2.4 O-RAN

O-RAN Release 5, completed in June 2026, includes AI RAN framework enhancements through AI/ML workflow services spanning the Non-RT RIC and Near-RT RIC. O-RAN provides a practical early substrate because it already exposes programmable control, timing separation, policies, telemetry, xApps/rApps, and AI/ML lifecycle concepts.

The most realistic first prototype is therefore not “replace 6G.” It is an **A6GP-over-O-RAN** experiment in which agents own intent, contracts, and delegation while RIC/SMO functions execute bounded policies and an evidence plane verifies outcomes.

### 2.5 Where Research Novelty Still Exists

A6GP should not claim novelty merely from the phrase “6G agent protocol.” The stronger research opportunities are:

1. treating every network-changing agent action as a **transaction**, not a generic tool call;
2. expressing authority as a **short-lived, revocable, hash-bound capability lease**;
3. defining success through **independent evidence gates** rather than model self-report;
4. making **unknown side effects** a first-class protocol state;
5. compiling high-level reasoning into policies for distinct network timing classes;
6. coordinating RAN/Core/Edge changes as **federated sagas** with local commit authority;
7. turning every autonomy episode into an immutable **outcome graph** for learning and governance.

---

## 3. Seven First-Principles Tensions an Agent Protocol Must Resolve

### 3.1 Autonomy vs. Determinism

Agents need to form new plans under uncertainty, while network actions must remain predictable and bounded. A6GP allows open planning but deterministic admission. A model can propose arbitrary strategies, but only schema-valid, policy-valid, lease-valid, precondition-valid actions can enter the execution plane.

### 3.2 Global Optimization vs. Domain Sovereignty

RAN, core, transport, edge, cloud, and security domains have different goals and should not be controlled by one universal super-agent. A6GP uses domain autonomy plus contract negotiation. A global coordinator may orchestrate a saga, but each domain retains local commit authority.

### 3.3 High-Level Semantics vs. Machine Protocols

A user may ask, “Guarantee this industrial-control service with minimum energy.” Network functions accept structured parameters, not natural-language intent. The contract layer compiles semantic objectives into constraints, SLOs, allowed actions, and evidence policies before any side effect is possible.

### 3.4 Continual Learning vs. Operational Stability

A learning system can recommend a new policy or threshold, but should not be able to rewrite the safety boundary that governs its own behavior. Learned policy and authority policy are distinct artifacts.

### 3.5 Parallel Agents vs. Resource Conflicts

Power, PRB, beam, mobility, slicing, and compute optimizers can interfere. A6GP binds actions to resource scopes and performs conflict detection and dependency ordering before commit.

### 3.6 Recovery vs. Duplicate Side Effects

Blind retry is acceptable for many stateless software requests but dangerous in network control. A6GP requires stable action identities and idempotency keys. Ambiguous outcomes move to RECONCILING rather than automatically creating a fresh action.

### 3.7 Model Latency vs. Network Timing

The strongest general model may require hundreds of milliseconds or seconds. The solution is **time-scale compilation**: slower agents generate verified control artifacts executed by faster deterministic components.

---

## 4. A6GP Architecture: The 6G Agent Fabric

A6GP defines eight logical planes. They may be co-located or distributed.

### 4.1 Identity and Trust Plane

Maintains cryptographic agent identities, operator/tenant binding, platform attestation, trust tier, certificates, revocation, and principal mapping.

### 4.2 Capability and Registry Plane

Stores capability descriptors: what an agent can read, what it may propose to modify, which action schemas it supports, which timing classes it can serve, its risk ceiling, cost limits, and delegation policy.

### 4.3 Intent and Contract Plane

Turns business/network objectives into a machine-verifiable contract containing scope, SLOs, hard constraints, allowed actions, required observations, risk, timing class, evidence policy, fallback, expiry, and revision.

### 4.4 Reasoning and Planning Plane

Runs LLMs, world models, optimizers, rule engines, and multi-agent planners. It proposes plans and actions but does not own commit authority.

### 4.5 Safety and Authority Plane

A deterministic policy layer that owns capability leases, least privilege, risk escalation, quorum authorization, conflict checks, resource budgets, digital-twin prechecks, and runtime guards.

### 4.6 Transaction Execution Plane

Owns ACTION_PREPARE, AUTHORIZE, COMMIT, STATUS, ROLLBACK, COMPENSATE, and RECONCILE. It uses adapters to O-RAN, 3GPP SBI, Kubernetes, SDN, device APIs, simulators, or future 6G interfaces.

### 4.7 Evidence and World-State Plane

Maintains observations, topology, network state, digital-twin state, before/after snapshots, measurement contracts, provenance, and conflicting evidence.

### 4.8 Learning and Governance Plane

Turns every autonomy run into an immutable episode recording objective, plan, actions, failures, recovery, evidence, cost, and outcome for offline learning, audit, and policy evaluation.

---

## 5. Five Timing Classes and the Time-Scale Compiler

A6GP messages carry a `timingClass`. The following are research design bands rather than 3GPP-defined limits.

| Class | Indicative budget | Typical role | Agent behavior |
|---|---:|---|---|
| T0 | <0.1 ms | tight PHY/data-plane loop | no free-form reasoning; verified deterministic artifact only |
| T1 | 0.1-10 ms | fast MAC/RLC/local protection | lightweight model or compiled policy with deterministic guard |
| T2 | 10 ms-1 s | near-real-time RAN control | specialized agent/optimizer, bounded inference |
| T3 | 1 s-minutes | cross-domain negotiation and planning | general agents, multi-agent reasoning, world-model simulation |
| T4 | minutes-days | training, offline optimization, strategy discovery | large models, large simulations, agent swarms |

### 5.1 Policy Artifacts

A T3/T4 agent does not directly “own” T0/T1 control. It emits a versioned **Policy Artifact** specifying:

- input variables and ranges;
- action space;
- hard guards;
- deterministic fallback;
- artifact hash and version;
- topology binding;
- validity window;
- verification report;
- rollback policy.

The safety plane admits the artifact before deployment to a RIC, edge node, or device.

### 5.2 Why Model Compression Alone Is Not Enough

Deploying a smaller LLM at the edge can reduce inference time but does not solve authority, conflict, replay, evidence, or rollback. Time-scale compilation is therefore a control-system concept, not merely an inference-acceleration technique.

---

## 6. Core Protocol Objects

### 6.1 AgentPrincipal

Important fields include `agentId`, `principalType`, `tenant`, `operatorDomain`, `identityKey`, `attestation`, `trustTier`, `status`, and `capabilityDescriptorHash`.

### 6.2 CapabilityDescriptor

Defines typed capabilities, read/write resources, timing classes, supported actions, risk ceiling, required evidence, cost limits, and delegation rules. Human-readable descriptions may exist, but they do not replace the executable schema.

### 6.3 IntentContract

The contract is the core A6GP object. It contains a revisioned goal, resource scope, hard constraints, optimization objectives, SLOs, permitted action classes, required observations, authority policy, risk class, timing class, evidence policy, fallback/compensation, termination conditions, and validity interval.

### 6.4 AuthorityLease

A lease is temporary and revocable:

`Lease = {subject, scope, actionSet, riskCeiling, validUntil, parentLease, constraints, nonce}`

Delegation must satisfy:

- child scope is contained by parent scope;
- child action set is a subset of the parent action set;
- child risk ceiling does not exceed the parent ceiling;
- child expiry does not outlive the parent lease.

### 6.5 ActionProposal and ActionAuthorization

An ActionProposal represents a candidate side effect. Authorization must cryptographically bind the proposal’s canonical hash so that an agent cannot obtain approval and then change parameters before commit.

### 6.6 EvidenceRecord

Evidence is machine-readable proof with source identity, measurement contract, resource identity, time window, method/version, artifact hash, verdict (PASS/FAIL/UNKNOWN), and confidence or evidence strength.

### 6.7 EpisodeRecord

After contract completion, the system persists an immutable lineage of plans, actions, evidence, failures, recovery, and resource consumption.

---


## 7. Resource Namespace, Versioning, and Canonical Message Envelope

A6GP constrains both semantic objects and the wire-level contract. Version 0.4 defines a protocol normalization layer so independent implementations can agree on exactly what an authorization refers to.

### 7.1 Hierarchical `a6gp://` Resource Scopes

A6GP uses a canonical URI namespace:

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

Containment requires exact authority and domain equality plus exact path-segment prefix semantics. `site-17` must never authorize `site-170`; a lease on a cell must never authorize its ancestor site or the whole RAN. The Core profile does not infer wildcard authority from string matching.

### 7.2 Protocol Version and Downgrade Protection

A6GP uses `major.minor` semantic versions. Peers advertise supported protocol versions, conformance profiles, bindings, and extensions. The negotiated version and critical extensions are part of signed protocol context. Unknown critical extensions and inconsistent downgrade attempts fail closed.

### 7.3 Canonical Envelope

All v4.0 control messages share a common envelope containing protocol/message versioning, identifiers, sender/receiver, tenant, timing/risk classes, contract revision, topology version, lease and idempotency identities, `bodyHash`, signature algorithm, key ID, critical extensions, and body.

The JSON reference binding SHOULD use RFC 8785 JSON Canonicalization Scheme for stable bytes and hashes. A binary binding can use Protobuf/gRPC or CBOR/COSE if it preserves the same semantics and state machine.

### 7.4 Freshness and Replay Protection

Receivers reject expired messages, invalid signatures, forbidden replay, tenant/authority mismatch, unknown critical extensions, and downgrade attempts inconsistent with negotiation. Clock-skew tolerance is deployment policy and must not silently extend lease or authorization expiry.

### 7.5 Why This Matters

Without canonicalization, version negotiation, scope semantics, replay rules, and signed critical extensions, two implementations can both claim “A6GP support” while disagreeing about the exact authority of the same action. v4.0 makes this a conformance issue rather than an implementation detail.

## 8. Message Families

### 8.1 Registration and Discovery

`AGENT_REGISTER`, `AGENT_ATTEST`, `AGENT_STATUS`, `CAPABILITY_ADVERTISE`, `CAPABILITY_QUERY`, `CAPABILITY_RESULT`, `AGENT_REVOKE`.

### 8.2 Intent and Negotiation

`INTENT_SUBMIT`, `INTENT_OFFER`, `PLAN_PROPOSE`, `CONSTRAINT_CHALLENGE`, `PLAN_COUNTER`, `CONTRACT_PROPOSE`, `CONTRACT_ACCEPT`, `CONTRACT_REJECT`, `CONTRACT_AMEND`.

### 8.3 Delegation and Collaboration

`DELEGATION_PROPOSE`, `DELEGATION_GRANT`, `DELEGATION_REJECT`, `DELEGATION_REVOKE`, `TASK_PROGRESS`, `TASK_RESULT`.

### 8.4 Action Transactions

`ACTION_PREPARE`, `ACTION_CHALLENGE`, `ACTION_AUTHORIZED`, `ACTION_REJECTED`, `ACTION_COMMIT`, `ACTION_ACK`, `ACTION_STATUS`, `ACTION_ROLLBACK`, `ACTION_COMPENSATE`, `RECONCILE_REQUEST`, `RECONCILE_RESULT`.

### 8.5 Evidence and Completion

`EVIDENCE_SUBMIT`, `EVIDENCE_QUERY`, `EVIDENCE_CONFLICT`, `ADJUDICATION_REQUEST`, `RESULT_ATTEST`, `CONTRACT_CLOSE`.

### 8.6 Liveness and Recovery

`LEASE_GRANT`, `LEASE_RENEW`, `LEASE_EXPIRE`, `HEARTBEAT`, `FAILOVER_CLAIM`, `QUARANTINE`, `RECOVERY_PROPOSE`.

---

## 9. Action Transactions: The Core A6GP Mechanism

### 9.1 Why Agent Network Actions Must Be Transactional

A network action can be only partially completed, executed against stale state, affected by race conditions, or acknowledged after a control-plane failover. A6GP therefore treats every side effect as a transaction.

### 9.2 PREPARE

The proposing agent submits action kind, target, parameters, preconditions, expected effect, risk estimate, evidence plan, and rollback/compensation semantics.

The safety plane validates identity, lease, scope, contract, topology version, conflicts, budget, digital-twin requirements, and reversibility.

### 9.3 AUTHORIZE

An authorization token is bound to the exact action:

`AuthToken = Sign(authority, actionHash, leaseChainHash, contractRevision, topologyVersion, policyVersion, preconditionSnapshotHash, approvals, expiresAt, nonce)`

Changing any action parameter changes the hash and invalidates the token.

### 9.4 COMMIT

The executor requires a valid authorization and a stable `idempotencyKey`. Replaying the same key and same action hash must return the prior/current result rather than creating a second side effect.

### 9.5 VERIFY

Execution success is not contract success. The evidence plane evaluates SLOs and guardrails. Missing evidence is `UNKNOWN`, never silently converted to PASS.

### 9.6 UNKNOWN and RECONCILE

If the client loses connectivity after COMMIT, the action enters:

`COMMITTING -> UNKNOWN -> RECONCILING`

Recovery queries the original action identity. It does not fabricate a new action simply because the acknowledgement was lost.

### 9.7 Cross-Domain Saga

A low-latency AI service may require RAN PRB changes, UPF placement, edge GPU reservation, and model deployment. A6GP models these as a saga. Each domain owns local commit authority and compensation; the cross-domain agent coordinates ordering and evidence.

---


### 9.8 Stable Idempotency Scope

The idempotency identity should not be tied only to the current agent because an authorized failover agent must be able to reconcile an action created by a failed predecessor. v4.0 therefore defines the default logical idempotency scope as:

```text
(tenant, contractId, targetAuthorityDomain, idempotencyKey)
```

A different action hash under the same scope is an `IDEMPOTENCY_CONFLICT`.

### 9.9 Execution Receipt

Executors should return a stable execution ID, action hash, idempotency scope, execution status, effect hash, and timestamps. `ACTION_ACK` proves only an execution-domain observation; it does not prove that the Intent Contract succeeded.

### 9.10 TOCTOU Between Prepare and Commit

Topology, load, policy, and alarms may change between PREPARE and COMMIT. v4.0 binds `contractRevision`, `topologyVersion`, `policyVersion`, and `preconditionSnapshotHash` into authorization. Stale commit conditions produce explicit stale errors and require a fresh prepare/authorize cycle rather than model guesswork.

## 10. Risk Classes

Timing class answers “how fast?” Risk class answers “how much independent authority is required?”

| Risk | Example | Minimum admission behavior |
|---|---|---|
| R0 | read-only telemetry or simulation | authenticated identity and read policy |
| R1 | reversible small-scope optimization | lease, idempotency, post-check |
| R2 | material service impact or multi-resource change | twin/shadow precheck, rollback/compensation, independent evidence |
| R3 | safety, billing, sovereignty, or wide-area critical change | threshold authorization, staged rollout, immutable audit, independent authority/human gate where required |

The proposing agent may recommend raising risk but cannot lower the risk assigned by policy.

---

## 11. Security Model

### 11.1 Prompt Injection Becomes Action Injection

Text from users, logs, or external systems may manipulate a reasoning model. A6GP never treats prompt content as authority. Only structured proposals with valid leases and deterministic safety checks can execute.

### 11.2 Agent Impersonation

Agent identity should bind to workload/platform identity, with attestation for higher-risk roles. Advertising a capability does not automatically grant permission.

### 11.3 Privilege Amplification Through Delegation

Scope containment is computed and enforced outside the model. A child can receive less authority, never more.

### 11.4 Replay and Duplicate Commit

Messages include nonce, expiry, action hash, and idempotency identity. Old authorization cannot be reused for modified parameters.

### 11.5 Evidence Fraud

An agent cannot unilaterally claim that optimization succeeded. Evidence should be produced by telemetry, a verifier, an active probe, or another independently trusted source where practical.

### 11.6 Multi-Agent Collective Error

Strong contradictory evidence creates an adjudication task rather than a majority vote. The resolution mechanism should be a discriminating measurement, shadow replay, counterexample, or independent reproduction.

### 11.7 Model Unavailability

The network must fail safe and preferably fail operational. It should retain the last known-good policy, narrow permissions, or fall back to conventional controllers rather than becoming uncontrollable when an LLM endpoint fails.

---


### 11.8 Confused Deputy and Cross-Tenant Authority

An agent legitimately authorized for one tenant must not become a deputy for another tenant. A6GP binds tenant, authority domain, scope, and lease chain into authorization. Cross-tenant leases are denied by default unless an explicit federation policy issues narrowed authority.

### 11.9 Version Downgrade and Critical Extensions

The negotiated protocol version, profile set, and critical extensions are signed context. A peer encountering an unknown critical extension fails closed. This prevents silently stripping a newly required safety mechanism through downgrade.

### 11.10 R3 Multi-Authority Threshold Authorization

Safety-, billing-, sovereignty-, or wide-area-critical actions should not be approved by a single reasoning or control service. v4.0 supports `m-of-n` authorization across independent authority domains. Multiple signatures from the same domain do not satisfy a policy requiring distinct domains.

## 12. Agentic RAN Deployment Model

### 12.1 Action Depth

A practical adoption path proceeds from slower to faster control:

1. operational configuration: energy mode, carrier activation, model deployment;
2. Non-RT optimization: slicing policies, long-term resources, model selection;
3. Near-RT control: power/PRB/beam/mobility policy parameters;
4. T1 compiled policies for fast local actions;
5. T0 PHY execution remains deterministic or highly specialized.

### 12.2 Initial Action Taxonomy

Suggested first actions:

- `ran.prb.allocate`
- `ran.power.adjust`
- `ran.beam.policy.update`
- `ran.handover.bias.update`
- `ran.energy.mode.set`
- `ran.admission.policy.update`
- `ran.measurement.policy.update`
- `ran.model.deploy`

Each action should have a strict schema, resource limits, guardrails, conflict rules, and rollback semantics.

### 12.3 Mapping to O-RAN

A6GP does not replace O-RAN. It provides the agent-control semantics above it. Registry and contract functions can live in the SMO/Non-RT domain; T2 agents can map to Near-RT services/xApps; policy artifacts can be delivered using appropriate policy/management mechanisms; actual RAN control remains through E2 or future interfaces; evidence aggregates O1/E2 telemetry, RIC metrics, and external probes.

---

## 13. Agent-Native Core, Edge, and Cloud

### 13.1 Core Agent

A core-network agent may coordinate slice admission, UPF selection, QoS policy, capability exposure, mobility policy, or anomaly recovery. Billing/authentication/wide-area actions should normally be R2/R3.

### 13.2 Edge Compute Agent

6G AI services couple radio and compute. An edge agent may manage GPU/NPU placement, model replicas, inference routing, cache, offload, and energy budgets.

### 13.3 Joint Network-Compute Contracts

Example:

> “For the next 20 minutes, keep P99 end-to-end latency below 20 ms for the stadium AR service, under cost X and with network-energy increase below Y%.”

This decomposes into RAN, core, transport, and edge subcontracts. The final evidence gate evaluates end-to-end outcome, not only local-domain metrics.

---

## 14. World Models and Digital Twins

Digital twins should be more than visualization. For higher-risk changes they can serve as one pre-commit oracle.

### 14.1 Shadow Validation

R2/R3 actions can be evaluated first in O-RAN digital twins, ns-3, OMNeT++, srsRAN-based environments, learned world models, or operator replay systems.

### 14.2 Simulation PASS Is Not Real PASS

A twin increases confidence but does not replace live evidence. A6GP records simulator/model version, scenario seed, topology snapshot, and uncertainty.

### 14.3 Counterfactual Evidence

Agents may predict what would happen without an action. Long-term episode data allows those counterfactual predictions to be calibrated and used to improve world models.

---

## 15. A6GP Protocol Runtime Architecture

A6GP should not depend on any particular agent framework or model vendor. The protocol must define runtime semantics that can be implemented across different RAN, core, edge, and cloud stacks. A practical runtime is divided into four mutually constraining planes: **Reasoning & Coordination, Protocol Control, Deterministic Execution, and Evidence & Recovery**.

### 15.1 Reasoning & Coordination Plane

This plane performs open-ended intelligence: interpreting intent, discovering agents, decomposing objectives, producing candidate plans, negotiating across domains, querying digital twins or world models, and proposing recovery strategies. It may use LLMs, RL policies, optimization solvers, conventional algorithms, or hybrids. A6GP does not standardize the internal model architecture; it standardizes the protocol objects emitted by this plane.

The critical restriction is that this plane does **not** own final authority over real network side effects. It may propose `PLAN_PROPOSE`, `DELEGATE_REQUEST`, or `ACTION_PREPARE`, but it cannot bypass the protocol control plane.

### 15.2 Protocol Control Plane

This is the authoritative A6GP core and should be deterministic, auditable, and replayable wherever practical. It owns intent contracts and revisions, identities and capability registrations, authority leases and delegated scopes, risk/timing policy, action-transaction state, resource conflicts, cross-domain sagas, evidence policy, and completion gates.

External reasoning systems may recommend changes, but every real-network `COMMIT` must be authorized or validated by this plane.

### 15.3 Deterministic Execution Plane

The execution plane maps an authorized action to concrete network mechanisms: RIC policies, E2 control, 5GC service-based interfaces, UPF or transport policy, edge-compute operations, or precompiled local policies. Two rules are central: commits must be idempotent (or bound to stable idempotency identities), and T0/T1 execution should use deterministic controllers or validated policies rather than ad hoc general-purpose model calls.

### 15.4 Evidence & Recovery Plane

A6GP separates “the controller accepted the command” from “the contract objective was achieved.” Independent evidence may include telemetry windows, active probes, SLO verifiers, energy measurements, security attestations, and digital-twin results. Unknown outcomes trigger reconciliation; contradictory strong evidence creates an evidence conflict; cross-domain partial failure triggers compensation or replanning.

### 15.5 Persistent Objectives and Dynamic Delegation Graphs

Long-lived network intent cannot exist only inside conversation context. Each `IntentContract` requires a durable identity, revision, scope, SLOs, budget, validity window, and evidence policy. Complex objectives can expand into a dynamic delegation graph, but each child must inherit and narrow parent authority, and every new node must pass admission.

### 15.6 Host-Owned Completion

Completion belongs to the protocol control plane, not to the reasoning model. An agent may claim that work is complete, but `CONTRACT_CLOSE` is permitted only when required actions are committed, required evidence meets threshold, strong conflicts are resolved, and unresolved external effects have been reconciled.

> **Models own proposals; the protocol owns authorization; evidence owns completion.**

## 16. A6GP v0.4 Reference Runtime and Protocol TCK

The reference runtime exists to make protocol invariants executable; it is not a product architecture prescription. v4.0 separates `AgentRegistry`, `SafetyKernel`, `ProtocolRuntimeAdapter`, `ActionExecutor`, the Evidence Gate, and protocol object types.

### 16.1 Structured Resource Scopes

Authority uses `a6gp://authority/domain/...` URIs and segment-wise ancestor/descendant checks. This removes prefix-confusion bugs and permits a site-level parent lease to delegate a cell-level child lease without authorizing siblings or ancestors.

### 16.2 Lease Chains and Cascading Revocation

Delegation narrows scope, action set, risk ceiling, and expiry. A child records its parent lease. Revoking a parent recursively invalidates descendants and any unused authorization derived from that chain.

### 16.3 ActionExecutor Implements UNKNOWN/Reconcile

The reference runtime implements the case where a physical effect occurs but its ACK is lost through `ActionExecutor.ensure()` and `inspect()`. A fault injection can apply the effect and return `UNKNOWN`; the runtime preserves the original identity and permits only reconciliation, not a fresh equivalent action.

### 16.4 Evidence Independence

Evidence records now include source principal/class, independence group, measurement-contract hash, observation time, and validity. Executor self-report is rejected as independent evidence by default; stale evidence, evidence for unapplied actions, or strong failure evidence blocks completion.

### 16.5 R3 Authorization Quorum

The runtime supports required approvals and distinct authority domains. Conformance tests prove that one approval is insufficient, two approvals from one authority domain are insufficient when distinct domains are required, and two distinct domains satisfy the research profile.

### 16.6 Executable Result

The v4.0 core suite contains **14 tests and passes 14/14**. It covers hash-bound authorization, duplicate commit, lost-ACK reconciliation, evidence fail-closed behavior, executor self-report rejection, strong failure evidence, unapplied-action evidence rejection, hierarchical scope containment, delegation narrowing, cascading lease revocation, agent revocation, stale contract/topology rejection, R2/R3 prechecks, R3 distinct-domain quorum, and cross-tenant isolation.

The package includes executable JSON Schemas for contracts, actions, leases, evidence, and envelopes. Together with the runtime tests they form the initial protocol TCK substrate.


## 17. Three End-to-End Use Cases

### 17.1 Stadium Hotspot: Joint RAN and Edge Optimization

**Intent:** for 15 minutes, maintain AR-service P99 latency below 20 ms, drop rate below 0.5%, and energy increase below 8%.

**Agents:** Service Agent, RAN Agent, Core Agent, Edge Agent, Energy Agent.

Flow:

1. Service Agent submits intent.
2. Contract Plane records SLOs, budget, scope, and evidence policy.
3. RAN Agent proposes PRB/beam actions.
4. Edge Agent proposes model-replica scaling.
5. Energy Agent constrains total power.
6. Planner creates a cross-domain saga.
7. Digital twin performs prechecks.
8. TSEF authorizes per domain.
9. RAN/Core/Edge commit.
10. Evidence Fabric verifies end-to-end latency, RAN KPIs, GPU load, and energy.
11. Partial failure triggers compensation and re-planning.

### 17.2 Energy Agent vs. SLA Agent Conflict

An Energy Agent wants to disable a low-load carrier while an SLA Agent predicts a load surge in ten minutes. Both submit strong but contradictory evidence. A6GP opens an `EVIDENCE_CONFLICT` and requests higher-frequency measurements or a short shadow test. It does not use agent majority voting.

### 17.3 Lost ACK During Control Change

A RAN Agent commits a handover-bias change but the connection breaks before the ACK. Instead of retrying blindly, A6GP marks the action UNKNOWN and queries the controller using the original idempotency identity. If the action already executed, the system proceeds to VERIFY; otherwise it may re-issue the same logical commit safely.

---

## 18. Experimental System and Evaluation Plan

### 18.1 Testbed Layers

1. **Protocol emulator:** TypeScript/Python state machines and safety invariants.
2. **RAN simulator/testbed:** ns-3, srsRAN, or O-RAN SC.
3. **World model/digital twin:** action prechecks and counterfactual prediction.
4. **Multi-agent runtime:** vendor-neutral A6GP runtime with replaceable external or local model interfaces.

### 18.2 Baselines

- B0: rules/conventional controller;
- B1: single agent with direct tool calls;
- B2: multi-agent A2A/MCP-style collaboration without transaction/evidence semantics;
- B3: full A6GP;
- B4: A6GP without reconciliation;
- B5: A6GP without evidence gating;
- B6: A6GP without time-scale compilation.

### 18.3 Metrics

**Network metrics:** throughput, P99 latency, packet loss, handover failure, PRB utilization, energy.  
**Autonomy metrics:** goal success, unsafe-action rejection, duplicate side effects, recovery success, reconciliation time, evidence completeness.  
**Agent metrics:** token/request cost, plan depth, number of agents, context bytes, decision latency.  
**System metrics:** availability, failover time, transaction throughput, ledger growth, CPU/memory overhead.

### 18.4 Failure Injection

At minimum test lost ACKs, agent crashes, controller restarts, stale telemetry, topology change, conflicting agents, model 429/5xx, malicious prompt injection, expired leases, duplicate commits, simulator false positives, and WAN partitions.

### 18.5 Publication-Quality Questions

A strong paper should show more than “the prototype runs.” It should test whether A6GP:

1. reduces duplicate effects and out-of-scope actions at equal network utility;
2. makes UNKNOWN/reconcile safer than blind retry;
3. reduces false-success through independent evidence;
4. improves complex cross-domain completion with dynamic multi-agent decomposition;
5. lets high-level agents influence fast control through verified artifacts without violating timing constraints.

---

## 19. Research Hypotheses

**H1 Transactional Safety:** Under packet loss, controller crashes, and retries, A6GP drives duplicate side effects toward zero relative to direct-tool baselines.

**H2 Evidence-Grounded Completion:** Independent evidence gates reduce false-positive completion when models report success but SLOs are not actually met.

**H3 Scoped Delegation:** Capability leases prevent privilege amplification during dynamic multi-agent spawning while preserving useful parallelism.

**H4 Multi-Domain Productivity:** Dynamic DAGs and multi-host workers reduce wall-clock completion time for objectives with real RAN/Core/Edge parallelism.

**H5 Time-Scale Compilation:** Verified policies generated by slower T3 agents can execute at T1/T2 latency while preserving higher-level adaptability.

**H6 Episode Learning:** Recovery policies learned or selected from verified outcome graphs outperform pure free-form prompt reflection on repeated failure modes.

---

## 20. Standardizable Protocol Contributions

### 20.1 Hash-Bound Action Authorization

Authorization tokens bind the exact canonical action hash, lease, scope, expiry, and nonce.

### 20.2 Evidence-Gated Network Intent Contracts

Completion is controlled by explicit measurement/evidence policy rather than model self-report or HTTP success.

### 20.3 Unknown-Side-Effect Reconciliation Protocol

Ambiguous external effects are first-class protocol states reconciled through stable action identities rather than blind retry.

### 20.4 Hierarchical Capability Leases for Multi-Agent Networks

Delegation, resource hierarchy containment, risk ceilings, and expiry are unified into a verifiable lease chain.

### 20.5 Time-Scale Policy Compilation

Long-horizon reasoning is compiled into low-latency policy artifacts bound to topology, version, guardrails, evidence, and rollback.

### 20.6 Evidence Conflict Adjudication

Strong conflicting evidence automatically produces a discriminating measurement or experiment task instead of agent voting.

### 20.7 Autonomy Episode Ledger

Goal-plan-action-evidence-recovery-result lineage becomes an immutable outcome graph for governance and offline learning.

---

## 21. Relationship to A2A, MCP, ETSI ENI, 3GPP, and O-RAN

| System | Primary strength | What A6GP reuses | What A6GP adds |
|---|---|---|---|
| A2A 1.0 | agent discovery, tasks, heterogeneous interoperability | agent cards, task/message patterns | telecom scope, risk, leases, transactions, evidence, reconciliation |
| MCP 2026-07-28 | tool/resource/prompt access and capability negotiation | tool and data exposure | side-effect safety, network-resource hierarchy, transactional control |
| ETSI ENI 059 | agent interfaces for next-generation mobile systems | telecom agent-interface taxonomy | stronger transaction/evidence/timing/authority semantics |
| 3GPP TR 29.832 | study of AI protocol in 6G | future standards alignment and bindings | experimental transaction/evidence semantics now |
| O-RAN R5 | programmable AI/ML workflow and RIC/SMO | near-term experimental substrate | cross-domain contracts and safe agent transaction layer |

A6GP is best treated as a **semantic control contract** that can later bind to normative 3GPP/ETSI/O-RAN procedures, not as an isolated replacement protocol stack.

---

## 22. Implementation Roadmap

### Phase 0: Protocol Invariants, 0-3 Months

Complete schemas, property-based tests, idempotency/scope/lease/evidence invariants, and a fault-injection simulator.

### Phase 1: O-RAN / RAN Simulation, 3-6 Months

Build an O-RAN SC or srsRAN adapter, implement PRB/power/beam actions, add near-real-time actions and digital-twin prechecks.

### Phase 2: Joint RAN and Edge, 6-12 Months

Add compute offload, model deployment, network-compute joint contracts, and cross-domain sagas.

### Phase 3: Multi-Domain Agent Federation, 12-18 Months

Add core/transport/security agents, threshold authorization, and multi-operator or third-party trust.

### Phase 4: Standardization, Interoperability, and Public Validation

Turn message objects and state machines into contributions; publish transaction/evidence benchmarks; split the strongest mechanisms into separate patent families where justified.

---

## 23. Engineering Definition of Done

A serious A6GP prototype should satisfy at least the following:

1. every side effect is rejected without a valid lease;
2. authorization binds the exact action hash;
3. duplicate COMMIT does not create a duplicate effect;
4. UNKNOWN effects are reconciled rather than blindly resubmitted;
5. delegated authority never exceeds parent authority;
6. contracts cannot close without independent evidence;
7. high-risk actions support digital-twin or shadow prechecks;
8. at least two network/compute domains can complete a saga;
9. the network falls back deterministically when the reasoning model is unavailable;
10. actions, evidence, and recovery have immutable lineage.

---


## Annex A. Conformance Profiles and Minimum TCK

A6GP v0.4 separates conformance into five profiles so a discovery-only implementation is not forced to implement cross-domain sagas, while a transport-only implementation cannot claim complete A6GP control semantics.

| Profile | Minimum capability |
|---|---|
| A6GP-Core | identity, contract, lease, hash-bound authorization, idempotency, evidence gate, versioning |
| A6GP-Telecom-Control | risk/timing, topology and precondition binding, fallback, high-risk precheck |
| A6GP-Federation | local-domain commit authority, saga, compensation, cross-domain evidence |
| A6GP-Policy-Artifact | T0/T1 artifact, guard, validated envelope, withdrawal/fallback |
| A6GP-Secure-Binding | canonical envelope, signature, replay, critical extensions, downgrade protection |

The minimum TCK should cover at least 20 state-machine/security cases including missing/revoked leases, privilege amplification, cross-tenant authority, hash mismatch, stale topology, R3 quorum, duplicate commit, lost ACK, stale evidence, strong conflict, unresolved UNKNOWN, critical extensions, and downgrade attacks.

## Annex B. Formalizable Protocol Properties

A6GP should not rely only on unit tests. Candidate properties for TLA+/PlusCal, property-based state machines, or model checking include:

```text
P1 COMMIT(a) => validLease(a) AND validAuthorization(hash(a))
P2 Authority(child) subset_of Authority(parent)
P3 CONTRACT_CLOSE => evidenceSatisfied AND noStrongConflict AND noUnresolvedEffect
P4 uncertain(externalEffect) => state = UNKNOWN
P5 UNKNOWN(a) => next in {STATUS, RECONCILE, ESCALATE}, not NEW_EQUIVALENT_ACTION
P6 revoked(leaseChain) => no future commit by that chain
```

P4/P5 are especially important: a telecom control protocol must not collapse “we do not know whether it executed” into “it failed,” because that classification error directly creates duplicate physical side effects.

## Annex C. Performance, Scaling, and Privacy

A6GP is not intended for every packet or PHY symbol. T0/T1 execution should stay local and deterministic, while contracts, authority, transactions, and evidence live in lower-frequency control planes. Registries/evidence stores can be sharded by tenant or authority domain; capability descriptors can use bounded-TTL caches; raw telemetry need not be retained forever if immutable artifact hashes, measurement contracts, windows, and audit lineage are preserved.

Performance evaluation should measure P50/P99 authorization latency, transaction throughput, reconciliation latency, evidence-gate latency, metadata bytes per action, ledger growth, CPU/memory overhead, and the safety-utility tradeoff versus direct-agent baselines.

Protocol evidence should not store private model chain-of-thought. It should retain verifiable objectives, structured actions, authorization, execution receipts, measurement contracts, evidence summaries, and recovery lineage.

## 24. Conclusion

Whether 6G becomes agent-native does not depend on making an LLM fast enough to sit inside every PHY loop. It depends on whether the network develops a protocol discipline that separates **intelligence from authority**. A model can reason at second or minute scale and still influence millisecond operation by producing validated policies, contracts, leases, and transactions. The critical safety condition is that open-ended reasoning never receives unconstrained physical-network authority.

A6GP therefore treats 6G as a high-intensity protocol validation environment. Telecom forces the runtime to deal with distributed state, strict permissions, heterogeneous timing, partial failure, external side effects, independent evidence, recovery, and safety. Agent-native networking is credible only if the protocol can operate under these conditions without authority escalation, duplicate side effects, false success, or unsafe dependence on model availability.

The central protocol proposition can be summarized in one sentence:

> **Let agents reason freely, but allow them to change the real 6G network only through verifiable contracts, least-privilege leases, transactional actions, state-freshness binding, and independent evidence.**

---

## References (status checked 2026-10-04)

1. ITU, *IMT-2030: Technical requirements for the 6G future*, 17 March 2026. https://www.itu.int/hub/2026/03/imt-2030-technical-requirements-for-the-6g-future/
2. ITU-R, *IMT towards 2030 and beyond (IMT-2030)* portal. https://www.itu.int/en/ITU-R/study-groups/rsg5/rwp5d/IMT-2030/Pages/default.aspx
3. 3GPP, TR 29.832, *Study on the Protocol for Artificial Intelligence in 6G*, Release 20, draft; v0.2.0 uploaded 14 September 2026. https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=5548
4. ETSI, GS ENI 059 V4.1.1, *AI Agent Interface and Protocol Specification for Next-Generation Mobile Communication System*, published 14 September 2026. https://portal.etsi.org/webapp/WorkProgram/Report_WorkItem.asp?WKI_ID=75451
5. ETSI ENI work programme, ENI 055/056/057/058/059/060/062. https://portal.etsi.org/webapp/WorkProgram/
6. O-RAN ALLIANCE, *O-RAN ALLIANCE Completed its Specification Release 5 (O-RAN-R005)*, 8 June 2026. https://www.o-ran.org/blog/o-ran-alliance-completed-its-specification-release-5-o-ran-r005
7. A2A Protocol, official specification, latest released v1.0.0 as observed in October 2026. https://a2a-protocol.org/v1.0.0/
8. Model Context Protocol TypeScript SDK v2, stable line implementing protocol revision 2026-07-28. https://ts.sdk.modelcontextprotocol.io/v2/

9. RFC 8785, *JSON Canonicalization Scheme (JCS)*.
10. RFC 2119 / RFC 8174, normative requirement keywords.
