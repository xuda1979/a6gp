import { ActionTransactionManager } from "./transactions.ts";
import type { SagaResult, SagaStep } from "./types.ts";

export class SagaCoordinator {
  private readonly transactions: ActionTransactionManager;

  constructor(transactions: ActionTransactionManager) {
    this.transactions = transactions;
  }

  async run(steps: SagaStep[]): Promise<SagaResult> {
    const applied: string[] = [];
    const reversed: string[] = [];
    for (const step of steps) {
      let result;
      try {
        result = await this.transactions.commit(step.actionId);
      } catch (error) {
        return this.compensate(applied, reversed, step.stepId, error instanceof Error ? error.message : String(error));
      }
      if (result.state === "UNKNOWN" || result.state === "UNRESOLVED" || result.state === "RECONCILING") {
        return {
          status: "BLOCKED_RECONCILE",
          applied,
          reversed,
          failedStep: step.stepId,
          detail: `action ${step.actionId} has ambiguous external outcome`,
        };
      }
      if (result.state !== "APPLIED" && result.state !== "VERIFYING" && result.state !== "VERIFIED") {
        return this.compensate(applied, reversed, step.stepId, `action ${step.actionId} ended in ${result.state}`);
      }
      applied.push(step.actionId);
    }
    return { status: "COMPLETED", applied, reversed };
  }

  private async compensate(applied: string[], reversed: string[], failedStep: string, detail: string): Promise<SagaResult> {
    for (const actionId of [...applied].reverse()) {
      try {
        const result = await this.transactions.reverse(actionId);
        if (result.state === "REVERSED") reversed.push(actionId);
        else return { status: "FAILED", applied, reversed, failedStep, detail: `compensation for ${actionId} ended in ${result.state}` };
      } catch (error) {
        return { status: "FAILED", applied, reversed, failedStep, detail: `compensation for ${actionId} failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    return { status: "COMPENSATED", applied, reversed, failedStep, detail };
  }
}
