# JINGTANG V1 Screen and State Matrix

Package: D1-UI-R2

Status: Approved — D1-UI-R2 Human UI Final Approval recorded 2026-08-20

## Website Screen Inventory

| Route/page family | Primary responsibility | Required states/content | Prototype composition |
| --- | --- | --- | --- |
| `/` Home | Understand → Trust → Explore → Book Demo | Hero, truthful workflow, platform status, trust, CTA | Website Home view |
| `/platform/social-publishing` | Explain controlled, account-specific publishing | Create/customize/preview/confirm/track; platform differences | Website editorial/product family |
| `/platform/workflow-approvals` | Explain roles and separate approval/publish | Roles, submit/approve/reject, audit, explicit publish | Website editorial/product family |
| `/integrations` | Canonical public integration index | Available/Beta/Coming Soon groups; no unavailable action | Website integration cards |
| `/integrations/youtube` | Reviewer/sales evidence for the first planned channel | Coming Soon until D5 Gate; capability, auth, user control, data, disconnect, legal links | Trust detail family |
| `/solutions` | Organize real customer scenarios | Social Publishing product vs Professional Services; AI Visibility only Services/Early Access | Website editorial family |
| `/security` | Explain verified controls only | Identity/access, encryption, operations, reporting contact | Trust detail family |
| `/company/about` | Company/brand/legal identity | Global marketing positioning, legal entity slot, no invented proof | Editorial family |
| `/company/contact` | Human contact and demo path | Contact options, response expectation, collection notice | Form/editorial family |
| `/privacy` | Readable legal policy | Version/effective date, YouTube/Google disclosure, contact | Legal reading family |
| `/terms` | Readable service terms | Version/effective date, YouTube Terms link, legal entity | Legal reading family |
| `/data-deletion` | Explain and initiate JINGTANG data deletion | Separate JINGTANG data, disconnect/revoke, third-party content | Trust/destructive family |
| `/sign-in` | Enter SaaS | Login, reset, error, invitation return | Identity family |
| `/book-demo` | Primary conversion | Business contact form, validation, success, privacy notice | Form family |

Every website row has corresponding stable `en` and `zh-CN` routes, matching language alternates, localized metadata, same-locale internal links, and a page-preserving locale switch. All pages use the same public header/footer, mobile-first behavior, truthful capability badges, and localized primary CTA (`Book a Demo` / `预约演示`). There is no “Available integration detail” until Registry status becomes Available; the YouTube page uses Coming Soon/review-state content until then.

## SaaS Screen Inventory

| Area | Screens | Primary role/action ownership | Required state families |
| --- | --- | --- | --- |
| Identity | Sign Up, Login, Password Reset, invitation acceptance | Public user | Empty, validation, working, invalid/expired link, success, service error |
| Workspace onboarding | Create Workspace, Join Workspace, invite initial team, assign roles | New Owner/Admin | Empty, duplicate name, invalid invite, partial invite failure, complete |
| Home | Attention summary, connected channels, pending approvals, upcoming publishing, recent activity | All; actions role-sensitive | Empty, loading by region, mixed success, permission-filtered |
| Content | Content list, create entry, filters, detail | Editor create/edit/submit; others read by permission | Empty, loading, no result, error, draft/review/execution states |
| Composer | Content → Platforms → Customize → Review | Editor; Owner/Admin super-role | Upload and validation states, platform eligibility, unsaved change, submit result |
| Content Detail | Overview, Platform Versions, Approval, Publishing, Activity | Contextual by role | Current/older revision, rejection, approved, execution results/recovery |
| Approvals | Pending, Approved, Rejected queues and review | Approver/Publisher | Empty queue, loading, stale revision, approve/reject working/error |
| Calendar | Scheduled/Upcoming/Published views only | Read; schedule action only if Registry allows | Empty, Schedule Not Available, loading, timezone, cancelled/failed |
| Channels | Channel index, connect explanation, OAuth return, detail | Owner/Admin connect/reauthorize/disconnect | Not connected, connecting, connected, reauth, disconnecting, disconnected, unavailable |
| Activity | Workspace audit presentation and content-scoped activity | Viewer and above read | Empty, loading, pagination, redacted target, error |
| Settings/Workspace | Workspace name/configuration | Owner/Admin manage | Read, edit, validation, save working/success/error |
| Settings/Members & Roles | Invite, remove, role change | Owner/Admin manage | Empty, pending invite, permission denied, last-owner protection, partial error |
| Settings/Data & Account | Consent versions, data request, account/Workspace deletion | Authorized user/Owner | Explain, confirm, working, queued, completed, failed/retry/support |

## Cross-product Full-state Matrix

