# Delivery Baseline

Delivery: JINGTANG Social Platform Developer Review Enablement
Scope: project
Status: Approved
Baseline Revision: 6
Approval Source: Human Owner explicitly approved the recommended temporary review-environment plan on 2026-08-24 and authorized implementation after purchasing a 20 GB Tencent COS storage package. On 2026-08-24, the Human Owner additionally approved a cost-bounded amendment: the temporary Review environment uses a host-local envelope key, while staging and formal production continue to require KMS. On 2026-08-25, the Human Owner explicitly superseded the prior public-presentation decision: the current Seoul deployment remains a temporary review infrastructure boundary, while its website entry point and user-facing SaaS content must present the formal JINGTANG product without test, private-beta, or review-environment labeling. On 2026-08-26, the Human Owner approved the complete R3 Facebook Scope Approval package: exactly `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`; the documented data/deletion boundary; one controlled real Page-video Human E2E write; and a durable company-owned Meta App ID exception that preserves environment isolation for all runtime credentials, URLs, tokens and data. On 2026-08-27, the Human Owner approved moving Facebook reviewer materials and external applications to a unified R5 submission stage, formally accepted closure of R3 technical development, and authorized the start of TikTok R4 Scope Approval. Later on 2026-08-27, the Human Owner approved the complete R4 TikTok Scope package: Login Kit Web plus Direct Post Video, automatic `user.info.basic` plus exactly `video.publish`, a company TikTok Organization-owned durable App identity, `FILE_UPLOAD` only, unaudited private-account use with an explicitly selected `SELF_ONLY` privacy value, R4 implementation and one controlled private Human E2E publish. External TikTok review/audit, public `Available`, checkpoint and repository synchronization remain separately gated.

## Goal

在不把当前腾讯云首尔 Lighthouse 提升为最终正式生产基础设施、也不放宽其成本与安全边界的前提下，将该限时 SaaS 部署作为 JINGTANG 当前真实的对外产品入口：官网登录直达实际 SaaS，官网和 SaaS 以正式产品内容呈现，并按 Facebook 后 TikTok 的顺序形成真实、最小权限、可由第三方审核员复现的开发者审核纵向切片与提交材料。

## User Outcome

官网访客点击登录即可进入真实的 JINGTANG Workspace 登录页；获授权的演示用户及 Facebook、TikTok 审核员能够使用稳定 HTTPS 地址和专用账号完成真实端到端流程，看到准确的中英文法律、数据、能力和限制说明，而不会看到内部的 test、private beta、pre-launch 或 review-environment 标记。普通公众不会因此获得自助注册权限，也不会被误导为尚未完成的平台能力已经可用。

## Non-goals

- 本 Delivery 不把临时 `review` 基础设施认定为 D7 最终正式生产部署、正式生产安全证据或适合推广与规模化销售的运行环境；这不妨碍当前用户界面按正式产品呈现。
- 本 Delivery 不改变正式生产仍需独立腾讯云计算边界、TencentDB、TDMQ、CIAM、KMS-sealed COS Secret、CLS/Cloud Monitor 和受保护发布流程的要求。
- 本 Delivery 不以第三方最终批准、配额提升或审核时长作为团队可控的 Acceptance Criteria；只交付政策合规与提交就绪状态。
- 本 Delivery 不把 Facebook、TikTok 或其权限在未获批准且未完成真实生产发布前标记为 `Available`。
- 本 Delivery 不开放公众自助注册、自助密码重置或匿名产品访问，也不以官网真实登录入口作为当前推广或扩容授权。
- 本 Delivery 不删除对用户决策必要的真实能力限制；平台审核、可见性、配额、Scope 和不可用功能仍须准确显示，只移除内部交付阶段与测试环境措辞。
- 本 Delivery 不实现 Schedule、Ads、评论/私信管理、Social Listening、跨平台抓取搬运、批量迁移或高并发媒体处理。
- 本 Delivery 不在 Lighthouse 上运行视频转码、MinIO、Keycloak、RabbitMQ/TDMQ 替代集群或完整监控平台。
- Instagram 不因 Facebook 接入而自动纳入范围；任何 Instagram 权限或功能需要独立批准。

## Key Decisions

