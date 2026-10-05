# A6GP Implementation Guide

## 1. Keep the protocol core deterministic

Reasoning systems propose objects; deterministic code validates and owns authority. Do not put an LLM inside the lease validator, commit gate, signature verifier, idempotency ledger, or evidence gate.

## 2. Map resource scopes to real authority boundaries

Reference scopes use a hierarchical form such as:

```text
ran:operator-a/region-west/site-17/cell-3
core:operator-a/upf-west-2
edge:operator-a/cluster-5/gpu-pool-2
slice:operator-a/enterprise-A
```

Production adapters should map those logical scopes to immutable internal resource identifiers. Do not rely on display names alone.

## 3. Adapter contract

An external executor should support the semantic equivalent of:

```text
ensure(logicalActionIdentity, exactActionHash) -> SUCCEEDED | FAILED | UNKNOWN
inspect(logicalActionIdentity, exactActionHash) -> SUCCEEDED | FAILED | UNKNOWN | NOT_FOUND
reverse(exactActionIdentity) -> SUCCEEDED | FAILED | UNKNOWN
```

The stable logical idempotency identity is:

```text
(tenant, contractId, targetAuthorityDomain, idempotencyKey)
```

It intentionally excludes the original agent identity so an authorized failover agent can reconcile the same logical action.

## 4. Do not turn UNKNOWN into retry

If the transport dies after an external side effect might have occurred, persist `UNKNOWN`. Query the external system using the original logical identity. Never create a fresh idempotency key merely to make the workflow continue.

## 5. Bind authorization to mutable network context

Before COMMIT, re-check:

- contract revision;
- live lease chain and revocation state;
- exact action hash;
- topology version;
- policy version;
- precondition snapshot;
- R3 approvals;
- required precheck identity.

This protects the plan-to-act gap from stale assumptions.

## 6. Evidence must be independent enough for the risk

HTTP 200 or controller ACK proves command acceptance, not SLO achievement. R2/R3 completion should combine sources such as active probes, telemetry windows, security attestations, energy meters, and user-plane measurements.

## 7. Recommended first real adapter

For an initial RAN experiment, use an O-RAN/srsRAN-style lab and start with bounded actions such as PRB allocation, power adjustment, beam-policy parameters, handover bias, admission policy, energy mode, and model deployment. Keep the actual PHY loop deterministic.

## 8. Durable production state

The in-memory reference runtime is for semantics. Production should persist:

- principals and attestations;
- contract revisions;
- lease chains and revocations;
- action records and authorization context;
- idempotency records;
- reconciliation state;
- evidence and conflicts;
- Saga/compensation lineage;
- signed audit records.
