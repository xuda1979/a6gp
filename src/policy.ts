import { sha256 } from "./canonical.ts";
import { invariant } from "./errors.ts";
import type { PolicyArtifact, ResourceSnapshot } from "./types.ts";

function artifactContent(artifact: PolicyArtifact): Record<string, unknown> {
  const { artifactHash: _hash, ...content } = artifact;
  return content;
}

export function computePolicyArtifactHash(artifact: PolicyArtifact): string {
  return sha256(artifactContent(artifact));
}

export function validatePolicyArtifact(
  artifact: PolicyArtifact,
  snapshot: ResourceSnapshot,
  inputs: Record<string, number>,
  now = new Date(),
): void {
  invariant(artifact.timingClass === "T0" || artifact.timingClass === "T1", "INVALID_INPUT", "fast policy artifact must target T0/T1");
  invariant(artifact.artifactHash === computePolicyArtifactHash(artifact), "AUTH_HASH_MISMATCH", "policy artifact hash mismatch");
  invariant(snapshot.targetScope === artifact.targetScope, "SCOPE_VIOLATION", "policy artifact target differs from runtime target");
  invariant(snapshot.topologyVersion === artifact.topologyVersion, "TOPOLOGY_STALE", "policy artifact topology is stale");
  invariant(snapshot.policyVersion === artifact.policyVersion, "POLICY_STALE", "policy artifact policy version is stale");
  invariant(new Date(artifact.validFrom).getTime() <= now.getTime(), "AUTH_EXPIRED", "policy artifact is not active yet");
  invariant(new Date(artifact.validUntil).getTime() > now.getTime(), "AUTH_EXPIRED", "policy artifact expired");
  invariant(artifact.guardConditions.length > 0, "INVALID_INPUT", "policy artifact requires guard conditions");
  invariant(Boolean(artifact.fallback), "INVALID_INPUT", "policy artifact requires deterministic fallback");
  invariant(artifact.verificationEvidence.length > 0, "EVIDENCE_MISSING", "policy artifact requires verification evidence");
  for (const [name, bounds] of Object.entries(artifact.inputEnvelope)) {
    const value = inputs[name];
    invariant(typeof value === "number" && Number.isFinite(value), "PRECONDITION_FAILED", `missing validated input ${name}`);
    invariant(value >= bounds.min && value <= bounds.max, "PRECONDITION_FAILED", `input ${name} left validated envelope`);
  }
}