- `jingtangai.com` 继续独立提供已上线静态官网；其 English/简体中文登录入口直接指向当前真实 SaaS 的 `https://review.jingtangai.com/login`。`app.jingtangai.com` 保留给未来最终正式生产环境；迁移时必须先完成入口与法律/数据披露的一致切换。
- `review` 继续作为部署 profile、配置边界和运维术语，但不是用户可见的产品状态。SaaS 不显示 Review/Test、非销售、私有测试或预发布环境横幅；官网登录页、Security、Legal 和产品内容也不得以内部 Delivery/Stage/Gate 描述当前服务。
- 当前首尔 Lighthouse 的同机部署是限时、可撤销的物理共置例外。官网与 review SaaS 使用独立容器、Docker 网络、数据卷、配置命名空间、日志和发布目录；review 服务不得读写官网发布产物。
- review 环境使用独立本地 PostgreSQL、单 worker PostgreSQL transactional outbox、私有 COS 源素材、独立 OAuth App/Client、最小权限 COS CAM、host-local `local:v2` envelope key/store 和独立备份前缀。Review 根密钥与 detached key store 不进入备份；正式 staging/production 继续使用 KMS。该路径只证明审核用纵向切片，不替代正式生产的 dispatcher → TDMQ → worker 证据。
- review 身份仅允许预创建、明确授权的当前产品、演示和审核账号；关闭公开注册和自助密码重置，不使用固定测试验证码，不接受匿名产品访问。对外登录体验按正式 Workspace 呈现，不暴露底层身份适配器。
- 浏览器通过短时签名直接把源素材上传到私有 COS；应用服务器不持久保存媒体文件，也不做转码。单文件上限不超过 500 MiB，worker 外部发布并发固定为 1。
- 20 GB COS 的运行预算为最多约 15 GB 活跃源素材、3 GB 加密数据库备份、2 GB 对象版本和余量。资源包是计费抵扣而不是硬配额；达到软阈值时必须拒绝新上传并告警。
- 当前 SaaS 使用 `noindex`、HTTPS、速率限制、最小公网端口和专用账号；`noindex` 是当前受控访问策略，不得在 UI 中解释为测试状态。平台审核员可能来自不固定 IP，因此访问控制以应用账号和最小公开路由为主，不依赖全站 IP 白名单。
- 真实生产能力 Registry 在第三方批准、正式生产实现与 Production Gate 完成前保持 `Coming Soon` / `production_available: false`。
- 平台顺序为 Facebook 后 TikTok。每个平台先冻结 `Need → Permission → UI → User Action → Data → Retention → Deletion` 证据和最小 Scope，再使用外部凭证；不提前申请未实现权限。
- R3/R4 的技术 Stage Acceptance 可在该平台的 Scope Approval、实现、Code Review、Acceptance Review 和 Human E2E 均通过后完成；Reviewer Account、Instructions、Demo Script/Video、Business/Domain Verification、Advanced Access/Audit 和外部 App Review 统一移至 R5 Submission Readiness。后置只改变执行顺序，不代表材料已完成、外部申请已提交或平台能力已公开可用；Meta、Google/YouTube 和 TikTok 的验证与审核仍是彼此独立的外部流程。
- R3 Facebook 仅申请 `pages_show_list`、`pages_read_engagement` 和 `pages_manage_posts`；`public_profile` 为 Meta 自动登录权限。范围只包括用户明确选择的一张 Facebook Page、一个已审批 MP4、Publish Now、真实结果跟踪和 deny-first revoke/deauthorize/delete。Live、Reels、Profile、Group、Ads、Insights、Messaging、Webhook、Instagram、Threads、Schedule 及其他 Scope 均不在批准范围。
- Meta App ID 是由公司 Business Portfolio 持有的 durable external integration identity，可在 Review 到未来 production 的迁移中保留。Review user/Page tokens、授权记录、App Secret material、Redirect/Callback URL、数据、日志和运行配置不得复用；迁移前须撤销 Review 授权、销毁 Token Key、轮换 App Secret、移除 Review URL 并重新执行适用 Gate。Meta 是否延续 Advanced Access 或要求重新审核仍是外部状态。
- R4 TikTok 仅使用 Web Login Kit 与 Content Posting API Direct Post Video；`user.info.basic` 是自动登录权限，唯一申请 Scope 为 `video.publish`。媒体只通过 `FILE_UPLOAD` 在最终确认后从私有 COS 顺序流式传输；不使用 `PULL_FROM_URL`、`video.upload`、`video.list`、Display API、Share Kit、照片、Webhook、Schedule 或其他 TikTok 产品/Scope。
- 未通过 TikTok audit 前，R4 只允许受控私密 TikTok 账号和用户从 fresh Creator Info 返回值中手动选择 `SELF_ONLY`；Privacy 不设默认值，Comment/Duet/Stitch 默认关闭，商业内容与 AI 内容披露、Music/Branded Content policy consent 和准确账号/媒体/字段的 immutable final confirmation 均为外部写入前置条件。一次批准的私密 Human E2E 只能发布一份明确确认的 MP4，系统不得因重试静默创建第二条帖子。
- TikTok App 由公司 TikTok Organization 持有，是可跨 Review 与未来 production 迁移保留的 durable external integration identity。Review Client Secret、Token、Redirect URI、Sandbox 用户、授权记录、数据、日志和运行配置不得复用；迁移前须撤销 Review 授权、销毁 Token Key、轮换 Secret、移除 Review URL 并重新执行适用 Gate。TikTok audit/App Review 与公开可用状态仍是外部且单独审批的状态。
- 审核结束或 Human Owner 要求结束时，必须先把官网登录安全迁移到替代 SaaS 或恢复为准确的不可用状态，再停止 review 服务、撤销审核 OAuth/CAM 凭证、删除 review Workspace 和源素材、保留最小删除/审计证据，并验证官网无死链或错误能力声明。

