import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createACNLab } from "../examples/acn-lab.ts";
import { A6GPError, ACN_SERVICE_EXTENSION, ACN_STATE_EXTENSION, ACN_OPERATIONS, EnvelopeReplayGuard, envelopeBodyHash, executeTaskPlan, createACNRuntime, InMemoryIdempotentExecutor,
  handleNetworkToolRPC, negotiate, planCollaborationTask, signEnvelope, verifyACNEnvelope,
  type A6GPEnvelope, type AgentRegistration, type ComputeReservation, type DataRecord, type GroupRecord,
  type ProtocolAdvertisement, type ToolCall, type TaskAccess } from "../src/index.ts";

function code(fn: () => unknown, code: string) { assert.throws(fn, (e: unknown) => e instanceof A6GPError && e.code === code); }
async function rejects(fn: () => Promise<unknown>, code: string) { await assert.rejects(fn, (e: unknown) => e instanceof A6GPError && e.code === code); }
type Lab = ReturnType<typeof createACNLab>;
const groupCall = (f: Lab, args = { ...f.groupRequest }, key = "group-1", scope = f.group): ToolCall => ({ name: "acn.group.configure", targetScope: scope, arguments: args, idempotencyKey: key });
const computeCall = (f: Lab, args = { ...f.offload }, key = "compute-1", scope = f.job): ToolCall => ({ name: "acn.compute.reserve", targetScope: scope, arguments: args, idempotencyKey: key });
const captureCall = (f: Lab, key = "capture-1"): ToolCall => ({ name: "acn.data.capture", targetScope: f.data, idempotencyKey: key,
  arguments: { payloadBase64: Buffer.from('{"load":0.7,"userId":"private-user"}').toString("base64"), modality: "sensor", retentionUntil: f.future() } });
async function invoke(f: Lab, call: ToolCall, access = f.contexts.planner) { return f.gateway.call(access, call); }
async function mutateData(f: Lab, name: string, args: Record<string, unknown>, key = name) { return invoke(f, { name, targetScope: f.data, arguments: args, idempotencyKey: key }); }

test("ACN-01: discovery filters capabilities across vendors; principal retains user mapping", async () => {
  const f = createACNLab();
  const r = await invoke(f, { name: "acn.agent.discover", targetScope: "service:operator-a/acn/directory", arguments: { capabilities: ["collaborate"] } });
  assert.deepEqual((r.output as AgentRegistration[]).map(p => p.agentId), ["planner", "robot"]);
  assert.equal(f.runtime.authority.principal("robot")?.userId, "user-1");
});

test("ACN-02: identity and lease IDs cannot be overwritten", () => {
  const f = createACNLab(), p = f.runtime.authority.principal("planner")!;
  code(() => f.runtime.registerPrincipal({ ...p, tenant: "other" }), "INVALID_INPUT");
  const l = f.runtime.authority.requireLive(f.contexts.planner.leaseId);
  code(() => f.runtime.grantLease({ ...l }), "INVALID_INPUT");
});

test("ACN-03: descriptor tampering fails identity hash binding", () => {
  const f = createACNLab(), p = f.services.directory.resolve(f.contexts.planner, "robot");
  code(() => f.services.directory.register({ ...p, endpoint: "https://attacker.example.invalid" }), "AUTH_HASH_MISMATCH");
});

test("ACN-04: expired registrations disappear from discovery and cannot resolve", () => {
  const f = createACNLab(), later = new Date(Date.now() + 2000);
  const peer = f.services.directory.resolve(f.contexts.planner, "robot");
  f.services.directory.register({ ...peer, expiresAt: f.future(1000) });
  code(() => f.services.directory.peer(f.contexts.planner, "robot", later), "AUTH_EXPIRED");
  assert.deepEqual(f.services.directory.discover(f.contexts.planner, ["collaborate"], later).map(p => p.agentId), ["planner"]);
});

