import { ContractRegistry } from "./contracts.ts";
import { EvidenceLedger } from "./evidence.ts";
import { invariant } from "./errors.ts";
import { AuthorityRegistry } from "./lease.ts";
import { ResourceSnapshotRegistry } from "./snapshots.ts";
import { ActionTransactionManager } from "./transactions.ts";
import type {
  ActionExecutor,
  AgentPrincipal,
  AuthorityLease,
  ContractGateResult,
  EvidenceRecord,
  IntentContract,
  ResourceSnapshot,
} from "./types.ts";

export class A6GPRuntime {
  readonly contracts = new ContractRegistry();
  readonly authority = new AuthorityRegistry();
  readonly snapshots = new ResourceSnapshotRegistry();
  readonly evidence = new EvidenceLedger();
  readonly transactions: ActionTransactionManager;

  constructor(executor: ActionExecutor) {
    this.transactions = new ActionTransactionManager(
      this.contracts,
      this.authority,
      this.snapshots,
      this.evidence,
      executor,
    );
  }

  registerPrincipal(principal: AgentPrincipal): void {
    this.authority.registerPrincipal(principal);
  }

  createAndActivateContract(contract: IntentContract): IntentContract {
    this.contracts.create(contract);
    if (contract.state !== "ACTIVE") this.contracts.transition(contract.contractId, "ACTIVE");
    return this.contracts.require(contract.contractId);
  }

  grantLease(input: Parameters<AuthorityRegistry["grant"]>[0]): AuthorityLease {
    return this.authority.grant(input);
  }

  observe(snapshot: ResourceSnapshot): void {
    this.snapshots.set(snapshot);
  }

  appendEvidence(record: EvidenceRecord): EvidenceRecord {
    const contract = this.contracts.require(record.contractId);
    invariant(contract.tenant === record.tenant, "TENANT_MISMATCH", "evidence tenant differs from contract tenant");
    return this.evidence.append(record);
  }

  objectiveGate(contractId: string): ContractGateResult {
    const contract = this.contracts.require(contractId);
    const unresolved = this.transactions.forContract(contractId)
      .filter((record) => !["VERIFIED", "REVERSED", "FAILED", "REJECTED"].includes(record.state))
      .map((record) => record.action.actionId);
    return this.evidence.gate(contract, unresolved);
  }

  closeContract(contractId: string): IntentContract {
    const gate = this.objectiveGate(contractId);
    invariant(gate.status === "PASS", "EVIDENCE_MISSING", "contract completion gate is blocked", { gate });
    return this.contracts.transition(contractId, "COMPLETED");
  }
}