| State | Required visual semantics | Primary surface/action |
| --- | --- | --- |
| Empty | Name what is absent and provide one real next step when permitted | Page region + role-sensitive CTA |
| Loading | Preserve layout and identify the region being loaded; never imply success | Skeleton/progress + accessible status |
| Success | Persist meaningful state in page/history; toast only acknowledges | Updated object/detail + audit entry |
| Validation error | Field and summary error with exact remediation; retain user input | Form field + error summary |
| Uploading | File identity, progress, cancel where safe; later steps blocked | Composer Content step |
| Upload failure | Safe reason, retry/remove; cannot proceed | Upload item + blocking step reason |
| Authorization expiry | Channel and affected task identified; no generic 401 | Needs Attention + Reconnect |
| Reauthorization | Explain requested permission and return path to original task | Channels-owned flow |
| Publishing | Exact platform/account and start time; external write began | Per-platform execution row |
| Processing | Distinct from Published; refresh/poll state and expectation | Per-platform execution row |
| Partial failure | Every execution remains visible; no aggregate Published claim | Content Detail Publishing section |
| Needs Attention | User-correctable reason and Resolve action | Home/Content/Channels |
| Disconnecting | New external operations stopped; revocation/cleanup in progress | Channel detail + Activity |
| Deletion in progress | Target/scope/timeline and request reference | Data & Account status |
| Permission denied | Explain role requirement without exposing hidden tenant data | Page/action boundary |
| Disabled with reason | Readable reason adjacent to action; not opacity-only | Button/help text |
| Destructive confirmation | Exact target, consequences, explicit Cancel and destructive action | Modal/dialog |
| Retryable provider error | Plain-language temporary failure, retry timing/action | Execution result |
| Non-retryable provider error | Explain unsupported/rejected condition and safe next step | Execution result |
| Consent missing | Blocking current Terms/Privacy with unchecked consent | Registration/YouTube preflight |
| Re-consent required | Material change explanation; Accept/Cancel; no OAuth on cancel | YouTube API preflight |
| Schedule unavailable | Capability label and disabled/non-rendered Schedule action | Composer/Calendar/Channel |
| Locale switch | Preserve route, Workspace, draft/revision, active task and dialog/step state; update only UI messages/formatting | Public header; SaaS account/Settings |
| Missing translation | English safe fallback plus blocking catalog evidence; never blank or expose a raw key in production | Any interface surface |
| Localized content expansion | Wrap/reflow without hiding status, restriction, legal or destructive meaning | Navigation, buttons, tables, dialogs, legal pages |

## Role/Action Matrix for UI

| Action | Owner/Admin | Editor | Approver/Publisher | Viewer |
| --- | --- | --- | --- | --- |
| Manage Workspace/members/roles | Primary | Hidden/denied | Hidden/denied | Hidden/denied |
| Connect/reauthorize/disconnect | Primary | View status | View status | View status |
| Create/upload/edit Draft | Allowed | Primary | Read | Read |
| Submit for approval | Allowed | Primary | Read | Read |
| Approve/reject | Allowed, separate action | Hidden/denied | Primary | Hidden/denied |
| Confirm publish | Allowed, separate confirmation | Hidden/denied | Primary | Hidden/denied |
| Read Content/status/Activity | Allowed | Allowed | Allowed | Allowed |
| Delete Workspace | Owner-only destructive flow | Hidden | Hidden | Hidden |

Owner/Admin’s super-role never merges Approval and Publish into one machine/user action.

## Prototype Flow Coverage

| Flow | Prototype view and interaction | Decision trace |
| --- | --- | --- |
| Sign Up/Login → Workspace | Interactive Identity & Onboarding view covers explicit consent, Workspace creation, invitations, roles, and Home readiness | D-09, D-11, D-12 |
| Upload → Platforms → Customize → Review | Composer step controls, upload-complete fixture, disabled Coming Soon platforms, YouTube-specific fields, final review | D-01, D-08 |
| Submit → Approve/Reject | Composer submit action and Approval view action state | D-02, D-04 |
| Approve → Confirm Publish | Approval view reveals distinct Publish Confirmation, then explicit modal | D-02, D-03 |
| Publish → Track/Recover | Approval result plus Trust States publishing/processing/failed/needs-attention variants | D-03, D-04 |
| Connect/Consent/Reauthorize | Trust States selectors and annotated Channels flow | D-05, D-12 |
| Disconnect/Revoke/Delete | Distinct Trust States confirmations and progress semantics | D-06 |

## Responsive and Accessibility Coverage

- Website representative views are reviewed in `en` and `zh-CN` at 1440, 1024, 768, 390, and 320 CSS px.
- SaaS representative views are reviewed in `en` and `zh-CN` at 1440, 1024, 768, 390, and 320 CSS px for readability/reflow; complex operational optimization remains desktop-first.
- Keyboard order, focus visibility, accessible names, text status/error, dialogs, form labels, error association, progress, non-color state, and 200% zoom are specified for every component family.
- The prototype’s Mobile review mode demonstrates reflow; implementation verification remains blocking in D2–D5.
- The prototype’s English/简体中文 control demonstrates that locale changes preserve the current prototype context and leave user-authored fixture content unchanged; [`LOCALIZATION.md`](LOCALIZATION.md) owns complete route/message coverage.