test("ACN-05: cross-domain resolution requires an explicit directional agreement", () => {
  const f = createACNLab();
  const p = f.runtime.authority.principal("robot")!;
  f.runtime.registerPrincipal({ ...p, agentId: "foreign-domain", operatorDomain: "untrusted" });
  const d = f.services.directory.resolve(f.contexts.planner, "robot");
  f.services.directory.register({ ...d, agentId: "foreign-domain" });
  code(() => f.services.directory.resolve(f.contexts.planner, "foreign-domain"), "SCOPE_VIOLATION");
  assert.equal(f.services.directory.resolve(f.contexts.planner, "robot").agentId, "robot");
});

test("ACN-06: cross-tenant peers remain inaccessible even with domain agreements", () => {
  const f = createACNLab(), p = f.runtime.authority.principal("robot")!;
  f.runtime.registerPrincipal({ ...p, agentId: "other-tenant", tenant: "operator-b" });
  const d = f.services.directory.resolve(f.contexts.planner, "robot");
  f.services.directory.register({ ...d, agentId: "other-tenant" });
  code(() => f.services.directory.resolve(f.contexts.planner, "other-tenant"), "TENANT_MISMATCH");
});

test("ACN-07: task binding is inherited and delegation cannot change the task", () => {
  const f = createACNLab(), parent = f.runtime.authority.requireLive(f.contexts.planner.leaseId);
  const input = { subject: "robot", tenant: f.tenant, scope: parent.scope, actionSet: parent.actionSet,
    riskCeiling: "R1" as const, validUntil: f.future(), parentLeaseId: parent.leaseId };
  assert.equal(f.runtime.grantLease(input).contractId, f.contract.contractId);
  code(() => f.runtime.grantLease({ ...input, contractId: "another-task" }), "SCOPE_VIOLATION");
});

test("ACN-08: a task-bound lease cannot execute an otherwise identical second contract", async () => {
  const f = createACNLab();
  f.runtime.createAndActivateContract({ ...f.contract, contractId: "another-task" });
  await rejects(() => invoke(f, groupCall(f), { ...f.contexts.planner, contractId: "another-task" }), "SCOPE_VIOLATION");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-09: legacy unbound lease cannot enter ACN services", async () => {
  const f = createACNLab(), lease = f.runtime.grantLease({ subject: "planner", tenant: f.tenant, scope: f.contract.scope,
    actionSet: ACN_OPERATIONS, riskCeiling: "R1", validUntil: f.future() });
  await rejects(() => invoke(f, groupCall(f), { ...f.contexts.planner, leaseId: lease.leaseId }), "SCOPE_VIOLATION");
});

test("ACN-10: direct mutation cannot bypass action preparation/authorization/commit", () => {
  const f = createACNLab();
  code(() => f.services.resources.configureGroup(f.contexts.planner, f.group, f.groupRequest, new Date()), "INVALID_STATE");
  code(() => f.services.data.capture(f.contexts.planner, f.data, captureCall(f).arguments as any, new Date()), "INVALID_STATE");
});

test("ACN-11: dynamic group creation, QoS update and release preserve revisions", async () => {
  const f = createACNLab();
  const first = await invoke(f, groupCall(f)); assert.equal(first.transaction?.state, "APPLIED");
  assert.equal((first.output as GroupRecord).trafficClass, "interactive-multimodal");
  const update = await invoke(f, groupCall(f, { ...f.groupRequest, expectedRevision: 1, modalities: ["model"] }, "group-update"));
  assert.equal((update.output as GroupRecord).revision, 2);
  assert.equal((update.output as GroupRecord).trafficClass, "model-transfer");
  assert.equal((await invoke(f, { name: "acn.group.release", targetScope: f.group, arguments: { expectedRevision: 2 }, idempotencyKey: "release" })).transaction?.state, "APPLIED");
  await rejects(() => invoke(f, { name: "acn.group.read", targetScope: f.group, arguments: {} }), "AUTH_EXPIRED");
});

