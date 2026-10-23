import { invariant } from "../errors.ts";
import type { A6GPRuntime } from "../runtime.ts";
import type { RiskClass } from "../types.ts";
import { sha256 } from "../canonical.ts";
import { assertTenantScope, parseScope } from "../scope.ts";

/** Trusted identity context supplied by an authenticated transport, never tool arguments. */
export interface TaskAccess {
  agentId: string;
  tenant: string;
  contractId: string;
  contractRevision: number;
  leaseId: string;
  actionId?: string;
}

export function authorizeEffect(runtime: A6GPRuntime, access: TaskAccess, scope: string, operation: string, parameters: unknown, now: Date): void {
  authorize(runtime, access, scope, operation, "R1", now);
  const record = access.actionId ? runtime.transactions.get(access.actionId) : undefined;
  invariant(record?.state === "COMMITTING" && record.authorization?.leaseId === access.leaseId,
    "INVALID_STATE", "service effects require an authorized transaction in COMMITTING");
  invariant(record.action.targetScope === scope && record.action.actionType === operation
    && record.action.actor === access.agentId && record.action.contractId === access.contractId
    && record.action.contractRevision === access.contractRevision && record.action.riskClass === "R1" && record.action.timingClass === "T2"
    && sha256(record.action.parameters) === sha256(parameters), "AUTH_HASH_MISMATCH", "service call differs from authorized action");
  fresh(runtime.snapshots.require(scope).observedAt, 5_000, now);
}

export function resourceScope(tenant: string, scope: string, namespace: string): void {
  assertTenantScope(tenant, scope);
  invariant(parseScope(scope).namespace === namespace, "SCOPE_VIOLATION", `resource needs ${namespace} namespace`);
}

export function authorize(runtime: A6GPRuntime, access: TaskAccess, scope: string, operation: string, risk: RiskClass = "R0", now = new Date()): void {
  const lease = runtime.authority.assertAction(access.leaseId, access.agentId, access.tenant, scope, operation, risk, now, access.contractId);
  invariant(lease.contractId === access.contractId, "SCOPE_VIOLATION", "ACN services require an explicitly task-bound lease");
  runtime.contracts.assertAction(access.contractId, access.contractRevision, access.tenant, scope, operation, risk, now);
}

export function positive(value: unknown, name: string, allowZero = false): asserts value is number {
  invariant(typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0), "INVALID_INPUT", `invalid ${name}`);
}

export function fresh(observedAt: string, maxAgeMs: number, now = new Date()): void {
  const age = now.getTime() - Date.parse(observedAt);
  invariant(Number.isFinite(age) && age >= 0 && age <= maxAgeMs, "PRECONDITION_FAILED", "network observation is stale or future-dated");
}

export function revision(actual: number, expected: unknown): void {
  invariant(Number.isSafeInteger(expected) && actual === expected, "AUTH_CONTEXT_STALE", "resource revision changed");
}
