import { ACN_OPERATIONS, createACNRuntime, descriptorHash, NetworkToolGateway,
  type AgentDescriptor, type GroupRequest, type OffloadRequest, type TaskAccess } from "../src/index.ts";

/** Synthetic reference inputs. These are not measurements from a RAN or a production cloud. */
export function createACNLab() {
  const { runtime, services } = createACNRuntime();
  const gateway = new NetworkToolGateway(runtime, services);
  const tenant = "operator-a", stamp = new Date().toISOString();
  const future = (ms = 60_000) => new Date(Date.now() + ms).toISOString();
  const scopes = ["service", "group", "net", "compute", "data"].map(ns => `${ns}:${tenant}/acn`);
  const contract = runtime.createAndActivateContract({ contractId: "acn-task-1", revision: 1, tenant,
    goal: "Connect collaborating agents, admit edge work, and share redacted observations", scope: scopes,
    hardConstraints: ["joint capacity admission", "tenant and task isolation"], allowedActions: ACN_OPERATIONS,
    riskClass: "R1", timingClass: "T2", evidencePolicy: ["independent-outcome"], minimumEvidenceStrength: 0.9,
    minimumIndependentSources: 1, fallbackPolicy: "reject-and-retain-current-state", validUntil: future(300_000), state: "ACTIVE" });
  const agents = ["planner", "robot", "probe"];
  for (const [i, agentId] of agents.entries()) {
    const descriptor: AgentDescriptor = { vendor: `vendor-${i}`, endpoint: `https://${agentId}.example.invalid/acn`,
      protocols: ["a6gp/0.4", "mcp-tools"], capabilities: i === 2 ? ["independent-probe"] : ["collaborate", "sensor"] };
    runtime.registerPrincipal({ agentId, tenant, principalType: "APPLICATION", operatorDomain: i === 1 ? "edge" : "ran",
      userId: `user-${i}`, identityKeyId: `${agentId}-key`, trustTier: "LAB", status: "ACTIVE", capabilityDescriptorHash: descriptorHash(descriptor) });
    services.directory.register({ agentId, ...descriptor, expiresAt: future(120_000) });
  }
  services.directory.allowDomain(tenant, "ran", "edge"); services.directory.allowDomain(tenant, "edge", "ran");
  const contexts = Object.fromEntries(agents.map(agentId => {
    const lease = runtime.grantLease({ subject: agentId, tenant, contractId: contract.contractId, scope: scopes,
      actionSet: ACN_OPERATIONS, riskCeiling: "R1", validUntil: future(120_000) });
    return [agentId, { agentId, tenant, contractId: contract.contractId, contractRevision: 1, leaseId: lease.leaseId } satisfies TaskAccess];
  }));
  const link = "net:operator-a/acn/link-1", group = "group:operator-a/acn/team-1",
    job = "compute:operator-a/acn/job-1", data = "data:operator-a/acn/observation-1";
  services.resources.observeLink({ scope: link, tenant, uplinkMbps: 100, downlinkMbps: 200,
    latencyMs: 2, jitterMs: 1, lossRate: 0.001, syncSkewMs: 0.5, observedAt: stamp });
  services.resources.observeNode({ scope: "compute:operator-a/acn/base-station", tenant, tier: "base-station", linkScope: link,
    computeUnits: 8, memoryMb: 4096, queueMs: 2, costPerUnitMs: 0.01, observedAt: stamp });
  services.resources.observeNode({ scope: "compute:operator-a/acn/cloud", tenant, tier: "cloud", linkScope: link,
    computeUnits: 64, memoryMb: 32768, queueMs: 40, costPerUnitMs: 0.005, observedAt: stamp });
  const observe = (scope: string) => runtime.observe({ targetScope: scope, topologyVersion: "lab-topology-1", policyVersion: "lab-policy-1",
    preconditionSnapshotHash: "sha256:lab-state-1", observedAt: new Date().toISOString() });
  for (const scope of [group, job, data]) observe(scope);
  const groupRequest: GroupRequest = { expectedRevision: 0, members: ["planner", "robot"], linkScope: link,
    modalities: ["video", "token"], direction: "east-west",
    qos: { uplinkMbps: 30, downlinkMbps: 40, latencyMs: 10, jitterMs: 2, maxLossRate: 0.005, maxSkewMs: 1 } };
  const offload: OffloadRequest = { workUnits: 20, computeUnits: 4, memoryMb: 1024, uploadMbit: 0.1,
    downloadMbit: 0.1, uplinkMbps: 10, downlinkMbps: 20, deadlineMs: 50, maxCost: 1 };
  return { runtime, services, gateway, contexts, tenant, contract, link, group, job, data, groupRequest, offload, observe, future };
}