test("ACN-12: rejected QoS update leaves prior reservation intact", async () => {
  const f = createACNLab(); await invoke(f, groupCall(f));
  const r = await invoke(f, groupCall(f, { ...f.groupRequest, expectedRevision: 1, qos: { ...f.groupRequest.qos, uplinkMbps: 101 } }, "overflow"));
  assert.equal(r.transaction?.state, "FAILED");
  assert.equal(f.services.resources.group(f.contexts.planner, f.group).qos.uplinkMbps, 30);
});

test("ACN-13: stale group revision is rejected; duplicate members cannot reserve", async () => {
  const f = createACNLab(); await invoke(f, groupCall(f));
  assert.equal((await invoke(f, groupCall(f, { ...f.groupRequest }, "stale"))).transaction?.state, "FAILED");
  assert.equal((await invoke(f, groupCall(f, { ...f.groupRequest, expectedRevision: 1, members: ["planner", "planner"] }, "duplicate"))).transaction?.state, "FAILED");
  assert.equal(f.services.applyCount(), 1);
});

test("ACN-14: latency, jitter, loss and synchronization limits are enforced", async () => {
  for (const change of [{ latencyMs: 1 }, { jitterMs: 0 }, { maxLossRate: 0 }, { maxSkewMs: 0 }]) {
    const f = createACNLab();
    assert.equal((await invoke(f, groupCall(f, { ...f.groupRequest, qos: { ...f.groupRequest.qos, ...change } }))).transaction?.state, "FAILED");
  }
});

test("ACN-15: compute admission includes transfer/queue time and selects the fastest feasible node", async () => {
  const f = createACNLab(), r = await invoke(f, computeCall(f));
  assert.equal(r.transaction?.state, "APPLIED");
  const job = r.output as ComputeReservation;
  assert.equal(job.nodeScope, "compute:operator-a/acn/base-station");
  assert.equal(job.predictedTotalMs, 25); assert.equal(job.predictedCost, 0.2);
  f.observe(`${f.job}-2`);
  assert.equal((await invoke(f, computeCall(f, { ...f.offload, deadlineMs: 24 }, "tight", `${f.job}-2`))).transaction?.state, "FAILED");
});

test("ACN-16: impossible deadline or cost is rejected with no reservation", async () => {
  for (const change of [{ deadlineMs: 1 }, { maxCost: 0.01 }, { memoryMb: 1_000_000 }, { computeUnits: 1000 }]) {
    const f = createACNLab(); assert.equal((await invoke(f, computeCall(f, { ...f.offload, ...change }))).transaction?.state, "FAILED");
    assert.equal(f.services.applyCount(), 0);
  }
});

test("ACN-17: group and compute share one directional bandwidth budget", async () => {
  const f = createACNLab(); await invoke(f, groupCall(f, { ...f.groupRequest, qos: { ...f.groupRequest.qos, uplinkMbps: 95 } }));
  assert.equal((await invoke(f, computeCall(f))).transaction?.state, "FAILED");
  await invoke(f, { name: "acn.group.release", targetScope: f.group, arguments: { expectedRevision: 1 }, idempotencyKey: "release" });
  assert.equal((await invoke(f, computeCall(f, { ...f.offload }, "retry-after-release"))).transaction?.state, "APPLIED");
});

test("ACN-18: compute release frees units and bandwidth without reusing session identities", async () => {
  const f = createACNLab(); await invoke(f, computeCall(f));
  await invoke(f, { name: "acn.compute.release", targetScope: f.job, arguments: {}, idempotencyKey: "release" });
  f.observe(`${f.job}-2`);
  assert.equal((await invoke(f, computeCall(f, { ...f.offload }, "second", `${f.job}-2`))).transaction?.state, "APPLIED");
  assert.equal((await invoke(f, computeCall(f, { ...f.offload }, "reuse"))).transaction?.state, "FAILED");
});

