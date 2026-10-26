import { newId } from "../canonical.ts";
import { A6GPError, invariant } from "../errors.ts";
import { A6GPRuntime } from "../runtime.ts";
import { actionHash } from "../transactions.ts";
import type { ActionExecutor, ActionSpec, ExecutorResult } from "../types.ts";
import { AgentDirectory } from "./directory.ts";
import { DataService, type DataCapture } from "./data.ts";
import { ResourceServices, type GroupRequest, type OffloadRequest } from "./resources.ts";
import { requireTool } from "./tools.ts";
import type { TaskAccess } from "./access.ts";

interface Effect { hash: string; receipt: string; output: unknown }
const logicalKey = (a: ActionSpec) => JSON.stringify([a.tenant, a.contractId, a.targetAuthorityDomain, a.idempotencyKey]);

export class ACNServiceExecutor implements ActionExecutor {
  private runtime?: A6GPRuntime;
  private fallback?: ActionExecutor;
  private readonly effects = new Map<string, Effect>();
  private readonly lostAck = new Set<string>();
  private effectsApplied = 0;
  directory!: AgentDirectory;
  resources!: ResourceServices;
  data!: DataService;

  constructor(fallback?: ActionExecutor) { this.fallback = fallback; }

  bind(runtime: A6GPRuntime): void {
    invariant(!this.runtime, "INVALID_STATE", "ACN executor already bound");
    this.runtime = runtime;
    this.directory = new AgentDirectory(runtime);
    this.resources = new ResourceServices(runtime, this.directory);
    this.data = new DataService(runtime);
  }

  injectLostAck(actionId: string): void { this.lostAck.add(actionId); }
  applyCount(): number { return this.effectsApplied; }

  output(action: ActionSpec): unknown { return structuredClone(this.effects.get(logicalKey(action))?.output); }

  async ensure(action: ActionSpec, hash: string): Promise<ExecutorResult> {
    if (!action.actionType.startsWith("acn.")) {
      invariant(this.fallback, "ACTION_NOT_ALLOWED", "no external network adapter installed");
      return this.fallback.ensure(action, hash);
    }
    invariant(this.runtime && hash === actionHash(action), "AUTH_HASH_MISMATCH", "executor action hash mismatch");
    const tx = this.runtime.transactions.get(action.actionId);
    invariant(tx?.state === "COMMITTING" && tx.actionHash === hash && tx.authorization, "AUTHORITY_MISSING", "ACN effect requires a committing transaction");
    const existing = this.effects.get(logicalKey(action));
    if (existing) {
      invariant(existing.hash === hash, "IDEMPOTENCY_CONFLICT", "logical service effect is already bound to another action");
      return { status: "SUCCEEDED", receipt: existing.receipt };
    }
    const access: TaskAccess = { agentId: action.actor, tenant: action.tenant, contractId: action.contractId,
      contractRevision: action.contractRevision, leaseId: tx.authorization.leaseId, actionId: action.actionId };
    let output: unknown;
    try {
      const tool = requireTool(action.actionType, action.parameters);
      invariant(!tool.readOnly, "ACTION_NOT_ALLOWED", "read-only tool is not an effect");
      const p = action.parameters, now = new Date();
      switch (tool.name) {
        case "acn.group.configure": output = this.resources.configureGroup(access, action.targetScope, p as unknown as GroupRequest, now); break;
        case "acn.group.release": output = this.resources.releaseGroup(access, action.targetScope, p.expectedRevision as number, now); break;
        case "acn.compute.reserve": output = this.resources.reserveCompute(access, action.targetScope, p as unknown as OffloadRequest, now); break;
        case "acn.compute.release": output = this.resources.releaseCompute(access, action.targetScope, now); break;
        case "acn.data.capture": output = this.data.capture(access, action.targetScope, p as unknown as DataCapture, now); break;
        default: output = this.data.mutate(access, action.targetScope, tool.name, p, now);
      }
    } catch (error) {
      // Built-in handlers validate before their synchronous resource mutation; rejection has no external effect.
      if (error instanceof A6GPError || error instanceof SyntaxError || error instanceof TypeError) return { status: "FAILED", detail: error.message };
      throw error;
    }
    const receipt = newId("acn-receipt");
    this.effects.set(logicalKey(action), { hash, receipt, output: structuredClone(output) }); this.effectsApplied += 1;
    if (this.lostAck.delete(action.actionId)) return { status: "UNKNOWN", detail: "service applied; injected lost acknowledgement" };
    return { status: "SUCCEEDED", receipt };
  }

  async inspect(action: ActionSpec, hash: string): Promise<ExecutorResult> {
    if (!action.actionType.startsWith("acn.")) {
      invariant(this.fallback, "ACTION_NOT_ALLOWED", "no external network adapter installed");
      return this.fallback.inspect(action, hash);
    }
    const effect = this.effects.get(logicalKey(action));
    if (!effect) return { status: "NOT_FOUND" };
    invariant(effect.hash === hash, "IDEMPOTENCY_CONFLICT", "stored effect has a different hash");
    return { status: "SUCCEEDED", receipt: effect.receipt };
  }

  async reverse(action: ActionSpec, hash: string): Promise<ExecutorResult> {
    if (action.actionType.startsWith("acn.")) return { status: "FAILED", detail: "use an explicitly authorized release/delete action" };
    invariant(this.fallback?.reverse, "COMPENSATION_FAILED", "external adapter has no compensation");
    return this.fallback.reverse(action, hash);
  }
}

export function createACNRuntime(fallback?: ActionExecutor): { runtime: A6GPRuntime; services: ACNServiceExecutor } {
  const services = new ACNServiceExecutor(fallback);
  const runtime = new A6GPRuntime(services);
  services.bind(runtime);
  return { runtime, services };
}
