# JINGTANG V1 UI Finalization Package

- Status: Approved — Human UI Final Approval and Stage Acceptance recorded 2026-08-20
- Package Version: D1-UI-R2
- R4.5 Amendment: Approved material semantics on 2026-08-28; implementation/rendered verification pending
- Effective Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Upstream Product Authority: [`BASELINE.md`](../../docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md), Approved Revision 2
- Upstream Design Authority: [`DESIGN_AUTHORITY.md`](../../docs/deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md), Approved Revision 2
- R4.5 Product Authority: [`BASELINE.md`](../../docs/deliveries/social-platform-review-enablement/BASELINE.md), Approved Revision 8
- Architecture Constraint: [`docs/architecture/README.md`](../../docs/architecture/README.md), Approved Revision 15
- UI Package Owner: JINGTANG Design Owner
- Approval Owner: JINGTANG Human Owner

## Purpose and Authority Boundary

This is the single D1 implementation-ready derived UI package. It converts the Approved Baseline and D-01 through D-12 into visual language, high-fidelity review screens, component and token specifications, full states, responsive/accessibility rules, and annotated implementation handoff.

The 2026-08-28 R4.5 amendment adds only the approved Instagram-specific implementation semantics to the handoff and state/localization matrices: two-permission consent, Reels-tab-only confirmation, asynchronous duplicate-safe result states, immediate local disconnect, prominent manual-removal guidance and callback-confirmed provider revocation. The existing prototype remains the approved D1-UI-R2 visual source; it is not evidence that Instagram screens have been implemented or visually accepted.

It does not add product scope, platform availability, Schedule, AI automation, external approval, or production evidence. Mock accounts and content in the review source are design fixtures only. Public capability truth remains owned by [`config/integrations.yaml`](../../config/integrations.yaml).

## Approved Direction Input

The Human Owner requested on 2026-08-20 that D1 use a UI style that is:

> 简约、大气、有高级品牌感

D1-UI-R2 translates that direction into five build principles:

1. Quiet confidence — restrained color, no visual gimmicks, one dominant action.
2. Editorial scale — generous whitespace and composed typography for the public website.
3. Operational clarity — denser but calm SaaS surfaces with exact state and role semantics.
4. Trust made visible — consent, account, approval, confirmation, failure, revoke, and delete receive first-class screens.
5. One meaning, two languages — English and Simplified Chinese share product truth, user control, and the same premium visual character.

## Package Contents

- [`prototype.html`](prototype.html) — canonical high-fidelity, interactive review source for representative website, SaaS, Composer, approval/publish, trust, and Design System surfaces.
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — visual tokens, foundations, components, motion, content, responsive, and accessibility build rules.
- [`SCREEN_STATE_MATRIX.md`](SCREEN_STATE_MATRIX.md) — complete website/SaaS screen inventory, role/action ownership, full-state coverage, and prototype flow mapping.
- [`HANDOFF.md`](HANDOFF.md) — component inventory, responsive behavior, copy slots, implementation routing, and D2–D5 acceptance notes.
- [`LOCALIZATION.md`](LOCALIZATION.md) — `en`/`zh-CN` locale behavior, route and preference rules, canonical glossary, Chinese typography, content boundaries, and verification matrix.

The package intentionally contains no raster product screenshot or decorative illustration. Brand quality is carried by typography, layout, material surfaces, and precise interaction; future photography or illustration requires its own licensed asset decision.

## Review Instructions

Open `prototype.html` in a modern browser. The persistent review bar identifies the source as D1 mock data and switches between:

- Website Home
- Identity & Onboarding
- SaaS Home
- Composer
- Approval & Publish
- Trust States
- Screen Library
- Design System

The English/简体中文 control demonstrates representative localized UI without resetting the active review screen, onboarding/composer step, approval state, or trust-state scenario. The Desktop/Mobile control demonstrates the approved responsive boundary. Identity/Workspace/team setup, Composer steps, approval/rejection, publish confirmation, and trust-state selectors are interactive review paths, not product implementation.

## Coverage Statement

D1-UI-R2 covers every approved primary website and SaaS route in English and Simplified Chinese through a reusable page family, localized copy contract, and explicit screen/state matrix. High-fidelity representative screens establish the layout, typography, locale-switch, and component rules; remaining route/locale variants are build-identical compositions defined in the handoff, not unresolved designs.

There is no blocking UI TBD for D2–D5. Official domain, final legal entity expression, legal text, and verified production capability remain external content/configuration inputs already routed to D3/D5; their slots and truthful fallback states are finalized here.

## Approval Record

The JINGTANG Human Owner explicitly approved this package and accepted D1 on 2026-08-20 with the instruction “批准 D1-UI-R2 并接受 D1 Stage”. This records Human UI Final Approval and Stage Acceptance for `D1-UI-R2` as the implementation-ready bilingual derived specification.

The approval confirms fidelity, completeness, bilingual readiness, build readiness, and alignment with the requested premium minimal direction. It does not elevate this package above the Approved Baseline or Design Authority, authorize production/external writes, or treat prototype fixtures as implemented capability.
