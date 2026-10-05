import { invariant } from "./errors.ts";
import { riskAtMost } from "./risk.ts";
import { assertTenantScope, scopesCover } from "./scope.ts";
import type { IntentContract, RiskClass } from "./types.ts";

export class ContractRegistry {
  private readonly contracts = new Map<string, IntentContract>();

  create(contract: IntentContract): IntentContract {
    invariant(!this.contracts.has(contract.contractId), "INVALID_INPUT", `duplicate contract ${contract.contractId}`);
    invariant(contract.revision >= 1 && Number.isSafeInteger(contract.revision), "INVALID_INPUT", "contract revision must be a positive integer");
    invariant(contract.scope.length > 0, "INVALID_INPUT", "contract requires resource scope");
    invariant(contract.allowedActions.length > 0, "INVALID_INPUT", "contract requires allowed actions");
    invariant(contract.evidencePolicy.length > 0, "INVALID_INPUT", "contract requires evidence policy");
    invariant(contract.minimumEvidenceStrength > 0 && contract.minimumEvidenceStrength <= 1, "INVALID_INPUT", "invalid evidence strength threshold");
    invariant(Number.isSafeInteger(contract.minimumIndependentSources) && contract.minimumIndependentSources > 0, "INVALID_INPUT", "invalid independent-source threshold");
    invariant(new Date(contract.validUntil).getTime() > Date.now(), "INVALID_INPUT", "contract already expired");
    for (const scope of contract.scope) assertTenantScope(contract.tenant, scope);
    const stored: IntentContract = {
      ...structuredClone(contract),
      scope: [...new Set(contract.scope)].sort(),
      allowedActions: [...new Set(contract.allowedActions)].sort(),
      evidencePolicy: [...new Set(contract.evidencePolicy)].sort(),
      hardConstraints: [...contract.hardConstraints],
    };
    this.contracts.set(stored.contractId, stored);
    return structuredClone(stored);
  }

  get(contractId: string): IntentContract | undefined {
    const contract = this.contracts.get(contractId);
    return contract ? structuredClone(contract) : undefined;
  }

  require(contractId: string): IntentContract {
    const contract = this.contracts.get(contractId);
    invariant(contract, "INVALID_INPUT", `unknown contract ${contractId}`);
    return structuredClone(contract);
  }

  transition(contractId: string, state: IntentContract["state"]): IntentContract {
    const contract = this.contracts.get(contractId);
    invariant(contract, "INVALID_INPUT", `unknown contract ${contractId}`);
    contract.state = state;
    return structuredClone(contract);
  }

  amend(contractId: string, expectedRevision: number, patch: Partial<Omit<IntentContract, "contractId" | "revision">>): IntentContract {
    const current = this.contracts.get(contractId);
    invariant(current, "INVALID_INPUT", `unknown contract ${contractId}`);
    invariant(current.revision === expectedRevision, "CONTRACT_REVISION_STALE", "contract revision mismatch");
    const next: IntentContract = { ...current, ...structuredClone(patch), contractId, revision: expectedRevision + 1 };
    for (const scope of next.scope) assertTenantScope(next.tenant, scope);
    this.contracts.set(contractId, next);
    return structuredClone(next);
  }

  requireActive(contractId: string, now = new Date()): IntentContract {
    const contract = this.contracts.get(contractId);
    invariant(contract, "INVALID_INPUT", `unknown contract ${contractId}`);
    invariant(contract.state === "ACTIVE" || contract.state === "VERIFYING", "CONTRACT_NOT_ACTIVE", `contract ${contractId} is ${contract.state}`);
    invariant(new Date(contract.validUntil).getTime() > now.getTime(), "CONTRACT_NOT_ACTIVE", `contract ${contractId} expired`);
    return structuredClone(contract);
  }

  assertAction(contractId: string, revision: number, tenant: string, targetScope: string, actionType: string, risk: RiskClass, now = new Date()): IntentContract {
    const contract = this.requireActive(contractId, now);
    invariant(contract.revision === revision, "CONTRACT_REVISION_STALE", `action binds revision ${revision}, current is ${contract.revision}`);
    invariant(contract.tenant === tenant, "TENANT_MISMATCH", "action tenant differs from contract tenant");
    assertTenantScope(tenant, targetScope);
    invariant(scopesCover(contract.scope, targetScope), "SCOPE_VIOLATION", `target ${targetScope} is outside contract scope`);
    invariant(contract.allowedActions.includes(actionType), "ACTION_NOT_ALLOWED", `contract does not allow ${actionType}`);
    invariant(riskAtMost(risk, contract.riskClass), "RISK_POLICY_REJECTED", `action risk ${risk} exceeds contract risk ${contract.riskClass}`);
    return contract;
  }
}
