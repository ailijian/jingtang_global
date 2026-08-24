# Delivery Baseline

Delivery: JINGTANG Social Platform Developer Review Enablement
Scope: project
Status: Approved
Baseline Revision: 2
Approval Source: Human Owner explicitly approved the recommended temporary review-environment plan on 2026-08-24 and authorized implementation after purchasing a 20 GB Tencent COS storage package. On 2026-08-24, the Human Owner additionally approved a cost-bounded amendment: the temporary Review environment uses a host-local envelope key, while staging and formal production continue to require KMS.

## Goal

在不改变 JINGTANG 真实生产服务器、托管数据服务和安全边界要求的前提下，使用当前腾讯云首尔 Lighthouse 与新购 20 GB COS 建立一个限时、受保护、非销售用途的 SaaS `review` 环境，并按 Facebook 后 TikTok 的顺序形成真实、最小权限、可由第三方审核员复现的开发者审核纵向切片与提交材料。

## User Outcome

JINGTANG 团队能够向 Facebook 和 TikTok 审核员提供稳定 HTTPS 地址、专用审核账号、准确的中英文法律与数据说明、逐步操作指引和真实端到端演示；审核员能够在受保护环境中连接其允许的测试账号、上传授权素材、明确确认写入、查看真实结果并验证断开、撤销和删除控制。普通公众不会被误导为这些平台已经正式可用。

## Non-goals

- 本 Delivery 不把临时 `review` 环境认定为 D7 正式生产部署、生产安全证据或可公开销售的 SaaS。
- 本 Delivery 不改变正式生产仍需独立腾讯云计算边界、TencentDB、TDMQ、CIAM、KMS-sealed COS Secret、CLS/Cloud Monitor 和受保护发布流程的要求。
- 本 Delivery 不以第三方最终批准、配额提升或审核时长作为团队可控的 Acceptance Criteria；只交付政策合规与提交就绪状态。
- 本 Delivery 不把 Facebook、TikTok 或其权限在未获批准且未完成真实生产发布前标记为 `Available`。
- 本 Delivery 不实现 Schedule、Ads、评论/私信管理、Social Listening、跨平台抓取搬运、批量迁移或高并发媒体处理。
- 本 Delivery 不在 Lighthouse 上运行视频转码、MinIO、Keycloak、RabbitMQ/TDMQ 替代集群或完整监控平台。
- Instagram 不因 Facebook 接入而自动纳入范围；任何 Instagram 权限或功能需要独立批准。

## Key Decisions

- `jingtangai.com` 继续独立提供已上线静态官网；临时 SaaS 使用 `review.jingtangai.com`。`app.jingtangai.com` 保留给未来正式生产环境。
- 当前首尔 Lighthouse 的同机部署是限时、可撤销的物理共置例外。官网与 review SaaS 使用独立容器、Docker 网络、数据卷、配置命名空间、日志和发布目录；review 服务不得读写官网发布产物。
- review 环境使用独立本地 PostgreSQL、单 worker PostgreSQL transactional outbox、私有 COS 源素材、独立 OAuth App/Client、最小权限 COS CAM、host-local `local:v2` envelope key/store 和独立备份前缀。Review 根密钥与 detached key store 不进入备份；正式 staging/production 继续使用 KMS。该路径只证明审核用纵向切片，不替代正式生产的 dispatcher → TDMQ → worker 证据。
- review 身份仅允许预创建、明确授权的审核账号；关闭公开注册和自助密码重置，不使用固定测试验证码，不接受匿名产品访问。
- 浏览器通过短时签名直接把源素材上传到私有 COS；应用服务器不持久保存媒体文件，也不做转码。单文件上限不超过 500 MiB，worker 外部发布并发固定为 1。
- 20 GB COS 的运行预算为最多约 15 GB 活跃源素材、3 GB 加密数据库备份、2 GB 对象版本和余量。资源包是计费抵扣而不是硬配额；达到软阈值时必须拒绝新上传并告警。
- review 环境使用 `noindex`、HTTPS、速率限制、最小公网端口和专用审核账号。平台审核员可能来自不固定 IP，因此访问控制以应用账号和最小公开路由为主，不依赖全站 IP 白名单。
- 真实生产能力 Registry 在第三方批准、正式生产实现与 Production Gate 完成前保持 `Coming Soon` / `production_available: false`。
- 平台顺序为 Facebook 后 TikTok。每个平台先冻结 `Need → Permission → UI → User Action → Data → Retention → Deletion` 证据和最小 Scope，再使用外部凭证；不提前申请未实现权限。
- 审核结束或 Human Owner 要求结束时，停止 review 服务、撤销审核 OAuth/CAM 凭证、删除 review Workspace 和源素材、保留最小删除/审计证据，并验证官网未受影响。

