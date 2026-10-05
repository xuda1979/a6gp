# A6GP v0.4 Conformance Test Kit

The TCK treats protocol claims as executable invariants. Missing evidence is not a pass.

## Profiles and current coverage

| Profile | Current reference-runtime coverage |
|---|---|
| A6GP-Core | contracts, lease chain, action authorization, idempotency, evidence gate, version negotiation |
| A6GP-Telecom-Control | timing/risk classes, topology/policy/precondition binding, R2/R3 precheck |
| A6GP-Federation | authority domains, R3 quorum, Saga compensation, UNKNOWN blocking |
| A6GP-Policy-Artifact | T0/T1 artifact hash, validity, topology/policy binding, input envelope, fallback |
| A6GP-Secure-Binding | Ed25519 envelope, canonical body hash, replay guard, critical extensions |

## TCK groups

1. **Authority and scope** — no lease, hierarchical containment, tenant isolation, monotonic delegation, revocation propagation.
2. **High-risk authorization** — R2/R3 precheck, R3 quorum, approval action-hash binding.
3. **Transactional execution** — duplicate commit, logical idempotency, lost ACK, UNKNOWN and reconciliation.
4. **TOCTOU resistance** — topology, policy, precondition, contract revision, principal/lease revocation.
5. **Evidence semantics** — executor self-report exclusion, independent verification, strong conflict, completion gate.
6. **Protocol binding** — version/profile negotiation, Ed25519 signature, body tamper, replay, critical extensions.
7. **Federation and fast control** — Saga compensation, ambiguous-effect blocking, T0/T1 policy envelope.

Run:

```bash
npm test
```

Full release gate:

```bash
npm run check
```

## What passing does not prove

The current TCK does not prove real 6G interoperability, production security, bounded revocation latency across WAN partitions, safe radio behavior, or standards compliance. Those require external adapters, testbeds, packet/fault injection, key infrastructure, and standards-defined wire bindings.
