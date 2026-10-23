import { invariant } from "../errors.ts";
import type { A6GPRuntime } from "../runtime.ts";
import { authorize, authorizeEffect, fresh, positive, resourceScope, revision, type TaskAccess } from "./access.ts";
import { AgentDirectory } from "./directory.ts";

export const MODALITIES = ["text", "audio", "image", "video", "model", "token", "sensor"] as const;
export type Modality = typeof MODALITIES[number];
export interface GroupQoS {
  uplinkMbps: number;
  downlinkMbps: number;
  latencyMs: number;
  jitterMs: number;
  maxLossRate: number;
  maxSkewMs: number;
}
export interface LinkResource {
  scope: string;
  tenant: string;
  uplinkMbps: number;
  downlinkMbps: number;
  latencyMs: number;
  jitterMs: number;
  lossRate: number;
  syncSkewMs: number;
  observedAt: string;
}
export interface ComputeNode {
  scope: string;
  tenant: string;
  tier: "terminal" | "base-station" | "cluster" | "edge" | "core" | "cloud";
  linkScope: string;
  computeUnits: number;
  memoryMb: number;
  queueMs: number;
  costPerUnitMs: number;
  observedAt: string;
}
export interface GroupRequest {
  expectedRevision: number;
  members: string[];
  linkScope: string;
  modalities: Modality[];
  direction: "east-west" | "north-south";
  qos: GroupQoS;
}
export interface GroupRecord extends GroupRequest {
  scope: string;
  tenant: string;
  contractId: string;
  revision: number;
  expiresAt: string;
  trafficClass: "model-transfer" | "interactive-multimodal" | "telemetry";
  status: "ADMITTED" | "DEGRADED";
}
export interface OffloadRequest {
  workUnits: number;
  computeUnits: number;
  memoryMb: number;
  uploadMbit: number;
  downloadMbit: number;
  uplinkMbps: number;
  downlinkMbps: number;
  deadlineMs: number;
  maxCost: number;
}
export interface ComputeReservation extends OffloadRequest {
  scope: string;
  tenant: string;
  contractId: string;
  nodeScope: string;
  linkScope: string;
  predictedTotalMs: number;
  predictedCost: number;
  expiresAt: string;
}

export class ResourceServices {
  private readonly runtime: A6GPRuntime;
  private readonly directory: AgentDirectory;
  private readonly links = new Map<string, LinkResource>();
  private readonly nodes = new Map<string, ComputeNode>();
  private readonly groups = new Map<string, GroupRecord>();
  private readonly jobs = new Map<string, ComputeReservation>();
  readonly maxObservationAgeMs: number;

  constructor(runtime: A6GPRuntime, directory: AgentDirectory, maxObservationAgeMs = 5_000) {
    positive(maxObservationAgeMs, "max observation age");
    this.runtime = runtime; this.directory = directory; this.maxObservationAgeMs = maxObservationAgeMs;
  }

  /** Trusted telemetry ingestion, separate from agent proposals. Capacity updates retain reservations. */
  observeLink(link: LinkResource, now = new Date()): void {
    resourceScope(link.tenant, link.scope, "net");
    for (const key of ["uplinkMbps", "downlinkMbps"] as const) positive(link[key], key);
    for (const key of ["latencyMs", "jitterMs", "lossRate", "syncSkewMs"] as const) positive(link[key], key, true);
    invariant(link.lossRate <= 1, "INVALID_INPUT", "invalid loss rate");
    fresh(link.observedAt, this.maxObservationAgeMs, now);
    this.links.set(link.scope, structuredClone(link));
  }

  observeNode(node: ComputeNode, now = new Date()): void {
    resourceScope(node.tenant, node.scope, "compute"); resourceScope(node.tenant, node.linkScope, "net");
    invariant(["terminal", "base-station", "cluster", "edge", "core", "cloud"].includes(node.tier), "INVALID_INPUT", "invalid deployment tier");
    positive(node.computeUnits, "compute units"); positive(node.memoryMb, "memory");
    positive(node.queueMs, "queue delay", true); positive(node.costPerUnitMs, "compute cost", true);
    fresh(node.observedAt, this.maxObservationAgeMs, now);
    this.nodes.set(node.scope, structuredClone(node));
  }

  private liveLink(scope: string, now: Date): LinkResource {
    const link = this.links.get(scope);
    invariant(link, "PRECONDITION_FAILED", "unknown link");
    fresh(link.observedAt, this.maxObservationAgeMs, now);
    return link;
  }

