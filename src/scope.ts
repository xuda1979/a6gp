import { A6GPError, invariant } from "./errors.ts";

export interface ParsedScope {
  namespace: string;
  tenant: string;
  path: string[];
}

export function parseScope(scope: string): ParsedScope {
  const colon = scope.indexOf(":");
  invariant(colon > 0, "INVALID_INPUT", `invalid resource scope: ${scope}`);
  const namespace = scope.slice(0, colon);
  const rest = scope.slice(colon + 1);
  const [tenant, ...path] = rest.split("/").filter(Boolean);
  invariant(Boolean(tenant), "INVALID_INPUT", `resource scope has no tenant: ${scope}`);
  invariant(/^[A-Za-z0-9._-]+$/.test(namespace), "INVALID_INPUT", `invalid namespace: ${namespace}`);
  invariant(/^[A-Za-z0-9._-]+$/.test(tenant), "INVALID_INPUT", `invalid tenant: ${tenant}`);
  for (const segment of path) {
    invariant(/^[A-Za-z0-9._:@=-]+$/.test(segment), "INVALID_INPUT", `invalid scope segment: ${segment}`);
  }
  return { namespace, tenant, path };
}

export function scopeContains(parent: string, child: string): boolean {
  const p = parseScope(parent);
  const c = parseScope(child);
  if (p.namespace !== c.namespace || p.tenant !== c.tenant) return false;
  if (p.path.length > c.path.length) return false;
  return p.path.every((segment, i) => c.path[i] === segment);
}

export function scopesCover(parents: readonly string[], child: string): boolean {
  return parents.some((parent) => scopeContains(parent, child));
}

export function assertTenantScope(tenant: string, scope: string): void {
  const parsed = parseScope(scope);
  if (parsed.tenant !== tenant) {
    throw new A6GPError("TENANT_MISMATCH", `scope ${scope} is not owned by tenant ${tenant}`);
  }
}

export function assertScopeSubset(parentScopes: readonly string[], childScopes: readonly string[]): void {
  for (const child of childScopes) {
    invariant(scopesCover(parentScopes, child), "SCOPE_VIOLATION", `delegated scope ${child} exceeds parent authority`);
  }
}
