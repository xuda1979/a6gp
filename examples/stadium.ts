import {
  A6GPRuntime,
  InMemoryIdempotentExecutor,
  type ActionSpec,
  type EvidenceRecord,
  type IntentContract,
} from "../src/index.ts";

const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const tenant = "operator-a";
const site = "ran:operator-a/region-west/site-17";
const cell = `${site}/cell-3`;
const executor = new InMemoryIdempotentExecutor();
const runtime = new A6GPRuntime(executor);

runtime.registerPrincipal({
  agentId: "agent:operator-a:ran-optimizer-17",
  principalType: "RAN",
  tenant,
  operatorDomain: "region-west",
  identityKeyId: "key-42",
  trustTier: "TIER_2",
  status: "ACTIVE",
  capabilityDescriptorHash: "sha256:demo-capability",
});

const contract: IntentContract = {
  contractId: "ctr-stadium-001",
  revision: 1,
  tenant,
  goal: "Maintain stadium AR P99 latency below 20 ms",
  scope: [site],
  hardConstraints: ["drop_rate < 0.005", "energy_delta < 0.08"],
  allowedActions: ["ran.prb.allocate"],
  riskClass: "R2",
  timingClass: "T3",
  evidencePolicy: ["e2e-latency-window", "drop-rate-window"],
  minimumEvidenceStrength: 0.9,
  minimumIndependentSources: 2,
  fallbackPolicy: "last-known-good",
  validUntil: future(10 * 60_000),
  state: "ACTIVE",
};
runtime.createAndActivateContract(contract);

runtime.observe({
  targetScope: cell,
  topologyVersion: "topo-8842",
  policyVersion: "policy-7",
  preconditionSnapshotHash: "sha256:stadium-precondition-v1",
  observedAt: new Date().toISOString(),
});

const lease = runtime.grantLease({
  subject: "agent:operator-a:ran-optimizer-17",
  tenant,
  scope: [site],
  actionSet: ["ran.prb.allocate"],
  riskCeiling: "R2",
  validUntil: future(5 * 60_000),
});

const action: ActionSpec = {
  actionId: "act-stadium-prb-001",
  contractId: contract.contractId,
  contractRevision: 1,
  tenant,
  actor: lease.subject,
  targetAuthorityDomain: "ran-west",
  targetScope: cell,
  actionType: "ran.prb.allocate",
  parameters: { prbShare: 0.62 },
  riskClass: "R2",
  timingClass: "T2",
  idempotencyKey: "stadium-prb-window-001",
  topologyVersion: "topo-8842",
  policyVersion: "policy-7",
  preconditionSnapshotHash: "sha256:stadium-precondition-v1",
  fallbackPolicy: "last-known-good",
  compensationActionType: "ran.prb.restore",
};

runtime.transactions.prepare(action, lease.leaseId, {
  precheckId: "pre-stadium-001",
  kind: "digital-twin",
  verdict: "PASS",
  artifactHash: "sha256:twin-run-001",
  topologyVersion: action.topologyVersion,
  policyVersion: action.policyVersion,
  inputHash: "sha256:twin-input-001",
  uncertainty: 0.03,
});
runtime.transactions.authorize(action.actionId);
console.log("commit:", (await runtime.transactions.commit(action.actionId)).state);

const evidence: EvidenceRecord[] = [
  {
    evidenceId: "ev-latency-001", contractId: contract.contractId, actionId: action.actionId,
    kind: "e2e-latency-window", source: "probe:stadium-e2e-1", sourceClass: "probe", tenant,
    resource: "service:operator-a/stadium-ar", timeWindow: [new Date(Date.now()-5000).toISOString(), new Date().toISOString()],
    measurementContract: "sha256:latency-method-v1", verdict: "PASS", strength: 0.98,
    artifactHash: "sha256:latency-evidence", createdAt: new Date().toISOString(),
  },
  {
    evidenceId: "ev-drop-001", contractId: contract.contractId, actionId: action.actionId,
    kind: "drop-rate-window", source: "telemetry:ric-2", sourceClass: "telemetry", tenant,
    resource: "service:operator-a/stadium-ar", timeWindow: [new Date(Date.now()-5000).toISOString(), new Date().toISOString()],
    measurementContract: "sha256:drop-method-v1", verdict: "PASS", strength: 0.96,
    artifactHash: "sha256:drop-evidence", createdAt: new Date().toISOString(),
  },
];
for (const row of evidence) runtime.appendEvidence(row);
runtime.transactions.verify(action.actionId, 0.9);
console.log("gate:", runtime.objectiveGate(contract.contractId));
console.log("contract:", runtime.closeContract(contract.contractId).state);