test("ACN-19: stale link telemetry fails closed even when the action snapshot is fresh", async () => {
  const f = createACNLab();
  f.services.resources.observeLink({ scope: f.link, tenant: f.tenant, uplinkMbps: 100, downlinkMbps: 200, latencyMs: 2, jitterMs: 1,
    lossRate: 0, syncSkewMs: 0, observedAt: new Date(Date.now() - 6000).toISOString() }, new Date(Date.now() - 6000));
  assert.equal((await invoke(f, groupCall(f))).transaction?.state, "FAILED");
  assert.equal((await invoke(f, computeCall(f))).transaction?.state, "FAILED");
});

test("ACN-20: snapshot age and topology drift are checked before effects", async () => {
  const f = createACNLab(), call = groupCall(f), action = f.gateway.prepare(f.contexts.planner, call);
  f.runtime.transactions.authorize(action.actionId);
  f.runtime.observe({ ...f.runtime.snapshots.require(f.group), topologyVersion: "changed" });
  await rejects(() => f.runtime.transactions.commit(action.actionId), "TOPOLOGY_STALE");
  f.runtime.observe({ ...f.runtime.snapshots.require(f.group), observedAt: new Date(Date.now() - 6000).toISOString() });
  await rejects(() => invoke(f, groupCall(f, { ...f.groupRequest }, "stale")), "PRECONDITION_FAILED");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-21: task lease revocation after authorization blocks commit", async () => {
  const f = createACNLab(), a = f.gateway.prepare(f.contexts.planner, groupCall(f)); f.runtime.transactions.authorize(a.actionId);
  f.runtime.authority.revoke(f.contexts.planner.leaseId);
  await rejects(() => f.runtime.transactions.commit(a.actionId), "LEASE_REVOKED");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-22: duplicate tool calls are idempotent; changed payload conflicts", async () => {
  const f = createACNLab(), call = groupCall(f);
  assert.equal((await invoke(f, call)).transaction?.state, "APPLIED");
  assert.equal((await invoke(f, call)).transaction?.state, "APPLIED");
  await rejects(() => invoke(f, groupCall(f, { ...f.groupRequest, modalities: ["model"] })), "IDEMPOTENCY_CONFLICT");
  assert.equal(f.services.applyCount(), 1);
});

test("ACN-23: applied service with lost ACK reconciles once without blind retry", async () => {
  const f = createACNLab(), a = f.gateway.prepare(f.contexts.planner, groupCall(f));
  f.services.injectLostAck(a.actionId); f.runtime.transactions.authorize(a.actionId);
  assert.equal((await f.runtime.transactions.commit(a.actionId)).state, "UNKNOWN");
  await rejects(() => invoke(f, groupCall(f)), "RECONCILIATION_REQUIRED");
  assert.equal((await f.runtime.transactions.reconcile(a.actionId)).state, "APPLIED");
  assert.equal(f.services.applyCount(), 1);
});

test("ACN-24: data capture/redact/store/share preserves bytes, hashes and lineage", async () => {
  const f = createACNLab(), capture = await invoke(f, captureCall(f));
  const initial = capture.output as DataRecord;
  assert.equal((await mutateData(f, "acn.data.process", { expectedRevision: 1, transform: "json-redact", removeFields: ["userId"] })).transaction?.state, "APPLIED");
  await mutateData(f, "acn.data.store", { expectedRevision: 2 });
  await mutateData(f, "acn.data.share", { expectedRevision: 3, readerIds: ["robot"] });
  const shared = f.services.data.read(f.contexts.robot, f.data);
  assert.deepEqual(JSON.parse(Buffer.from(shared.payloadBase64, "base64").toString()), { load: 0.7 });
  assert.deepEqual(shared.record.lineage, [initial.contentHash]); assert.notEqual(shared.record.contentHash, initial.contentHash);
  assert.equal(shared.record.revision, 4);
});

