# JINGTANG V1 Design System

Package: D1-UI-R2

Status: Approved — D1-UI-R2 Human UI Final Approval recorded 2026-08-20

## 1. Brand Character

JINGTANG should feel like global enterprise infrastructure with editorial restraint: assured, precise, calm, and human. The visual system avoids loud gradients, neon AI tropes, oversized rounded cards, inflated claims, and decorative dashboard metrics.

The public website uses generous negative space and a composed editorial rhythm. The SaaS uses the same materials at a tighter density, prioritizing target account, workflow state, next action, and recovery.

## 2. Color Tokens

| Token | Light value | Purpose |
| --- | --- | --- |
| `jt.canvas` | `#F3F1EA` | Warm page canvas; public website and review surfaces |
| `jt.surface` | `#FCFCF9` | Primary elevated/product surface |
| `jt.surface.strong` | `#FFFFFF` | Forms, dialogs, selected operational surfaces |
| `jt.ink` | `#111513` | Primary text and highest-emphasis controls |
| `jt.ink.soft` | `#45504A` | Secondary body copy |
| `jt.muted` | `#727A74` | Metadata and tertiary labels only |
| `jt.line` | `#D8DCD5` | Dividers, input boundaries, quiet structure |
| `jt.brand` | `#155D4E` | JINGTANG jade; selected navigation, focus, brand action |
| `jt.brand.deep` | `#0C332C` | Dark brand field and high-contrast trust sections |
| `jt.brand.soft` | `#E5EFEB` | Selected/positive low-emphasis surface |
| `jt.gold` | `#A97D3E` | Sparse editorial accent; never a general status color |
| `jt.success` | `#1E684D` | Published, connected, completed; always paired with text/icon |
| `jt.warning` | `#875A17` | Pending, processing, reauthorization, scheduled |
| `jt.danger` | `#A23832` | Failed, destructive, validation error |
| `jt.info` | `#315E86` | Neutral informational state |

Large color fields use `jt.canvas`, `jt.surface`, or `jt.brand.deep`. `jt.brand` is restrained to brand/action identity. Status colors never carry meaning alone. Dark-mode values are not part of the V1 product target; operating-system contrast modes and forced colors must remain usable.

## 3. Typography

