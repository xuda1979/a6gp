import test from "node:test";
import assert from "node:assert/strict";
import {
  A6GPError,
  A6GPRuntime,
  InMemoryIdempotentExecutor,
  actionHash,
  scopeContains,
  type ActionSpec,
  type AgentPrincipal,
  type Approval,
  type EvidenceRecord,
  type IntentContract,
  type PrecheckRecord,
} from "../src/index.ts";

const tenant = "operator-a";
const site = "ran:operator-a/region-west/site-17";
const cell = `${site}/cell-3`;
const now = () => new Date();
const future = (ms = 60_000) => new Date(Date.now() + ms).toISOString();

function principal(agentId = "agent:operator-a:ran-optimizer-17", operatorDomain = "region-west"): AgentPrincipal {
  return {
    agentId,
    principalType: "RAN",
    tenant,
    operatorDomain,
    identityKeyId: `${agentId}:key-1`,
    trustTier: "TIER_2",
    status: "ACTIVE",
    capabilityDescriptorHash: "sha256:capability",
  };
}

function contract(overrides: Partial<IntentContract> = {}): IntentContract {
  return {
    contractId: "ctr-2042",
    revision: 1,
    tenant,
    goal: "Maintain stadium AR service SLO",
    scope: [site],
    hardConstraints: ["drop_rate < 0.005", "energy_delta < 0.08"],
    allowedActions: ["ran.prb.allocate", "ran.beam.policy.update", "ran.power.adjust"],
    riskClass: "R3",
    timingClass: "T3",
    evidencePolicy: ["e2e-latency-window", "drop-rate-window"],
    minimumEvidenceStrength: 0.9,
    minimumIndependentSources: 2,
    approvalThreshold: 2,
    fallbackPolicy: "last-known-good",
    validUntil: future(300_000),
    state: "ACTIVE",
    ...overrides,
  };
}

function action(overrides: Partial<ActionSpec> = {}): ActionSpec {
  return {
    actionId: "act-91",
    contractId: "ctr-2042",
    contractRevision: 1,
    tenant,
    actor: "agent:operator-a:ran-optimizer-17",
    targetAuthorityDomain: "ran-west",
    targetScope: cell,
    actionType: "ran.prb.allocate",
    parameters: { prbShare: 0.62 },
    riskClass: "R1",
    timingClass: "T2",
    idempotencyKey: "site17-prb-window-0001",
    topologyVersion: "topo-8842",
    policyVersion: "policy-7",
    preconditionSnapshotHash: "sha256:preconditions-v1",
    fallbackPolicy: "last-known-good",
    compensationActionType: "ran.prb.restore",
    ...overrides,
  };
}

function precheck(a: ActionSpec, verdict: "PASS" | "FAIL" | "UNKNOWN" = "PASS"): PrecheckRecord {
  return {
    precheckId: `pre-${a.actionId}`,
    kind: "digital-twin",
    verdict,
    artifactHash: "sha256:twin-artifact",
    topologyVersion: a.topologyVersion,
    policyVersion: a.policyVersion,
    inputHash: "sha256:input",
    uncertainty: 0.03,
  };
}

function approval(a: ActionSpec, issuer: string, domain: string, hash = actionHash(a)): Approval {
  return {
    approvalId: `approval-${issuer}`,
    issuer,
    authorityDomain: domain,
    actionHash: hash,
    expiresAt: future(60_000),
  };
}

function evidence(
  id: string,
  kind: string,
  source: string,
  sourceClass: EvidenceRecord["sourceClass"] = "probe",
  verdict: EvidenceRecord["verdict"] = "PASS",
  actionId = "act-91",
  strength = 0.97,
): EvidenceRecord {
  return {
    evidenceId: id,
    contractId: "ctr-2042",
    actionId,
    kind,
    source,
    sourceClass,
    tenant,
    resource: "service:operator-a/stadium-ar",
    timeWindow: [new Date(Date.now() - 10_000).toISOString(), new Date().toISOString()],
    measurementContract: "sha256:measurement-contract-v1",
    verdict,
    strength,
    artifactHash: `sha256:${id}`,
    createdAt: new Date().toISOString(),
  };
}

