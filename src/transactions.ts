import { newId, sha256 } from "./canonical.ts";
import { ContractRegistry } from "./contracts.ts";
import { EvidenceLedger } from "./evidence.ts";
import { A6GPError, invariant } from "./errors.ts";
import { AuthorityRegistry } from "./lease.ts";
import { ResourceSnapshotRegistry } from "./snapshots.ts";
import type {
  ActionAuthorization,
  ActionExecutor,
  ActionRecord,
  ActionSpec,
  Approval,
  PrecheckRecord,
} from "./types.ts";

function canonicalAction(action: ActionSpec): Record<string, unknown> {
  return {
    actionId: action.actionId,
    contractId: action.contractId,
    contractRevision: action.contractRevision,
    tenant: action.tenant,
    actor: action.actor,
    targetAuthorityDomain: action.targetAuthorityDomain,
    targetScope: action.targetScope,
    actionType: action.actionType,
    parameters: action.parameters,
    riskClass: action.riskClass,
    timingClass: action.timingClass,
    idempotencyKey: action.idempotencyKey,
    topologyVersion: action.topologyVersion,
    policyVersion: action.policyVersion,
    preconditionSnapshotHash: action.preconditionSnapshotHash,
    fallbackPolicy: action.fallbackPolicy ?? null,
    compensationActionType: action.compensationActionType ?? null,
  };
}

export function actionHash(action: ActionSpec): string {
  return sha256(canonicalAction(action));
}

export class ActionTransactionManager {
  private readonly actions = new Map<string, ActionRecord>();
  private readonly contracts: ContractRegistry;
  private readonly authority: AuthorityRegistry;
  private readonly snapshots: ResourceSnapshotRegistry;
  private readonly evidence: EvidenceLedger;
  private readonly executor: ActionExecutor;

  constructor(
    contracts: ContractRegistry,
    authority: AuthorityRegistry,
    snapshots: ResourceSnapshotRegistry,
    evidence: EvidenceLedger,
    executor: ActionExecutor,
  ) {
    this.contracts = contracts;
    this.authority = authority;
    this.snapshots = snapshots;
    this.evidence = evidence;
    this.executor = executor;
  }

