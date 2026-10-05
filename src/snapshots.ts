import { invariant } from "./errors.ts";
import type { ResourceSnapshot } from "./types.ts";

export class ResourceSnapshotRegistry {
  private readonly snapshots = new Map<string, ResourceSnapshot>();

  set(snapshot: ResourceSnapshot): void {
    this.snapshots.set(snapshot.targetScope, structuredClone(snapshot));
  }

  require(targetScope: string): ResourceSnapshot {
    const snapshot = this.snapshots.get(targetScope);
    invariant(snapshot, "PRECONDITION_FAILED", `missing resource snapshot for ${targetScope}`);
    return structuredClone(snapshot);
  }

  assertBinding(targetScope: string, topologyVersion: string, policyVersion: string, preconditionSnapshotHash: string): ResourceSnapshot {
    const current = this.require(targetScope);
    invariant(current.topologyVersion === topologyVersion, "TOPOLOGY_STALE", `topology changed for ${targetScope}`);
    invariant(current.policyVersion === policyVersion, "POLICY_STALE", `policy changed for ${targetScope}`);
    invariant(current.preconditionSnapshotHash === preconditionSnapshotHash, "PRECONDITION_FAILED", `precondition snapshot changed for ${targetScope}`);
    return current;
  }
}