function fixture(contractOverride: Partial<IntentContract> = {}) {
  const executor = new InMemoryIdempotentExecutor();
  const runtime = new A6GPRuntime(executor);
  const p = principal();
  runtime.registerPrincipal(p);
  runtime.createAndActivateContract(contract(contractOverride));
  runtime.observe({
    targetScope: cell,
    topologyVersion: "topo-8842",
    policyVersion: "policy-7",
    preconditionSnapshotHash: "sha256:preconditions-v1",
    observedAt: new Date().toISOString(),
  });
  const lease = runtime.grantLease({
    subject: p.agentId,
    tenant,
    scope: [site],
    actionSet: ["ran.prb.allocate", "ran.beam.policy.update", "ran.power.adjust"],
    riskCeiling: "R3",
    validUntil: future(120_000),
  });
  return { runtime, executor, lease };
}

function expectCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => error instanceof A6GPError && error.code === code);
}

async function expectCodeAsync(fn: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(fn, (error: unknown) => error instanceof A6GPError && error.code === code);
}

test("TCK-01: side effect preparation without a valid lease is rejected", () => {
  const { runtime } = fixture();
  expectCode(() => runtime.transactions.prepare(action(), "lease-missing"), "AUTHORITY_MISSING");
});

test("TCK-02: hierarchical scope containment uses segment boundaries", () => {
  assert.equal(scopeContains("ran:operator-a/region/site-1", "ran:operator-a/region/site-1/cell-2"), true);
  assert.equal(scopeContains("ran:operator-a/region/site-1", "ran:operator-a/region/site-10"), false);
});

test("TCK-03: child lease cannot widen parent resource authority", () => {
  const { runtime, lease } = fixture();
  expectCode(() => runtime.grantLease({
    subject: lease.subject,
    tenant,
    scope: ["ran:operator-a/region-west"],
    actionSet: ["ran.prb.allocate"],
    riskCeiling: "R1",
    validUntil: future(60_000),
    parentLeaseId: lease.leaseId,
  }), "SCOPE_VIOLATION");
});

test("TCK-04: child lease cannot widen action set or risk", () => {
  const { runtime, lease } = fixture();
  const child = runtime.grantLease({
    subject: lease.subject,
    tenant,
    scope: [cell],
    actionSet: ["ran.prb.allocate"],
    riskCeiling: "R1",
    validUntil: future(60_000),
    parentLeaseId: lease.leaseId,
  });
  assert.equal(child.parentLeaseId, lease.leaseId);
  expectCode(() => runtime.grantLease({
    subject: child.subject,
    tenant,
    scope: [cell],
    actionSet: ["ran.prb.allocate", "ran.unknown"],
    riskCeiling: "R2",
    validUntil: future(30_000),
    parentLeaseId: child.leaseId,
  }), "ACTION_NOT_ALLOWED");
});

test("TCK-05: parent revocation cascades to delegated leases", () => {
  const { runtime, lease } = fixture();
  const child = runtime.grantLease({
    subject: lease.subject,
    tenant,
    scope: [cell],
    actionSet: ["ran.prb.allocate"],
    riskCeiling: "R1",
    validUntil: future(60_000),
    parentLeaseId: lease.leaseId,
  });
  runtime.authority.revoke(lease.leaseId);
  expectCode(() => runtime.authority.requireLive(child.leaseId), "LEASE_REVOKED");
});

test("TCK-06: cross-tenant resource scope is rejected", () => {
  const { runtime, lease } = fixture();
  const a = action({ targetScope: "ran:operator-b/region-west/site-17" });
  expectCode(() => runtime.transactions.prepare(a, lease.leaseId), "TENANT_MISMATCH");
});

test("TCK-07: R2/R3 action requires passing twin/shadow precheck", () => {
  const { runtime, lease } = fixture();
  const a = action({ riskClass: "R2" });
  expectCode(() => runtime.transactions.prepare(a, lease.leaseId), "PRECHECK_REQUIRED");
  expectCode(() => runtime.transactions.prepare({ ...a, actionId: "act-92" }, lease.leaseId, precheck(a, "FAIL")), "PRECHECK_REQUIRED");
});

test("TCK-08: R3 authorization requires independent approval quorum", () => {
  const { runtime, lease } = fixture({ approvalThreshold: 2 });
  const a = action({ riskClass: "R3" });
  runtime.transactions.prepare(a, lease.leaseId, precheck(a));
  expectCode(() => runtime.transactions.authorize(a.actionId, [approval(a, "op-a", "ran")]), "APPROVAL_QUORUM_MISSING");
  const auth = runtime.transactions.authorize(a.actionId, [
    approval(a, "op-a", "ran"),
    approval(a, "op-b", "safety"),
  ]);
  assert.equal(auth.approvals.length, 2);
});

