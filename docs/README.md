# Project Knowledge Map

## Purpose

This document is the stable navigation entry for durable project knowledge. It identifies where each material fact is owned, what semantic dimension that owner represents, and whether the owner describes an approved target, current state, derived specification, execution record, or history.

This map is routing only. It does not duplicate or override the facts held by the listed owners.

## Directory Structure

```text
docs/
├── README.md
├── OPERATIONS.md
├── architecture/
│   └── README.md
├── security-and-data/
│   └── README.md
└── deliveries/
    └── <delivery-id>/
        ├── BASELINE.md
        ├── PLAN.md
        ├── DESIGN_AUTHORITY.md        when material UI/UX requires an approved target
        └── decision-inputs/           provenance only; never parallel current authority
```

- Keep repository-wide, cross-Delivery authorities in their named domain directory.
- Keep Delivery targets, execution plans, Delivery-scoped design authority, and their provenance under the applicable Delivery directory.
- Keep generated artifacts, implementation specifications, contracts, configuration, and runtime code in their repository-owned machine or package locations rather than copying them into `docs/`.
- Keep only this navigation entry and explicitly mapped cross-Delivery owners at the `docs/` root. Add another root owner or top-level category only when durable cross-Delivery knowledge has no suitable existing owner.

## Knowledge Owners

| Knowledge | Owner | Dimension | Scope and status |
| --- | --- | --- | --- |
| Repository governance and agent instructions | [`AGENTS.md`](../AGENTS.md) | `current_state` | Repository-wide. |
| Repository licensing | [`LICENSE`](../LICENSE) | `current_state` | Repository-wide. |
| A Delivery's Goal, User Outcome, Non-goals, Key Decisions, Preserved Constraints, and Acceptance Criteria | `docs/deliveries/<delivery-id>/BASELINE.md`; current owners: [V1 Baseline](deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md) and [Social Platform Review Enablement Baseline](deliveries/social-platform-review-enablement/BASELINE.md) | `approved_target` after approval | Delivery-scoped. |
| A Delivery's stages, Gates, verification, and execution records | `docs/deliveries/<delivery-id>/PLAN.md`; current owners: [V1 Plan](deliveries/jingtang-overseas-website-saas-v1-launch/PLAN.md) and [Social Platform Review Enablement Plan](deliveries/social-platform-review-enablement/PLAN.md) | `execution_only` | Exists only after formal planning; Delivery-scoped. |
| Material V1 information architecture, screen responsibility, interaction, UX state, responsive behavior, and consent semantics | [V1 Design Authority](deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md) | `approved_target` | V1 Design Target; it does not own product scope, APIs, persistence, or implementation tokens. |
| Approved V1 UI build specification and bilingual presentation package | [D1 UI package](../design/jingtang-v1/README.md) and the files it routes | `derived_specification` | D1-UI-R2; derived from the Delivery and Design authorities, not production-state evidence. |
| System, module, deployment, identity, tenancy, persistence, asynchronous-work, secrets, and observability boundaries | [Architecture](architecture/README.md) | `current_state` governing constraints | Repository-wide architecture authority; it does not prove that planned implementation exists. |
| Data classification, flows, residency, processors, retention, encryption, and control obligations | [Security and Data](security-and-data/README.md) | `current_state` policy | Repository-wide security and data authority; production controls require separately verified evidence. |
| SaaS/worker change control, monitoring, backup/restore, incident response, vulnerability management, and production-access procedures | [Operations](OPERATIONS.md) | `current_state` operating procedure | Repository-wide; repository checks do not substitute for D7 Tencent Cloud production evidence. |
| Contract vocabulary, permissions, envelopes, versioning, and compatibility rules | [Contract governance](../contracts/README.md) | `current_state` | Human-readable contract governance; it does not own product UX or persistence schema. |
| Contract artifact catalog and lifecycle status | [Contract manifest](../contracts/manifest.yaml) | `current_state` machine catalog | Entries marked `planned` are not implemented contracts. Canonical schemas become machine truth only at their cataloged paths. |
| Integration capabilities, public availability, OAuth intent, and review or audit constraints | [Integration registry](../config/integrations.yaml) | `current_state` machine truth | Public Integration status must derive from this registry and actual production capability. Localized labels derive from reviewed locale catalogs, not the registry's English reference labels. |
| Official public identity, legal-policy candidate version/URLs, contact handoff, product-access status, and production-readiness flags | [Public site configuration](../config/public-site.yaml) | `current_state` machine truth | D3-owned production configuration; identity is Human-frozen while legal approval, DNS, TLS, and rollout evidence remain explicit readiness states. |
| Runtime behavior and deployed capability | `apps/**` and runtime `packages/**` | `current_state` machine truth when present | Planned for implementation stages; absence means the capability is not implemented. A mismatch with an Approved baseline is unfinished work, not an amendment to the target. |
| Persistence structure and history | `packages/db/prisma/schema.prisma` and `packages/db/prisma/migrations/**` | `current_state` machine truth when present | Planned; generated or runtime types must not become a second persistence authority. |
| HTTP and asynchronous wire structures | Cataloged JSON Schema, OpenAPI, and AsyncAPI paths in the [Contract manifest](../contracts/manifest.yaml) | `current_state` machine truth when present | Planned; generated types and documentation must derive from, or be checked against, these artifacts. |
| Verification commands and automation | Root package scripts and CI workflows | `current_state` machine truth when present | Planned; use canonical commands once established instead of copying command lists into prose documents. |
| Original V1 proposal and decision input | [Original V1 proposal](deliveries/jingtang-overseas-website-saas-v1-launch/decision-inputs/ORIGINAL_PROPOSAL.md) | `historical_context` | Provenance only after approval of the Delivery baseline; not a parallel current target. |
| Stage acceptance, review evidence, and checkpoints | Acceptance records in the applicable [V1 Plan](deliveries/jingtang-overseas-website-saas-v1-launch/PLAN.md) or [derived package](../design/jingtang-v1/README.md), plus Git history | `evidence_history` | Evidence of decisions and completed Gates; not an owner of current product or system facts. |

## Semantic Dimensions

- `current_state` describes the governing or implemented state within its owner's scope. A policy or architecture authority is not, by itself, evidence of deployed behavior.
- `approved_target` describes the outcome to implement. Current implementation that differs from it is incomplete unless the target is explicitly amended.
- `derived_specification` refines an upstream target for implementation and cannot redefine that target.
- `execution_only` coordinates work and records Gates; it cannot redefine target or current-state authority.
- `historical_context` and `evidence_history` explain provenance or prove an event; neither is current truth unless this map explicitly assigns a current dimension.

## External Sources and Provenance

Decision provenance and external constraints are routed through each Delivery's `Authoritative References`. A decision input is context, not a parallel target authority after its baseline is Approved.

External platform policies are not repository-owned facts. For an affected integration, use the current official platform source identified by the Delivery authority.

## Map Maintenance

- Update this map when an owner, semantic dimension, scope, or implementation status changes materially.
- Keep facts in their listed owner. Do not copy requirements, schemas, enums, commands, or evidence into this map.
- Add a new durable owner only under the repository's Documentation Governance rules.