  prepare(action: ActionSpec, leaseId: string, precheck?: PrecheckRecord, now = new Date()): ActionRecord {
    invariant(!this.actions.has(action.actionId), "INVALID_INPUT", `duplicate action ${action.actionId}`);
    invariant(Boolean(action.idempotencyKey) || action.riskClass === "R0", "INVALID_INPUT", "R1-R3 action requires idempotencyKey");
    const contract = this.contracts.assertAction(
      action.contractId,
      action.contractRevision,
      action.tenant,
      action.targetScope,
      action.actionType,
      action.riskClass,
      now,
    );
    this.authority.assertAction(
      leaseId,
      action.actor,
      action.tenant,
      action.targetScope,
      action.actionType,
      action.riskClass,
      now,
    );
    this.snapshots.assertBinding(
      action.targetScope,
      action.topologyVersion,
      action.policyVersion,
      action.preconditionSnapshotHash,
    );
    if (action.riskClass === "R2" || action.riskClass === "R3") {
      invariant(precheck, "PRECHECK_REQUIRED", `${action.riskClass} action requires a precheck`);
      invariant(precheck.verdict === "PASS", "PRECHECK_REQUIRED", "precheck did not pass");
      invariant(precheck.topologyVersion === action.topologyVersion, "TOPOLOGY_STALE", "precheck topology differs from action");
      invariant(precheck.policyVersion === action.policyVersion, "POLICY_STALE", "precheck policy differs from action");
    }
    invariant(new Date(contract.validUntil).getTime() > now.getTime(), "CONTRACT_NOT_ACTIVE", "contract expired before prepare");
    const timestamp = now.toISOString();
    const record: ActionRecord = {
      action: structuredClone(action),
      actionHash: actionHash(action),
      state: "PREPARED",
      leaseId,
      precheck: precheck ? structuredClone(precheck) : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.actions.set(action.actionId, record);
    return structuredClone(record);
  }

  authorize(actionId: string, approvals: Approval[] = [], ttlMs = 30_000, now = new Date()): ActionAuthorization {
    const record = this.mutable(actionId);
    invariant(record.state === "PREPARED", "INVALID_STATE", `cannot authorize from ${record.state}`);
    const leaseId = record.leaseId;
    invariant(leaseId, "AUTHORITY_MISSING", "prepared action has no lease");
    const action = record.action;
    const contract = this.contracts.assertAction(
      action.contractId,
      action.contractRevision,
      action.tenant,
      action.targetScope,
      action.actionType,
      action.riskClass,
      now,
    );
    const lease = this.authority.assertAction(
      leaseId,
      action.actor,
      action.tenant,
      action.targetScope,
      action.actionType,
      action.riskClass,
      now,
    );
    this.snapshots.assertBinding(action.targetScope, action.topologyVersion, action.policyVersion, action.preconditionSnapshotHash);
    invariant(record.actionHash === actionHash(action), "AUTH_HASH_MISMATCH", "action mutated after prepare");

    for (const approval of approvals) {
      invariant(approval.actionHash === record.actionHash, "AUTH_HASH_MISMATCH", "approval binds a different action hash");
      invariant(new Date(approval.expiresAt).getTime() > now.getTime(), "AUTH_EXPIRED", "approval expired");
    }
    if (action.riskClass === "R3") {
      const threshold = contract.approvalThreshold ?? 2;
      const domains = new Set(approvals.map((a) => a.authorityDomain));
      const issuers = new Set(approvals.map((a) => a.issuer));
      invariant(domains.size >= threshold && issuers.size >= threshold, "APPROVAL_QUORUM_MISSING", `R3 requires ${threshold} independent approval domains`);
    }

    const authorization: ActionAuthorization = {
      authorizationId: newId("auth"),
      actionHash: record.actionHash,
      leaseId: lease.leaseId,
      leaseChainHash: lease.chainHash,
      subject: action.actor,
      contractId: action.contractId,
      contractRevision: action.contractRevision,
      topologyVersion: action.topologyVersion,
      policyVersion: action.policyVersion,
      preconditionSnapshotHash: action.preconditionSnapshotHash,
      targetScope: action.targetScope,
      actionRisk: action.riskClass,
      approvals: structuredClone(approvals),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      nonce: newId("nonce"),
    };
    record.authorization = authorization;
    record.state = "AUTHORIZED";
    record.updatedAt = now.toISOString();
    return structuredClone(authorization);
  }

  async commit(actionId: string, now = new Date()): Promise<ActionRecord> {
    const record = this.mutable(actionId);
    if (["APPLIED", "VERIFYING", "VERIFIED"].includes(record.state)) {
      return structuredClone(record);
    }
    if (record.state === "UNKNOWN" || record.state === "RECONCILING" || record.state === "UNRESOLVED") {
      throw new A6GPError("RECONCILIATION_REQUIRED", `ambiguous action ${actionId} must be reconciled before any further commit`);
    }
    invariant(record.state === "AUTHORIZED", "INVALID_STATE", `cannot commit from ${record.state}`);
    this.revalidateAuthorization(record, now);
    record.state = "COMMITTING";
    record.updatedAt = now.toISOString();
    let result;
    try {
      result = await this.executor.ensure(record.action, record.actionHash);
    } catch (error) {
      if (error instanceof A6GPError) throw error;
      record.state = "UNKNOWN";
      record.lastError = error instanceof Error ? error.message : String(error);
      record.updatedAt = new Date().toISOString();
      return structuredClone(record);
    }
    if (result.status === "SUCCEEDED") {
      record.state = "APPLIED";
      record.executorReceipt = result.receipt;
    } else if (result.status === "FAILED") {
      record.state = "FAILED";
      record.lastError = result.detail ?? "executor reported failure";
    } else {
      record.state = "UNKNOWN";
      record.lastError = result.detail ?? "executor outcome ambiguous";
    }
    record.updatedAt = new Date().toISOString();
    return structuredClone(record);
  }

  beginVerification(actionId: string, now = new Date()): ActionRecord {
    const record = this.mutable(actionId);
    invariant(record.state === "APPLIED", "INVALID_STATE", `cannot verify from ${record.state}`);
    record.state = "VERIFYING";
    record.updatedAt = now.toISOString();
    return structuredClone(record);
  }

  verify(actionId: string, minimumStrength = 0.8, now = new Date()): ActionRecord {
    const record = this.mutable(actionId);
    invariant(record.state === "APPLIED" || record.state === "VERIFYING", "INVALID_STATE", `cannot mark verified from ${record.state}`);
    invariant(this.evidence.actionVerified(actionId, minimumStrength), "EVIDENCE_MISSING", "independent PASS evidence is required to verify action");
    record.state = "VERIFIED";
    record.updatedAt = now.toISOString();
    return structuredClone(record);
  }

  async reconcile(actionId: string, now = new Date()): Promise<ActionRecord> {
    const record = this.mutable(actionId);
    invariant(record.state === "UNKNOWN" || record.state === "RECONCILING", "RECONCILIATION_REQUIRED", `action ${actionId} is not ambiguous`);
    record.state = "RECONCILING";
    record.updatedAt = now.toISOString();
    let result;
    try {
      result = await this.executor.inspect(record.action, record.actionHash);
    } catch (error) {
      record.state = "UNRESOLVED";
      record.lastError = error instanceof Error ? error.message : String(error);
      record.updatedAt = new Date().toISOString();
      return structuredClone(record);
    }
    if (result.status === "SUCCEEDED") {
      record.state = "APPLIED";
      record.executorReceipt = result.receipt;
      record.lastError = undefined;
    } else if (result.status === "FAILED" || result.status === "NOT_FOUND") {
      record.state = "FAILED";
      record.lastError = result.detail ?? (result.status === "NOT_FOUND" ? "executor proved no effect" : "executor reported failure");
    } else {
      record.state = "UNRESOLVED";
      record.lastError = result.detail ?? "executor still cannot resolve effect";
    }
    record.updatedAt = new Date().toISOString();
    return structuredClone(record);
  }

  async reverse(actionId: string, now = new Date()): Promise<ActionRecord> {
    const record = this.mutable(actionId);
    invariant(record.state === "APPLIED" || record.state === "VERIFYING" || record.state === "VERIFIED", "INVALID_STATE", `cannot reverse from ${record.state}`);
    invariant(this.executor.reverse, "COMPENSATION_FAILED", "executor has no reverse operation");
    record.state = "REVERSING";
    const result = await this.executor.reverse(record.action, record.actionHash);
    if (result.status === "SUCCEEDED") {
      record.state = "REVERSED";
    } else if (result.status === "UNKNOWN") {
      record.state = "UNKNOWN";
    } else {
      record.state = "FAILED";
      record.lastError = result.detail ?? "reverse failed";
    }
    record.updatedAt = now.toISOString();
    return structuredClone(record);
  }

  get(actionId: string): ActionRecord | undefined {
    const record = this.actions.get(actionId);
    return record ? structuredClone(record) : undefined;
  }

  forContract(contractId: string): ActionRecord[] {
    return [...this.actions.values()]
      .filter((record) => record.action.contractId === contractId)
      .map((record) => structuredClone(record));
  }

  private mutable(actionId: string): ActionRecord {
    const record = this.actions.get(actionId);
    invariant(record, "INVALID_INPUT", `unknown action ${actionId}`);
    return record;
  }

  private revalidateAuthorization(record: ActionRecord, now: Date): void {
    const auth = record.authorization;
    invariant(auth, "AUTHORITY_MISSING", "action has no authorization");
    invariant(new Date(auth.expiresAt).getTime() > now.getTime(), "AUTH_EXPIRED", "authorization expired");
    invariant(auth.actionHash === actionHash(record.action), "AUTH_HASH_MISMATCH", "action changed after authorization");
    const lease = this.authority.assertAction(
      auth.leaseId,
      record.action.actor,
      record.action.tenant,
      record.action.targetScope,
      record.action.actionType,
      record.action.riskClass,
      now,
    );
    invariant(lease.chainHash === auth.leaseChainHash, "LEASE_CHAIN_INVALID", "lease chain changed after authorization");
    const contract = this.contracts.assertAction(
      auth.contractId,
      auth.contractRevision,
      record.action.tenant,
      record.action.targetScope,
      record.action.actionType,
      record.action.riskClass,
      now,
    );
    invariant(contract.revision === auth.contractRevision, "CONTRACT_REVISION_STALE", "contract changed after authorization");
    this.snapshots.assertBinding(
      auth.targetScope,
      auth.topologyVersion,
      auth.policyVersion,
      auth.preconditionSnapshotHash,
    );
    invariant(auth.subject === record.action.actor, "AUTH_CONTEXT_STALE", "authorized subject changed");
    invariant(auth.actionRisk === record.action.riskClass, "AUTH_CONTEXT_STALE", "authorized risk changed");
  }
}
