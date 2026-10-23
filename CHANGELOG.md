# Changelog

## 0.4.1 — 2026-10-23

- implemented optional ACN Services v1 from the supplied ACN presentation: governed discovery, dynamic groups and QoS, shared network/compute admission, data lifecycle, task planning and tool-message integration;
- added explicitly task-bound leases with inherited delegation and action checks at prepare/authorize/commit; prevented identity/lease ID overwrite;
- added critical signed fresh network-state contexts, guarded service effects, revision tombstones and group degradation reporting;
- added 46 ACN tests, a six-step synthetic collaboration demo and catalog/schema consistency checks for 14 tools;
- updated the Chinese progress report and documented source traceability, units, host trust boundaries and remaining lab/production work.

## 0.4.0 — 2026-10-05

- strengthened authorization context with contract/topology/policy/precondition/lease-chain binding;
- added hierarchical resource scope semantics and revocation propagation;
- added R3 multi-authority quorum;
- added explicit UNKNOWN reconciliation and logical idempotency;
- added independent evidence gate and conflict detection;
- added signed v0.4 JSON envelope, version negotiation, replay guard and critical-extension handling;
- added cross-domain Saga coordinator;
- added T0/T1 Policy Artifact validation;
- added six JSON Schemas and 28-test TCK;
- added full Chinese and English technical reports.
