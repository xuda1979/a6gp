# A6GP Reference Runtime Architecture

The reference runtime implements protocol semantics without depending on any specific agent framework. Its purpose is to test A6GP invariants before a normative wire encoding is frozen.

## Planes

1. **Reasoning & Coordination** proposes plans, delegation, and candidate actions.
2. **Protocol Control** owns contracts, leases, risk/timing policy, action transactions, and completion gates.
3. **Deterministic Execution** maps authorized actions to RAN/Core/Edge adapters with idempotency and compensation.
4. **Evidence & Recovery** validates outcomes, reconciles UNKNOWN effects, resolves evidence conflicts, and records immutable episodes.

## Adapter boundary

`ProtocolRuntimeAdapter` is intentionally small. Any database/orchestrator can host A6GP if it preserves the same objective, action, evidence, and completion semantics.

## Non-negotiable invariants

- no side effect without a valid lease;
- authorization binds the exact action hash;
- duplicate commit cannot create a duplicate logical effect;
- UNKNOWN is reconciled, not blindly retried;
- delegated authority never exceeds parent authority;
- contract close requires independent evidence;
- revoked authority invalidates outstanding authorization;
- model outage must not remove deterministic fallback.
