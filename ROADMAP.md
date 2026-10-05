# A6GP Roadmap

## v0.4 — semantic reference runtime (current)

- protocol specification and bilingual reports;
- deterministic reference core;
- 28-test TCK;
- signed JSON reference envelope;
- Saga and T0/T1 policy-artifact semantics.

## v0.5 — network adapters

- O-RAN/srsRAN lab adapter;
- 5GC/UPF capability adapter;
- edge-compute adapter;
- durable SQLite/PostgreSQL protocol state;
- fault-injection harness for packet loss, stale topology, controller crash, and partition.

## v0.6 — benchmark release

- direct-tool agent baseline;
- A2A/MCP-style collaboration baseline without A6GP transaction/evidence semantics;
- A6GP full and ablation configurations;
- safety, recovery, latency, network utility, energy, and autonomy metrics;
- reproducible experiment manifests.

## v0.7 — formalization and interoperability

- executable state-machine model (TLA+/PlusCal or equivalent);
- property/fuzz tests for message/state sequences;
- Protobuf and/or CBOR binding;
- external implementation interoperability test.

## standards/publication track

- map proven semantics to 3GPP/ETSI/O-RAN terminology;
- separate implementation observations from normative proposals;
- publish benchmark evidence before claiming superiority;
- develop patent families only for mechanisms that remain novel after prior-art search.