test("ACN-25: data ACL and task lease are both required", async () => {
  const f = createACNLab(); await invoke(f, captureCall(f));
  code(() => f.services.data.read(f.contexts.robot, f.data), "SCOPE_VIOLATION");
  await mutateData(f, "acn.data.store", { expectedRevision: 1 });
  await mutateData(f, "acn.data.share", { expectedRevision: 2, readerIds: ["robot"] });
  f.runtime.authority.revoke(f.contexts.robot.leaseId);
  code(() => f.services.data.read(f.contexts.robot, f.data), "LEASE_REVOKED");
});

test("ACN-26: data lifecycle refuses premature sharing, stale revision and unknown transform", async () => {
  const f = createACNLab(); await invoke(f, captureCall(f));
  for (const [name, args] of [
    ["acn.data.share", { expectedRevision: 1, readerIds: ["robot"] }],
    ["acn.data.store", { expectedRevision: 0 }],
    ["acn.data.process", { expectedRevision: 1, transform: "execute-code", removeFields: [] }],
  ] as const) assert.equal((await mutateData(f, name, args)).transaction?.state, "FAILED");
  assert.equal(f.services.applyCount(), 1);
});

test("ACN-27: deletion and retention revoke byte access and prevent identity resurrection", async () => {
  const f = createACNLab(); await invoke(f, captureCall(f));
  await mutateData(f, "acn.data.delete", { expectedRevision: 1 });
  code(() => f.services.data.read(f.contexts.planner, f.data), "AUTH_EXPIRED");
  assert.equal((await invoke(f, captureCall(f, "recreate"))).transaction?.state, "FAILED");
  const other = createACNLab(), input = captureCall(other); input.arguments.retentionUntil = other.future(1000);
  await invoke(other, input);
  code(() => other.services.data.read(other.contexts.planner, other.data, new Date(Date.now() + 2000)), "AUTH_EXPIRED");
});

test("ACN-28: noncanonical or oversized data and non-finite QoS are rejected", async () => {
  const f = createACNLab(), input = captureCall(f); input.arguments.payloadBase64 = "invalid?";
  assert.equal((await invoke(f, input)).transaction?.state, "FAILED");
  const big = captureCall(f, "big"); big.arguments.payloadBase64 = Buffer.alloc(1_048_577).toString("base64");
  assert.equal((await invoke(f, big)).transaction?.state, "FAILED");
  await rejects(() => invoke(f, groupCall(f, { ...f.groupRequest, qos: { ...f.groupRequest.qos, latencyMs: NaN } })), "INVALID_INPUT");
});

test("ACN-29: structured task planner discovers peers and executes a dependency-ordered lifecycle", async () => {
  const f = createACNLab(), steps = await planCollaborationTask(f.gateway, f.contexts.planner, {
    planId: "task", requiredCapabilities: ["collaborate"], memberCount: 2, groupScope: f.group, group: f.groupRequest,
    compute: { scope: f.job, request: f.offload }, data: { scope: f.data, capture: captureCall(f).arguments as any, redactFields: ["userId"] } });
  const r = await executeTaskPlan(f.gateway, f.contexts.planner, steps.reverse());
  assert.equal(r.status, "APPLIED"); assert.equal(r.results.length, 6);
  assert.equal(f.services.data.read(f.contexts.robot, f.data).record.state, "SHARED");
  assert.equal(f.runtime.objectiveGate(f.contract.contractId).status, "BLOCKED");
});

