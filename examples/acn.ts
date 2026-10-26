import assert from "node:assert/strict";
import { createACNLab } from "./acn-lab.ts";
import { executeTaskPlan, planCollaborationTask, sha256, type ComputeReservation } from "../src/index.ts";

const f = createACNLab();
const plan = await planCollaborationTask(f.gateway, f.contexts.planner, {
  planId: "collaboration-demo", requiredCapabilities: ["collaborate"], memberCount: 2,
  groupScope: f.group, group: f.groupRequest, compute: { scope: f.job, request: f.offload },
  data: { scope: f.data, capture: { payloadBase64: Buffer.from('{"load":0.7,"userId":"synthetic-user"}').toString("base64"),
    modality: "sensor", retentionUntil: f.future() }, redactFields: ["userId"] },
});
const result = await executeTaskPlan(f.gateway, f.contexts.planner, plan);
assert.equal(result.status, "APPLIED");
assert.equal(result.results.length, 6);
assert.equal(f.runtime.objectiveGate(f.contract.contractId).status, "BLOCKED");

// Separate probe identity checks the model state. These assertions are synthetic software evidence.
const group = f.services.resources.group(f.contexts.probe, f.group);
const compute = f.services.resources.compute(f.contexts.probe, f.job) as ComputeReservation;
const shared = f.services.data.read(f.contexts.robot, f.data);
assert.equal(group.status, "ADMITTED");
assert.deepEqual(group.members, ["planner", "robot"]);
assert.ok(compute.predictedTotalMs <= compute.deadlineMs);
assert.deepEqual(JSON.parse(Buffer.from(shared.payloadBase64, "base64").toString()), { load: 0.7 });
const probeHash = sha256({ group, compute, data: shared.record });
for (const { transaction } of result.results) {
  assert.ok(transaction);
  f.runtime.appendEvidence({ evidenceId: `probe-${transaction.action.actionId}`, contractId: f.contract.contractId,
    actionId: transaction.action.actionId, kind: "independent-outcome", source: "probe:reference-model", sourceClass: "probe",
    tenant: f.tenant, resource: transaction.action.targetScope, timeWindow: [transaction.createdAt, new Date().toISOString()],
    measurementContract: "synthetic-acn-state-assertions-v1", verdict: "PASS", strength: 0.95,
    artifactHash: probeHash, createdAt: new Date().toISOString() });
  f.runtime.transactions.verify(transaction.action.actionId, 0.9);
}
assert.equal(f.runtime.closeContract(f.contract.contractId).state, "COMPLETED");
console.log(JSON.stringify({ scenario: "acn-collaboration", evidenceScope: "synthetic in-memory model; no live RAN or inference execution",
  operations: result.results.length, groupRevision: group.revision, groupStatus: group.status,
  selectedNode: compute.nodeScope, predictedOffloadMs: compute.predictedTotalMs, predictedCost: compute.predictedCost,
  sharedDataState: shared.record.state, redactionVerified: true, physicalServiceEffects: f.services.applyCount(),
  completionBeforeProbe: "BLOCKED", completionAfterSyntheticProbe: "COMPLETED" }, null, 2));
