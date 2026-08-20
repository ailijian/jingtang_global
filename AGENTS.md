# Repository Agent Guide

## Scope and Knowledge Map

This repository owns the durable project knowledge, Delivery artifacts, and implementation for the JINGTANG overseas website and SaaS.

- Delivery targets live at `docs/deliveries/<delivery-id>/BASELINE.md`.
- Delivery execution plans live beside their baseline as `docs/deliveries/<delivery-id>/PLAN.md` after formal planning creates them.
- Decision provenance and external constraints are routed through each Delivery's `Authoritative References`; a decision input is context, not a parallel target authority after its baseline is Approved.
- Repository licensing is owned by `LICENSE`.
- External platform policies are not repository-owned facts. For an affected integration, use the current official platform source identified by the Delivery authority.

## Authority and Repository Invariants

- An Approved `BASELINE.md` is the sole owner of its Delivery's Goal, User Outcome, Non-goals, Key Decisions, Preserved Constraints, and Acceptance Criteria. Its `PLAN.md` owns execution only and must not redefine the target.
- Keep public product and Integration status aligned with actual production capability. Do not describe an unavailable capability as Available.
- Express developer-review outcomes in terms the team controls: policy compliance and review readiness. A third party's approval decision is external state, not Delivery acceptance.
- If current authoritative sources materially conflict, stop only the affected work and report the conflict. Do not choose by filename, recency, implementation behavior, or historical status alone.

## Delivery Workflow

For substantial planned development, use this route:

```text
approved BASELINE.md
→ [material UI/UX → design-readiness]
→ implementation-planning
→ PLAN.md
→ one Stage at a time
→ required verification and PLAN-required Gates
→ [PLAN requires Stage Acceptance → acceptance-review]
→ checkpoint
```

- Use `delivery-baseline` to create, approve, or explicitly amend a Delivery target.
- Do not create a formal `PLAN.md` from a missing or Draft baseline.
- Treat an Approved baseline as immutable unless the user explicitly approves an amendment. Planning or implementation convenience is not amendment authority.
- Invoke Code Review or Stage Acceptance only when the current `PLAN.md` requires that Gate.

## Documentation Governance

- Keep one long-lived owner for each material fact. Update the existing owner before creating another document, and reference authorities instead of copying them.
- Do not create per-version copies of durable Product, Architecture, Domain, Contract, Security, Testing, or Design knowledge. Use Git for history.
- `BASELINE.md` and `PLAN.md` are the normal persistent artifacts for a substantial Delivery. Add another durable document only when the knowledge survives future Deliveries, lacks an existing owner, and cannot be derived reliably from code, schema, contracts, or another machine source.
- Treat decision inputs, reviews, Gate evidence, archives, and completed plans as context or history unless this map explicitly assigns them current authority.
- Do not reorganize the documentation tree as incidental cleanup.

## Repository Governance

Do not modify this `AGENTS.md` merely because a task reveals a useful local practice. Report only material candidates that are durable across future Deliveries, repository-specific, likely to prevent repeated error or ambiguity, and not better owned elsewhere. Do not modify repository governance without explicit authorization.
