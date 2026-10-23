import { sha256 } from "../canonical.ts";
import { invariant } from "../errors.ts";
import type { A6GPRuntime } from "../runtime.ts";
import { actionHash } from "../transactions.ts";
import type { ActionRecord, ActionSpec } from "../types.ts";
import { authorize, fresh, type TaskAccess } from "./access.ts";
import type { ACNServiceExecutor } from "./services.ts";
import { networkTools, requireTool } from "./tools.ts";
import type { KeyObject } from "node:crypto";
import type { A6GPEnvelope, ProtocolAdvertisement } from "../types.ts";
import { EnvelopeReplayGuard } from "../wire.ts";
import { ACN_STATE_EXTENSION, verifyACNEnvelope, type NetworkStateContext } from "./context.ts";

export interface ToolCall {
  name: string;
  targetScope: string;
  arguments: Record<string, unknown>;
  idempotencyKey?: string;
}
export interface ToolResult { output?: unknown; transaction?: ActionRecord }

export class NetworkToolGateway {
  private readonly runtime: A6GPRuntime;
  private readonly services: ACNServiceExecutor;
  constructor(runtime: A6GPRuntime, services: ACNServiceExecutor) { this.runtime = runtime; this.services = services; }

  list(): Record<string, unknown>[] { return networkTools(); }

  async callEnvelope(envelope: A6GPEnvelope<ToolCall>, publicKey: KeyObject, supported: ProtocolAdvertisement, replayGuard: EnvelopeReplayGuard): Promise<ToolResult> {
    const access = verifyACNEnvelope(envelope, publicKey, supported, this.runtime, replayGuard);
    const call = envelope.body, state = envelope.extensions[ACN_STATE_EXTENSION] as NetworkStateContext;
    const tool = requireTool(call.name, call.arguments);
    invariant(envelope.messageType === "TOOL_CALL" && call.targetScope === state.targetScope,
      "AUTH_CONTEXT_STALE", "tool request differs from network context");
    invariant(envelope.riskClass === (tool.readOnly ? "R0" : "R1") && envelope.timingClass === "T2",
      "RISK_POLICY_REJECTED", "tool envelope risk/timing differs from capability policy");
    invariant(tool.readOnly || call.idempotencyKey === envelope.idempotencyKey, "AUTH_CONTEXT_STALE", "tool idempotency binding mismatch");
    return this.call(access, call);
  }

  /** Prepare is exposed for approval/inspection and lost-ACK testing. No side effects here. */
  prepare(access: TaskAccess, call: ToolCall, now = new Date()): ActionSpec {
    const tool = requireTool(call.name, call.arguments);
    invariant(!tool.readOnly, "INVALID_INPUT", "read-only capability cannot prepare a mutation");
    invariant(typeof call.idempotencyKey === "string" && call.idempotencyKey.length > 0, "INVALID_INPUT", "mutation needs a logical idempotency key");
    authorize(this.runtime, access, call.targetScope, call.name, "R1", now);
    const snapshot = this.runtime.snapshots.require(call.targetScope);
    fresh(snapshot.observedAt, this.services.resources.maxObservationAgeMs, now);
    const action: ActionSpec = {
      actionId: `acn-${sha256([access.tenant, access.contractId, access.agentId, call.targetScope, call.name, call.idempotencyKey]).slice(7)}`,
      contractId: access.contractId, contractRevision: access.contractRevision, tenant: access.tenant, actor: access.agentId,
      targetAuthorityDomain: "acn-reference", targetScope: call.targetScope, actionType: call.name,
      parameters: structuredClone(call.arguments), riskClass: "R1", timingClass: "T2", idempotencyKey: call.idempotencyKey,
      topologyVersion: snapshot.topologyVersion, policyVersion: snapshot.policyVersion, preconditionSnapshotHash: snapshot.preconditionSnapshotHash,
    };
    const existing = this.runtime.transactions.get(action.actionId);
    if (existing) invariant(existing.actionHash === actionHash(action), "IDEMPOTENCY_CONFLICT", "tool retry changed the bound action");
    else this.runtime.transactions.prepare(action, access.leaseId, undefined, now);
    return action;
  }

  async call(access: TaskAccess, call: ToolCall): Promise<ToolResult> {
    const tool = requireTool(call.name, call.arguments), p = call.arguments;
    authorize(this.runtime, access, call.targetScope, call.name, tool.readOnly ? "R0" : "R1");
    if (tool.readOnly) {
      let output: unknown;
      switch (tool.name) {
        case "acn.agent.discover":
          invariant(call.targetScope === `service:${access.tenant}/acn/directory`, "SCOPE_VIOLATION", "invalid directory scope");
          output = this.services.directory.discover(access, p.capabilities as string[] | undefined); break;
        case "acn.peer.resolve":
          invariant(call.targetScope === `service:${access.tenant}/acn/directory`, "SCOPE_VIOLATION", "invalid directory scope");
          output = this.services.directory.resolve(access, p.agentId as string); break;
        case "acn.group.read": output = this.services.resources.group(access, call.targetScope); break;
        case "acn.compute.read": output = this.services.resources.compute(access, call.targetScope); break;
        default: output = this.services.data.read(access, call.targetScope);
      }
      return { output };
    }
    const action = this.prepare(access, call);
    const record = this.runtime.transactions.get(action.actionId)!;
    if (record.state === "PREPARED") this.runtime.transactions.authorize(action.actionId);
    const transaction = record.state === "FAILED" ? record : await this.runtime.transactions.commit(action.actionId);
    return { transaction, output: transaction.state === "APPLIED" || transaction.state === "VERIFIED" ? this.services.output(action) : undefined };
  }
}

export interface TaskStep { stepId: string; dependsOn: string[]; call: ToolCall }

/** Executes structured task decomposition from any planner; validates the entire DAG before applying. */
export async function executeTaskPlan(gateway: NetworkToolGateway, access: TaskAccess, steps: TaskStep[]): Promise<{ status: "APPLIED" | "BLOCKED"; results: ToolResult[] }> {
  const pending = new Map(steps.map(s => [s.stepId, s]));
  invariant(pending.size === steps.length && steps.every(s => s.stepId && s.dependsOn.every(id => pending.has(id))), "INVALID_INPUT", "invalid task dependency graph");
  for (const step of steps) requireTool(step.call.name, step.call.arguments);
  const order: TaskStep[] = [], done = new Set<string>();
  while (pending.size) {
    const ready = [...pending.values()].filter(s => s.dependsOn.every(id => done.has(id)));
    invariant(ready.length > 0, "INVALID_INPUT", "cyclic task dependency graph");
    for (const step of ready) { order.push(step); done.add(step.stepId); pending.delete(step.stepId); }
  }
  const results: ToolResult[] = [];
  for (const step of order) {
    const result = await gateway.call(access, step.call); results.push(result);
    if (result.transaction && !["APPLIED", "VERIFIED"].includes(result.transaction.state)) return { status: "BLOCKED", results };
  }
  return { status: "APPLIED", results };
}
