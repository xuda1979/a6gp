import { invariant } from "../errors.ts";
import type { TaskAccess } from "./access.ts";
import type { AgentRegistration } from "./directory.ts";
import type { DataCapture } from "./data.ts";
import { NetworkToolGateway, type TaskStep } from "./gateway.ts";
import type { GroupRequest, OffloadRequest } from "./resources.ts";

export interface CollaborationIntent {
  planId: string;
  requiredCapabilities: string[];
  memberCount: number;
  groupScope: string;
  group: Omit<GroupRequest, "members">;
  compute?: { scope: string; request: OffloadRequest };
  data?: { scope: string; capture: DataCapture; redactFields: string[] };
}

/** Deterministic structured-intent planner. An external LLM can propose this input; it grants no authority. */
export async function planCollaborationTask(gateway: NetworkToolGateway, access: TaskAccess, intent: CollaborationIntent): Promise<TaskStep[]> {
  invariant(intent.planId && Number.isSafeInteger(intent.memberCount) && intent.memberCount >= 2, "INVALID_INPUT", "invalid collaboration intent");
  const discovery = await gateway.call(access, { name: "acn.agent.discover", targetScope: `service:${access.tenant}/acn/directory`, arguments: { capabilities: intent.requiredCapabilities } });
  const peers = discovery.output as AgentRegistration[];
  invariant(peers.length >= intent.memberCount, "PRECONDITION_FAILED", "not enough authorized peers for task");
  const members = peers.slice(0, intent.memberCount).map(p => p.agentId);
  const steps: TaskStep[] = [{ stepId: "group", dependsOn: [], call: { name: "acn.group.configure", targetScope: intent.groupScope,
    arguments: { ...intent.group, members }, idempotencyKey: `${intent.planId}/group` } }];
  if (intent.compute) steps.push({ stepId: "compute", dependsOn: ["group"], call: { name: "acn.compute.reserve", targetScope: intent.compute.scope,
    arguments: { ...intent.compute.request }, idempotencyKey: `${intent.planId}/compute` } });
  if (intent.data) {
    const data = intent.data;
    steps.push({ stepId: "capture", dependsOn: ["group"], call: { name: "acn.data.capture", targetScope: data.scope, arguments: { ...data.capture }, idempotencyKey: `${intent.planId}/capture` } },
      { stepId: "process", dependsOn: ["capture"], call: { name: "acn.data.process", targetScope: data.scope, arguments: { expectedRevision: 1, transform: "json-redact", removeFields: data.redactFields }, idempotencyKey: `${intent.planId}/process` } },
      { stepId: "store", dependsOn: ["process"], call: { name: "acn.data.store", targetScope: data.scope, arguments: { expectedRevision: 2 }, idempotencyKey: `${intent.planId}/store` } },
      { stepId: "share", dependsOn: ["store"], call: { name: "acn.data.share", targetScope: data.scope, arguments: { expectedRevision: 3, readerIds: members }, idempotencyKey: `${intent.planId}/share` } });
  }
  return steps;
}
