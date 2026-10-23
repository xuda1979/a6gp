# ACN Services v1 integration

The optional ACN extension adds executable network-for-agent services and a structured agent-for-network orchestration path on the v0.4 safety core. Package version: `0.4.1`. The source requirement mapping and limitations are in [ACN_REQUIREMENTS_CN.md](ACN_REQUIREMENTS_CN.md).

## Components

| Component | Responsibility |
|---|---|
| `AgentDirectory` | Identity-bound multi-vendor descriptors, capability discovery, registration expiry, tenant isolation, directional domain peering |
| `ResourceServices` | Task groups, revision checks, directional bandwidth accounting shared with compute, QoS degradation reporting, joint compute admission |
| `DataService` | Bounded payload capture, top-level JSON redaction, hash lineage, storage/sharing lifecycle, task leases plus reader ACLs, retention and deletion |
| `NetworkToolGateway` | Fourteen typed capabilities; prepare/authorize/commit for effects; signed-envelope entry point |
| `planCollaborationTask` / `executeTaskPlan` | Deterministic structured-intent decomposition, DAG validation, dependency ordering, stop on failure/UNKNOWN |
| `verifyACNEnvelope` | Identity/key/task binding, critical extension negotiation, fresh network state, topology/policy/precondition binding, replay rejection |
| `handleNetworkToolRPC` | MCP tools-message bridge for a host-owned authenticated transport |

Use `createACNRuntime(existingExecutor?)`, provision identities and descriptors through the trusted control plane, activate a contract, and grant a lease with `contractId`. Observe link/node telemetry and target snapshots, then call the gateway with a host-created `TaskAccess`. The complete executable configuration is [examples/acn-lab.ts](../examples/acn-lab.ts).

```ts
const { runtime, services } = createACNRuntime(existingRANExecutor);
const gateway = new NetworkToolGateway(runtime, services);
// Provision trusted identity, contract, task lease and resource observations first.
const result = await gateway.call(authenticatedTaskContext, {
  name: "acn.compute.reserve",
  targetScope: "compute:operator-a/acn/job-1",
  idempotencyKey: "task-window-1/compute",
  arguments: {
    workUnits: 20, computeUnits: 4, memoryMb: 1024,
    uploadMbit: 0.1, downloadMbit: 0.1, uplinkMbps: 10, downlinkMbps: 20,
    deadlineMs: 50, maxCost: 1,
  },
});
```

## Admission model and units

`workUnits` is compute-unit milliseconds; `computeUnits` is the requested parallel resource reservation. `uploadMbit`/`downloadMbit` are megabits and directional capacity is Mbps. Node cost is abstract cost units per compute-unit millisecond, not a currency quote.

```
predictedTotalMs = link.latencyMs + link.jitterMs + node.queueMs
                 + workUnits / computeUnits
                 + 1000 * (uploadMbit / uplinkMbps + downloadMbit / downlinkMbps)
predictedCost = workUnits * costPerUnitMs
```

The model treats `link.latencyMs` as aggregate fixed communication overhead. It assumes reserved-rate serialization and excludes contention beyond the supplied queue estimate. Select the fastest feasible authorized fresh node, then lowest cost, then stable scope ordering. Both the candidate node and its link must lie within the task contract and lease. The reservation must fit the remaining task/lease lifetime.

Group uplink/downlink values represent aggregate group reservation on one abstract shared link. This is not per-member multicast-tree allocation. QoS admission checks latency plus jitter, jitter, loss and synchronization skew against fresh observations. Reads report `DEGRADED` when fresh observations or remaining capacity violate the admitted bounds. Explicitly authorized updates can reconfigure the group. Updates replace the old reservation atomically; released groups retain revision tombstones.

Resource effects are synchronous within one process; concurrent proposals serialize at the mutation boundary. This does not implement distributed consensus or durable reservations. Expired reservations stop consuming admission capacity. Revocation blocks further operations and leaves existing reservations conservatively allocated until expiry or explicit operator recovery.

## Data and authority

Capture accepts canonical base64, supports seven modality labels, and limits each payload to 1 MiB and total active payloads to 16 MiB. `json-redact` removes explicitly named top-level JSON keys and records the previous content hash. It does not perform general privacy classification. Hashes use A6GP canonical JSON SHA-256 of the base64 representation, not a raw-byte digest. Store is an in-memory lifecycle transition. Sharing replaces the active same-tenant reader list. Retention cleanup is lazy on data access/mutation and keeps metadata tombstones; it is not a durable retention service.

ACN operations require explicitly task-bound leases. Delegated leases inherit a parent's task binding; they cannot replace it. Legacy unbound leases continue to work on the original core paths. Resource service mutations additionally require the matching transaction in `COMMITTING`; authorized arguments, scope, risk/timing class and current snapshot age are checked before applying. Registration, key/user mappings, peering agreements and telemetry ingestion are trusted host administration operations. Expose none of these as anonymous agent tools.

`APPLIED` acknowledges service state mutation, not objective success. Contract completion still requires independent evidence through the original gate. For an unknown acknowledgement, inspect/reconcile the original action; a retry must not create a new effect. A failed plan preserves earlier applied steps for inspection and explicitly authorized cleanup; no automatic compensation is claimed.

## Wire and host integration

ACN envelopes must negotiate and mark critical both `ext.acn.services.v1` and `ext.acn.network-state.v1`. For mutations, use `TOOL_CALL`, R1/T2, the same body/envelope idempotency key and the target scope from the signed state context. `callEnvelope` validates these bindings and then enters the gateway. The host supplies a trusted principal-to-public-key lookup; a matching `keyId` string alone is insufficient key management.

The MCP bridge returns tool descriptors, JSON-RPC method/parameter errors and structured tool results. It is a tools-message adapter, not a standalone MCP server or A2A transport. The host must supply initialization, transport, authentication, key lookup and session governance. It should route signed external A6GP calls through `callEnvelope`, rather than construct `TaskAccess` from untrusted request fields.

## Verification

`npm run check` checks schema syntax, catalog/schema consistency, all original and ACN tests, stadium and lost-ACK examples, and the ACN collaboration example. The new demo's 25 ms result is a prediction from synthetic inputs. No RAN benchmark, actual inference job, WAN reachability, real-time guarantee, production security certification or standards conformance result is claimed.
