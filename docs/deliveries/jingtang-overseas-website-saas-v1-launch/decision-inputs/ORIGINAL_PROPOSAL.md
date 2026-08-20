# 鲸汤 JINGTANG 海外官网与 SaaS 第一版上线方案 v0.3（定稿版）

**文档版本：** v0.3  
**状态：** 定稿  
**公司主体：** 鲸汤（上海）智能科技有限公司  
**海外品牌：** JINGTANG  
**适用范围：** 海外官网、SaaS 第一版、开发者平台审核、数据治理、安全与上线验收  
**政策校核日期：** 2026 年 8 月 20 日

---

# 一、文档定位

本方案作为 JINGTANG 海外业务第一版统一基线，供以下团队共同执行：

- 公司管理层
- 产品
- UI / UX
- 前端
- 后端
- DevOps
- 安全
- 法务 / 隐私
- 海外市场
- Developer Review 负责人
- 销售及客户成功

本方案统一解决五类问题：

1. JINGTANG 对外到底是什么公司；
2. 第一版到底开发什么、不开发什么；
3. 官网应该宣传什么、不应该宣传什么；
4. SaaS 如何满足真实企业客户使用需求；
5. 产品如何满足 Google / YouTube、TikTok 以及后续 Meta、LinkedIn 等开发者审核要求。

本版本延续 v0.1 已确定的四个核心目标：

- 销售获客
- 产品可信度
- 开发者审核
- 品牌建设

并继续以真实完成：

> 账号授权 → 内容创建 → 审批 → 发布 → 状态跟踪

作为第一版核心验收方向。

---

# 二、v0.3 核心决策

本版本正式冻结以下决策。

## 2.1 JINGTANG 是 SaaS，不是代运营工具

公司定位：

> **Global Marketing Technology Company**

战略定位：

> **Global Marketing Infrastructure**

产品定位：

> **Global content operations and AI visibility.**

第一版核心产品：

> **Global Social Publishing + Enterprise Content Workflow**

---

## 2.2 第一版不追求功能数量

第一版唯一核心目标：

> 一个真实企业能够安全连接自己授权的海外社交账号，由企业成员完成内容创建、审核和明确发布，并能够查看结果、撤销授权和删除相关数据。

第一版必须做到：

> **真实、完整、安全、可审核、可删除、可演示。**

---

## 2.3 官网只宣传真实能力

官网严格区分三种状态：

### Available

已经在生产产品中真实可使用。

### Beta / Early Access

已经存在真实产品，但仍处于受限测试阶段。

### Coming Soon

尚未正式提供。

禁止：

> 产品尚未实现，却在官网写成 Supported / Available。

---

## 2.4 AI Visibility 不阻塞第一版 Social Publishing 上线

AI Visibility 是 JINGTANG 的长期核心产品方向。

但如果第一版 SaaS 尚未具备真实：

- Prompt Tracking
- Brand Monitoring
- Competitor Comparison
- Citation Analysis
- AI Visibility Dashboard

则官网只能将其定义为：

> **AI Visibility Services**

或：

> **AI Visibility — Early Access**

不能宣传为已经完整上线的 SaaS 模块。

当相关 SaaS 功能真实上线后，再升级为正式 Platform Product。

---

# 三、品牌体系

## 3.1 法律主体

公司正式法律主体：

> **鲸汤（上海）智能科技有限公司**

所有：

- Privacy Policy
- Terms of Service
- Developer Account
- Google Cloud
- Meta Business
- TikTok Developer
- LinkedIn Developer
- 合同
- 发票
- DPA

中的主体必须一致。

---

# 四、海外品牌

海外统一品牌：

# JINGTANG

推荐书写：

> JINGTANG

或：

> Jingtang

不使用：

> Whale Soup

作为海外品牌名称。

---

# 五、正式英文法律名称

如果鲸汤已经存在正式登记或长期统一使用的英文法律名称，则所有海外法律和开发者账号统一使用。

如果暂时没有：

法律页面可以明确写：

> JINGTANG is operated by 鲸汤（上海）智能科技有限公司.

但在 Developer Review 正式提交前，公司必须内部冻结唯一英文主体表达。

禁止：

- 市场一个英文名称
- Google Cloud 一个英文名称
- TikTok 一个英文名称
- 合同另一个英文名称

---

# 六、品牌身份一致性

以下必须形成一套身份：

| 场景 | 统一要求 |
|---|---|
| Brand | JINGTANG |
| Website | JINGTANG |
| SaaS | JINGTANG |
| Google OAuth App | JINGTANG |
| Meta App | JINGTANG |
| TikTok App | JINGTANG |
| LinkedIn App | JINGTANG |
| Company | 鲸汤（上海）智能科技有限公司 |
| Support | support@官方域名 |
| Privacy | privacy@官方域名 |
| Security | security@官方域名 |

---

# 七、域名

正式 Developer Review 前必须冻结官方品牌主域名。

推荐结构：

```text
brand.com
```

官网。

```text
app.brand.com
```

SaaS。

```text
docs.brand.com
```

帮助文档 / API Documentation。

```text
status.brand.com
```

服务状态。

正式域名确定后替换本文中的 `brand.com`。

---

# 八、域名属于上线 P0 Gate

域名不是普通市场事项。

正式申请 Google / TikTok 等生产权限前必须完成：

- 域名所有权
- HTTPS
- DNS
- 企业邮箱
- Google Domain Verification
- TikTok URL Ownership Verification
- OAuth Redirect URI
- Privacy URL
- Terms URL
- Data Deletion URL

Google 外部生产应用要求 Homepage 位于开发者拥有并验证的域名，并且 Homepage、Privacy Policy 与 OAuth 配置需要保持一致。

TikTok 对相关 Website、Privacy、Terms 及 Content Posting 使用的 URL 也有 URL Ownership Verification 要求。

---

# 九、公司定位

推荐英文介绍：

> JINGTANG is a global marketing technology company building secure content operations, publishing workflows and AI visibility infrastructure for businesses expanding internationally.

中文：

> 鲸汤是一家全球营销科技公司，为国际化发展的企业提供全球内容运营、营销自动化和 AI 搜索可见性基础设施。

---

# 十、首页产品定位

不直接在 Hero 使用过度抽象的：

> Enterprise Global Marketing Infrastructure

首页首先让用户理解产品用途。

推荐：

# Global content operations for businesses going worldwide.

副标题：

> Connect your authorized social accounts, manage content workflows and publish across global platforms from one workspace.

