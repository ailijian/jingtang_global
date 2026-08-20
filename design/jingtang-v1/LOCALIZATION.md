# JINGTANG V1 Localization Handoff

Package: D1-UI-R2

Status: Approved — D1-UI-R2 Human UI Final Approval recorded 2026-08-20

## Locale Contract

- Supported UI locales: English (`en`) and Simplified Chinese (`zh-CN`). English is the default and safe fallback.
- Both locales cover the complete in-scope website and SaaS UI: navigation, forms, validation, status, errors/recovery, Consent, capability limitations, legal/security content, destructive actions, emails and server-generated user messages.
- The locale changes presentation only. It does not change Workspace, permission, scope, capability, policy version, workflow state, draft/revision, publishing intent, execution or Audit meaning.
- User-authored Source Asset metadata, Caption, Title, Description, comments and platform fields remain exactly as authored. Locale switching never translates or rewrites them; any future AI translation remains a separate, explicit, user-controlled capability under AC-17.

## Switch and Preference Behavior

- Public website: the header exposes `EN / 中文`. Locale routes are stable (`/en/...` and `/zh-cn/...`); switching maps to the corresponding page, query and safe anchor. Root resolves to English. Locale preference may be retained in a first-party cookie/local preference, but does not override a directly requested locale URL.
- SaaS: the user/account area and Settings expose the same control. An authenticated preference persists to the user profile and across devices; a pre-auth preference may remain local until sign-in.
- Switching is in-place: preserve current Workspace, route object ID, composer step, unsaved form/draft state, selected accounts, approval revision, open safe dialog and recovery return path. It must not repeat OAuth, Consent, publish, revoke or delete commands.
- Use English fallback for a missing message, emit catalog telemetry without personal/user content, and fail completeness verification. Production never renders an empty string or raw message key.

## Public Route and Discovery Rules

- Every Baseline public page exists under both locale prefixes and returns the same canonical capability/status data.
- Each page sets the correct HTML `lang`, localized title/description, self canonical and reciprocal `hreflang="en"`, `hreflang="zh-CN"` and `x-default` links. Sitemaps list both variants.
- Internal navigation, CTAs, legal links, forms and Integration details remain in the active locale. A language switch never falls back to Home when a corresponding page exists.
- Legal translations present the same canonical policy version/effective date. Consent evidence records that version and the displayed locale; the locale does not create a separate policy meaning.

## Copy Ownership and Catalog Shape

- Runtime messages live in one versioned catalog package owned by D2 (`packages/i18n/` per Architecture A-13). Pages/components consume stable semantic keys; they do not embed parallel translations.
- Keys are namespaced by product surface and meaning, for example `nav.content`, `capability.comingSoon`, `approval.submit`, `channel.disconnect.confirm.title`, and `legal.dataDeletion.thirdPartyDistinction`.
- Canonical machine enums and Integration Registry values stay language-neutral. The catalog renders reviewed labels; the UI never branches capability or action availability on translated text.
- Rich legal/Consent messages use named link/value slots, never concatenated sentence fragments. Dates, times, numbers and time zones use locale-aware formatters while stored values remain unchanged.

## Canonical Glossary

| English | 简体中文 | Rule |
| --- | --- | --- |
| Workspace | 工作空间 | Product boundary; do not translate as project |
| Home | 首页 | SaaS primary navigation |
| Content | 内容 | User content object |
| Approvals | 审批 | Queue/navigation noun |
| Calendar | 日历 | Does not imply Schedule availability |
| Channels | 渠道 | Connected social accounts area |
| Activity | 活动记录 | User-readable audit history |
| Settings | 设置 | Product settings |
| Draft | 草稿 | Workflow state |
| Pending Approval | 待审批 | Workflow state |
| Approved / Rejected | 已批准 / 已驳回 | Workflow states |
| Publishing / Processing / Published | 发布中 / 处理中 / 已发布 | Keep three states distinct |
| Failed / Needs Attention | 失败 / 需要处理 | Keep failure and user recovery distinct |
| Available | 可用 | Only Registry-proven capability |
| Beta / Early Access | 测试版 / 抢先体验 | Preserve limitations nearby |
| Coming Soon | 即将推出 | No executable action |
| Schedule Not Available | 暂不支持定时发布 | Must not imply hidden support |
| Book a Demo | 预约演示 | Primary public CTA |
| Submit for approval | 提交审批 | Does not publish |
| Approve / Reject | 批准 / 驳回 | Exact revision decision |
| Confirm and publish | 确认并发布 | Only explicit external-write action |
| Reconnect YouTube | 重新连接 YouTube | Reauthorization action |
| Disconnect channel | 断开渠道 | Separate from data deletion |
| Delete JINGTANG data | 删除 JINGTANG 数据 | Does not delete third-party content |

JINGTANG and platform product names remain unchanged. The Chinese legal entity uses `鲸汤（上海）智能科技有限公司`; its English expression remains an owner-supplied, legally approved slot and is never invented by translation.

## Chinese Typography and Layout

- Editorial: `Noto Serif SC`, `Songti SC`, serif. Product/UI: `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, system sans-serif.
- Chinese uses natural punctuation, no uppercase transformation, no artificial letter spacing and a 1.55–1.75 body line height where density permits. Display line height is optically increased from the Latin setting.
- Controls size to content. Critical status, limitation, legal and destructive text may wrap; they may not be ellipsized, clipped, reduced below the minimum type token or hidden behind hover.
- Verify both locales at 1440, 1024, 768, 390 and 320 CSS px, 200% zoom, keyboard navigation and supported forced/contrast modes.

## Required Review Matrix

| Surface | `en` / `zh-CN` parity focus |
| --- | --- |
| Website | All routes, metadata/alternates, CTA, capability status, legal/security truth |
| Identity/Onboarding | Consent, validation, invitations, roles, locale preference |
| SaaS shell/Home | Navigation, attention, status, role-sensitive actions, formatting |
| Composer/Approval | Steps, platform fields, exact revision, user content unchanged, separate publish |
| Channels/Publish | Scope purpose, limitations, target account, confirmation, result/recovery |
| Disconnect/Delete | Exact target/scope, third-party distinction, progress, retry/support |

Release evidence includes catalog completeness, duplicate/conflicting translation checks, visual regression, corresponding-route switching, preference persistence, task-state preservation, safe fallback, semantic parity review and confirmation that locale switching never triggers an external command.