test("TCK-09: approval bound to a different action hash is rejected", () => {
  const { runtime, lease } = fixture({ approvalThreshold: 2 });
  const a = action({ riskClass: "R3" });
  runtime.transactions.prepare(a, lease.leaseId, precheck(a));
  expectCode(() => runtime.transactions.authorize(a.actionId, [
    approval(a, "op-a", "ran", "sha256:wrong"),
    approval(a, "op-b", "safety"),
  ]), "AUTH_HASH_MISMATCH");
});

test("TCK-10: duplicate COMMIT is protocol-idempotent and creates one physical effect", async () => {
  const { runtime, executor, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  const first = await runtime.transactions.commit(a.actionId);
  const second = await runtime.transactions.commit(a.actionId);
  assert.equal(first.state, "APPLIED");
  assert.equal(second.state, "APPLIED");
  assert.equal(executor.applyCount(), 1);
});

test("TCK-11: lost ACK becomes UNKNOWN; blind retry is forbidden; reconcile proves one effect", async () => {
  const { runtime, executor, lease } = fixture();
  const a = action();
  executor.injectLostAckFor(a);
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  const unknown = await runtime.transactions.commit(a.actionId);
  assert.equal(unknown.state, "UNKNOWN");
  await expectCodeAsync(() => runtime.transactions.commit(a.actionId), "RECONCILIATION_REQUIRED");
  const reconciled = await runtime.transactions.reconcile(a.actionId);
  assert.equal(reconciled.state, "APPLIED");
  assert.equal(executor.applyCount(), 1);
});

test("TCK-12: topology drift after authorization fails closed", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  runtime.observe({
    targetScope: cell,
    topologyVersion: "topo-8843",
    policyVersion: "policy-7",
    preconditionSnapshotHash: "sha256:preconditions-v1",
    observedAt: new Date().toISOString(),
  });
  await expectCodeAsync(() => runtime.transactions.commit(a.actionId), "TOPOLOGY_STALE");
});

test("TCK-13: policy drift after authorization fails closed", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  runtime.observe({
    targetScope: cell,
    topologyVersion: "topo-8842",
    policyVersion: "policy-8",
    preconditionSnapshotHash: "sha256:preconditions-v1",
    observedAt: new Date().toISOString(),
  });
  await expectCodeAsync(() => runtime.transactions.commit(a.actionId), "POLICY_STALE");
});

test("TCK-14: precondition drift after authorization fails closed", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  runtime.observe({
    targetScope: cell,
    topologyVersion: "topo-8842",
    policyVersion: "policy-7",
    preconditionSnapshotHash: "sha256:preconditions-v2",
    observedAt: new Date().toISOString(),
  });
  await expectCodeAsync(() => runtime.transactions.commit(a.actionId), "PRECONDITION_FAILED");
});

test("TCK-15: principal revocation invalidates unused authorization", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  runtime.authority.revokePrincipal(a.actor);
  await expectCodeAsync(() => runtime.transactions.commit(a.actionId), "LEASE_REVOKED");
});

test("TCK-16: contract revision change invalidates authorization", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  runtime.contracts.amend(a.contractId, 1, { goal: "updated goal" });
  await expectCodeAsync(() => runtime.transactions.commit(a.actionId), "CONTRACT_REVISION_STALE");
});

test("TCK-17: executor self-report cannot verify an action", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  await runtime.transactions.commit(a.actionId);
  runtime.appendEvidence(evidence("ev-executor", "e2e-latency-window", "executor:ran-west", "executor"));
  expectCode(() => runtime.transactions.verify(a.actionId), "EVIDENCE_MISSING");
});

test("TCK-18: independent action evidence can verify applied effect", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  await runtime.transactions.commit(a.actionId);
  runtime.appendEvidence(evidence("ev-probe-action", "e2e-latency-window", "probe:stadium-e2e-1"));
  const verified = runtime.transactions.verify(a.actionId, 0.9);
  assert.equal(verified.state, "VERIFIED");
});

test("TCK-19: strong contradictory evidence opens conflict and blocks completion", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  await runtime.transactions.commit(a.actionId);
  runtime.appendEvidence(evidence("ev-a1", "e2e-latency-window", "probe:latency-1"));
  runtime.appendEvidence(evidence("ev-a2", "drop-rate-window", "probe:drop-1"));
  runtime.appendEvidence(evidence("ev-a3", "drop-rate-window", "probe:drop-2", "probe", "FAIL"));
  runtime.transactions.verify(a.actionId, 0.9);
  const gate = runtime.objectiveGate(a.contractId);
  assert.equal(gate.status, "BLOCKED");
  assert.deepEqual(gate.conflicts, ["drop-rate-window"]);
});