## Preserved Constraints

- V1 Approved Baseline 的品牌、法律主体、用户控制、租户/RBAC、最小权限、真实撤销/删除、中英双语和真实能力状态约束继续适用。
- 官网现有生产可用性、DNS、TLS、Legal 页面和静态部署不得因 review 环境变更而回退。
- OAuth Token、平台 Secret、CAM 凭证和会话 Secret 不得进入 Git、容器镜像、浏览器、普通日志、错误消息、截图或审核视频。
- review 数据和凭证不得与未来 production 数据库、Bucket、KMS Key、OAuth Client、Redirect URI、Secret 或日志目标共享；Review 本地根密钥和 detached key store 也不得复用于 staging/production。Revision 4 批准的公司 Meta App ID 和 Revision 6 批准的公司 TikTok Organization/App identity 是非 Secret 的 durable external identities，可以保留；各自的 Review Secret、Token、授权数据、URL 和运行配置仍不得复用。
- 用户只发布其拥有或获授权的素材；外部写入仍需有权用户对准确平台、账号、素材和平台字段进行独立明确确认。
- Disconnect 必须先阻止新调用，再程序化撤销并清理 Token 和适用授权数据；Workspace/账号删除继续遵循既有 durable lifecycle 与 retention 约束。
- 当前临时基础设施不得被包装为最终生产架构或形成未经证实的安全承诺；官网 Security、Legal 和 Integration 只能描述已验证的当前服务事实及用户需要了解的真实限制，不得暴露内部 Stage/Gate，也不得把未来正式生产设计写成当前能力。

## Acceptance Criteria

- AC-01: `review.jingtangai.com` 使用有效 HTTPS、`noindex` 和稳定健康检查，并以正式 JINGTANG Workspace 呈现，不显示 Review/Test、非销售、私有测试或预发布环境标识；`jingtangai.com` 官网的 HTTPS、双语页面和静态运行不受影响。
- AC-02: Lighthouse 上的官网、review platform、worker 和 PostgreSQL 具备独立容器/网络/卷/配置边界；数据库、管理端口和 COS 对象均不公开。
- AC-03: 在 2 核 4 GB / 60 GB 主机上，低并发审核 journey 能稳定运行；worker 并发为 1，主机具备受控 swap、容器内存/日志限制、磁盘和 COS 容量告警，媒体不落主机持久盘。
- AC-04: review 账号只能由受保护操作创建；公开注册和自助重置不可用；Session/OAuth Cookie 在 HTTPS 上使用 Secure、HttpOnly 和适用 SameSite 属性。
- AC-05: 浏览器使用短时签名向首尔私有 COS 直接上传，500 MiB 上限和 15 GB 活跃素材软配额被执行；删除、非当前对象版本和备份遵守已披露的 retention/lifecycle。
- AC-06: review OAuth Token 使用独立 `local:v2` envelope 加密边界：每个连接使用独立数据密钥，256-bit 根密钥与 detached key store 仅存在于受保护主机持久卷和 root-managed `0400`/`0700` 运行边界，不进入数据库或 COS 备份；断开/删除须精确销毁对应 key reference，主机或根密钥丢失时须重新连接渠道。静态 CAM 凭证只允许访问命名的 review COS 前缀，不得拥有 KMS 权限，并在 review 结束后轮换或删除。Staging/production 的 KMS 要求保持不变。
- AC-07: Facebook 审核切片以当前官方机制完成真实 OAuth、目标 Page/账号识别、最小权限发布、真实结果跟踪、Disconnect/Revoke/Delete 和双语故障恢复；每项申请权限都能追溯到真实 UI 和用户动作。
- AC-08: TikTok 审核切片以 Web Login Kit、自动 `user.info.basic` 和唯一申请 Scope `video.publish` 完成真实 OAuth、fresh Creator Info、无默认 Privacy、手动 `SELF_ONLY`、`FILE_UPLOAD` Direct Post、真实异步结果跟踪、Disconnect/Revoke/Delete 和双语故障恢复。Comment/Duet/Stitch 默认关闭；商业内容、AI 内容与 TikTok policy consent 进入 immutable confirmation；一次受控私密 Human E2E 不得产生重复帖子。
- AC-09: R5 宣布统一提交就绪前，Facebook 和 TikTok 分别具备 Reviewer Account、Instructions、Scope/Permission Matrix、Data Flow/Retention/Deletion 说明、支持联系人和完整 E2E Demo Script/Video；内容与实际 App 配置一致。该材料包不再阻塞已完成技术 Gate 的 R3/R4 Stage Acceptance，但不得因后置而被记为已完成或已提交。
- AC-10: review 环境中的登录、角色、Content、审批、确认、外部执行、失败、断开、撤销和删除仍保持租户隔离、RBAC、审计和中英双语语义；不依赖模拟平台成功或人工改库证明闭环。
- AC-11: `jingtangai.com` 的 English/简体中文登录操作直接进入 `https://review.jingtangai.com/login`，且保留无自助注册的账号控制；Registry 与官网在第三方批准和正式生产 Gate 完成前继续显示 Facebook/TikTok `Coming Soon`，不提供其可执行入口。
- AC-12: R3/R4 技术 Stage Acceptance 不等于第三方提交就绪。R5 只有在统一材料、验证前置条件和实际 App 配置全部一致后，才能记录各平台的 `submission_ready` 并另行请求外部提交授权；第三方决定只记录为外部状态，不改变 Delivery Acceptance。
- AC-13: review 环境每日生成加密 PostgreSQL 备份并上传独立 COS 前缀/Bucket，保留 7 天；至少一次隔离恢复演练通过，且备份不包含明文 Secret。
- AC-14: 结束 review 环境时，官网登录已安全迁移或准确回退，专用 OAuth/CAM 凭证被撤销，Review 数据和源素材按既有 deletion/retention 控制清理，官网继续正常且无死链；未来 production 仍需从独立受控资源部署而非原地提升该环境。

