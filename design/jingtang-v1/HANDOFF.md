# JINGTANG V1 UI Handoff

Package: D1-UI-R2

Status: Approved — D1-UI-R2 Human UI Final Approval and Stage Acceptance recorded 2026-08-20

## Source of Truth and Use

Implementation consumes this package in this order:

1. Approved Baseline for product meaning and truth.
2. Approved Design Authority for D-01 through D-12.
3. Approved Architecture/Contract/Integration owners for technical and capability constraints.
4. This D1 package for visual layout, component behavior, full states, responsive/accessibility requirements, and copy slots.

If a material meaning conflicts, upstream authority wins and implementation stops. Engineers must not “improve” the UI by adding platforms, automatic publishing, Schedule, AI action, new navigation, or a second OAuth flow.

## Approved Design Trace

| Decision | D1-UI-R2 receiver |
| --- | --- |
| D-01 | Composer platform selection/customization and Content Detail platform versions |
| D-02 | Approval card, approved state, separate Publish Confirmation dialog |
| D-03 | Per-platform execution component and partial-failure/processing states |
| D-04 | Single Content Detail with Overview, Platform Version, Approval, Publishing, Activity |
| D-05 | Channels-owned Connect, Reauthorize, Return to Content, and Disconnect screens |
| D-06 | Separate Channel Disconnect, JINGTANG data deletion, and unsupported third-party deletion semantics |
| D-07 | Workspace rail and complete Home/Content/Approvals/Calendar/Channels/Activity/Settings screen library |
| D-08 | Content → Platforms → Customize → Review interactive stepper |
| D-09 | Interactive account consent → Workspace → team invitations/roles → Home readiness prototype |
| D-10 | Public IA and Screen Library page families, including truthful Solutions |
| D-11 | Desktop/Mobile review modes and normative responsive specifications |
| D-12 | Unchecked registration consent and YouTube consent/re-consent gate states |

## Canonical Component Inventory

| ID | Component | Variants/states | Receiver |
| --- | --- | --- | --- |
| `JT-PUB-01` | Public Header | desktop, mobile menu, current page | D3 |
| `JT-PUB-02` | Editorial Hero | standard, product, trust/legal | D3 |
| `JT-PUB-03` | Capability Status | Available, Beta/Early Access, Coming Soon, Schedule Not Available | D3/D5/D7 |
| `JT-PUB-04` | Integration Summary | truthful status, capability, auth/data/control links | D3/D7 |
| `JT-PUB-05` | Legal Reading Layout | index, version/date, body, contact | D3 |
| `JT-AUTH-01` | Identity Form | signup, login, reset, invite, validation/working/error/success | D2 |
| `JT-AUTH-02` | Consent Gate | current consent, missing, re-consent, cancel | D2/D5 |
| `JT-SHELL-01` | Workspace Rail | full, collapsed/mobile menu, role-sensitive actions | D2 |
| `JT-SHELL-02` | Page Header | title, context, primary action, breadcrumb/back | D2–D5 |
| `JT-DATA-01` | Quiet Data List/Table | loading, empty, error, result, stacked mobile | D2–D5 |
| `JT-STATE-01` | Status Marker | workflow, intent, execution, channel, capability | D2–D5 |
| `JT-STATE-02` | Needs Attention | cause, affected target, Resolve | D2–D6 |
| `JT-COMP-01` | Composer Stepper | Content, Platforms, Customize, Review; complete/current/error/disabled | D4 |
| `JT-COMP-02` | Asset Upload | empty, drag, uploading, failed, complete, removed | D4 |
| `JT-COMP-03` | Platform Account Selector | ready, selected, reauth, unsupported, unavailable, coming soon | D4/D5 |
| `JT-COMP-04` | Platform Fields | YouTube title/description/privacy/audience/required settings | D4/D5 |
| `JT-COMP-05` | Platform Preview | media, final fields, target account; not a literal platform screenshot | D4/D5 |
| `JT-APR-01` | Approval Review | exact revision, history, approve, reject/comment, stale state | D4 |
| `JT-PUB-06` | Publish Confirmation | exact content/accounts/fields/mode/approval; explicit confirm | D5 |
| `JT-PUB-07` | Execution Result | publishing, processing, published, failed, needs attention, cancelled | D4/D5 |
| `JT-CHAN-01` | Channel Summary | not connected through disconnected | D5/D6 |
| `JT-CHAN-02` | OAuth Explanation/Return | before leaving, returning, success, cancel, provider error | D5 |
| `JT-TRUST-01` | Destructive Confirmation | disconnect, JINGTANG data deletion, Workspace deletion | D6 |
| `JT-AUDIT-01` | Activity Event | actor, action, target, timestamp, result, safe metadata | D2/D4–D6 |
| `JT-I18N-01` | Locale Switch | `en`, `zh-CN`, active, switching, saved, safe fallback; preserves current context | D2/D3 |
| `JT-I18N-02` | Localized Message Slot | canonical key, params, rich-link slots, status/action severity, missing-key evidence | D2–D7 |

