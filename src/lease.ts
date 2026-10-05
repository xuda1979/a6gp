import { newId, sha256 } from "./canonical.ts";
import { A6GPError, invariant } from "./errors.ts";
import { riskAtMost } from "./risk.ts";
import { assertScopeSubset, assertTenantScope, scopesCover } from "./scope.ts";
import type { AgentPrincipal, AuthorityLease, RiskClass } from "./types.ts";

export interface LeaseGrantInput {
  leaseId?: string;
  subject: string;
  tenant: string;
  scope: string[];
  actionSet: string[];
  riskCeiling: RiskClass;
  validUntil: string;
  parentLeaseId?: string;
  constraints?: string[];
  nonce?: string;
}

export class AuthorityRegistry {
  private readonly principals = new Map<string, AgentPrincipal>();
  private readonly leases = new Map<string, AuthorityLease>();

  registerPrincipal(principal: AgentPrincipal): void {
    invariant(principal.status === "ACTIVE", "INVALID_INPUT", "new principal must be ACTIVE");
    this.principals.set(principal.agentId, structuredClone(principal));
  }

  principal(agentId: string): AgentPrincipal | undefined {
    const p = this.principals.get(agentId);
    return p ? structuredClone(p) : undefined;
  }

  revokePrincipal(agentId: string): void {
    const p = this.principals.get(agentId);
    invariant(p, "INVALID_INPUT", `unknown principal ${agentId}`);
    p.status = "REVOKED";
    for (const lease of this.leases.values()) {
      if (lease.subject === agentId && !lease.revokedAt) lease.revokedAt = new Date().toISOString();
    }
  }

  grant(input: LeaseGrantInput, now = new Date()): AuthorityLease {
    const principal = this.principals.get(input.subject);
    invariant(principal?.status === "ACTIVE", "AUTHORITY_MISSING", `inactive or unknown principal ${input.subject}`);
    invariant(principal.tenant === input.tenant, "TENANT_MISMATCH", "principal and lease tenant differ");
    invariant(input.scope.length > 0, "INVALID_INPUT", "lease requires at least one resource scope");
    invariant(input.actionSet.length > 0, "INVALID_INPUT", "lease requires at least one action");
    invariant(new Date(input.validUntil).getTime() > now.getTime(), "LEASE_EXPIRED", "lease must expire in the future");
    for (const scope of input.scope) assertTenantScope(input.tenant, scope);

    let parent: AuthorityLease | undefined;
    if (input.parentLeaseId) {
      parent = this.requireLive(input.parentLeaseId, now);
      invariant(parent.subject !== input.subject || parent.leaseId !== input.leaseId, "INVALID_INPUT", "lease cannot parent itself");
      invariant(parent.tenant === input.tenant, "TENANT_MISMATCH", "parent lease tenant differs");
      assertScopeSubset(parent.scope, input.scope);
      invariant(input.actionSet.every((action) => parent!.actionSet.includes(action)), "ACTION_NOT_ALLOWED", "delegated action set exceeds parent authority");
      invariant(riskAtMost(input.riskCeiling, parent.riskCeiling), "RISK_POLICY_REJECTED", "delegated risk exceeds parent ceiling");
      invariant(new Date(input.validUntil).getTime() <= new Date(parent.validUntil).getTime(), "LEASE_EXPIRED", "child lease outlives parent lease");
    }

    const issuedAt = now.toISOString();
    const base = {
      leaseId: input.leaseId ?? newId("lease"),
      subject: input.subject,
      tenant: input.tenant,
      scope: [...new Set(input.scope)].sort(),
      actionSet: [...new Set(input.actionSet)].sort(),
      riskCeiling: input.riskCeiling,
      validUntil: input.validUntil,
      parentLeaseId: parent?.leaseId,
      parentChainHash: parent?.chainHash,
      constraints: [...(input.constraints ?? [])].sort(),
      nonce: input.nonce ?? newId("nonce"),
      issuedAt,
    };
    const lease: AuthorityLease = { ...base, chainHash: sha256(base) };
    this.leases.set(lease.leaseId, lease);
    return structuredClone(lease);
  }

  revoke(leaseId: string, now = new Date()): void {
    const lease = this.leases.get(leaseId);
    invariant(lease, "AUTHORITY_MISSING", `unknown lease ${leaseId}`);
    lease.revokedAt = now.toISOString();
    for (const child of this.leases.values()) {
      if (child.parentLeaseId === leaseId && !child.revokedAt) this.revoke(child.leaseId, now);
    }
  }

  requireLive(leaseId: string, now = new Date()): AuthorityLease {
    const lease = this.leases.get(leaseId);
    invariant(lease, "AUTHORITY_MISSING", `unknown lease ${leaseId}`);
    if (lease.revokedAt) throw new A6GPError("LEASE_REVOKED", `lease ${leaseId} is revoked`);
    if (new Date(lease.validUntil).getTime() <= now.getTime()) {
      throw new A6GPError("LEASE_EXPIRED", `lease ${leaseId} expired`);
    }
    const principal = this.principals.get(lease.subject);
    invariant(principal?.status === "ACTIVE", "AUTHORITY_MISSING", `principal ${lease.subject} is not active`);
    if (lease.parentLeaseId) {
      const parent = this.requireLive(lease.parentLeaseId, now);
      invariant(parent.chainHash === lease.parentChainHash, "LEASE_CHAIN_INVALID", "parent lease chain hash drift");
      assertScopeSubset(parent.scope, lease.scope);
      invariant(lease.actionSet.every((action) => parent.actionSet.includes(action)), "LEASE_CHAIN_INVALID", "lease action chain widened");
      invariant(riskAtMost(lease.riskCeiling, parent.riskCeiling), "LEASE_CHAIN_INVALID", "lease risk chain widened");
    }
    return structuredClone(lease);
  }

  assertAction(leaseId: string, subject: string, tenant: string, targetScope: string, actionType: string, risk: RiskClass, now = new Date()): AuthorityLease {
    const lease = this.requireLive(leaseId, now);
    invariant(lease.subject === subject, "AUTHORITY_MISSING", "lease subject differs from action actor");
    invariant(lease.tenant === tenant, "TENANT_MISMATCH", "lease tenant differs from action tenant");
    assertTenantScope(tenant, targetScope);
    invariant(scopesCover(lease.scope, targetScope), "SCOPE_VIOLATION", `target ${targetScope} is outside lease scope`);
    invariant(lease.actionSet.includes(actionType), "ACTION_NOT_ALLOWED", `action ${actionType} is not allowed by lease`);
    invariant(riskAtMost(risk, lease.riskCeiling), "RISK_POLICY_REJECTED", `action ${risk} exceeds lease ceiling ${lease.riskCeiling}`);
    return lease;
  }
}
