import { newId } from "./canonical.ts";
import { A6GPError } from "./errors.ts";
import type { ActionExecutor, ActionSpec, ExecutorResult } from "./types.ts";

interface EffectRecord {
  actionHash: string;
  receipt: string;
  reversed: boolean;
}

function logicalKey(action: ActionSpec): string {
  return [action.tenant, action.contractId, action.targetAuthorityDomain, action.idempotencyKey].join("|");
}

export class InMemoryIdempotentExecutor implements ActionExecutor {
  private readonly effects = new Map<string, EffectRecord>();
  private readonly lostAckOnce = new Set<string>();
  private readonly failOnce = new Set<string>();
  private physicalApplyCount = 0;

  injectLostAckFor(action: ActionSpec): void {
    this.lostAckOnce.add(logicalKey(action));
  }

  injectFailureFor(action: ActionSpec): void {
    this.failOnce.add(logicalKey(action));
  }

  applyCount(): number {
    return this.physicalApplyCount;
  }

  async ensure(action: ActionSpec, actionHash: string): Promise<ExecutorResult> {
    const key = logicalKey(action);
    const existing = this.effects.get(key);
    if (existing) {
      if (existing.actionHash !== actionHash) {
        throw new A6GPError("IDEMPOTENCY_CONFLICT", "same logical idempotency key is bound to a different action hash");
      }
      return { status: existing.reversed ? "FAILED" : "SUCCEEDED", receipt: existing.receipt };
    }
    if (this.failOnce.delete(key)) return { status: "FAILED", detail: "injected executor failure" };

    const receipt = newId("receipt");
    this.effects.set(key, { actionHash, receipt, reversed: false });
    this.physicalApplyCount += 1;
    if (this.lostAckOnce.delete(key)) {
      return { status: "UNKNOWN", detail: "effect applied but acknowledgement intentionally lost" };
    }
    return { status: "SUCCEEDED", receipt };
  }

  async inspect(action: ActionSpec, actionHash: string): Promise<ExecutorResult> {
    const existing = this.effects.get(logicalKey(action));
    if (!existing) return { status: "NOT_FOUND" };
    if (existing.actionHash !== actionHash) {
      throw new A6GPError("IDEMPOTENCY_CONFLICT", "stored logical effect has a different action hash");
    }
    return { status: existing.reversed ? "FAILED" : "SUCCEEDED", receipt: existing.receipt };
  }

  async reverse(action: ActionSpec, actionHash: string): Promise<ExecutorResult> {
    const existing = this.effects.get(logicalKey(action));
    if (!existing) return { status: "NOT_FOUND" };
    if (existing.actionHash !== actionHash) {
      throw new A6GPError("IDEMPOTENCY_CONFLICT", "cannot reverse a different action under the same logical key");
    }
    existing.reversed = true;
    return { status: "SUCCEEDED", receipt: existing.receipt };
  }
}