当 AI Visibility SaaS 正式上线后，可升级为：

> Manage global social publishing, content workflows and AI visibility from one workspace.

---

# 十一、品牌 Slogan

品牌级推荐：

# Go Global. Get Discovered.

产品营销可使用：

> Go Global. Publish Everywhere.

AI Visibility 上线后：

> Go Global. Publish Everywhere. Build AI Visibility.

---

# 十二、目标客户

## 12.1 Manufacturers

包括：

- 机械设备
- 汽车零部件
- 新能源
- 储能
- 工业设备
- 电子
- 消费电子

---

## 12.2 Global / Cross-border Brands

包括：

- DTC
- Shopify
- Amazon Seller
- 消费品牌
- 跨境品牌

---

## 12.3 B2B Exporters

重点依赖：

- YouTube
- LinkedIn
- Facebook
- Google
- AI Search

---

## 12.4 Marketing Agencies

提供：

> Multi-tenant Agency Workspace

未来支持一个 Agency 管理多个客户 Workspace。

Agency 能力不要求第一版全部完成。

---

# 十三、第一版产品边界

第一版 SaaS 产品冻结为：

# Social Publishing

加：

# Basic Enterprise Content Workflow

不建设大而全 Marketing Automation Platform。

---

# 十四、第一版必须开发

## Account

- Sign Up
- Login
- Logout
- Password Reset / equivalent identity flow

## Workspace

- Create Workspace
- Workspace Settings

## Team

- Invite Member
- Remove Member
- Basic Roles

## Channels

- Connect Account
- OAuth
- Reauthorization
- Disconnect

## Content

- Upload Video / Media
- Create Post
- Edit
- Platform Customization
- Preview

## Workflow

- Draft
- Submit for Approval
- Approve
- Reject

## Publishing

- Publish Now
- Schedule：仅对已经验证技术与平台合规性的渠道开放
- Publishing Status
- Publishing History
- Retry / Needs Attention

## Governance

- Audit Log

## Privacy

- Data Deletion
- Account Deletion
- Platform Data Cleanup

---

# 十五、第一版明确不做

- 通用 Low-code Workflow Builder
- Ads Management
- CRM
- DM Management
- Comment Management
- Social Listening
- Influencer Management
- AI Customer Service
- Full BI
- Advanced Social Analytics
- Automatic Video Editing
- Advanced AI Video Generation
- Hundreds of Integrations

避免：

> 第一版产品非常大，但核心授权和发布流程不稳定。

---

# 十六、Workflow Automation 第一版边界

第一版不建设 Zapier 式系统。

只支持：

```text
Draft
↓
Submit for Approval
↓
Approve / Reject
↓
Publish / Schedule
```

未来二期再增加：

- Conditional Workflow
- Webhook
- CRM
- DAM
- CMS
- Slack
- 飞书
- 企业微信
- 钉钉

---

# 十七、RBAC 第一版边界

第一版使用四类权限即可。

## Owner / Admin

- Workspace
- Members
- Channels
- OAuth
- Settings

## Editor

- Upload
- Create
- Edit
- Submit

## Approver / Publisher

- Approve
- Reject
- Publish

## Viewer

只读。

未来 Enterprise 再细分：

- Admin
- Approver
- Publisher
- Editor
- Analyst
- Viewer

---

# 十八、核心用户流程

```text
Sign Up
↓
Create Workspace
↓
Invite Member
↓
Assign Role
↓
Connect Social Account
↓
OAuth
↓
Upload Content
↓
Customize per Platform
↓
Preview
↓
Submit
↓
Approve
↓
Publish / Schedule
↓
Track Status
↓
Audit
↓
Disconnect
↓
Delete Related Data
```

---

# 十九、平台支持状态

第一版网站与产品统一使用：

## Available

真实生产可用。

## Beta

真实可用，但受测试规模、平台审核或配额约束。

## Coming Soon

尚不能使用。

---

# 二十、第一版平台 Roadmap

## Wave 1

优先：

- YouTube
- Facebook
- Instagram

但只有真正完成生产接入的平台才能标记：

> Available

---

## Wave 2

TikTok。

在正式完成 TikTok Audit 前：

官网建议：

> TikTok — Coming Soon

或：

> TikTok Publishing — Private Beta

不得宣传成：

> Public TikTok Publishing Available

---

## Wave 3

- LinkedIn
- Pinterest
- X

根据商业需求和审核情况逐项接入。

---

# 二十一、多平台内容模型

用户上传：

> 自己拥有或获得合法授权的原始素材。

一个 Source Asset 可以创建多个平台版本。

例如：

### YouTube Version

- Title
- Description
- Privacy
- Audience Settings
- Other supported metadata

### Instagram Version

- Caption
- Media Format
- Supported publishing options

### TikTok Version

- Caption / Title
- Privacy
- Interaction Settings
- Disclosure

平台版本彼此独立。

---

# 二十二、禁止自动跨平台搬运

JINGTANG 的“多平台发布”定义为：

> 用户拥有合法权利的原始素材，通过 JINGTANG 分别发布到用户明确选择的平台。

禁止产品逻辑：

> 从 YouTube / Instagram / Facebook 等第三方平台自动抓取、下载任意内容并重新搬运至 TikTok。

TikTok 当前明确要求 Direct Post 用于真实创作者发布原创内容，不接受将其他平台任意内容复制到 TikTok 的产品用途。

---

# 二十三、产品状态模型

统一状态：

- Draft
- Pending Approval
- Rejected
- Approved
- Scheduled
- Publishing
- Processing
- Published
- Failed
- Needs Attention
- Cancelled

---

# 二十四、Audit Log

一期必须上线基础 Audit Log。

至少记录：

- Login
- Member Invite
- Role Change
- Account Connect
- Account Disconnect
- Reauthorization
- Create Content
- Edit Content
- Submit
- Approve
- Reject
- Publish
- Schedule
- Cancel
- Publish Result
- Data Deletion

字段：

- User
- Workspace
- Action
- Target
- Timestamp
- Result
- Relevant technical metadata

---

# 二十五、OAuth 原则

所有社交媒体账号通过官方授权机制连接。

JINGTANG：

- 不要求客户提供平台密码
- 不保存平台密码
- 不模拟登录
- 不绕过 OAuth
- 不共享 API Credentials
- 不使用客户 Cookie 作为平台认证方案

前台明确：

> **We never ask for or store your social media passwords.**

---

# 二十六、OAuth Token Storage

