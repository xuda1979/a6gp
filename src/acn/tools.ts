import { invariant } from "../errors.ts";
import { canonical } from "../canonical.ts";

type Field = { type: "string" | "number" | "array" | "object"; required?: boolean };
export interface NetworkTool {
  name: string;
  description: string;
  readOnly: boolean;
  fields: Record<string, Field>;
}
const field = (type: Field["type"], required = true): Field => ({ type, required });
const TOOLS: NetworkTool[] = [
  { name: "acn.agent.discover", description: "Discover live, authorized agent capabilities", readOnly: true, fields: { capabilities: field("array", false) } },
  { name: "acn.peer.resolve", description: "Resolve a tenant/domain-authorized HTTPS peer endpoint", readOnly: true, fields: { agentId: field("string") } },
  { name: "acn.group.configure", description: "Create or revise task group and reserve directional QoS capacity", readOnly: false,
    fields: { expectedRevision: field("number"), members: field("array"), linkScope: field("string"), modalities: field("array"), direction: field("string"), qos: field("object") } },
  { name: "acn.group.read", description: "Inspect a live task group", readOnly: true, fields: {} },
  { name: "acn.group.release", description: "Release group bandwidth with revision check", readOnly: false, fields: { expectedRevision: field("number") } },
  { name: "acn.compute.reserve", description: "Jointly admit communication and compute within deadline/cost limits", readOnly: false,
    fields: Object.fromEntries(["workUnits", "computeUnits", "memoryMb", "uploadMbit", "downloadMbit", "uplinkMbps", "downlinkMbps", "deadlineMs", "maxCost"].map(k => [k, field("number")])) },
  { name: "acn.compute.read", description: "Inspect a compute reservation and predicted latency", readOnly: true, fields: {} },
  { name: "acn.compute.release", description: "Release joint compute and link reservation", readOnly: false, fields: {} },
  { name: "acn.data.capture", description: "Capture bounded multimodal data with hash and retention", readOnly: false,
    fields: { payloadBase64: field("string"), modality: field("string"), retentionUntil: field("string") } },
  { name: "acn.data.process", description: "Redact named top-level JSON fields and record lineage", readOnly: false,
    fields: { expectedRevision: field("number"), transform: field("string"), removeFields: field("array") } },
  { name: "acn.data.store", description: "Mark captured/processed data stored in the reference store", readOnly: false, fields: { expectedRevision: field("number") } },
  { name: "acn.data.share", description: "Replace data ACL with active same-tenant reader identities", readOnly: false, fields: { expectedRevision: field("number"), readerIds: field("array") } },
  { name: "acn.data.delete", description: "Delete payload, revoke readers and retain identity tombstone", readOnly: false, fields: { expectedRevision: field("number") } },
  { name: "acn.data.read", description: "Read retained bytes subject to task lease and data ACL", readOnly: true, fields: {} },
];

export const ACN_OPERATIONS = TOOLS.map(t => t.name);

export function requireTool(name: string, args: Record<string, unknown>): NetworkTool {
  const tool = TOOLS.find(t => t.name === name);
  invariant(tool, "ACTION_NOT_ALLOWED", `unknown network capability ${name}`);
  invariant(args && typeof args === "object" && !Array.isArray(args), "INVALID_INPUT", "tool arguments require an object");
  invariant(Object.keys(args).every(k => Object.hasOwn(tool.fields, k)), "INVALID_INPUT", "unknown tool argument");
  try { canonical(args); } catch { invariant(false, "INVALID_INPUT", "tool arguments must contain finite JSON values"); }
  for (const [key, spec] of Object.entries(tool.fields)) {
    const value = args[key];
    if (value === undefined && !spec.required) continue;
    invariant(spec.type === "array" ? Array.isArray(value) : spec.type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
      : typeof value === spec.type, "INVALID_INPUT", `invalid tool argument ${key}`);
    if (spec.type === "number") invariant(typeof value === "number" && Number.isFinite(value), "INVALID_INPUT", `non-finite argument ${key}`);
  }
  return structuredClone(tool);
}

/** MCP-compatible descriptors; transport authentication/initialization belongs to the host. */
export function networkTools(): Record<string, unknown>[] {
  return TOOLS.map(t => ({ name: t.name, description: t.description,
    inputSchema: { type: "object", additionalProperties: false,
      required: Object.entries(t.fields).filter(([, f]) => f.required).map(([key]) => key),
      properties: Object.fromEntries(Object.entries(t.fields).map(([key, f]) => [key, { type: f.type }])) },
    annotations: { readOnlyHint: t.readOnly, idempotentHint: true } }));
}
