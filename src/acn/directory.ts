import { sha256 } from "../canonical.ts";
import { invariant } from "../errors.ts";
import type { A6GPRuntime } from "../runtime.ts";
import { authorize, type TaskAccess } from "./access.ts";

export interface AgentDescriptor {
  vendor: string;
  endpoint: string;
  protocols: string[];
  capabilities: string[];
}

export interface AgentRegistration extends AgentDescriptor {
  agentId: string;
  expiresAt: string;
}

export function descriptorHash(descriptor: AgentDescriptor): string {
  return sha256({ vendor: descriptor.vendor, endpoint: descriptor.endpoint,
    protocols: [...descriptor.protocols].sort(), capabilities: [...descriptor.capabilities].sort() });
}

export class AgentDirectory {
  private readonly runtime: A6GPRuntime;
  private readonly entries = new Map<string, AgentRegistration>();
  private readonly agreements = new Set<string>();

  constructor(runtime: A6GPRuntime) { this.runtime = runtime; }

  /** Control-plane provisioning: the identity/key/user mapping must already be authenticated. */
  register(entry: AgentRegistration, now = new Date()): void {
    const principal = this.runtime.authority.principal(entry.agentId);
    invariant(principal?.status === "ACTIVE", "AUTHORITY_MISSING", "registration needs an active identity");
    invariant(descriptorHash(entry) === principal.capabilityDescriptorHash, "AUTH_HASH_MISMATCH", "descriptor differs from identity binding");
    invariant(entry.vendor.length > 0 && entry.capabilities.length > 0 && entry.protocols.length > 0, "INVALID_INPUT", "incomplete capability descriptor");
    const url = new URL(entry.endpoint);
    invariant(url.protocol === "https:" && !url.username && !url.password, "INVALID_INPUT", "peer endpoint requires HTTPS without embedded credentials");
    invariant(Date.parse(entry.expiresAt) > now.getTime(), "AUTH_EXPIRED", "registration expired");
    this.entries.set(entry.agentId, structuredClone(entry));
  }

  /** A directional agreement represents local operator approval, not inferred reachability. */
  allowDomain(tenant: string, from: string, to: string): void {
    this.agreements.add(JSON.stringify([tenant, from, to]));
  }

  peer(access: TaskAccess, agentId: string, now = new Date()): AgentRegistration {
    authorize(this.runtime, access, `service:${access.tenant}/acn/directory`, "acn.peer.resolve", "R0", now);
    const caller = this.runtime.authority.principal(access.agentId);
    const principal = this.runtime.authority.principal(agentId);
    const entry = this.entries.get(agentId);
    invariant(caller?.status === "ACTIVE" && principal?.status === "ACTIVE", "AUTHORITY_MISSING", "peer identity is inactive");
    invariant(caller.tenant === access.tenant && principal.tenant === access.tenant, "TENANT_MISMATCH", "peer belongs to another tenant");
    invariant(entry && Date.parse(entry.expiresAt) > now.getTime(), "AUTH_EXPIRED", "peer registration missing or expired");
    invariant(caller.operatorDomain === principal.operatorDomain || this.agreements.has(JSON.stringify([access.tenant, caller.operatorDomain, principal.operatorDomain])), "SCOPE_VIOLATION", "no cross-domain peering agreement");
    return structuredClone(entry);
  }

  discover(access: TaskAccess, requiredCapabilities: string[] = [], now = new Date()): AgentRegistration[] {
    authorize(this.runtime, access, `service:${access.tenant}/acn/directory`, "acn.agent.discover", "R0", now);
    invariant(Array.isArray(requiredCapabilities) && requiredCapabilities.every(x => typeof x === "string"), "INVALID_INPUT", "invalid capability query");
    const found: AgentRegistration[] = [];
    for (const entry of this.entries.values()) {
      if (!requiredCapabilities.every(c => entry.capabilities.includes(c))) continue;
      const p = this.runtime.authority.principal(entry.agentId);
      const caller = this.runtime.authority.principal(access.agentId)!;
      if (p?.status !== "ACTIVE" || p.tenant !== access.tenant || Date.parse(entry.expiresAt) <= now.getTime()) continue;
      if (p.operatorDomain !== caller.operatorDomain && !this.agreements.has(JSON.stringify([access.tenant, caller.operatorDomain, p.operatorDomain]))) continue;
      found.push(structuredClone(entry));
    }
    return found.sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  resolve(access: TaskAccess, agentId: string, now = new Date()): AgentRegistration {
    authorize(this.runtime, access, `service:${access.tenant}/acn/directory`, "acn.peer.resolve", "R0", now);
    return this.peer(access, agentId, now);
  }
}