根据平台要求可能保存：

- Access Token
- Refresh Token
- Scope
- Account ID
- Channel / Page ID
- Account Name
- Authorization Time
- Expiration
- Workspace ID
- Connected By

Token 必须：

- 加密保存
- 严格限制内部访问
- 不写入普通日志
- 不返回前端无关页面
- 不出现在错误信息中

---

# 二十七、OAuth Lifecycle

```text
Connect
↓
Authorization
↓
Encrypted Storage
↓
Authorized Use
↓
Refresh
↓
Reauthorization if required
↓
Disconnect
↓
Revoke
↓
Delete Token
↓
Delete Required Related Data
↓
Audit Log
```

Disconnect 不能仅修改数据库状态。

必须执行对应平台真实撤销 / 清理动作。

---

# 二十八、Google / YouTube 审核体系

JINGTANG 内部必须明确区分：

## Google OAuth Verification

验证：

- App Identity
- Branding
- Domain
- Privacy
- Scope
- OAuth Flow
- User Data Use

和：

## YouTube API Compliance Audit

验证：

- YouTube API 使用
- 产品用途
- 用户控制
- 数据处理
- Developer Policies
- Required Minimum Functionality
- Upload / Quota Compliance

两者不得混为一谈。

---

# 二十九、YouTube 第一版上线 Gate

如果 API 项目尚未通过相关 YouTube Compliance Audit：

通过 `videos.insert` 上传的视频会受到 Private Viewing 限制。

因此：

> **“公开发布 YouTube 视频”属于审核完成后的功能。**

正式产品状态必须与实际 API 项目状态一致。

---

# 三十、YouTube 配额

当前默认 YouTube Data API 配额体系包括：

- `videos.insert` 独立默认调用额度；
- `search.list` 独立默认调用额度；
- 其他端点的综合日配额。

如业务需要超出默认配额，需要按照 YouTube 当前流程申请增加，并接受对应 Compliance Audit。

具体数字属于可变化的平台配置：

> 不写死在产品商业宣传中。

后台必须建设：

- Quota Monitoring
- Quota Error Handling
- Retry / Needs Attention

---

# 三十一、YouTube Homepage / OAuth Identity

生产 OAuth App 必须做到：

- Homepage 位于已验证自有域名；
- Homepage 明确说明 JINGTANG 是什么；
- 不能只有 Login；
- Privacy Policy 可直接访问；
- OAuth App Name 与产品身份一致；
- Homepage / Privacy / Terms 与 Google Cloud 配置一致。



---

# 三十二、YouTube Privacy Policy 强制内容

Privacy Policy 必须明确说明：

> JINGTANG uses YouTube API Services.

并说明：

- 获取哪些 Google / YouTube 数据；
- 为什么获取；
- 如何使用；
- 是否分享；
- 保存在哪里；
- 保存多久；
- 如何删除；
- 如何联系 JINGTANG。

必须链接：

- Google Privacy Policy
- Google Security Settings / 权限撤销页面

YouTube 当前政策明确要求这些披露。

---

# 三十三、YouTube Terms 强制内容

JINGTANG Terms 必须：

1. 显示 YouTube Terms of Service 链接；
2. 明确说明用户使用 JINGTANG 的 YouTube 功能时，同时同意遵守 YouTube Terms of Service。



---

# 三十四、用户 Privacy Consent

用户在第一次访问需要 YouTube API 的产品功能前：

必须已经主动同意：

- Privacy Policy
- Terms of Service

建议注册时：

```text
[ ] I agree to the Terms of Service and Privacy Policy.
```

后台保存：

- User ID
- Terms Version
- Privacy Version
- Consent Timestamp

YouTube 当前政策要求用户同意 Privacy Policy 后才能访问 API Client 功能。

如果 Google 用户数据用途发生实质变化：

重新通知并根据适用政策获取新的有效同意。

---

# 三十五、YouTube Scope 原则

只申请：

> **Minimum Necessary Scope**

第一版禁止为了未来可能使用的功能提前申请大量 Scope。

每一个 Scope 必须在 Developer Review Matrix 中回答：

- 为什么需要；
- 对应什么 UI；
- 用户在哪里触发；
- 为什么更窄权限不够；
- 获取什么数据；
- 保存什么数据。

不需要的 Scope：

> 不申请。

---

# 三十六、YouTube 发布页面

第一版至少展示：

## Channel

用户清楚知道发布到哪个 YouTube Channel。

## Video

即将发布的视频。

## Title

用户可编辑。

## Description

用户可编辑。

## Privacy

用户主动选择：

- Public
- Unlisted
- Private

## Audience / Other Required Settings

根据实际 API 和业务功能展示。

## Preview / Review

明确最终数据。

## Publish Confirmation

用户主动确认。

YouTube Required Minimum Functionality 要求上传客户端至少允许用户设置 Title、Description 和 Privacy Status。

---

# 三十七、YouTube 用户最终控制权

系统可以：

- AI 建议标题
- AI 建议 Description
- AI 翻译
- 推荐 Tags

但是：

用户必须：

- 能看见
- 能修改
- 能拒绝
- 对最终上传内容拥有最终控制权

系统不得未经明确同意：

- 修改用户 Title
- 追加 JINGTANG 广告
- 自动插入宣传文字
- 静默改变用户字段

YouTube Developer Policy 明确要求写入操作由用户最终控制。

---

# 三十八、YouTube 多平台选择

如果一个 Create Post 同时支持多个平台：

用户必须能够：

- 选中 YouTube
- 取消 YouTube
- 选中其他平台
- 分别确认平台版本

不能：

> 用户只点击一次模糊的 Publish，然后系统偷偷发布所有连接账号。

---

# 三十九、YouTube Data Lifecycle

这是第一版 P0。

## Token

根据有效授权和适用规则保存。

## 普通 Authorized API Data

除政策明确允许长期保存的类型外：

> 最长保存 30 个自然日，然后必须 Refresh 或 Delete。

## Authorized Statistical Data

如果属于政策允许长期保存的统计数据：

仍需要至少每 30 天验证：

- 用户授权仍有效；
- 对应资源仍存在。

## User Deletion Request

用户要求删除 JINGTANG 保存的 YouTube 相关用户数据时：

> 尽快删除，最长不得超过 7 个自然日。



---

# 四十、YouTube Disconnect

用户点击：

> Disconnect YouTube

系统必须：