## Representative Layout Specifications

### Public website

- Header sits in the 1240px content grid; 80px desktop height, 64px mobile.
- Home hero begins within the first viewport but does not force viewport-height framing. At desktop it uses 7/5 columns; at mobile it stacks heading, copy, CTAs, then workflow evidence.
- Editorial sections use 96–128px desktop vertical spacing and 64–80px mobile spacing.
- Product/trust pages reuse the editorial hero, anchored content index, proof/process sections, status surfaces, and final demo CTA.
- Legal pages use a 720px reading column with a sticky index only at ≥1024px.

### SaaS

- Full rail is 232px. Page header and content begin at a 24px gutter; maximum operational content width is 1440px.
- Home uses one attention band and two balanced data regions; it must not become a KPI dashboard.
- Content Detail is the single operational view: overview and current platform execution are primary; approval/activity use tabs/sections within the same route.
- Composer at ≥1100px uses a flexible form column plus 360px preview. Below that, preview follows form content.
- Dialog maximum width: 560px; Publish Confirmation may use 680px for multiple accounts/fields.

## Key Interaction Annotations

### Composer

1. Content step cannot complete before validated upload success.
2. Platforms shows only Workspace-connected, eligible accounts as selectable; Coming Soon is visible only as disabled product direction with no Connect action.
3. Customize keeps separate platform fields and per-tab complete/incomplete/error markers.
4. Review freezes a readable snapshot and exposes `Submit for approval`, never Publish for Editor.
5. Any content change after approval creates a new revision and invalidates approval.

### Approval and Publish

1. Approve and Reject reference the exact revision.
2. Reject exposes a reason field and returns the Content to a clear editable/rejected state.
3. Approve updates workflow state only; a separate `Continue to publish` action opens `JT-PUB-06`.
4. Publish Confirmation repeats exact YouTube channel, video/title/description/privacy/audience, and mode.
5. `Confirm and publish` is the only action that creates an external execution.

### Channels and consent

1. All connect/reauthorize/disconnect flows originate from Channels, even when linked from a failed Content execution.
2. Before Google OAuth, show what happens, official sign-in ownership, requested permission purpose, and Continue/Cancel.
3. Missing/outdated Terms/Privacy presents blocking `JT-AUTH-02`; Cancel returns without OAuth/API work.
4. Reauthorization returns to Channel and offers Return to Content when entered from recovery.

### Disconnect and delete

1. Disconnect names the channel and explains future API stop, token revocation/data cleanup, and that published YouTube content remains.
2. Delete JINGTANG Data identifies JINGTANG-held data and request progress.
3. Third-party deletion is not shown as supported in V1.

## Copy and Configuration Slots

These slots must be supplied by their owner; the UI fallback is truthful and non-actionable.