test("ACN-30: invalid/cyclic task plan fails before any effects", async () => {
  const f = createACNLab();
  await rejects(() => executeTaskPlan(f.gateway, f.contexts.planner, [{ stepId: "a", dependsOn: ["b"], call: groupCall(f) }, { stepId: "b", dependsOn: ["a"], call: computeCall(f) }]), "INVALID_INPUT");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-31: UNKNOWN stops dependent plan execution and leaves completion blocked", async () => {
  const f = createACNLab(), call = groupCall(f), a = f.gateway.prepare(f.contexts.planner, call); f.services.injectLostAck(a.actionId);
  const r = await executeTaskPlan(f.gateway, f.contexts.planner, [{ stepId: "g", dependsOn: [], call }, { stepId: "c", dependsOn: ["g"], call: computeCall(f) }]);
  assert.equal(r.status, "BLOCKED"); assert.equal(r.results.length, 1); assert.equal(f.services.applyCount(), 1);
});

test("ACN-32: tool catalog/JSON-RPC bridge exposes structured capabilities and guarded effects", async () => {
  const f = createACNLab();
  const list = await handleNetworkToolRPC(f.gateway, f.contexts.planner, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal((list.result as any).tools.length, 14);
  const r = await handleNetworkToolRPC(f.gateway, f.contexts.planner, { jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "acn.group.configure", arguments: groupCall(f).arguments, _meta: { a6gp: { targetScope: f.group, idempotencyKey: "rpc" } } } });
  assert.equal((r.result as any).isError, false); assert.equal(f.services.applyCount(), 1);
  const unknown = await handleNetworkToolRPC(f.gateway, f.contexts.planner, { jsonrpc: "2.0", id: 3, method: "unknown" });
  assert.equal((unknown.error as any).code, -32601);
});

function signed(f: Lab, statePatch = {}, envelopePatch = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const supported: ProtocolAdvertisement = { protocolVersions: ["0.4"], profiles: ["A6GP-Core", "A6GP-Secure-Binding"], extensions: [ACN_SERVICE_EXTENSION, ACN_STATE_EXTENSION], bindings: ["json-https"] };
  const snapshot = f.runtime.snapshots.require(f.group), body = groupCall(f);
  const unsigned: Omit<A6GPEnvelope<ToolCall>, "signature"> = {
    protocolVersion: "0.4", messageType: "TOOL_CALL", messageId: "signed-1", sender: "planner", receiver: "acn-reference", sentAt: Date.now(), expiresAt: Date.now() + 60_000,
    timingClass: "T2", riskClass: "R1", tenant: f.tenant, contractId: f.contract.contractId, contractRevision: 1, leaseId: f.contexts.planner.leaseId,
    topologyVersion: snapshot.topologyVersion, idempotencyKey: body.idempotencyKey, bodyHash: envelopeBodyHash(body), hashAlg: "sha-256", signatureAlg: "Ed25519", keyId: "planner-key",
    criticalExtensions: [ACN_STATE_EXTENSION, ACN_SERVICE_EXTENSION], extensions: { [ACN_STATE_EXTENSION]: { ...snapshot, source: "lab-telemetry", ...statePatch } },
    negotiated: negotiate(supported, supported), body, ...envelopePatch };
  return { envelope: signEnvelope(unsigned, privateKey), publicKey, supported };
}

test("ACN-33: signed typed network context enters the tool transaction and rejects replay", async () => {
  const f = createACNLab(), s = signed(f), guard = new EnvelopeReplayGuard();
  assert.equal((await f.gateway.callEnvelope(s.envelope, s.publicKey, s.supported, guard)).transaction?.state, "APPLIED");
  await rejects(() => f.gateway.callEnvelope(s.envelope, s.publicKey, s.supported, guard), "AUTH_CONTEXT_STALE");
});

test("ACN-34: stale/future state or wrong topology cannot pass signed context validation", () => {
  const f = createACNLab();
  for (const patch of [{ observedAt: new Date(Date.now() - 6000).toISOString() }, { observedAt: new Date(Date.now() + 6000).toISOString() }, { topologyVersion: "stale" }]) {
    const s = signed(f, patch);
    code(() => verifyACNEnvelope(s.envelope, s.publicKey, s.supported, f.runtime, new EnvelopeReplayGuard()), patch.topologyVersion ? "TOPOLOGY_STALE" : "PRECONDITION_FAILED");
  }
});