1. 立即停止新 API 操作；
2. 程序化撤销对应 Token；
3. 删除 Token；
4. 清理授权相关数据；
5. 记录 Audit Log；
6. 按 YouTube 政策时限完成数据删除。

通过 JINGTANG 自有撤销机制撤销授权后，相关授权数据应尽快删除，并在 7 个自然日内完成。

---

# 四十一、Google Security Settings 撤销

用户也可能不在 JINGTANG 中点击 Disconnect，而是在 Google 账号安全页面撤销权限。

因此后台必须：

- 定期确认 Token 有效性；
- 处理 Refresh Failure；
- 识别授权已撤销；
- 停止 API 操作；
- 触发对应数据清理。



---

# 四十二、YouTube Data Deletion 页面

`/data-deletion`

必须明确区分：

## Delete data stored by JINGTANG

删除：

- Token
- Channel connection
- Related API data

和：

## Delete content stored by YouTube

JINGTANG 删除自己的数据：

> 不等于删除 YouTube 平台上的内容。

用户如果要删除 YouTube 自身数据，需要通过：

- YouTube
- 或拥有相应权限并明确执行删除操作的授权客户端

进行。

---

# 四十三、YouTube Analytics 第一版边界

第一版只展示 Operational Data：

- Publish Status
- Published Time
- Platform URL / ID
- Failure
- Retry
- Processing Status

暂不建设：

- JINGTANG Engagement Score
- Growth Score
- Performance Index
- 基于 YouTube API Data 的自定义派生排名

YouTube 当前对 API Data 派生指标有专门限制和额外政策要求。第一版主动排除，降低审核风险。

---

# 四十四、Google / YouTube Demo Video

审核视频必须使用：

> 与正式提交完全相同的生产 App。

建议完整展示：

```text
JINGTANG Website
↓
Login
↓
Channels
↓
Connect YouTube
↓
Google OAuth
↓
Complete Consent Screen
↓
Requested Scopes
↓
Return to JINGTANG
↓
Upload
↓
Select YouTube
↓
Title
↓
Description
↓
Privacy
↓
Preview
↓
Publish
↓
Publishing Result
↓
Disconnect
```

Google 当前要求 Demo Video 展示：

- 完整 OAuth Flow；
- 完整 Consent Screen；
- 实际请求的 Scope；
- 每个 Scope 对应的产品功能。



---

# 四十五、TikTok 产品上线原则

TikTok 为 Wave 2。

在审核通过前：

产品可以进行开发和受限测试。

但官网不得将：

> Public TikTok Publishing

宣传为正式 Available。

TikTok 当前规定，未经 Audit 的 Content Posting API Client 的发布受到 Private Viewing 限制。

---

# 四十六、TikTok 产品身份

JINGTANG 必须持续表现为：

> 面向真实企业客户提供的 SaaS。

不是：

- 内部脚本
- 团队自己上传账号的工具
- 私人测试 Utility

TikTok 当前审核指导明确不接受仅服务内部团队 / 私人用途的上传工具。

---

# 四十七、TikTok Publish Page 必须实时 Query Creator Info

每次渲染 TikTok Post 页面时：

必须调用最新：

> Creator Info

获取：

- Creator Nickname
- Available Privacy Options
- Comment Availability
- Duet Availability
- Stitch Availability
- Max Video Duration
- 其他当前 API 返回能力

不能把这些能力永久写死在前端。

---

# 四十八、TikTok Creator

发布页面必须明显显示：

> 当前正在发布到哪个 TikTok Creator。

例如：

> Publishing to @abc_global

不得只有：

> TikTok

而没有账号信息。

---

# 四十九、TikTok Duration Validation

上传视频必须根据实时 Creator Info 返回的：

> `max_video_post_duration_sec`

校验视频时长。

不符合时：

阻止发布并告诉用户原因。



---

# 五十、TikTok Privacy

Privacy 必须：

- 来自 Creator Info 返回的可用值；
- 用户自己选择；
- 默认为空。

禁止默认：

- Public
- Friends
- Only Me

TikTok 当前要求用户手动选择 Privacy，并且不得设置默认值。

---

# 五十一、TikTok Comment / Duet / Stitch

三个 Interaction Settings：

默认：

> 全部未勾选。

如果 Creator Info 表示某项已关闭：

该项必须：

- Disabled
- Greyed Out

不得让用户在 JINGTANG 中强制打开。

TikTok 当前要求这些交互由用户手动启用，不允许默认勾选。

---

# 五十二、TikTok Preview

发布前必须展示：

> 实际即将发布的内容预览。

用户需要能够明确确认：

- 视频 / 图片
- Caption
- Privacy
- Interactions
- Commercial Disclosure

---

# 五十三、TikTok 文案必须可编辑

如果 JINGTANG AI 自动生成：

- Caption
- Hashtag
- Title

用户在发送 TikTok 前必须可以：

- 编辑
- 删除
- 重写

不得锁死 AI 输出。

---

# 五十四、禁止 JINGTANG Watermark

JINGTANG 不得自动在客户内容上添加：

- JINGTANG Logo
- JINGTANG Watermark
- Promotional Link
- Promotional Text

TikTok 当前明确禁止第三方发布客户端向内容叠加自己的品牌、水印或促销信息。

---

# 五十五、TikTok Commercial Content Disclosure

发布页必须支持当前 TikTok 要求的 Commercial Content Disclosure。

主 Toggle：

> 默认关闭。

打开后：

根据当前 API / UX 要求提供：

- Your Brand
- Branded Content

至少选择一个后才能发布。

如果没有满足要求：

> Publish Button Disabled。



---

# 五十六、TikTok Branded Content 与 Privacy

如果用户选择：

> Branded Content

产品必须遵守 TikTok 对相关 Privacy 的限制。

不能允许出现：

> TikTok 不接受的 Branded Content + Private Visibility 组合。

UI 应：

- 禁用冲突选项；
- 或按照 TikTok 当前要求调整，并清楚通知用户。



---

# 五十七、TikTok AI-generated Content

当前 Direct Post API 支持：

> `is_aigc`

如果用户内容属于需要声明的 AI-generated content：

JINGTANG 应在产品中提供对应 Disclosure，并根据 TikTok 当前 API 正确传递。

TikTok 当前 API 在 `is_aigc=true` 时会对视频应用相应的 AI-generated 标记。

---

# 五十八、TikTok Music Usage Confirmation

Publish Button 之前必须展示 TikTok 要求的相关声明。

普通情况：

> “By posting, you agree to TikTok's Music Usage Confirmation”

