import type { KeyObject } from "node:crypto";
import { invariant } from "../errors.ts";
import type { A6GPRuntime } from "../runtime.ts";
import type { A6GPEnvelope, ProtocolAdvertisement } from "../types.ts";
import { EnvelopeReplayGuard, verifyEnvelope } from "../wire.ts";
import { fresh, positive, type TaskAccess } from "./access.ts";
import { assertTenantScope, scopesCover } from "../scope.ts";

export const ACN_STATE_EXTENSION = "ext.acn.network-state.v1";
export const ACN_SERVICE_EXTENSION = "ext.acn.services.v1";
export interface NetworkStateContext {
  targetScope: string;
  topologyVersion: string;
  policyVersion: string;
  preconditionSnapshotHash: string;
  observedAt: string;
  source: string;
}

/** The caller supplies a trusted identity key; network transport/key lookup is outside this reference. */
export function verifyACNEnvelope<T>(envelope: A6GPEnvelope<T>, publicKey: KeyObject, supported: ProtocolAdvertisement,
  runtime: A6GPRuntime, replayGuard: EnvelopeReplayGuard, maxAgeMs = 5_000, now = Date.now()): TaskAccess {
  positive(maxAgeMs, "network context max age");
  verifyEnvelope(envelope, publicKey, supported, undefined, now);
  const principal = runtime.authority.principal(envelope.sender);
  invariant(principal?.status === "ACTIVE" && principal.tenant === envelope.tenant && principal.identityKeyId === envelope.keyId,
    "AUTHORITY_MISSING", "envelope identity/key/tenant binding mismatch");
  invariant(envelope.criticalExtensions.includes(ACN_STATE_EXTENSION) && envelope.negotiated.extensions.includes(ACN_STATE_EXTENSION),
    "UNSUPPORTED_CRITICAL_EXTENSION", "ACN network context must be negotiated and critical");
  invariant(envelope.criticalExtensions.includes(ACN_SERVICE_EXTENSION) && envelope.negotiated.extensions.includes(ACN_SERVICE_EXTENSION),
    "UNSUPPORTED_CRITICAL_EXTENSION", "task-bound ACN services must be negotiated and critical");
  const state = envelope.extensions[ACN_STATE_EXTENSION] as NetworkStateContext | undefined;
  invariant(state && typeof state.source === "string" && state.source.length > 0 && typeof state.targetScope === "string", "INVALID_INPUT", "missing typed network state context");
  fresh(state.observedAt, maxAgeMs, new Date(now));
  const snapshot = runtime.snapshots.assertBinding(state.targetScope, state.topologyVersion, state.policyVersion, state.preconditionSnapshotHash);
  fresh(snapshot.observedAt, maxAgeMs, new Date(now));
  invariant(envelope.topologyVersion === state.topologyVersion, "TOPOLOGY_STALE", "envelope topology differs from network context");
  invariant(envelope.contractId && envelope.contractRevision && envelope.leaseId, "INVALID_INPUT", "ACN envelope needs task and authority context");
  const contract = runtime.contracts.requireActive(envelope.contractId, new Date(now));
  invariant(contract.tenant === envelope.tenant && contract.revision === envelope.contractRevision, "CONTRACT_REVISION_STALE", "envelope task binding mismatch");
  const lease = runtime.authority.requireLive(envelope.leaseId, new Date(now));
  invariant(lease.subject === envelope.sender && lease.tenant === envelope.tenant && lease.contractId === envelope.contractId,
    "SCOPE_VIOLATION", "envelope lease binding mismatch");
  assertTenantScope(envelope.tenant, state.targetScope);
  invariant(scopesCover(lease.scope, state.targetScope) && scopesCover(contract.scope, state.targetScope), "SCOPE_VIOLATION", "network state outside task authority");
  // A failed state/identity check must not consume an otherwise valid replay identifier.
  replayGuard.accept(envelope.messageId, envelope.expiresAt, now);
  return { agentId: envelope.sender, tenant: envelope.tenant, contractId: envelope.contractId,
    contractRevision: envelope.contractRevision, leaseId: envelope.leaseId };
}