test("TCK-20: contract closes only with required independent evidence and no unresolved actions", async () => {
  const { runtime, lease } = fixture();
  const a = action();
  runtime.transactions.prepare(a, lease.leaseId);
  runtime.transactions.authorize(a.actionId);
  await runtime.transactions.commit(a.actionId);
  runtime.appendEvidence(evidence("ev-latency", "e2e-latency-window", "probe:latency-1"));
  runtime.appendEvidence(evidence("ev-drop", "drop-rate-window", "telemetry:ric-2", "telemetry"));
  runtime.transactions.verify(a.actionId, 0.9);
  const gate = runtime.objectiveGate(a.contractId);
  assert.equal(gate.status, "PASS");
  const closed = runtime.closeContract(a.contractId);
  assert.equal(closed.state, "COMPLETED");
});

test("TCK-21: failover actor may reuse same logical key only for the same action effect", async () => {
  const { runtime, executor, lease } = fixture();
  const a1 = action();
  runtime.transactions.prepare(a1, lease.leaseId);
  runtime.transactions.authorize(a1.actionId);
  await runtime.transactions.commit(a1.actionId);

  const p2 = principal("agent:operator-a:ran-optimizer-18");
  runtime.registerPrincipal(p2);
  const lease2 = runtime.grantLease({
    subject: p2.agentId,
    tenant,
    scope: [site],
    actionSet: ["ran.prb.allocate"],
    riskCeiling: "R1",
    validUntil: future(60_000),
  });
  const a2 = action({ actionId: "act-failover", actor: p2.agentId, parameters: { prbShare: 0.70 } });
  runtime.transactions.prepare(a2, lease2.leaseId);
  runtime.transactions.authorize(a2.actionId);
  await expectCodeAsync(() => runtime.transactions.commit(a2.actionId), "IDEMPOTENCY_CONFLICT");
  assert.equal(executor.applyCount(), 1);
});

import { generateKeyPairSync } from "node:crypto";
import {
  A6GP_PROTOCOL_VERSION,
  EnvelopeReplayGuard,
  envelopeBodyHash,
  negotiate,
  signEnvelope,
  verifyEnvelope,
  type A6GPEnvelope,
  type ProtocolAdvertisement,
} from "../src/index.ts";

const advertisement: ProtocolAdvertisement = {
  protocolVersions: ["0.4"],
  profiles: ["A6GP-Core", "A6GP-Telecom-Control", "A6GP-Secure-Binding"],
  extensions: ["ext.telecom-test"],
  bindings: ["json-https"],
};

function signedTestEnvelope() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const body = { action: "probe", value: 1 };
  const negotiated = negotiate(advertisement, advertisement, ["A6GP-Core", "A6GP-Secure-Binding"]);
  const unsigned: Omit<A6GPEnvelope<typeof body>, "signature"> = {
    protocolVersion: A6GP_PROTOCOL_VERSION,
    messageType: "ACTION_PREPARE",
    messageId: `msg-${Date.now()}-${Math.random()}`,
    correlationId: "ctr-wire",
    transactionId: "tx-wire",
    sender: "agent:operator-a:test",
    receiver: "authority:operator-a:test",
    sentAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    timingClass: "T2",
    riskClass: "R1",
    tenant,
    contractId: "ctr-2042",
    contractRevision: 1,
    topologyVersion: "topo-8842",
    leaseId: "lease-test",
    idempotencyKey: "wire-test-1",
    bodyHash: envelopeBodyHash(body),
    hashAlg: "sha-256",
    signatureAlg: "Ed25519",
    keyId: "key-test",
    criticalExtensions: [],
    extensions: {},
    negotiated,
    body,
  };
  return { envelope: signEnvelope(unsigned, privateKey), publicKey };
}

test("TCK-22: version negotiation selects a mutually supported profile/binding", () => {
  const remote: ProtocolAdvertisement = {
    protocolVersions: ["0.3", "0.4"],
    profiles: ["A6GP-Core", "A6GP-Secure-Binding"],
    extensions: [],
    bindings: ["grpc-protobuf", "json-https"],
  };
  const selected = negotiate(advertisement, remote, ["A6GP-Core"]);
  assert.equal(selected.protocolVersion, "0.4");
  assert.equal(selected.binding, "json-https");
  assert.deepEqual(selected.profiles, ["A6GP-Core", "A6GP-Secure-Binding"]);
});