涉及 Branded Content 时：

同时包含当前 TikTok 要求的：

- Branded Content Policy
- Music Usage Confirmation

具体 UI 文案必须在研发冻结和审核提交前再次与 TikTok 最新官方版本逐字核对，不自行改写核心法律含义。

---

# 五十九、TikTok Explicit Consent

只有用户明确确认后：

才允许开始将素材发送至 TikTok。

禁止：

- 打开页面即上传
- AI 自动决定发布
- 系统后台未经授权立即发布

用户对：

> 内容 + 账号 + Privacy + Disclosure + Publish

必须拥有最终控制权。

---

# 六十、TikTok 第一版 Schedule 策略

为了降低第一版审核和状态同步复杂度：

> **TikTok Audit 第一阶段优先只做 Publish Now。**

在以下能力验证完成前，不对外提供 TikTok Schedule：

- Future-time user consent model
- Token validity
- Re-query Creator Info
- Privacy option revalidation
- Duration / account eligibility
- Failure recovery
- Cancellation
- Audit acceptance

后续若增加 Schedule：

到实际发送前仍需重新校验最新 Creator Info 和当前授权状态。

---

# 六十一、TikTok Publishing Status

发布后必须：

- 告诉用户内容可能需要处理时间；
- 保存 `publish_id`；
- 获取发布状态；
- 展示 Processing / Published / Failed；
- 在失败时提供可理解原因。

可根据官方能力：

- Poll Status API
- 或使用相关状态通知机制。

TikTok 当前要求客户端让用户能够理解发布处理状态。

---

# 六十二、TikTok Upload Method

如果视频已经存储于 JINGTANG Server：

优先根据 TikTok 当前要求使用：

> PULL_FROM_URL

相关文件 URL 必须属于：

> JINGTANG 已验证所有权的 Domain / URL Prefix。

如果文件仅位于用户设备：

按 TikTok 规则使用：

> FILE_UPLOAD



---

# 六十三、TikTok App Review Website

正式提交审核时：

官网必须是完整真实网站。

不能只是：

- Landing Page
- Login Page
- Coming Soon Page

Privacy 和 Terms：

必须公开可访问，并在官网明显展示。

TikTok 当前 App Review Guidelines 明确要求完整官网，并要求 Privacy / Terms 可直接访问。

---

# 六十四、TikTok Review Video

提交审核视频应展示：

```text
JINGTANG Website
↓
Login
↓
Connect TikTok
↓
TikTok Authorization
↓
Return
↓
Upload
↓
TikTok Creator
↓
Creator Info-based Settings
↓
Caption
↓
Privacy
↓
Comment / Duet / Stitch
↓
Commercial Disclosure
↓
AIGC if applicable
↓
Preview
↓
Music Usage Confirmation
↓
Explicit Publish
↓
Processing
↓
Status
```

申请的每个 TikTok Product / Scope：

都必须在真实产品中找到对应功能。

---

# 六十五、Meta / Instagram

第一版架构已经具备支持 Meta / Instagram App Review 的基础：

- 真实官网
- 真实公司
- OAuth
- User-controlled publishing
- Privacy
- Terms
- Data Deletion
- Integration Page
- Review Account
- Demo Video
- Developer Review Matrix

但正式提交前：

必须按照当时实际申请的每一个 Permission / Feature 单独审核。

禁止使用：

> “整体看起来合规，所以一次申请所有权限。”

原则：

> Need → Permission → UI → User Action → Data → Retention → Deletion

逐项建立证据。

---

# 六十六、其他平台原则

LinkedIn、Pinterest、X 等全部遵守同一原则：

1. 产品真实上线后才标 Available；
2. 只申请真实需要的 Scope；
3. 用户明确授权；
4. 用户控制发布；
5. 建立 Disconnect；
6. 建立 Data Deletion；
7. Developer Review Video 与生产产品一致；
8. 平台提交前重新核对当时最新官方规则。

---

# 六十七、Developer Review Matrix

公司内部维护唯一 Matrix。

| 字段 | 内容 |
|---|---|
| Platform | 平台 |
| Product/API | API / Product |
| Scope / Permission | 权限 |
| Business Need | 为什么需要 |
| User Feature | 用户功能 |
| User Action | 用户如何触发 |
| Screen | 对应 UI |
| Data Access | 获取数据 |
| Data Stored | 保存数据 |
| Retention | 保存期限 |
| Revocation | 撤销方式 |
| Deletion | 删除方式 |
| Review Account | 测试账号 |
| Demo Video | 审核录像 |
| Audit Status | 状态 |
| Production Status | Available / Beta / Coming Soon |

---

# 六十八、Scope 审核规则

任何权限只要无法回答：

> 为什么需要这个权限？

就不申请。

任何权限只要无法指向：

> 一个真实、面向用户的产品功能

就不申请。

任何权限如果只是：

> “以后可能会用”

就不申请。

---

# 六十九、Developer Review Evidence Package

每个平台提交前准备：

1. Legal Entity
2. Domain
3. Public Website
4. About
5. Contact
6. Privacy Policy
7. Terms
8. Data Deletion
9. Security
10. Integration Page
11. Live SaaS
12. Production-like OAuth
13. Test Account
14. Permission Matrix
15. Data Flow
16. Data Retention
17. Disconnect
18. Demo Script
19. Demo Video
20. Current Status

---

# 七十、官网 Sitemap

第一版建议：

## Platform

- Social Publishing
- Workflow & Approvals

如果 AI Visibility SaaS 尚未上线：

不把它与上述两个正式 SaaS 产品完全并列。

可以独立展示：

> AI Visibility

并标注：

- Services
- Early Access

---

## Solutions

- Manufacturers
- Global Brands
- Cross-border Ecommerce
- B2B Exporters
- Agencies
- China-to-Global

---

## Integrations

只展示真实状态。

---

## Resources

第一版：

- Help Center
- API / Product Docs

Blog 和大量 Guides 可以后续建设。

---

## Security

独立一级入口。

---

## Company

- About
- Contact

---

## Pricing

可使用：

> Contact Sales

---

## Sign In

进入：

> `app.brand.com`

---

# 七十一、首页 Hero

推荐：

# Go Global. Publish Everywhere.

副标题：

> Connect your authorized social accounts, manage content approvals and publish across global platforms from one workspace.

CTA：

## Primary

> Book a Demo

## Secondary

> Explore the Platform

---

# 七十二、首页 Pain

标题：