test("ACN-35: signed sender key/tenant/task/extension bindings cannot be downgraded", () => {
  const f = createACNLab();
  for (const [patch, expected] of [[{ keyId: "wrong-key" }, "AUTHORITY_MISSING"], [{ tenant: "operator-b" }, "AUTHORITY_MISSING"],
    [{ contractRevision: 2 }, "CONTRACT_REVISION_STALE"], [{ criticalExtensions: [] }, "UNSUPPORTED_CRITICAL_EXTENSION"]] as const) {
    const s = signed(f, {}, patch);
    code(() => verifyACNEnvelope(s.envelope, s.publicKey, s.supported, f.runtime, new EnvelopeReplayGuard()), expected);
  }
});

test("ACN-36: observation freshness is rechecked at commit, including direct core callers", async () => {
  const f = createACNLab(), a = f.gateway.prepare(f.contexts.planner, groupCall(f)); f.runtime.transactions.authorize(a.actionId);
  f.runtime.observe({ ...f.runtime.snapshots.require(f.group), observedAt: new Date(Date.now() - 6000).toISOString() });
  assert.equal((await f.runtime.transactions.commit(a.actionId)).state, "FAILED");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-37: reduced link capacity marks an admitted group DEGRADED", async () => {
  const f = createACNLab(); await invoke(f, groupCall(f));
  f.services.resources.observeLink({ scope: f.link, tenant: f.tenant, uplinkMbps: 20, downlinkMbps: 200,
    latencyMs: 2, jitterMs: 1, lossRate: 0.001, syncSkewMs: 0.5, observedAt: new Date().toISOString() });
  assert.equal(f.services.resources.group(f.contexts.planner, f.group).status, "DEGRADED");
  assert.equal((await invoke(f, computeCall(f))).transaction?.state, "FAILED");
});

test("ACN-38: concurrent group proposals cannot oversubscribe the shared uplink", async () => {
  const f = createACNLab(); f.observe(`${f.group}-2`);
  const request = { ...f.groupRequest, qos: { ...f.groupRequest.qos, uplinkMbps: 70 } };
  const results = await Promise.all([invoke(f, groupCall(f, request)), invoke(f, groupCall(f, request, "second", `${f.group}-2`))]);
  assert.deepEqual(results.map(r => r.transaction?.state).sort(), ["APPLIED", "FAILED"]);
  assert.equal(f.services.applyCount(), 1);
});

test("ACN-39: compute cost constraint can select a slower affordable cloud candidate", async () => {
  const f = createACNLab(), r = await invoke(f, computeCall(f, { ...f.offload, maxCost: 0.15, deadlineMs: 70 }));
  assert.equal((r.output as ComputeReservation).nodeScope, "compute:operator-a/acn/cloud");
  assert.equal((r.output as ComputeReservation).predictedTotalMs, 63);
});

test("ACN-40: session permission alone cannot reserve an unauthorized node or link", async () => {
  const f = createACNLab(), lease = f.runtime.grantLease({ subject: "planner", tenant: f.tenant, contractId: f.contract.contractId,
    scope: [f.job], actionSet: ["acn.compute.reserve"], riskCeiling: "R1", validUntil: f.future() });
  const r = await invoke(f, computeCall(f), { ...f.contexts.planner, leaseId: lease.leaseId });
  assert.equal(r.transaction?.state, "FAILED"); assert.equal(f.services.applyCount(), 0);
});

test("ACN-41: typed tool resources cannot be placed in the wrong namespace", async () => {
  const f = createACNLab();
  assert.equal((await invoke(f, groupCall(f, { ...f.groupRequest }, "wrong", f.data))).transaction?.state, "FAILED");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-42: signed tool scope cannot diverge from its signed network-state scope", async () => {
  const f = createACNLab(), body = { ...groupCall(f), targetScope: f.data };
  const s = signed(f, {}, { body, bodyHash: envelopeBodyHash(body) });
  await rejects(() => f.gateway.callEnvelope(s.envelope, s.publicKey, s.supported, new EnvelopeReplayGuard()), "AUTH_CONTEXT_STALE");
  assert.equal(f.services.applyCount(), 0);
});