## Authoritative References

- [V1 Approved Baseline](../jingtang-overseas-website-saas-v1-launch/BASELINE.md) — 继续拥有产品身份、V1 用户控制和全局 preserved constraints；本 Delivery 不修订其已接受结果。
- [Architecture Authority](../../architecture/README.md) — 拥有正式生产与临时 review 运行边界。
- [Security and Data Authority](../../security-and-data/README.md) — 拥有数据流、保留、加密、删除和环境隔离义务。
- [Integration Registry](../../../config/integrations.yaml) — 拥有实际平台能力、Scope intent 与公开状态。
- [Meta App Review Submission Guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide) — Facebook 审核材料与可复现访问约束。
- [TikTok App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines) — TikTok Sandbox、产品、Scope、演示和审核约束。
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started) — TikTok 视频发布能力和审核边界。

## Revision Record

- Revision 1 — 2026-08-24: Human Owner approved the temporary, non-sales Review environment on the existing Seoul Lighthouse and a 20 GB COS budget.
- Revision 2 — 2026-08-24: Human Owner approved replacing paid Tencent KMS only in the temporary Review profile with the existing `local:v2` envelope implementation. Review root/wrapped-key files remain host-local and excluded from backup; staging and production KMS requirements are unchanged.
- Revision 3 — 2026-08-25: Human Owner explicitly superseded the prior public-presentation decisions. The current Seoul deployment remains temporary, capacity-bounded, non-promoted review infrastructure, but the official website now links to its real login and all public/SaaS content presents the formal JINGTANG product without test, private-beta, pre-launch, internal Delivery, or review-environment labeling. Account controls, truthful platform limitations, future production architecture, and capability Registry gates remain unchanged.
- Revision 4 — 2026-08-26: Human Owner approved the complete R3 Facebook Scope package. R3 is limited to `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`, one selected Page, one explicitly confirmed MP4 Publish Now flow, real result tracking, provider revocation/deauthorization/deletion and one controlled real Human E2E write. A company-owned Meta App ID may remain durable across the later infrastructure migration, but Review tokens, Secret material, redirect/callback URLs, data and runtime configuration remain isolated and must be retired before final-production cutover. External App Review submission and public availability remain separately gated.
- Revision 5 — 2026-08-27: Human Owner approved a unified R5 submission stage for Facebook/TikTok reviewer accounts, instructions, demo scripts/videos, Business/Domain Verification, Advanced Access/Audit and external App Review applications; these artifacts no longer block a platform slice whose technical Gates and Human E2E have passed. The Human Owner formally accepted R3 technical closure and authorized only the R4 TikTok Scope Approval activity. Public availability, TikTok App/credential creation, TikTok permissions, implementation, Human E2E writes, external submissions, checkpoints and repository synchronization remain separately gated.
- Revision 6 — 2026-08-27: Human Owner approved the complete R4 TikTok Scope package: Login Kit Web plus Direct Post Video; automatic `user.info.basic` plus exactly `video.publish`; a company TikTok Organization-owned durable App; `FILE_UPLOAD` only; unaudited controlled private-account use with manually selected `SELF_ONLY`; implementation and one controlled private Human E2E publish. Public availability, external TikTok audit/App Review, checkpoint and repository synchronization remain separately gated.
