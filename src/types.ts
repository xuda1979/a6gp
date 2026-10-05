export type RiskClass = "R0" | "R1" | "R2" | "R3";
export type TimingClass = "T0" | "T1" | "T2" | "T3" | "T4";
export type ContractState =
  | "PROPOSED" | "NEGOTIATING" | "ADMITTED" | "ACTIVE" | "VERIFYING"
  | "COMPLETED" | "DEGRADED" | "RECOVERING" | "ABORTING" | "ABORTED"
  | "EXPIRED" | "REJECTED";
export type ActionState =
  | "PROPOSED" | "PREPARED" | "AUTHORIZED" | "COMMITTING" | "APPLIED"
  | "VERIFYING" | "VERIFIED" | "REJECTED" | "UNKNOWN" | "RECONCILING"
  | "REVERSING" | "REVERSED" | "FAILED" | "UNRESOLVED";
export type EvidenceVerdict = "PASS" | "FAIL" | "UNKNOWN";
export type ExecutorStatus = "SUCCEEDED" | "FAILED" | "UNKNOWN" | "NOT_FOUND";

export interface AgentPrincipal {
  agentId: string;
  principalType: string;
  tenant: string;
  operatorDomain: string;
  identityKeyId: string;
  trustTier: string;
  status: "ACTIVE" | "REVOKED" | "QUARANTINED";
  capabilityDescriptorHash: string;
}

export interface IntentContract {
  contractId: string;
  revision: number;
  tenant: string;
  goal: string;
  scope: string[];
  hardConstraints: string[];
  allowedActions: string[];
  riskClass: RiskClass;
  timingClass: TimingClass;
  evidencePolicy: string[];
  minimumEvidenceStrength: number;
  minimumIndependentSources: number;
  approvalThreshold?: number;
  fallbackPolicy: string;
  validUntil: string;
  state: ContractState;
}

export interface AuthorityLease {
  leaseId: string;
  subject: string;
  tenant: string;
  scope: string[];
  actionSet: string[];
  riskCeiling: RiskClass;
  validUntil: string;
  parentLeaseId?: string;
  parentChainHash?: string;
  constraints: string[];
  nonce: string;
  issuedAt: string;
  revokedAt?: string;
  chainHash: string;
}

export interface Approval {
  approvalId: string;
  issuer: string;
  authorityDomain: string;
  actionHash: string;
  expiresAt: string;
}

export interface PrecheckRecord {
  precheckId: string;
  kind: "digital-twin" | "shadow" | "replay" | "formal";
  verdict: "PASS" | "FAIL" | "UNKNOWN";
  artifactHash: string;
  topologyVersion: string;
  policyVersion: string;
  inputHash: string;
  uncertainty?: number;
}

export interface ActionSpec {
  actionId: string;
  contractId: string;
  contractRevision: number;
  tenant: string;
  actor: string;
  targetAuthorityDomain: string;
  targetScope: string;
  actionType: string;
  parameters: Record<string, unknown>;
  riskClass: RiskClass;
  timingClass: TimingClass;
  idempotencyKey: string;
  topologyVersion: string;
  policyVersion: string;
  preconditionSnapshotHash: string;
  fallbackPolicy?: string;
  compensationActionType?: string;
}

export interface ActionAuthorization {
  authorizationId: string;
  actionHash: string;
  leaseId: string;
  leaseChainHash: string;
  subject: string;
  contractId: string;
  contractRevision: number;
  topologyVersion: string;
  policyVersion: string;
  preconditionSnapshotHash: string;
  targetScope: string;
  actionRisk: RiskClass;
  approvals: Approval[];
  expiresAt: string;
  nonce: string;
}

export interface ActionRecord {
  action: ActionSpec;
  actionHash: string;
  state: ActionState;
  leaseId?: string;
  authorization?: ActionAuthorization;
  precheck?: PrecheckRecord;
  lastError?: string;
  executorReceipt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  contractId: string;
  actionId?: string;
  kind: string;
  source: string;
  sourceClass: "executor" | "telemetry" | "probe" | "attestation" | "twin" | "operator";
  tenant: string;
  resource: string;
  timeWindow: [string, string];
  measurementContract: string;
  verdict: EvidenceVerdict;
  strength: number;
  artifactHash: string;
  createdAt: string;
}

export interface ResourceSnapshot {
  targetScope: string;
  topologyVersion: string;
  policyVersion: string;
  preconditionSnapshotHash: string;
  observedAt: string;
}

export interface ExecutorResult {
  status: ExecutorStatus;
  receipt?: string;
  detail?: string;
}

export interface ActionExecutor {
  ensure(action: ActionSpec, actionHash: string): Promise<ExecutorResult>;
  inspect(action: ActionSpec, actionHash: string): Promise<ExecutorResult>;
  reverse?(action: ActionSpec, actionHash: string): Promise<ExecutorResult>;
}

export interface ContractGateResult {
  status: "PASS" | "BLOCKED";
  requiredKinds: string[];
  missingKinds: string[];
  independentSources: string[];
  passStrength: number;
  conflicts: string[];
  unresolvedActions: string[];
}

export interface ProtocolAdvertisement {
  protocolVersions: string[];
  profiles: string[];
  extensions: string[];
  bindings: string[];
}

export interface NegotiatedContext {
  protocolVersion: string;
  profiles: string[];
  extensions: string[];
  binding: string;
}

export interface A6GPEnvelope<T = Record<string, unknown>> {
  protocolVersion: string;
  messageType: string;
  messageId: string;
  correlationId?: string;
  transactionId?: string;
  sender: string;
  receiver: string;
  sentAt: number;
  expiresAt: number;
  timingClass: TimingClass;
  riskClass: RiskClass;
  tenant: string;
  contractId?: string;
  contractRevision?: number;
  topologyVersion?: string;
  leaseId?: string;
  idempotencyKey?: string;
  bodyHash: string;
  hashAlg: "sha-256";
  signatureAlg: "Ed25519";
  keyId: string;
  criticalExtensions: string[];
  extensions: Record<string, unknown>;
  negotiated: NegotiatedContext;
  signature: string;
  body: T;
}

export interface PolicyArtifact {
  artifactId: string;
  artifactHash: string;
  tenant: string;
  targetScope: string;
  topologyVersion: string;
  policyVersion: string;
  timingClass: "T0" | "T1";
  validFrom: string;
  validUntil: string;
  inputEnvelope: Record<string, { min: number; max: number }>;
  actionEnvelope: Record<string, { min: number; max: number }>;
  guardConditions: string[];
  fallback: string;
  rollbackPolicy: string;
  verificationEvidence: string[];
}

export interface SagaStep {
  stepId: string;
  actionId: string;
}

export interface SagaResult {
  status: "COMPLETED" | "COMPENSATED" | "BLOCKED_RECONCILE" | "FAILED";
  applied: string[];
  reversed: string[];
  failedStep?: string;
  detail?: string;
}
