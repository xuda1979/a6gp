# Contributing

Changes to protocol behavior should be evidence-driven and test-first.

1. Add or update a TCK case that captures the intended invariant.
2. Make the smallest protocol/runtime change.
3. Run `npm run check`.
4. Update the v0.4 specification when normative semantics change.
5. Keep reasoning/model logic outside final authority and completion gates.
6. Never weaken a safety assertion merely to make a test pass.

For a breaking semantic change, increment the research protocol version and document migration behavior.