| Slot | Owner | Required by | Fallback before freeze |
| --- | --- | --- | --- |
| `brand.official_domain` | Executive/Brand Owner | D3 | No production launch |
| `brand.legal_entity_en` | Legal Owner | D3 | Chinese entity context only; do not invent translation |
| `contact.support_email` | Support Owner | D3/D5 | No reviewer submission |
| `legal.terms_version/effective_at/url` | Legal/Data Owner | D2/D3 | Consent/OAuth blocked |
| `legal.privacy_version/effective_at/url` | Legal/Data Owner | D2/D3 | Consent/OAuth blocked |
| `integration.<id>.status/capabilities` | Integration Registry | D3/D5/D7 | Coming Soon / actions unavailable |
| `youtube.review_state/private_limit` | Integration Owner | D5/D7 | Coming Soon; no Available claim |
| `security.claims.*` | Security evidence owner | D3/D7 | Omit claim |
| `i18n.<locale>.*` | Design/Content Owner with Product/Legal/Integration review | D2–D7 | English safe fallback; missing key blocks release |

## Responsive Handoff

- Implement with CSS container/content queries where component behavior depends on available content width; route breakpoints may use the Design System bands.
- No fixed desktop canvas is allowed in product implementation.
- Tables define both wide-row and stacked-record renderings; hiding a material column on mobile requires an explicit details disclosure.
- Side panels move into document flow. Dialogs use viewport-safe margins and body scrolling without trapping page content behind an inaccessible region.
- SaaS mobile may show “Best on desktop” for complex Composer efficiency, but all visible state and errors remain readable and no action is falsely completed.

## Accessibility Handoff

- Component stories/tests must include keyboard, visible focus, accessible name, error association, non-color state, reduced motion, 200% zoom, and 320px reflow.
- `aria-live` is limited to upload/execution changes; it must not repeatedly announce polling.
- Icon + text is required for material statuses. Platform logo is not the accessible account label.
- Modal initial focus lands on the decision heading or first safe control; destructive action is not default-focused.
- “Disabled with reason” uses an enabled disclosure or adjacent text because a disabled control alone is not discoverable to every user.

## Implementation Routing and Build Acceptance

| Stage | Receives | UI acceptance boundary |
| --- | --- | --- |
| D2 | Identity, onboarding, Workspace/member screens, shell, Consent base, shared components | Runnable keyboard-accessible shell; RBAC actions match role matrix; real empty/loading/error |
| D3 | All `en`/`zh-CN` public page families, locale routes/metadata and final content slots | Mobile-first bilingual public launch; Registry-driven statuses; no unsupported claim/action or missing locale route |
| D4 | Content list/detail, Composer, approval queues/review | Exact revisions, upload/platform validation, separate approval semantics, role-sensitive actions |
| D5 | YouTube Channel/OAuth/consent, confirmation, execution result/recovery | Exact account/content confirmation, truthful external state, reauthorization return path |
| D6 | Activity, disconnect/revoke/delete, Security/Data completion | Destructive semantics, progress/evidence, verified claims only |

Every Stage consumes [`LOCALIZATION.md`](LOCALIZATION.md). D2 owns catalogs and locale preference; D3 owns public locale routing; D4–D6 must verify each received UI surface in both locales; D7 owns final parity and production evidence.

## Asset and Export Notes

- The wordmark is typographic for D1; no new logo is invented.
- Icons are implementation-library assets with accessible labels.
- No platform mark is used as a partnership endorsement.
- No product screenshot, customer logo, certification badge, or stock photograph is approved by this package.
- CSS token names in `prototype.html` are reference values; D2 maps them into implementation tokens without changing their visual/semantic role.

## Final Review Checklist

- [x] Approved IA and D-01 through D-12 routed.
- [x] Website and SaaS screen families assigned.
- [x] Full states, role actions, responsive, and accessibility specified.
- [x] Integration/Schedule/AI status truth preserved.
- [x] Key Composer, approval/publish, OAuth/reconsent, recovery, disconnect/delete flows prototyped or annotated.
- [x] D2–D5 handoff has no blocking UI TBD.
- [x] English/简体中文 route, preference, typography, glossary, fallback and user-content boundaries specified.
- [x] Human walkthrough/review completed on the final rendered version.
- [x] Human UI Final Approval recorded for D1-UI-R2.
- [x] Stage Acceptance recorded.

## Approval Record

The JINGTANG Human Owner explicitly approved `D1-UI-R2` and accepted D1 on 2026-08-20 with “批准 D1-UI-R2 并接受 D1 Stage”. D2–D7 must implement this package without unapproved material deviation and continue to resolve capability truth from the Integration Registry and production evidence.
