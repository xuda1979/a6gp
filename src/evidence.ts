import { invariant } from "./errors.ts";
import type { ContractGateResult, EvidenceRecord, IntentContract } from "./types.ts";

function independent(evidence: EvidenceRecord): boolean {
  return evidence.sourceClass !== "executor";
}

export class EvidenceLedger {
  private readonly records = new Map<string, EvidenceRecord>();

  append(record: EvidenceRecord): EvidenceRecord {
    invariant(!this.records.has(record.evidenceId), "INVALID_INPUT", `duplicate evidence ${record.evidenceId}`);
    invariant(record.strength >= 0 && record.strength <= 1, "INVALID_INPUT", "evidence strength must be in [0,1]");
    invariant(new Date(record.timeWindow[0]).getTime() <= new Date(record.timeWindow[1]).getTime(), "INVALID_INPUT", "invalid evidence time window");
    this.records.set(record.evidenceId, structuredClone(record));
    return structuredClone(record);
  }

  get(evidenceId: string): EvidenceRecord | undefined {
    const record = this.records.get(evidenceId);
    return record ? structuredClone(record) : undefined;
  }

  forContract(contractId: string): EvidenceRecord[] {
    return [...this.records.values()].filter((e) => e.contractId === contractId).map((e) => structuredClone(e));
  }

  forAction(actionId: string): EvidenceRecord[] {
    return [...this.records.values()].filter((e) => e.actionId === actionId).map((e) => structuredClone(e));
  }

  actionVerified(actionId: string, minimumStrength = 0.8): boolean {
    return this.forAction(actionId).some((e) => independent(e) && e.verdict === "PASS" && e.strength >= minimumStrength);
  }

  conflicts(contractId: string, minimumStrength: number): string[] {
    const byKind = new Map<string, EvidenceRecord[]>();
    for (const record of this.forContract(contractId).filter(independent)) {
      const rows = byKind.get(record.kind) ?? [];
      rows.push(record);
      byKind.set(record.kind, rows);
    }
    const conflicts: string[] = [];
    for (const [kind, rows] of byKind) {
      const pass = rows.some((r) => r.verdict === "PASS" && r.strength >= minimumStrength);
      const fail = rows.some((r) => r.verdict === "FAIL" && r.strength >= minimumStrength);
      if (pass && fail) conflicts.push(kind);
    }
    return conflicts.sort();
  }

  gate(contract: IntentContract, unresolvedActions: string[]): ContractGateResult {
    const all = this.forContract(contract.contractId);
    const independentRecords = all.filter(independent);
    const strong = independentRecords.filter((e) => e.strength >= contract.minimumEvidenceStrength);
    const conflicts = this.conflicts(contract.contractId, contract.minimumEvidenceStrength);
    const missingKinds = contract.evidencePolicy.filter((kind) =>
      !strong.some((e) => e.kind === kind && e.verdict === "PASS"),
    );
    const independentSources = [...new Set(
      strong.filter((e) => e.verdict === "PASS").map((e) => e.source),
    )].sort();
    const strengths = contract.evidencePolicy.map((kind) => Math.max(
      0,
      ...strong.filter((e) => e.kind === kind && e.verdict === "PASS").map((e) => e.strength),
    ));
    const passStrength = strengths.length ? Math.min(...strengths) : 0;
    const status = missingKinds.length === 0 && conflicts.length === 0 &&
      independentSources.length >= contract.minimumIndependentSources && unresolvedActions.length === 0
      ? "PASS" : "BLOCKED";
    return {
      status,
      requiredKinds: [...contract.evidencePolicy],
      missingKinds,
      independentSources,
      passStrength,
      conflicts,
      unresolvedActions: [...unresolvedActions].sort(),
    };
  }
}
