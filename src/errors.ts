export type A6GPErrorCode =
  | "AUTHORITY_MISSING"
  | "LEASE_EXPIRED"
  | "LEASE_REVOKED"
  | "LEASE_CHAIN_INVALID"
  | "SCOPE_VIOLATION"
  | "TENANT_MISMATCH"
  | "ACTION_NOT_ALLOWED"
  | "RISK_POLICY_REJECTED"
  | "CONTRACT_NOT_ACTIVE"
  | "CONTRACT_REVISION_STALE"
  | "TOPOLOGY_STALE"
  | "POLICY_STALE"
  | "PRECONDITION_FAILED"
  | "PRECHECK_REQUIRED"
  | "APPROVAL_QUORUM_MISSING"
  | "AUTH_HASH_MISMATCH"
  | "AUTH_CONTEXT_STALE"
  | "AUTH_EXPIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "EXECUTION_UNKNOWN"
  | "RECONCILIATION_REQUIRED"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_NOT_INDEPENDENT"
  | "EVIDENCE_CONFLICT"
  | "COMPENSATION_FAILED"
  | "MODEL_UNAVAILABLE_FALLBACK"
  | "INVALID_STATE"
  | "INVALID_INPUT"
  | "UNSUPPORTED_CRITICAL_EXTENSION";

export class A6GPError extends Error {
  readonly code: A6GPErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: A6GPErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "A6GPError";
    this.code = code;
    this.details = details;
  }
}

export function invariant(
  condition: unknown,
  code: A6GPErrorCode,
  message: string,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) throw new A6GPError(code, message, details);
}