# Global content operations shouldn't require ten different tools.

展示：

- Multiple Platforms
- Multiple Accounts
- Multiple Markets
- Multiple Languages
- Multiple Team Members
- Repetitive Work
- Fragmented Approval

---

# 七十三、首页 Product

第一版重点两个产品模块：

## Social Publishing

> Manage and publish content across authorized global social accounts.

## Workflow & Approvals

> Keep global content creation, review and publishing under team control.

AI Visibility 如未 SaaS 上线：

第三卡改为：

## AI Visibility — Early Access

> Understand how your brand appears across AI-powered search and answer experiences.

---

# 七十四、首页核心工作流

真实 Screenshot 展示：

```text
Connect
→
Create
→
Customize
→
Approve
→
Publish
→
Track
```

---

# 七十五、Integrations 首页模块

标题：

> Connect the platforms your business uses.

每个平台必须标状态。

例如：

```text
YouTube       Available
Facebook      Available
Instagram     Available
TikTok        Coming Soon
LinkedIn      Coming Soon
```

具体状态按正式上线当天真实情况填写。

---

# 七十六、平台 Logo 使用

只使用平台品牌指南允许的 Logo 与品牌素材。

不要写：

> Official Partner

除非确实获得正式 Partner 身份。

使用：

> Integrates with

或：

> Integration available

---

# 七十七、Integration Page 模板

每个平台页面统一：

## Overview

平台集成能做什么。

## Status

Available / Beta / Coming Soon。

## Authorization

OAuth 流程。

## Permissions

为什么申请每个权限。

## Publishing

用户如何控制。

## Data Access

访问什么数据。

## Data Storage

保存什么数据。

## Security

如何保护 Token。

## Disconnect

如何断开。

## Deletion

如何删除。

## Platform Terms

外部政策链接。

---

# 七十八、Coming Soon Integration Page

尚未上线的平台：

不能伪造功能截图。

只能说明：

> Integration is currently in development.

可以提供：

> Join Waitlist

不能出现：

- Connect Button
- Supported Now
- Publish Now

除非真实可用。

---

# 七十九、Dashboard

第一版 Dashboard：

## Connected Channels

## Pending Approval

## Upcoming Posts

## Recent Publishing

## Needs Attention

## Recent Activity

不要加入复杂 Vanity Analytics。

---

# 八十、Create Post

步骤：

## 1. Upload

选择 Source Asset。

## 2. Select Platforms

用户主动选择平台。

## 3. Customize

不同平台分别编辑。

## 4. Preview

查看最终版本。

## 5. Submit / Approve

按权限处理。

## 6. Publish

明确用户动作。

## 7. Track

展示真实状态。

---

# 八十一、Publishing Confirmation

最终页面必须明确：

> You are about to publish this content to:

然后列出：

- YouTube — ABC Global
- Instagram — @abc_global

用户必须明确知道：

> 哪个内容将发布到哪个账号。

---

# 八十二、Scheduling

第一版 Schedule 不是所有平台强制统一能力。

每个平台单独标记：

- Publish Now Supported
- Schedule Supported
- Schedule Not Available

不能为了 UI 一致：

强行给所有 API 提供相同能力。

---

# 八十三、AI Assistance

AI 可以帮助：

- Caption Draft
- Translation
- Localization
- Hashtag Suggestion
- Title Suggestion

但 AI 不能取代用户对最终发布内容的控制。

任何 AI 自动生成文本：

在提交外部平台之前用户都能检查和修改。

---

# 八十四、AI Visibility

长期产品名称：

# AI Visibility

副标题：

> Generative Engine Optimization (GEO)

避免把 GEO 当作普通用户必须懂的第一概念。

---

# 八十五、AI Visibility 核心产品

正式 SaaS 版本未来包括：

- AI Visibility Audit
- Prompt Landscape
- Brand Mentions
- Competitor Comparison
- Citation Analysis
- Content Opportunities
- Entity Optimization
- Visibility Monitoring

---

# 八十六、AI Visibility Methodology

正式 SaaS 上线前必须上线：

`/ai-visibility/methodology`

说明：

- Engines
- Models / Experiences
- Language
- Geography
- Prompt Selection
- Frequency
- Mention Definition
- Citation Definition
- Competitor Definition
- Sampling
- Limitations
- Result Variability

---

# 八十七、AI Visibility 不做保证

禁止：

> Guaranteed ChatGPT Ranking

> Guaranteed AI Recommendation

> Rank #1 in AI

推荐：

> Improve visibility, authority and discoverability.

AI Visibility 属于概率型测量与优化问题。

---

# 八十八、AI Visibility Data

所有数据来源必须来自：

- 正式允许的 API
- 合规数据接口
- 明确允许的公开搜索体验
- 授权数据源

不把违反平台条款的大规模网页自动抓取作为核心数据来源。

---

# 八十九、Legal Pages

第一版必须：

- `/privacy`
- `/terms`
- `/data-deletion`
- `/security`

建议同期：

- `/cookies`
- `/acceptable-use`

Enterprise 阶段：

- `/subprocessors`
- `/dpa`
- `/trust`

---

# 九十、Privacy Policy

必须真实对应产品 Data Flow。

至少覆盖：

## Account Data

- Name
- Email
- Company
- Role

## OAuth / Platform Data

- Account ID
- Channel ID
- Token
- Scope
- Connection Metadata

## Content

- Videos
- Images
- Captions
- Schedules

## Security / Technical

- IP
- Device / Browser
- Logs
- Audit Data

## AI Data

仅在实际 AI 功能使用时披露。

---

# 九十一、Privacy Policy 必须回答

对每类数据：

- What
- Why
- How Used
- Where Stored
- How Long
- Who Has Access
- Third Parties
- International Transfer
- How to Delete
- Contact

不能使用一份与真实架构无关的模板隐私政策。

---

# 九十二、Terms

至少包含：

- User Responsibility
- Account Authorization
- Content Rights
- Third-party Platforms
- API Availability
- Platform Terms
- Prohibited Use
- Service Suspension
- Termination
- Intellectual Property
- Liability
- Applicable Legal Terms

---

# 九十三、Content Rights

客户必须确认：

对上传的：

- Video
- Image
- Audio
- Music
- Text
- Logo
- AI-generated Content

拥有合法使用及发布权利。

JINGTANG 不因为客户上传内容自动取得内容所有权。

---

# 九十四、Acceptable Use

禁止：

