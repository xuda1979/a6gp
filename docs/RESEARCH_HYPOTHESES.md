# Research hypotheses and evaluation plan

## H1: Transactional agent control reduces unsafe side effects

Compare direct tool invocation with A6GP prepare/authorize/commit under injected stale state, duplicated requests, model retries, and conflicting actions.

Metrics: unsafe action rate, duplicate side effects, rollback success, mean recovery time.

## H2: Timing-class separation improves control stability

Compare a monolithic LLM-in-loop controller with a hierarchical design where the agent compiles a policy and T1 executes locally.

Metrics: deadline miss rate, tail latency, oscillation, SLO violation rate, control regret.

## H3: Evidence-gated completion reduces false-success claims

Inject missing telemetry, stale data, contradictory measurements, and simulator/field mismatch.

Metrics: false-positive completion, UNKNOWN detection, time to adjudication.

## H4: Dynamic multi-agent decomposition improves complex cross-domain objectives

Evaluate RAN + core + edge objectives with one agent versus bounded specialist agents.

Metrics: objective success, wall time, model requests, action count, rollback count, evidence quality.

## H5: Intervention memory improves recovery productivity

Track failure classes and compare evidence-backed recovery strategy selection with naive repeated replanning.

Metrics: verified progress per model request, attempts to recovery, repeated-failure rate, cost per completed objective.

## Suggested experimental stack

- ns-3 / 5G-LENA or equivalent radio/network simulation
- O-RAN SC or compatible RIC test environment
- Kubernetes-based edge compute emulation
- network digital twin/shadow state service
- traffic replay and fault injection
- deterministic safety validators
- vendor-neutral A6GP supervisor, authority, and evidence runtime

Start with a simulator-only A6GP gateway before any live network actuation.
