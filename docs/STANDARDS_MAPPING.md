# Standards mapping and research positioning

This prototype is deliberately positioned as a research overlay compatible with, not a replacement for, emerging 6G standards work.

## ITU IMT-2030

The design aligns with IMT-2030's AI and communication usage scenario and overarching security/resilience and sustainability principles. It does not define a new radio interface candidate.

## 3GPP Release 20/21

Relevant 2026 work includes:

- TR 22.870: 6G use cases and service requirements.
- TR 23.801-01: 6G system architecture study, including intent-based exposure and AI-agent architecture discussions.
- TR 29.830: 6G network capability exposure study.
- TR 29.832: study on the protocol for AI in 6G.
- TR 32.801-01: 6G management and orchestration study.
- TR 33.801-01: security study for the 6G system.

Release 20 is primarily the 6G study phase; Release 21 is the normative phase. A6GP can therefore serve as a research contribution candidate and implementation sandbox, but it is not a 3GPP-compliant 6G protocol today.

## ETSI ENI

ETSI GS ENI 059 (2026-09) specifies AI-agent interfaces for next-generation mobile systems and studies gaps in A2A/MCP. A6GP builds beyond generic interface exposure by emphasizing:

- action transactions
- lease-bound delegated authority
- evidence-gated completion
- timing-class separation
- explicit rollback/compensation
- digital-twin preauthorization
- failure reconciliation

## O-RAN

O-RAN provides a practical path for implementation experiments through SMO, Non-RT RIC, Near-RT RIC, R1, A1, E2, O1, and O2. A6GP T2/T3 orchestration can map to RIC/SMO layers; T0/T1 execution remains deterministic in RAN functions or validated local policies.