| Role | Family | Weight | Desktop scale | Mobile scale |
| --- | --- | --- | --- | --- |
| Editorial display | `Newsreader`, Georgia, serif | 400/500 | 64/68, 48/52, 36/42 | 44/48, 36/40, 30/36 |
| Product/UI | `Manrope`, system sans-serif | 400/500 | 12–20 | 12–18 |
| Brand wordmark | `Manrope` | 500 | 14 with `0.18em` tracking | same |
| Data/status | `Manrope` with tabular numerals | 400/500 | 12–24 | 12–20 |
| Simplified Chinese editorial display | `Noto Serif SC`, `Songti SC`, serif | 400/500 | Match Latin optical scale; 1.12–1.22 line height | 36–48 primary; 1.16–1.28 line height |
| Simplified Chinese product/UI | `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, system sans-serif | 400/500 | 12–20 | 12–18 |

Public H1 uses editorial display; SaaS page titles remain the product/UI family for operational continuity. Body text is normally 16/26 on the website and 14/22 in the SaaS. Legal copy uses 16/28 with a 720px reading measure. No essential text is below 12px. Simplified Chinese never inherits Latin uppercase transformation or tracking; use natural Chinese punctuation, zero artificial letter spacing, and content-fit line breaks rather than manual word spacing.

## 4. Spacing, Grid, and Density

- Base unit: 4px.
- Core spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Website container: maximum 1240px, 32px desktop gutter, 20px mobile gutter.
- Website grid: 12 columns desktop, 6 tablet, 4 mobile.
- SaaS shell: 232px rail, flexible content, optional 320px contextual panel; 24px page gutter at ≥1024px.
- Dense tables use 44px minimum row height; standard lists use 56–72px depending on content.
- Primary forms use a 640px maximum line length; review/detail content uses 760–920px.

Whitespace separates meaning. Repeated information uses dividers and alignment before cards. Nested cards are prohibited.

## 5. Shape, Elevation, and Iconography

- Radius: 4px for tags, 8px controls, 12px panels/dialogs, 20px only for public editorial feature surfaces.
- Borders: 1px `jt.line`; selected state uses brand fill or a 2px focus/selection ring, not a heavier shadow.
- Elevation: none by default; dialog/popover uses one restrained shadow (`0 18px 60px rgba(17,21,19,.14)`).
- Icons: Lucide-style 1.5px outline, 16px product default, 20px navigation. Icons accompany visible text for material actions.
- Platform logos appear only where they identify an actual platform/account. Decorative logo clouds and fake partner marks are prohibited.

## 6. Motion

- Fast feedback: 120–160ms.
- Surface/navigation transition: 180–240ms.
- Easing: standard deceleration; no bounce, parallax, autoplay hero motion, or looping status animation.
- Loading uses skeleton/progress semantics; motion never implies success.
- `prefers-reduced-motion` removes non-essential transforms and animated progress.

## 7. Core Components

### Navigation

- Public header: quiet wordmark, five grouped navigation entries, text Sign In, one Book a Demo action.
- SaaS rail: Workspace context first, approved D-07 IA, Settings anchored last. Active item uses a slim jade marker plus surface change and text.
- Role changes action availability, not the primary IA.

### Buttons

- Primary: ink or jade fill, one per action group.
- Secondary: transparent/surface with line border.
- Ghost: text/icon with no container.
- Destructive: danger text/border; filled danger only in final destructive confirmation.
- Disabled actions retain readable label and adjacent reason; opacity alone is insufficient.
- Every async action exposes idle, working, success acknowledgment, and recoverable failure.

### Forms

- Labels remain visible above fields; placeholder is example content, never the label.
- Help text precedes errors. Errors use icon + exact message + remediation.
- Required platform fields stay platform-specific.
- Consent checkbox is never preselected and includes direct Terms/Privacy links.

### Status

- Compact status marker = icon/shape + text + subtle background when needed.
- Capability labels use exactly `Available`, `Beta / Early Access`, `Coming Soon`, and `Schedule Not Available`.
- Workflow status, publishing intent, and platform execution are visually adjacent but separately labeled.
- `Needs Attention` always includes cause and a `Resolve` path when recoverable.

### Tables and Lists

- Default to quiet horizontal dividers, no vertical gridlines.
- First column owns primary object identity; state and next action align to the right.
- Empty/loading/error belongs to the table region without shifting page navigation.
- Mobile transforms rows into readable stacked records; it does not shrink columns below legibility.

### Dialogs and Destructive Actions

- Dialog heading states the decision, body states the impact, footer contains explicit Cancel and one primary action.
- Publish confirmation names every exact platform/account, final fields, mode, and approval state.
- Disconnect, delete JINGTANG data, and delete third-party content never share wording or action labels.

### Upload and Preview

- Upload surface supports empty, drag focus, uploading progress, validation, failed, and complete states.
- Failed upload blocks later steps with a reason.
- Preview is framed as the target platform representation and never presented as a literal platform screenshot.

## 8. Responsive Rules

### Website — mobile first

- 320–639px: four-column layout; stacked hero; full-width primary CTA; navigation collapses into a labeled menu; body and legal pages never horizontally scroll.
- 640–959px: six-column layout; selected two-column editorial sections may remain side by side.
- ≥960px: twelve-column layout; hero uses 7/5 split; navigation is fully visible.

### SaaS — desktop/laptop operational first

- ≥1024px: full rail, tables, Composer split preview, and detail context panels.
- 768–1023px: rail collapses to icons plus accessible labels on focus/menu; contextual panel moves below primary content.
- 320–767px: status/read surfaces and simple approvals remain readable; navigation becomes a top Workspace/menu row; tables stack; dialogs fit the viewport. Complex Composer fields stack into one column and may display a truthful “Best on desktop” note, but no state, content, or error may overflow or disappear.

Exact CSS breakpoints may move by up to 32px during D2 implementation if content-fit testing proves necessary; the behavior above is normative.

## 9. Accessibility Build Requirements

- WCAG 2.2 AA contrast: 4.5:1 normal text, 3:1 large text and essential UI boundaries.
- Native landmark, heading, form, table, dialog, and button semantics.
- Logical DOM/tab order; visible 2px focus ring with 2px offset; no focus removal.
- Skip link on website and SaaS; rail/menu state exposed to assistive technology.
- Status, error, selection, progress, and risk never depend on color, icon, hover, or motion alone.
- Upload progress uses a named progress element; platform execution changes announce through a polite live region.
- Dialog focus is trapped/restored; Escape cancels only when cancellation is safe.
- Destructive action text names the target; icon-only buttons require accessible names.
- Minimum pointer target 40×40px for primary touch actions; inline text links retain visible affordance.
- Zoom at 200% and reflow at 320 CSS px without loss of information.

## 10. Content and Voice

- Voice: direct, composed, specific, non-promotional inside the product.
- Buttons use verbs: `Submit for approval`, `Approve`, `Confirm and publish`, `Reconnect YouTube`, `Disconnect channel`, `Delete JINGTANG data`.
- Errors explain what happened and what the user can do next; never expose provider codes as the primary message.
- Public claims must resolve from the Integration Registry or reviewed copy slots. “Partner”, certification, customer proof, and security claims require evidence.

## 11. Localization Visual Rules

- English (`en`) is the default; Simplified Chinese (`zh-CN`) is an equal, complete interface locale, not a partial marketing translation.
- Public header shows a concise language control before Sign In; SaaS exposes the same control in the user/account area and Settings. The active locale is always programmatically determinable and keyboard operable.
- Buttons, tabs and status chips size to content. Do not solve translation expansion by shrinking below token minimums, clipping, ellipsis on destructive/status meaning, or fixed-width English assumptions.
- At 320px, long Chinese and English actions may wrap to two lines with a 40px minimum hit target. Tables stack before material labels disappear.
- Brand and platform names such as JINGTANG, YouTube, Facebook and Instagram remain unchanged. The legally approved entity expression is inserted verbatim from its locale-specific legal slot.
- Capability, workflow and execution labels are localized from canonical machine values; colors, icons and action availability never vary by locale.
- User-authored content stays visually distinct from interface copy and remains unchanged when the interface locale changes.
- Detailed catalog, route, preference, glossary, fallback and acceptance rules are owned by [`LOCALIZATION.md`](LOCALIZATION.md).