- Spam
- Fraud
- Impersonation
- Copyright Infringement
- Unauthorized Account Access
- Credential Sharing
- Platform Abuse
- Circumvention
- Malicious Automation
- Illegal Content
- Unauthorized scraping / reposting

---

# 九十五、Data Flow Map

Data Flow Map 升级为：

# 生产上线 P0

真实客户进入生产环境前必须完成。

至少记录：

| Data | Source | Storage Region | Processor | Retention | Encryption | Delete |
|---|---|---|---|---|---|---|
| Account | User | TBD | JINGTANG | Defined | Yes | Yes |
| OAuth Token | Platform | TBD | JINGTANG | Policy-based | Yes | Yes |
| Media | User | TBD | JINGTANG | Defined | Yes | Yes |
| Logs | System | TBD | JINGTANG | Defined | Yes | Yes |
| Audit Log | System | TBD | JINGTANG | Defined | Yes | Yes |
| Backup | System | TBD | Vendor | Defined | Yes | Yes |

所有 TBD：

生产上线前必须填写完成。

---

# 九十六、中国数据跨境

由于：

> 鲸汤（上海）智能科技有限公司

可能服务中国企业，同时基础设施可能位于：

- Singapore
- Japan
- Korea
- Other overseas regions

在正式确定服务器架构前：

必须进行实际 Data Flow Review。

重点包括：

- 中国用户注册数据
- 中国企业员工数据
- OAuth 数据
- 上传内容
- Logs
- Support Data
- Backup

需要由技术与专业法务结合：

- 数据类型
- 数量
- 敏感程度
- 数据出境路径
- 客户合同

确定最终机制。

---

# 九十七、服务器选址原则

不能只根据：

> 延迟最低

决定。

同时评估：

- Social API connectivity
- Customer Region
- Data Transfer
- Privacy
- Security
- Backup
- Cost
- Disaster Recovery
- Chinese data compliance

---

# 九十八、Security

第一版真实实施至少包括：

- TLS
- Encryption at Rest
- OAuth Token Encryption
- Secret Management
- Environment Separation
- Tenant Isolation
- RBAC
- Audit Logging
- Backup
- Restore
- Production Access Control
- Access Logging
- Incident Response
- Basic Vulnerability Management

---

# 九十九、Security Page

只描述真实能力。

禁止：

> Military-grade Encryption

> Bank-level Security

没有：

- SOC 2
- ISO 27001

就不声称已认证。

---

# 一百、生产 Secrets

包括：

- Google Client Secret
- TikTok Client Secret
- Meta App Secret
- Encryption Keys

不得：

- 写入 Git Repo
- 暴露前端
- 放在公开文档
- 出现在用户日志
- 分享给无权限第三方

---

# 一百零一、Cookie MVP

第一版尽量减少：

- 广告 Pixel
- Retargeting
- 第三方 Tracking
- Session Recording

优先：

> Essential Cookies + 必要身份认证 + 最少 Analytics。

如果使用需要 Consent 的非必要 Cookie：

再上线对应 CMP / Consent 流程。

---

# 一百零二、Trust Layer

官网建立真实信任信息：

- Legal Company
- Company Address / Contact as appropriate
- Real Product Screenshots
- Security
- OAuth Explanation
- Data Controls
- Case Studies
- Press
- Customer References

禁止制造：

- 虚假客户
- 虚假合作方
- 虚假认证
- 未经许可的合作 Logo

---

# 一百零三、Pricing

第一版可以不公开具体数字。

建议：

## Starter

## Growth

## Enterprise

CTA：

> Contact Sales

或：

> Book a Demo

第一版不以复杂 Pricing Engine 为研发目标。

---

# 一百零四、Professional Services

保留收入模式：

- Account Setup
- Content Localization
- Developer Integration
- Global Content Strategy
- AI Visibility Consulting

但官网必须区分：

> SaaS Product

和：

> Professional Services

避免审核员误认为 JINGTANG 只是代理公司。

---

# 一百零五、商业模式

长期：

```text
SaaS Subscription
+
AI Visibility
+
Professional Services
```

第一阶段收入可以依赖服务。

但产品身份保持：

> B2B SaaS / Marketing Technology.

---

# 一百零六、第一版官网 MVP

必须上线：

- Home
- Social Publishing
- Workflow & Approvals
- Integrations
- Available Integration Pages
- About
- Contact
- Security
- Privacy
- Terms
- Data Deletion

如果 AI Visibility 对外销售：

增加：

- AI Visibility
- Methodology 或明确 Early Access 状态

---

# 一百零七、官网英文优先

默认：

```text
brand.com
```

English。

中文：

```text
brand.com/zh-cn
```

中英文：

- 产品定位一致
- 功能状态一致
- 法律主体一致
- 隐私承诺一致
- 平台支持状态一致

---

# 一百零八、官网品牌调性

使用：

- Professional
- Global
- Enterprise
- Technical
- Trustworthy

避免：

- AI 爆单
- 一键霸屏
- 无限账号
- 防封
- 群控
- 养号
- 绕风控
- 黑科技
- 批量矩阵神器

---

# 一百零九、上线 Gate A：品牌

必须完成：

- JINGTANG Name
- Logo
- Domain
- Legal Entity
- Formal Legal English Naming Strategy
- Company Email
- About
- Contact

---

# 一百一十、上线 Gate B：Legal

必须完成：

- Privacy
- Terms
- Data Deletion
- Security
- Platform-specific clauses
- Data Flow Map
- Retention Matrix

---

# 一百一十一、上线 Gate C：SaaS

必须真实完成：

- Login
- Workspace
- RBAC
- OAuth
- Upload
- Platform Customization
- Preview
- Approval
- Publish
- Status
- History
- Audit
- Disconnect
- Data Deletion

---

# 一百一十二、上线 Gate D：Platform

每个平台分别检查：

```text
API Enabled
+
Correct Scope
+
Developer Review
+
Audit where required
+
Production Credentials
+
Real OAuth
+
Real Publishing
+
Status Handling
+
Disconnect
+
Deletion
```

平台未完成：

不能标 Available。

---

# 一百一十三、上线 Gate E：Review Evidence

准备：

- Test Account
- Reviewer Instructions
- Review Video
- Scope Explanation
- Demo Data
- Product Screenshots
- Integration Page
- Support Contact

审核员应能够：

> 不需要内部员工解释大量背景，就理解产品是做什么的。

---

# 一百一十四、第一版最终验收场景

一个测试企业能够：