  private bandwidth(scope: string, omitGroup: string | undefined, now: Date): [number, number] {
    const link = this.liveLink(scope, now);
    let up = link.uplinkMbps, down = link.downlinkMbps;
    for (const g of this.groups.values()) if (g.scope !== omitGroup && g.linkScope === scope && Date.parse(g.expiresAt) > now.getTime()) {
      up -= g.qos.uplinkMbps; down -= g.qos.downlinkMbps;
    }
    for (const job of this.jobs.values()) if (job.linkScope === scope && Date.parse(job.expiresAt) > now.getTime()) {
      up -= job.uplinkMbps; down -= job.downlinkMbps;
    }
    return [up, down];
  }

  /** Called only by the transaction executor; all checks precede the atomic map replacement. */
  configureGroup(access: TaskAccess, scope: string, request: GroupRequest, now: Date): GroupRecord {
    authorizeEffect(this.runtime, access, scope, "acn.group.configure", request, now);
    resourceScope(access.tenant, scope, "group");
    authorize(this.runtime, access, request.linkScope, "acn.group.configure", "R1", now);
    const old = this.groups.get(scope);
    revision(old?.revision ?? 0, request.expectedRevision);
    invariant(!old || old.contractId === access.contractId, "SCOPE_VIOLATION", "group belongs to another task");
    invariant(Array.isArray(request.members) && request.members.length >= 2 && new Set(request.members).size === request.members.length, "INVALID_INPUT", "group needs distinct members");
    const peers = request.members.map(id => this.directory.peer(access, id, now));
    invariant(request.direction === "east-west" || request.direction === "north-south", "INVALID_INPUT", "invalid traffic direction");
    invariant(Array.isArray(request.modalities) && request.modalities.length > 0 && request.modalities.every(m => MODALITIES.includes(m)), "INVALID_INPUT", "invalid modalities");
    const q = request.qos;
    invariant(q, "INVALID_INPUT", "missing QoS");
    for (const key of ["uplinkMbps", "downlinkMbps", "latencyMs"] as const) positive(q[key], key);
    for (const key of ["jitterMs", "maxLossRate", "maxSkewMs"] as const) positive(q[key], key, true);
    invariant(q.maxLossRate <= 1, "INVALID_INPUT", "invalid loss bound");
    const link = this.liveLink(request.linkScope, now);
    const [up, down] = this.bandwidth(link.scope, scope, now);
    invariant(up >= q.uplinkMbps && down >= q.downlinkMbps, "PRECONDITION_FAILED", "insufficient group bandwidth");
    invariant(link.latencyMs + link.jitterMs <= q.latencyMs && link.jitterMs <= q.jitterMs && link.lossRate <= q.maxLossRate && link.syncSkewMs <= q.maxSkewMs, "PRECONDITION_FAILED", "link cannot meet group QoS");
    const contract = this.runtime.contracts.requireActive(access.contractId, now);
    const group: GroupRecord = { ...structuredClone(request), scope, tenant: access.tenant, contractId: access.contractId,
      revision: (old?.revision ?? 0) + 1, status: "ADMITTED",
      expiresAt: new Date(Math.min(Date.parse(contract.validUntil), Date.parse(this.runtime.authority.requireLive(access.leaseId, now).validUntil), ...peers.map(p => Date.parse(p.expiresAt)))).toISOString(),
      trafficClass: request.modalities.includes("model") ? "model-transfer" : request.modalities.some(m => ["audio", "video", "token"].includes(m)) ? "interactive-multimodal" : "telemetry" };
    this.groups.set(scope, group);
    return structuredClone(group);
  }

  group(access: TaskAccess, scope: string, now = new Date()): GroupRecord {
    authorize(this.runtime, access, scope, "acn.group.read", "R0", now);
    const group = this.groups.get(scope);
    invariant(group && group.contractId === access.contractId, "SCOPE_VIOLATION", "group unavailable to task");
    invariant(Date.parse(group.expiresAt) > now.getTime(), "AUTH_EXPIRED", "group expired");
    for (const id of group.members) this.directory.peer(access, id, now);
    const link = this.liveLink(group.linkScope, now), q = group.qos;
    const [up, down] = this.bandwidth(link.scope, group.scope, now);
    const degraded = up < q.uplinkMbps || down < q.downlinkMbps || link.latencyMs + link.jitterMs > q.latencyMs
      || link.jitterMs > q.jitterMs || link.lossRate > q.maxLossRate || link.syncSkewMs > q.maxSkewMs;
    return { ...structuredClone(group), status: degraded ? "DEGRADED" : "ADMITTED" };
  }

