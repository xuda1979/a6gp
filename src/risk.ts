import type { RiskClass } from "./types.ts";

const ORDER: Record<RiskClass, number> = { R0: 0, R1: 1, R2: 2, R3: 3 };

export function riskAtMost(actual: RiskClass, ceiling: RiskClass): boolean {
  return ORDER[actual] <= ORDER[ceiling];
}

export function maxRisk(a: RiskClass, b: RiskClass): RiskClass {
  return ORDER[a] >= ORDER[b] ? a : b;
}

export function riskRank(risk: RiskClass): number {
  return ORDER[risk];
}