test("ACN-43: invalid RPC/arguments use protocol errors and never apply effects", async () => {
  const f = createACNLab();
  const bad = await handleNetworkToolRPC(f.gateway, f.contexts.planner, { jsonrpc: "wrong", id: 1, method: "tools/list" });
  assert.equal((bad.error as any).code, -32600);
  const args = await handleNetworkToolRPC(f.gateway, f.contexts.planner, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "acn.group.configure", arguments: {}, _meta: { a6gp: { targetScope: f.group } } } });
  assert.equal((args.error as any).code, -32602); assert.equal(f.services.applyCount(), 0);
});

test("ACN-44: a released group retains a revision tombstone against delayed recreation", async () => {
  const f = createACNLab(); await invoke(f, groupCall(f));
  await invoke(f, { name: "acn.group.release", targetScope: f.group, arguments: { expectedRevision: 1 }, idempotencyKey: "release" });
  assert.equal((await invoke(f, groupCall(f, { ...f.groupRequest }, "old-create"))).transaction?.state, "FAILED");
  assert.equal((await invoke(f, groupCall(f, { ...f.groupRequest, expectedRevision: 2 }, "new-create"))).transaction?.state, "APPLIED");
});

test("ACN-45: ACN runtime preserves the existing external RAN adapter path", async () => {
  const fallback = new InMemoryIdempotentExecutor(), { runtime } = createACNRuntime(fallback);
  const f = createACNLab(), scope = "ran:operator-a/acn/cell-1";
  runtime.registerPrincipal(f.runtime.authority.principal("planner")!);
  runtime.createAndActivateContract({ ...f.contract, scope: [scope], allowedActions: ["ran.prb.allocate"] });
  runtime.observe({ targetScope: scope, topologyVersion: "t1", policyVersion: "p1", preconditionSnapshotHash: "s1", observedAt: new Date().toISOString() });
  const lease = runtime.grantLease({ subject: "planner", tenant: f.tenant, scope: [scope], actionSet: ["ran.prb.allocate"], riskCeiling: "R1", validUntil: f.future() });
  const action = { actionId: "external-action", contractId: f.contract.contractId, contractRevision: 1, actor: "planner", tenant: f.tenant,
    targetScope: scope, targetAuthorityDomain: "ran", actionType: "ran.prb.allocate", parameters: { prbShare: 0.4 }, riskClass: "R1" as const,
    timingClass: "T2" as const, idempotencyKey: "external-1", topologyVersion: "t1", policyVersion: "p1", preconditionSnapshotHash: "s1" };
  runtime.transactions.prepare(action, lease.leaseId); runtime.transactions.authorize(action.actionId);
  assert.equal((await runtime.transactions.commit(action.actionId)).state, "APPLIED");
  assert.equal(fallback.applyCount(), 1);
});

test("ACN-46: typed executor conflict retains UNKNOWN and blocks blind recommit", async () => {
  const f = createACNLab(); await invoke(f, groupCall(f)); f.observe(`${f.group}-2`);
  const call = groupCall(f, { ...f.groupRequest }, "group-1", `${f.group}-2`);
  const a = f.gateway.prepare(f.contexts.planner, call);
  await rejects(() => invoke(f, call), "IDEMPOTENCY_CONFLICT");
  assert.equal(f.runtime.transactions.get(a.actionId)?.state, "UNKNOWN");
  await rejects(() => f.runtime.transactions.commit(a.actionId), "RECONCILIATION_REQUIRED");
  assert.equal((await f.runtime.transactions.reconcile(a.actionId)).state, "UNRESOLVED");
  assert.equal(f.services.applyCount(), 1);
});