  releaseGroup(access: TaskAccess, scope: string, expectedRevision: number, now: Date): void {
    authorizeEffect(this.runtime, access, scope, "acn.group.release", { expectedRevision }, now);
    const group = this.groups.get(scope);
    invariant(group?.contractId === access.contractId, "SCOPE_VIOLATION", "group unavailable to task");
    revision(group.revision, expectedRevision);
    // Keep a revision tombstone: delayed create/update requests cannot resurrect an old revision.
    this.groups.set(scope, { ...group, expiresAt: now.toISOString(), revision: group.revision + 1 });
  }

  reserveCompute(access: TaskAccess, scope: string, request: OffloadRequest, now: Date): ComputeReservation {
    authorizeEffect(this.runtime, access, scope, "acn.compute.reserve", request, now);
    resourceScope(access.tenant, scope, "compute");
    invariant(!this.jobs.has(scope), "INVALID_INPUT", "compute session identity already used");
    for (const key of ["workUnits", "computeUnits", "memoryMb", "uplinkMbps", "downlinkMbps", "deadlineMs"] as const) positive(request[key], key);
    for (const key of ["uploadMbit", "downloadMbit", "maxCost"] as const) positive(request[key], key, true);
    const lease = this.runtime.authority.requireLive(access.leaseId, now);
    const contract = this.runtime.contracts.requireActive(access.contractId, now);
    const candidates: ComputeReservation[] = [];
    for (const node of this.nodes.values()) {
      if (node.tenant !== access.tenant) continue;
      // An inaccessible or stale node is ineligible; never use it as an optimistic estimate.
      try {
        authorize(this.runtime, access, node.scope, "acn.compute.reserve", "R1", now);
        authorize(this.runtime, access, node.linkScope, "acn.compute.reserve", "R1", now);
        fresh(node.observedAt, this.maxObservationAgeMs, now);
        const link = this.liveLink(node.linkScope, now);
        const [up, down] = this.bandwidth(link.scope, undefined, now);
        let units = node.computeUnits, memory = node.memoryMb;
        for (const job of this.jobs.values()) if (job.nodeScope === node.scope && Date.parse(job.expiresAt) > now.getTime()) {
          units -= job.computeUnits; memory -= job.memoryMb;
        }
        const predictedTotalMs = link.latencyMs + link.jitterMs + node.queueMs + request.workUnits / request.computeUnits
          + 1000 * (request.uploadMbit / request.uplinkMbps + request.downloadMbit / request.downlinkMbps);
        const predictedCost = request.workUnits * node.costPerUnitMs;
        const expires = Math.min(Date.parse(contract.validUntil), Date.parse(lease.validUntil));
        if (up < request.uplinkMbps || down < request.downlinkMbps || units < request.computeUnits || memory < request.memoryMb
          || predictedTotalMs > request.deadlineMs || predictedCost > request.maxCost || now.getTime() + predictedTotalMs > expires) continue;
        candidates.push({ ...structuredClone(request), scope, tenant: access.tenant, contractId: access.contractId,
          nodeScope: node.scope, linkScope: node.linkScope, predictedTotalMs, predictedCost, expiresAt: new Date(expires).toISOString() });
      } catch (error) {
        if (!(error instanceof Error && error.name === "A6GPError")) throw error;
      }
    }
    candidates.sort((a, b) => a.predictedTotalMs - b.predictedTotalMs || a.predictedCost - b.predictedCost || a.nodeScope.localeCompare(b.nodeScope));
    invariant(candidates.length > 0, "PRECONDITION_FAILED", "no authorized fresh node meets joint network/compute constraints");
    const selected = candidates[0];
    this.jobs.set(scope, selected);
    return structuredClone(selected);
  }

  compute(access: TaskAccess, scope: string, now = new Date()): ComputeReservation {
    authorize(this.runtime, access, scope, "acn.compute.read", "R0", now);
    const job = this.jobs.get(scope);
    invariant(job?.contractId === access.contractId, "SCOPE_VIOLATION", "compute session unavailable to task");
    invariant(Date.parse(job.expiresAt) > now.getTime(), "AUTH_EXPIRED", "compute session expired");
    return structuredClone(job);
  }

  releaseCompute(access: TaskAccess, scope: string, now: Date): void {
    authorizeEffect(this.runtime, access, scope, "acn.compute.release", {}, now);
    const job = this.jobs.get(scope);
    invariant(job?.contractId === access.contractId, "SCOPE_VIOLATION", "compute session unavailable to task");
    this.jobs.set(scope, { ...job, expiresAt: now.toISOString() });
  }
}
