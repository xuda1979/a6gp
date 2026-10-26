import { A6GPError, invariant } from "../errors.ts";
import { NetworkToolGateway } from "./gateway.ts";
import type { TaskAccess } from "./access.ts";

/** Tool-message bridge only. A host MCP server owns initialize, transport, authentication and keys. */
export async function handleNetworkToolRPC(gateway: NetworkToolGateway, access: TaskAccess, request: {
  jsonrpc: string; id: string | number; method: string;
  params?: { name?: string; arguments?: Record<string, unknown>; _meta?: { a6gp?: { targetScope?: string; idempotencyKey?: string } } };
}): Promise<Record<string, unknown>> {
  try {
    if (request.jsonrpc !== "2.0" || !(typeof request.id === "string" || typeof request.id === "number")) {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
    }
    if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools: gateway.list() } };
    if (request.method !== "tools/call") return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } };
    const p = request.params, meta = p?._meta?.a6gp;
    invariant(typeof p?.name === "string" && typeof meta?.targetScope === "string", "INVALID_INPUT", "missing tool name or A6GP resource context");
    const output = await gateway.call(access, { name: p.name, targetScope: meta.targetScope, arguments: p.arguments ?? {}, idempotencyKey: meta.idempotencyKey });
    const isError = output.transaction !== undefined && !["APPLIED", "VERIFIED"].includes(output.transaction.state);
    return { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output, isError } };
  } catch (error) {
    if (!(error instanceof A6GPError)) throw error;
    if (error.code === "INVALID_INPUT" || error.code === "ACTION_NOT_ALLOWED") return { jsonrpc: "2.0", id: request.id, error: { code: -32602, message: error.message } };
    return { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: `${error.code}: ${error.message}` }], isError: true } };
  }
}