```text
Register
↓
Create Workspace
↓
Invite Editor
↓
Invite Approver
↓
Admin Connects Authorized Account
↓
OAuth Completes
↓
Editor Uploads User-owned Content
↓
Editor Customizes Platform Version
↓
Editor Previews
↓
Editor Submits
↓
Approver Reviews
↓
Approver / Publisher Confirms
↓
Content Is Published
↓
System Shows Processing / Result
↓
Audit Log Shows Actions
↓
Admin Disconnects Account
↓
Token Is Revoked
↓
Required Platform Data Is Deleted
```

全部真实工作：

才算 MVP 完成。

---

# 一百一十五、上线后不以功能数量作为 KPI

第一阶段产品 KPI 建议围绕：

- OAuth Connection Success Rate
- Publish Success Rate
- Publishing Failure Rate
- Authorization Failure Rate
- Approval Completion
- Schedule Reliability
- Token Refresh Reliability
- Data Deletion Completion
- Support Incidents

而不是：

> 第一版拥有多少 AI 功能。

---

# 一百一十六、平台政策监控

Google / YouTube、TikTok、Meta 等开发者政策持续变化。

公司需要指定：

> Developer Compliance Owner

负责：

- 订阅政策更新
- Review API changelog
- 更新 Matrix
- 更新产品 UI
- 更新 Privacy / Terms
- 更新审核录像

每次：

- 新平台
- 新 Scope
- 新重大功能
- 数据用途变化

都必须重新执行合规检查。

---

# 一百一十七、统一产品定义

## 面向用户

> JINGTANG helps businesses securely manage global social publishing and content approval from one workspace.

## 面向中国客户

> 鲸汤帮助企业安全连接自己的海外社交媒体账号，通过统一工作空间完成内容创建、审批、发布和状态管理。

## 面向 Developer Reviewer

> JINGTANG is a multi-tenant SaaS platform that enables businesses to connect their own authorized social media accounts and perform user-controlled content publishing through transparent workflows.

## 面向合作伙伴

> Global marketing infrastructure for businesses expanding internationally.

---

# 一百一十八、第一版核心 Story

# Connect

连接用户自己的授权账号。

↓

# Create

上传并创建用户有权使用的内容。

↓

# Customize

针对每个平台单独调整。

↓

# Approve

企业内部审核。

↓

# Publish

用户明确发布。

↓

# Track

跟踪状态和错误。

↓

# Revoke

随时撤销授权。

↓

# Delete

删除相应数据。

---

# 一百一十九、第二阶段产品 Story

在 Publishing 基础稳定后：

加入：

# Localize

多语言本地化。

↓

# Automate

高级工作流。

↓

# Measure

允许范围内的分析。

↓

# Discover

AI Visibility。

最终形成：

> **Global Marketing Infrastructure**

---

# 一百二十、第一版冻结范围

自本版本定稿后：

如果没有明确 P0 原因，不再向第一版新增：

- CRM
- Ads
- Social Listening
- DM
- Comments
- Influencer
- Advanced BI
- Advanced Workflow Builder
- AI Video Generator
- 非关键 Integration

团队资源优先用于：

> **Connect → Create → Approve → Publish → Track → Revoke → Delete**

做到可靠。

---

# 一百二十一、定稿审批标准

本方案在以下层面完成闭环：

## Brand

通过。

## Website Architecture

通过。

## SaaS MVP Boundary

通过。

## OAuth Architecture

通过。

## YouTube Policy Design

通过。

## TikTok Policy Design

通过。

## Developer Review Framework

通过。

## Data Lifecycle

通过。

## Security Baseline

通过。

## Legal Information Architecture

通过。

## Data Flow Requirement

通过。

## First-version Scope Control

通过。

---

# 一百二十二、仍属于实施 Gate，而非方案缺失的事项

以下内容无需继续修改本方案，但必须在正式生产上线 / Developer Review 前实际完成：

1. 冻结真实品牌主域名；
2. 确认唯一正式英文法律主体表达；
3. 完成 Google / TikTok 等 Domain Verification；
4. 确认每个平台真实 Scope / Permission；
5. 完成真实生产 OAuth；
6. 完成对应 Platform Audit；
7. 填完 Data Flow Map 中所有 TBD；
8. 填完实际 Retention Period；
9. 完成 Reviewer Test Account；
10. 完成生产版本审核录像。

这些是：

> **Implementation Gates**

不是新的产品 Scope。

---

# 一百二十三、最终判断

JINGTANG 第一版不需要证明：

> 我们什么营销问题都能解决。

第一版只需要证明：

> **我们是一家真实、可信、安全、用户可控的全球内容运营 SaaS。**

当一个真实企业能够：

> 安全授权自己的账号、管理团队权限、创建和审核内容、明确发布、查看结果、撤销授权并删除数据，

JINGTANG 第一版的产品价值和开发者审核逻辑即成立。

---

# 一百二十四、最终产品基线

**Brand**

> JINGTANG

**Legal Entity**

> 鲸汤（上海）智能科技有限公司

**Company**

> Global Marketing Technology Company

**Strategic Position**

> Global Marketing Infrastructure

**V1 Product**

> Global Social Publishing + Enterprise Content Approval

**Core Flow**

> Connect → Create → Customize → Approve → Publish → Track → Revoke → Delete

**V1 Primary CTA**

> Book a Demo

**V1 Platform Principle**

> Only advertise what is actually available.

**V1 Compliance Principle**

> Minimum permission, explicit user control, transparent data use, reliable revocation and deletion.

---

# 一百二十五、定稿结论

本方案经过 v0.1 → v0.2 → v0.3 三轮收敛后：

> **产品边界清晰。**

> **第一版开发范围可控。**

> **官网与 SaaS 产品身份一致。**

> **YouTube / Google OAuth 核心审核要求已经产品化。**

> **TikTok Direct Post 核心审核 UX 已经转化为验收规则。**

> **OAuth、数据生命周期、撤销授权、数据删除已经形成闭环。**

> **未上线产品与平台已经通过 Available / Beta / Coming Soon 机制明确隔离。**

> **Data Flow Map 已提升为生产 P0。**

因此：

# 本方案建议正式通过并冻结。

下一阶段不再继续扩展战略文档。

项目正式进入：

> **官网 Page-level PRD → SaaS Product PRD → UI Design → Technical Design → Development → Compliance QA → Developer Review → Production Launch**

阶段。

**《鲸汤 JINGTANG 海外官网与 SaaS 第一版上线方案 v0.3》至此定稿。**