test("TCK-23: signed envelope verifies and duplicate messageId is rejected", () => {
  const { envelope, publicKey } = signedTestEnvelope();
  const guard = new EnvelopeReplayGuard();
  verifyEnvelope(envelope, publicKey, advertisement, guard);
  expectCode(() => verifyEnvelope(envelope, publicKey, advertisement, guard), "AUTH_CONTEXT_STALE");
});

test("TCK-24: body tampering invalidates body hash/signature context", () => {
  const { envelope, publicKey } = signedTestEnvelope();
  const tampered = structuredClone(envelope);
  tampered.body.value = 99;
  expectCode(() => verifyEnvelope(tampered, publicKey, advertisement), "AUTH_HASH_MISMATCH");
});

test("TCK-25: unknown critical extension fails closed", () => {
  const { envelope, publicKey } = signedTestEnvelope();
  const tampered = { ...envelope, criticalExtensions: ["ext.unknown"] };
  expectCode(() => verifyEnvelope(tampered, publicKey, advertisement), "UNSUPPORTED_CRITICAL_EXTENSION");
});

import { SagaCoordinator, computePolicyArtifactHash, validatePolicyArtifact, type PolicyArtifact } from "../src/index.ts";

test("TCK-26: cross-domain saga compensates previously applied steps after a terminal failure", async () => {
  const { runtime, executor, lease } = fixture();
  const first = action({ actionId: "act-saga-1", idempotencyKey: "saga-1" });
  const second = action({ actionId: "act-saga-2", idempotencyKey: "saga-2", actionType: "ran.power.adjust", parameters: { deltaDb: -1 } });
  runtime.transactions.prepare(first, lease.leaseId);
  runtime.transactions.authorize(first.actionId);
  runtime.transactions.prepare(second, lease.leaseId);
  runtime.transactions.authorize(second.actionId);
  executor.injectFailureFor(second);
  const result = await new SagaCoordinator(runtime.transactions).run([
    { stepId: "ran-prb", actionId: first.actionId },
    { stepId: "ran-power", actionId: second.actionId },
  ]);
  assert.equal(result.status, "COMPENSATED");
  assert.deepEqual(result.reversed, [first.actionId]);
  assert.equal(runtime.transactions.get(first.actionId)?.state, "REVERSED");
});

test("TCK-27: saga stops on UNKNOWN and does not compensate an ambiguous effect blindly", async () => {
  const { runtime, executor, lease } = fixture();
  const first = action({ actionId: "act-saga-unknown", idempotencyKey: "saga-unknown" });
  executor.injectLostAckFor(first);
  runtime.transactions.prepare(first, lease.leaseId);
  runtime.transactions.authorize(first.actionId);
  const result = await new SagaCoordinator(runtime.transactions).run([
    { stepId: "ambiguous", actionId: first.actionId },
  ]);
  assert.equal(result.status, "BLOCKED_RECONCILE");
  assert.deepEqual(result.reversed, []);
  assert.equal(executor.applyCount(), 1);
});

test("TCK-28: T0/T1 policy artifact is topology-bound and fails closed outside validated input envelope", () => {
  const snapshot = {
    targetScope: cell,
    topologyVersion: "topo-8842",
    policyVersion: "policy-7",
    preconditionSnapshotHash: "sha256:preconditions-v1",
    observedAt: new Date().toISOString(),
  };
  const artifact: PolicyArtifact = {
    artifactId: "policy-artifact-1",
    artifactHash: "",
    tenant,
    targetScope: cell,
    topologyVersion: "topo-8842",
    policyVersion: "policy-7",
    timingClass: "T1",
    validFrom: new Date(Date.now() - 1000).toISOString(),
    validUntil: future(60_000),
    inputEnvelope: { load: { min: 0, max: 1 }, sinr: { min: -10, max: 40 } },
    actionEnvelope: { powerDeltaDb: { min: -3, max: 3 } },
    guardConditions: ["bler < 0.1"],
    fallback: "last-known-good",
    rollbackPolicy: "restore-previous-policy",
    verificationEvidence: ["ev-policy-sim-1"],
  };
  artifact.artifactHash = computePolicyArtifactHash(artifact);
  validatePolicyArtifact(artifact, snapshot, { load: 0.7, sinr: 12 });
  expectCode(() => validatePolicyArtifact(artifact, snapshot, { load: 1.2, sinr: 12 }), "PRECONDITION_FAILED");
});