## Preserved Constraints

- V1 Approved Baseline 的品牌、法律主体、用户控制、租户/RBAC、最小权限、真实撤销/删除、中英双语和真实能力状态约束继续适用。
- 官网现有生产可用性、DNS、TLS、Legal 页面和静态部署不得因 review 环境变更而回退。
- OAuth Token、平台 Secret、CAM 凭证和会话 Secret 不得进入 Git、容器镜像、浏览器、普通日志、错误消息、截图或审核视频。
- review 数据和凭证不得与未来 production 数据库、Bucket、KMS Key、OAuth Client、Redirect URI、Secret 或日志目标共享；Review 本地根密钥和 detached key store 也不得复用于 staging/production。
- 用户只发布其拥有或获授权的素材；外部写入仍需有权用户对准确平台、账号、素材和平台字段进行独立明确确认。
- Disconnect 必须先阻止新调用，再程序化撤销并清理 Token 和适用授权数据；Workspace/账号删除继续遵循既有 durable lifecycle 与 retention 约束。
- 临时环境不得形成新的公开安全承诺；官网 Security 和 Integration 状态只描述已证实的正式生产事实。

## Acceptance Criteria

- AC-01: `review.jingtangai.com` 使用有效 HTTPS、明确的 Review/Test 环境标识、`noindex` 和稳定健康检查；`jingtangai.com` 官网的 HTTPS、双语页面和静态运行不受影响。
- AC-02: Lighthouse 上的官网、review platform、worker 和 PostgreSQL 具备独立容器/网络/卷/配置边界；数据库、管理端口和 COS 对象均不公开。
- AC-03: 在 2 核 4 GB / 60 GB 主机上，低并发审核 journey 能稳定运行；worker 并发为 1，主机具备受控 swap、容器内存/日志限制、磁盘和 COS 容量告警，媒体不落主机持久盘。
- AC-04: review 账号只能由受保护操作创建；公开注册和自助重置不可用；Session/OAuth Cookie 在 HTTPS 上使用 Secure、HttpOnly 和适用 SameSite 属性。
- AC-05: 浏览器使用短时签名向首尔私有 COS 直接上传，500 MiB 上限和 15 GB 活跃素材软配额被执行；删除、非当前对象版本和备份遵守已披露的 retention/lifecycle。
- AC-06: review OAuth Token 使用独立 `local:v2` envelope 加密边界：每个连接使用独立数据密钥，256-bit 根密钥与 detached key store 仅存在于受保护主机持久卷和 root-managed `0400`/`0700` 运行边界，不进入数据库或 COS 备份；断开/删除须精确销毁对应 key reference，主机或根密钥丢失时须重新连接渠道。静态 CAM 凭证只允许访问命名的 review COS 前缀，不得拥有 KMS 权限，并在 review 结束后轮换或删除。Staging/production 的 KMS 要求保持不变。
- AC-07: Facebook 审核切片以当前官方机制完成真实 OAuth、目标 Page/账号识别、最小权限发布、真实结果跟踪、Disconnect/Revoke/Delete 和双语故障恢复；每项申请权限都能追溯到真实 UI 和用户动作。
- AC-08: TikTok 审核切片以当前官方 Sandbox/Review 机制完成真实 OAuth、Creator/账号识别、最小权限视频发布或上传、真实结果跟踪、Disconnect/Revoke/Delete 和双语故障恢复；每项申请权限都能追溯到真实 UI 和用户动作。
- AC-09: Facebook 和 TikTok 分别具备 Reviewer Account、Instructions、Scope/Permission Matrix、Data Flow/Retention/Deletion 说明、支持联系人和完整 E2E Demo Script/Video；内容与实际 App 配置一致。
- AC-10: review 环境中的登录、角色、Content、审批、确认、外部执行、失败、断开、撤销和删除仍保持租户隔离、RBAC、审计和中英双语语义；不依赖模拟平台成功或人工改库证明闭环。
- AC-11: Registry 与官网在第三方批准和正式生产 Gate 完成前继续显示 Facebook/TikTok `Coming Soon`，review URL 不成为公众产品 CTA。
- AC-12: 每个平台达到团队可控的政策合规与提交就绪状态后可提交第三方审核；第三方决定只记录为外部状态，不改变 Delivery Acceptance。
- AC-13: review 环境每日生成加密 PostgreSQL 备份并上传独立 COS 前缀/Bucket，保留 7 天；至少一次隔离恢复演练通过，且备份不包含明文 Secret。
- AC-14: 结束 review 环境时，专用 OAuth/CAM 凭证被撤销，Review 数据和源素材按既有 deletion/retention 控制清理，官网继续正常，未来 production 仍需从独立受控资源部署而非原地提升该环境。

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
