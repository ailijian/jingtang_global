# JINGTANG 官网与当前 SaaS 人工部署及首尔服务器维护手册

- 状态：当前首尔部署的可执行人工 Runbook
- 适用对象：JINGTANG 运维人员和经授权的发布人员
- 适用环境：`jingtangai.com` 官网与 `review.jingtangai.com` 当前账号受控 SaaS
- 上位规范：[Operations Authority](../../docs/OPERATIONS.md)、[Architecture](../../docs/architecture/README.md)、[Security and Data](../../docs/security-and-data/README.md)

## 1. 使用边界

本手册回答两类问题：

1. 如何把官网和当前账号受控 SaaS 从一个已审核的 Git 提交人工部署到一台新的首尔服务器；
2. 如何对当前已经部署的首尔服务器执行日常检查、发布、重启、备份、恢复演练和受控回退。

当前 SaaS 对外使用正式产品文案和真实登录流程，但它仍是 Architecture A-16 定义的临时 `review` 运行配置：预创建账号、禁止公开注册和自助重置、搜索引擎 `noindex`、单机本地 PostgreSQL、单 worker、Review 专用 COS/CAM/OAuth 资源。它不是 D7 最终生产环境，不得原地晋升为正式生产。未来 D7 独立生产环境使用 [Tencent Cloud SaaS foundation](saas/README.md)，不使用本手册中的 Review-only 本地密钥或本地数据库方案。

本手册的新机流程创建一个**空的、独立的当前 SaaS 环境**。如果目标是替换现有首尔服务器并保留账号、数据库、OAuth 授权、对象或审计记录，必须先停止切流，另行审批数据迁移和恢复方案；不得直接复制正在运行的 PostgreSQL 数据目录，也不得把隔离恢复演练当成在线迁移。

## 2. 当前运行拓扑

| 项目          | 当前值                                                                                 |
| ------------- | -------------------------------------------------------------------------------------- |
| 官网          | `https://jingtangai.com`                                                               |
| SaaS 登录     | `https://review.jingtangai.com/login`                                                  |
| SaaS 健康检查 | `https://review.jingtangai.com/api/v1/health`                                          |
| 当前 SSH 别名 | `jingtang-production`                                                                  |
| 官网目录      | `/srv/jingtang/public-site`                                                            |
| SaaS 目录     | `/srv/jingtang/review`                                                                 |
| 公网入口      | `jingtang-public-site`（Caddy，唯一监听 `80/tcp`、`443/tcp`、`443/udp`）               |
| SaaS 容器     | `jingtang-review-platform-1`、`jingtang-review-worker-1`、`jingtang-review-postgres-1` |
| Docker 网络   | 外部入口 `jingtang-ingress`；内部网络 `jingtang-review-private`                        |
| 自动任务      | 每日加密数据库备份；每小时主机/COS 容量检查                                            |

PostgreSQL `5432` 和应用 `3100` 只在 Docker 网络内使用，不能映射到公网。Caddy 同时托管官网静态文件并反向代理当前 SaaS。

## 3. 操作约定

所有发布都从运维工作站上的仓库根目录发起。下列变量只在当前终端会话中使用；替换示例值，不要把密钥或密码写入变量、Git、命令参数、工单或截图。

```bash
export JT_REPO=/absolute/path/to/jingtang_global
export JT_SSH_TARGET=root@new-server-public-ip
export JT_SSH_IDENTITY=/absolute/path/to/dedicated_ed25519
export JT_CHANGE_REF=change-YYYYMMDD-NNN
export JT_RELEASE_SHA="$(git -C "$JT_REPO" rev-parse HEAD)"
```

`JT_SSH_TARGET` 必须是经过 `known_hosts` 校验、能写入 `/srv/jingtang` 并执行 Docker 的受控发布身份。Review 的主机准备、密钥生成和激活脚本要求 root；为了让仓库现有官网发布脚本无需额外改写即可执行，新机流程建议使用由独立个人密钥、来源 IP 和变更记录约束的 root 发布目标。使用非 root SSH 身份时，应在受保护会话内逐条以 `sudo` 执行 Review 服务器命令，并提前授予官网发布目录和 Docker 的最小必要权限。SSH key 路径不能包含空白字符。当前 `jingtang-production` 别名应只指向当前首尔主机，不要在未核验主机指纹时复用到新 IP。

建立连接前先核验目标：

```bash
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" \
  "$JT_SSH_TARGET" 'hostnamectl; uname -m; id; docker version; docker compose version'
```

## 4. 新服务器部署

### 4.1 发布输入和阻断条件

开始前必须同时满足：

- 已确定不可变的 40 位 Git SHA，工作树干净且提交已同步到受保护仓库；
- 该 SHA 的阻断 CI 已通过，并已取得本次 Review Change Authorization 引用；
- 工作站为 Node.js `24.x`、pnpm `11.19.x`、Git、Docker Engine/BuildKit、SSH、rsync、gzip、`sha256sum` 和 `dig`；
- 构建目标为 `linux/amd64`，新服务器为 Ubuntu 24.04 LTS `x86_64`；
- 新服务器至少 2 vCPU、3.5 GiB 内存、1 GiB swap、10 GiB 可用磁盘；建议为发布包、镜像、数据库和日志预留至少 60 GiB 系统盘；
- 已取得域名、腾讯云 Lighthouse/CVM、防火墙、COS、CAM、Google/YouTube OAuth 与公司 Meta Business Portfolio/App 控制面的操作权限；
- 如果新服务器将接管现有流量，已降低两个域名的 DNS TTL，并已明确回退 IP；
- 如果需要保留现有数据或授权，迁移方案已另行批准；否则只能创建全新的空环境。

确认发布输入：

```bash
cd "$JT_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
test "$(git rev-parse HEAD)" = "$JT_RELEASE_SHA"
test "${#JT_RELEASE_SHA}" -eq 40
node --version
pnpm --version
docker version
git show --no-patch --format='%H %cI %s' "$JT_RELEASE_SHA"
```

不要从未提交的工作树打包。`package-release.sh` 会再次执行这一阻断检查。

### 4.2 云资源和外部控制面

为新环境准备以下资源。新空环境使用独立资源；不要为了省事复用正式生产或其他测试环境的凭据。

#### 腾讯云主机和防火墙

- 区域：首尔；系统：Ubuntu 24.04 LTS `x86_64`；开启时间同步和安全更新；
- `22/tcp` 只允许命名运维人员的固定来源地址；禁止密码登录，使用独立 SSH 密钥；
- 公网开放 `80/tcp`、`443/tcp`，需要 HTTP/3 时开放 `443/udp`；
- 不开放 `3100`、`5432` 或 Docker daemon 端口；
- Docker 发布端口可能绕过 UFW/firewalld 规则，云防火墙必须是第一层约束；主机附加规则应放在 Docker 支持的 `DOCKER-USER` 链中。

#### Review 专用 COS Bucket

创建一个 `ap-seoul` 私有 Standard-storage Bucket，完整名称必须包含 APPID，并配置：

- 开启版本控制和 Bucket 默认 SSE-COS；
- `workspaces/` 非当前版本和删除标记在 7 天内清理；
- 不给 `workspaces/` 当前对象设置自动过期，当前对象由应用生命周期控制；
- `backups/postgres/` 当前对象和非当前版本在 7 天内清理；
- 未完成分片上传 1 天后清理；
- 浏览器 CORS 只允许来源 `https://review.jingtangai.com` 和方法 `PUT`；
- 允许请求头仅为 `content-type`、`x-amz-checksum-sha256`、`x-amz-meta-jingtang-sha256`；
- 暴露响应头仅为 `ETag`，预检缓存 600 秒，不允许凭据，不使用通配来源。

#### CAM 最小权限身份

创建三个独立 CAM 子用户和三对 SecretId/SecretKey：`platform`、`worker`、`backup`。分别从以下模板生成策略：

- [`review/cam/platform-policy.json`](review/cam/platform-policy.json)
- [`review/cam/worker-policy.json`](review/cam/worker-policy.json)
- [`review/cam/backup-policy.json`](review/cam/backup-policy.json)

把模板中的 `REPLACE_WITH_APP_ID` 和 `REPLACE_WITH_SOURCE_BUCKET_WITH_APPID` 替换为准确值后再在腾讯云创建策略。审核渲染结果，确认不存在 `action:*`、`resource:*`、其他 Bucket、其他地域、Bucket 管理或 KMS 权限。运行时禁止使用腾讯云根账号永久密钥。

#### Google/YouTube OAuth

创建该环境专用的 Web OAuth 客户端，配置：

```text
Authorized redirect URI:
https://review.jingtangai.com/api/v1/channels/youtube/oauth/callback
```

记录非敏感 Client ID；Client Secret 只通过后面的交互式密钥安装脚本写入服务器。不要把 Client Secret 写进 `runtime.env`。

#### Meta/Facebook App

R3 使用公司 Business Portfolio 持有的 durable Meta App ID；App ID 可以跨未来基础设施迁移保留，但当前 Review 的 App Secret、OAuth Token、授权数据、回调 URL 和运行配置都属于本环境。公司 Portfolio 至少保留两名具名公司管理员，不使用共享 Facebook 登录，不把恢复码或个人身份证明写入仓库、聊天、截图或部署产物。

在 Meta App Dashboard 中保持 Development 模式，并只配置 Facebook Login 与 Pages 发布所需产品。运行时权限只能是：

```text
pages_show_list
pages_read_engagement
pages_manage_posts
```

`public_profile` 是 Meta 自动登录权限；不得增加 `email`、`publish_video`、Ads、Insights、Messaging、Webhook、Instagram、Threads 或其他权限。配置以下公开和回调地址：

在 `Facebook Login for Business` 中创建并冻结一个使用“用户访问口令”的登录配置，将上述三项权限加入该配置。运行时必须通过这个配置编号发起授权，不得在 OAuth URL 中另行拼接权限。记录该非敏感配置编号。

```text
App domain: jingtangai.com
Privacy Policy: https://jingtangai.com/en/privacy/
Terms: https://jingtangai.com/en/terms/
Data Deletion instructions: https://jingtangai.com/en/data-deletion/
OAuth redirect: https://review.jingtangai.com/api/v1/channels/facebook/oauth/callback
Deauthorize callback: https://review.jingtangai.com/api/v1/channels/facebook/deauthorize
Data deletion callback: https://review.jingtangai.com/api/v1/channels/facebook/data-deletion
Support: developer@jingtangai.com
```

记录非敏感 App ID 与 Facebook Login for Business 配置编号；App Secret 只通过后面的交互式安装脚本写入服务器。外部 App Review 提交、Advanced Access 获批、切换 Live 和公开 `Available` 都是后续 Gate，本 Runbook 的部署步骤不授权执行。

### 4.3 初始化 Ubuntu 主机

以下 Docker 安装方式来自 [Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/)。执行前确认主机是新机或已评估现有 Docker 数据；不要在已有业务主机上清除旧包或 Docker 数据。

如果 `dpkg -l` 显示已经安装 `docker.io`、`docker-compose`、`docker-compose-v2`、`podman-docker`、单独的 `containerd` 或 `runc`，先停止并按 Docker 官方说明评估冲突包和已有数据，不能直接覆盖安装。

```bash
sudo apt update
sudo apt install -y ca-certificates curl rsync openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
```

检查资源和 swap：

```bash
getconf _NPROCESSORS_ONLN
free -h
df -h /srv 2>/dev/null || df -h /
swapon --show
timedatectl status
```

如果总 swap 小于 1 GiB，且主机上不存在 `/swapfile`，可以创建受控的 2 GiB swap：

```bash
sudo test ! -e /swapfile
sudo fallocate -l 2G /swapfile
sudo chmod 0600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -qF '/swapfile none swap sw 0 0' /etc/fstab || \
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
```

如果 `/swapfile` 已存在、使用 swap 分区或启用了其他内存管理，不要覆盖；先根据当前配置扩容并再次运行检查。

从工作站运行仓库提供的主机边界准备脚本：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  'sudo bash -s' < "$JT_REPO/infra/tencent/review/prepare-host.sh"
```

成功输出必须包含 CPU、内存、磁盘、swap 和 `jingtang-ingress` 网络检查通过。然后核验目录权限；不要输出文件内容：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo stat -c '%A %a %u:%g %n' \
    /srv/jingtang/review \
    /srv/jingtang/review/secrets \
    /srv/jingtang/review/postgres \
    /srv/jingtang/review/state \
    /srv/jingtang/review/backup-work"
```

预期：根目录和密钥目录不可被普通用户遍历；PostgreSQL 目录为 UID/GID `70`；应用状态和备份工作目录为 UID/GID `65532`。

### 4.4 安装依赖并执行发布前验证

```bash
cd "$JT_REPO"
pnpm install --frozen-lockfile
pnpm verify
pnpm review:release-check
pnpm site:release-check
```

`pnpm verify` 必须在最终干净提交上通过。人工部署不替代受保护 CI；两者都必须通过。Terraform `1.13.3` 只属于未来 D7 基础设施验证，不是当前 Review 新机流程的依赖。

### 4.5 先部署官网入口

官网部署脚本会构建静态站点，把不可变目录同步到 `/srv/jingtang/public-site/releases/<sha>`，更新 `current` 符号链接，并通过 Caddy 激活；激活失败会恢复之前的静态目录。

```bash
cd "$JT_REPO"
SITE_SSH_TARGET="$JT_SSH_TARGET" \
SITE_SSH_IDENTITY="$JT_SSH_IDENTITY" \
SITE_RELEASE_ID="$JT_RELEASE_SHA" \
  pnpm site:deploy:tencent
```

必须先完成这一步，因为 Review 激活脚本需要官网的 live Compose 和 Caddy 配置。域名尚未指向新主机时，Caddy 可能暂时无法取得证书，这是预期的，但容器必须处于运行状态：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "readlink /srv/jingtang/public-site/current && \
   sudo docker inspect --format '{{.State.Status}}' jingtang-public-site"
```

### 4.6 打包并增量传输当前 SaaS

在 `amd64` 构建工作站执行：

```bash
cd "$JT_REPO"
DOCKER_DEFAULT_PLATFORM=linux/amd64 \
  bash infra/tencent/review/package-release.sh "$JT_RELEASE_SHA"
cd ".local/review-release/$JT_RELEASE_SHA"
sha256sum --check SHA256SUMS
test "$(tr -d '\r\n' < RELEASE)" = "$JT_RELEASE_SHA"
```

在 ARM 工作站上，`DOCKER_DEFAULT_PLATFORM` 只能在 Docker 已配置可用的 `linux/amd64` 构建/运行支持时使用；否则改用 `amd64` 构建机，不要把 ARM 镜像传给 `x86_64` 服务器。

使用增量传输脚本。发布包只生成一个未压缩 Docker archive，使 runtime 与
migration 镜像的共享层只保存一次；远端以当前 archive 为 rsync 基线，只传输
变更块和必要的发布文件。缓存尚不存在时，脚本会从服务器当前已加载的两个镜像
自动生成基线，不需要重新上传旧依赖：

```bash
cd "$JT_REPO"
JT_SSH_TARGET="$JT_SSH_TARGET" \
JT_SSH_IDENTITY="$JT_SSH_IDENTITY" \
  bash infra/tencent/review/transfer-release.sh "$JT_SSH_TARGET" "$JT_RELEASE_SHA"
```

脚本会显示 rsync 的 `Total transferred file size` 与 `Total bytes sent`。后者才是
本次实际网络上传量。传输完成后，远端 cache 和不可变发布目录均恢复为 root 管理。

### 4.7 配置非敏感运行参数和密钥

首次部署时创建 `runtime.env`：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo install -m 0600 \
     '/srv/jingtang/review/releases/$JT_RELEASE_SHA/runtime.env.example' \
     /srv/jingtang/review/runtime.env && \
   sudoedit /srv/jingtang/review/runtime.env"
```

只修改以下非敏感值：

- `REVIEW_COS_BUCKET`：完整 Bucket 名称，包含 APPID；
- `REVIEW_YOUTUBE_OAUTH_CLIENT_ID`：Review 专用 OAuth Client ID；
- `REVIEW_FACEBOOK_APP_ID`：公司 Business Portfolio 持有的非敏感 Meta App ID；
- `REVIEW_FACEBOOK_LOGIN_CONFIGURATION_ID`：该 App 中冻结三项已批准 Page 权限的非敏感 Facebook Login for Business 配置编号；
- `REVIEW_IDENTITY_EMAIL` 和 `REVIEW_IDENTITY_NAME`：首个预创建账号的邮箱和显示名。

`JINGTANG_IMAGE` 和 `JINGTANG_MIGRATION_IMAGE` 由激活生成的 `release.env` 覆盖。`runtime.env` 中不得出现任何 `SECRET`、`PASSWORD` 或 `DATABASE_URL` 项。

首次部署仅运行一次内部密钥生成脚本；它遇到任何同名文件都会拒绝覆盖：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo '/srv/jingtang/review/releases/$JT_RELEASE_SHA/generate-internal-secrets.sh'"
```

依次交互式安装八个外部密钥。脚本关闭回显，且拒绝覆盖已有值：

```bash
for JT_SECRET_NAME in \
  platform-cam-secret-id platform-cam-secret-key \
  worker-cam-secret-id worker-cam-secret-key \
  backup-cam-secret-id backup-cam-secret-key \
  youtube-client-secret facebook-app-secret; do
  ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
    "sudo '/srv/jingtang/review/releases/$JT_RELEASE_SHA/install-external-secret.sh' '$JT_SECRET_NAME'"
done
unset JT_SECRET_NAME
```

只核验文件名、所有者和权限，绝不 `cat`、打包或复制密钥目录：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo find /srv/jingtang/review/secrets -maxdepth 1 -type f \
     -printf '%m %u:%g %f\n' | sort"
```

所有密钥文件应为 `0400`，密钥目录为 root 管理的 `0700`；运行时应用密钥由 UID/GID `65532` 读取，PostgreSQL 密钥由 UID/GID `70` 读取。不得备份本地 OAuth 根密钥或 detached key store；它们丢失时需要用户重新连接平台。

### 4.8 激活 SaaS、创建首个账号并安装自动任务

从发布包读取合并镜像校验和：

```bash
cd "$JT_REPO/.local/review-release/$JT_RELEASE_SHA"
export JT_IMAGES_SHA256="$(awk '$2 == "jingtang-review-images.tar" {print $1}' SHA256SUMS)"
test "${#JT_IMAGES_SHA256}" -eq 64
```

执行不可变激活：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo '/srv/jingtang/review/releases/$JT_RELEASE_SHA/activate-release.sh' \
    '$JT_RELEASE_SHA' '$JT_IMAGES_SHA256' '$JT_CHANGE_REF'"
```

激活会校验发布包、镜像 revision label、Compose、Caddy、`runtime.env` 和 live 配置，前向迁移数据库，启动 PostgreSQL、platform 和 worker，重建共享 Caddy，然后检查容器健康、官网 HTTPS 及 SaaS `noindex`。失败时会恢复进入激活前的官网/Review 配置；数据库迁移不会向后回滚。健康检查通过后，脚本只保留当前版本与上一可回滚版本，并按经过验证的完整 Git SHA 自动删除更早的 Review 发布目录、无 rollback 证据的废弃 SHA 候选、失败候选中的大镜像归档及旧镜像标签；共享镜像层仍由 Docker 保留，不会清理 rollback 配置证据、数据库卷、state、secrets 或用户对象。

新空环境创建首个预授权账号：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" '
  sudo docker compose --project-directory /srv/jingtang/review \
    --env-file /srv/jingtang/review/runtime.env \
    --env-file /srv/jingtang/review/release.env \
    -f /srv/jingtang/review/compose.yaml \
    --profile tools run --rm provision-identity
  sudo docker restart jingtang-review-platform-1
  for JT_ATTEMPT in $(seq 1 30); do
    test "$(sudo docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{end}}" \
      jingtang-review-platform-1 2>/dev/null)" = healthy && exit 0
    sleep 2
  done
  exit 1
'
```

platform 会在启动时读取受保护的账号存储，因此每次新增预创建账号后都必须受控重启 platform 并等待健康。账号密码位于受保护的 `reviewer-password` 文件，只能通过密码管理器或同等受保护渠道交付；不要在普通终端、聊天、工单或文档中显示。当前环境禁止公开注册和自助重置。

安装维护脚本和 systemd timers：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo '/srv/jingtang/review/releases/$JT_RELEASE_SHA/install-maintenance-timers.sh'"
```

预期任务：

- `jingtang-review-backup.timer`：每日 `03:15 UTC`，最多随机延迟 10 分钟；
- `jingtang-review-capacity.timer`：每小时，最多随机延迟 5 分钟。

### 4.9 部署验收

先确认目标主机确实是本次验证对象。域名已切到新服务器后，用 DNS 和 `--resolve` 双重验证；`JT_NEW_IP` 只填新服务器的已核验公网 IP：

```bash
export JT_NEW_IP=203.0.113.10
export JT_REVIEW_HEADERS="$(mktemp)"
trap 'rm -f "$JT_REVIEW_HEADERS"' EXIT
dig +short jingtangai.com A
dig +short review.jingtangai.com A
curl --fail --silent --show-error --resolve "jingtangai.com:443:$JT_NEW_IP" \
  https://jingtangai.com/ >/dev/null
curl --fail --silent --show-error --resolve "review.jingtangai.com:443:$JT_NEW_IP" \
  --dump-header "$JT_REVIEW_HEADERS" --output /dev/null \
  https://review.jingtangai.com/api/v1/health
grep -Eiq '^x-robots-tag:.*noindex' "$JT_REVIEW_HEADERS"
```

运行仓库正式 smoke；退出当前 shell 时 trap 会删除临时响应头文件：

```bash
cd "$JT_REPO"
pnpm site:production-smoke
```

服务器侧验收：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" '
  set -e
  test "$(cat /srv/jingtang/review/current-release)" = \
    "$(basename "$(readlink /srv/jingtang/public-site/current)")"
  sudo docker inspect --format="{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}" \
    jingtang-public-site \
    jingtang-review-platform-1 \
    jingtang-review-worker-1 \
    jingtang-review-postgres-1
  sudo ss -lntup
  sudo systemctl is-active \
    jingtang-review-backup.timer jingtang-review-capacity.timer
  sudo systemctl list-timers --all \
    jingtang-review-backup.timer jingtang-review-capacity.timer
  sudo /srv/jingtang/review/check-capacity.sh
'
```

只允许 `22/tcp`、`80/tcp`、`443/tcp` 和可选 `443/udp` 对公网监听。还必须由人工登录首个账号，验证：

1. 官网中英文页面的 Sign in 均进入真实 SaaS 登录页；
2. 页面没有“测试、内测、审核环境”等内部标记；
3. 登录、Workspace 权限、私有 COS 直传、明确发布确认、结果跟踪、YouTube 与 Facebook Page 连接/断开和安全错误文案正常；
4. SaaS 响应包含 `X-Robots-Tag: noindex, nofollow, noarchive`；
5. 未登录用户无法注册或自助重置密码；
6. 备份和隔离恢复演练通过。

立即生成首份备份并从命令输出记录对象键：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  'sudo /srv/jingtang/review/backup-review.sh'
```

使用刚生成的准确对象键执行隔离恢复演练：

```bash
export JT_BACKUP_OBJECT='backups/postgres/review-YYYYMMDDTHHMMSSZ.dump.enc'
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" "$JT_SSH_TARGET" \
  "sudo /srv/jingtang/review/restore-review-drill.sh '$JT_BACKUP_OBJECT'"
```

恢复演练只在无网络的临时 PostgreSQL 容器中验证解密和 schema，不会修改 live 数据库。

### 4.10 DNS 切流

空环境新机切流按以下顺序执行：

1. 在 DNS 仍指向旧主机时完成新机初始化、官网发布、Review 包/配置/密钥安装和容器激活准备；
2. 如果新机与旧机使用完全独立的 COS/CAM/OAuth/数据库，可先激活新机；如果复用任何 live 资源则停止，改走迁移方案；
3. 把 `jingtangai.com` 与 `review.jingtangai.com` 的 A 记录一起切到新 IP；
4. 等待权威 DNS 和公共解析器返回新 IP，通过 `sudo docker logs --since 15m jingtang-public-site` 确认 Caddy 在新机成功取得两个证书；
5. 使用上一节的 `--resolve` 明确验证新 IP，再运行完整 production smoke 和人工登录验收；
6. 观察错误日志、容量和备份任务；在观察期结束前保留旧主机和回退 DNS，不删除数据或密钥；
7. 只有在验收记录完成后，才可以根据单独批准的退役流程撤销旧资源。

激活脚本内的公网 HTTPS 检查在 DNS 尚未切换时可能命中旧服务器，因此它不能替代切流后的 `--resolve` 和 DNS 验证。

## 5. 当前首尔服务器日常维护

以下命令默认目标为当前 `jingtang-production`。执行写操作前再次核验 `hostnamectl`、当前 release 和变更引用；日常只读检查无需停止服务。

### 5.1 每日健康检查

工作站侧：

```bash
export JT_REVIEW_HEADERS="$(mktemp)"
trap 'rm -f "$JT_REVIEW_HEADERS"' EXIT
curl --fail --silent --show-error --location https://jingtangai.com/ >/dev/null
curl --fail --silent --show-error --dump-header "$JT_REVIEW_HEADERS" \
  --output /dev/null https://review.jingtangai.com/api/v1/health
grep -Eiq '^x-robots-tag:.*noindex' "$JT_REVIEW_HEADERS"
```

服务器侧：

```bash
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" \
  jingtang-production '
  set -e
  hostnamectl --static
  printf "website="; readlink /srv/jingtang/public-site/current
  printf "review="; cat /srv/jingtang/review/current-release
  sudo docker inspect --format="{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} restarts={{.RestartCount}}" \
    jingtang-public-site \
    jingtang-review-platform-1 \
    jingtang-review-worker-1 \
    jingtang-review-postgres-1
  free -h
  df -h / /srv/jingtang
  swapon --show
  sudo systemctl --failed
  sudo systemctl list-timers --all \
    jingtang-review-backup.timer jingtang-review-capacity.timer
'
```

健康标准：四个容器均为 `running`，platform/PostgreSQL 为 `healthy`，重启次数没有异常增长，根文件系统剩余空间至少 8 GiB，swap 至少 1 GiB，两个 timer 均为 active 且有下一次执行时间。

### 5.2 日志检查

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo docker logs --since 30m --tail 200 jingtang-review-platform-1
  sudo docker logs --since 30m --tail 200 jingtang-review-worker-1
  sudo docker logs --since 30m --tail 200 jingtang-review-postgres-1
  sudo journalctl -u jingtang-review-backup.service --since today --no-pager
  sudo journalctl -u jingtang-review-capacity.service --since today --no-pager
  sudo tail -n 100 /srv/jingtang/public-site/logs/access.log
  sudo tail -n 100 /srv/jingtang/public-site/logs/review-access.log
'
```

OAuth callback 已从 Caddy access log 排除。日志中如果出现 token、密码、授权码、SecretId/SecretKey 或用户私有内容，按 Operations 中的 P1/P2 事件流程立即隔离日志、停止受影响连接/worker，并轮换凭据；不要把原始敏感行复制到工单。

### 5.3 容量检查

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production \
  'sudo /srv/jingtang/review/check-capacity.sh'
```

该脚本同时检查主机至少 8 GiB 可用磁盘、至少 1 GiB swap 和 Review COS 容量。15 GiB active-object 是应用软上限，达到后应拒绝新上传，不能把已购买的 COS 套餐当作硬配额。

排查磁盘占用：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo du -xhd1 /srv/jingtang /var/lib/docker 2>/dev/null | sort -h
  sudo du -xhd1 /srv/jingtang/review/releases \
    /srv/jingtang/public-site/releases 2>/dev/null | sort -h
  sudo docker system df
  sudo docker image ls --digests
'
```

禁止执行无目标的 `docker system prune -a` 或递归删除整个 `/srv/jingtang`、release、数据库、state、secret 目录。Review 成功激活会自动保留当前与上一版本，并按**准确 SHA**清理更早的受管发布包和镜像；手工清理只用于异常残留，仍须先确认目标不是 `current-release`、不是上一回滚版本、不是官网 `current`。

### 5.4 自动备份和恢复演练

查看任务及最近结果：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo systemctl status jingtang-review-backup.timer \
    jingtang-review-capacity.timer --no-pager
  sudo journalctl -u jingtang-review-backup.service -n 100 --no-pager
  sudo journalctl -u jingtang-review-capacity.service -n 100 --no-pager
'
```

手工备份：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production \
  'sudo /srv/jingtang/review/backup-review.sh'
```

每次重大发布后以及至少按季度，从备份成功日志中选择一个仍在 7 天保留期内的准确对象键执行：

```bash
export JT_BACKUP_OBJECT='backups/postgres/review-YYYYMMDDTHHMMSSZ.dump.enc'
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production \
  "sudo /srv/jingtang/review/restore-review-drill.sh '$JT_BACKUP_OBJECT'"
```

若备份或恢复演练失败，不要删除 live 数据或覆盖数据库。保留安全错误类别和对象键，检查 backup CAM 前缀权限、COS 生命周期、磁盘空间和 `backup-encryption-key` 文件的权限；不得输出其值。

### 5.5 受控重启

单个服务异常时优先重启最小范围。

重启 platform 并等待健康：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo docker restart jingtang-review-platform-1
  for JT_ATTEMPT in $(seq 1 30); do
    test "$(sudo docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{end}}" \
      jingtang-review-platform-1 2>/dev/null)" = healthy && exit 0
    sleep 2
  done
  sudo docker logs --tail 100 jingtang-review-platform-1 >&2
  exit 1
'
```

重启 worker：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production \
  'sudo docker restart jingtang-review-worker-1 && \
   sudo docker inspect --format="{{.State.Status}}" jingtang-review-worker-1'
```

只有单服务重启不足时才重建当前 Review 服务：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo docker compose --project-directory /srv/jingtang/review \
    --env-file /srv/jingtang/review/runtime.env \
    --env-file /srv/jingtang/review/release.env \
    -f /srv/jingtang/review/compose.yaml \
    up -d postgres platform worker
  sudo docker compose --project-directory /srv/jingtang/review \
    --env-file /srv/jingtang/review/runtime.env \
    --env-file /srv/jingtang/review/release.env \
    -f /srv/jingtang/review/compose.yaml ps
'
```

重建官网 Caddy：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo docker compose --project-directory /srv/jingtang/public-site \
    -f /srv/jingtang/public-site/compose.yaml up -d --force-recreate
  sudo docker inspect --format="{{.State.Status}}" jingtang-public-site
'
```

不要用 `down -v`；它会触及持久卷。重启后必须重新执行 HTTPS、health、`noindex` 和登录检查。

### 5.6 发布新版本

官网内容更新使用第 4.4、4.5 和 4.9 节：

1. 最终提交上 `pnpm verify`；
2. 记录 SHA 和 change reference；
3. 运行 `pnpm site:deploy:tencent`；
4. 运行 `pnpm site:production-smoke` 并检查两个 Sign in 链接。

Review 应用更新使用第 4.4、4.6、4.8 和 4.9 节。已有主机不得再次运行 `generate-internal-secrets.sh`，也不得覆盖 `runtime.env` 或已有外部密钥。新发布只传输新的不可变 release，读取其校验和后运行新的 `activate-release.sh`；成功后重新安装 timers，以确保主机使用当前发布中的维护脚本和 unit。

每次发布后记录：UTC 时间、Git SHA、变更引用、CI 结果、两个 archive SHA256、容器/health、官网 smoke、登录验收、备份对象键和恢复演练结果。服务器会把成功 Review 激活追加到 `/srv/jingtang/review/change-record.log`。

### 5.7 回退

#### 官网静态内容回退

确认目标 SHA 的目录仍存在且包含 `index.html`：

```bash
export JT_PREVIOUS_SITE_SHA=replace_with_verified_sha
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production \
  "sudo test -f '/srv/jingtang/public-site/releases/$JT_PREVIOUS_SITE_SHA/index.html' && \
   sudo /srv/jingtang/public-site/activate-release.sh '$JT_PREVIOUS_SITE_SHA'"
```

该操作只回退官网静态目录，不回退 Review 应用、数据库或当前 Caddy 配置。随后运行 `pnpm site:production-smoke`。

#### Review 应用回退

Review 数据库迁移只允许前向。只有在确认当前 schema 与旧应用/旧 migration 镜像兼容、旧发布目录及两个 archive 校验和完整，并取得回退变更引用后，才可用旧发布目录中的 `activate-release.sh` 重新激活旧 SHA。不得运行向后迁移或用旧数据库目录覆盖 live 数据。

如果兼容性未经确认，停止回退，优先发布修复版；涉及数据恢复时按 Operations 的隔离恢复流程和单独 Human Owner 授权处理。

### 5.8 预创建账号维护

当前环境只允许预创建账号。新增账号前记录用途、负责人、有效期和交付渠道，在 `runtime.env` 中只更新非敏感邮箱/显示名，并通过 `provision-identity` 工具写入受保护存储。密码必须是独立值并通过受保护密码文件提供，不能放入环境变量或命令参数。执行完成后受控重启 platform，因为账号存储只在进程启动时加载。

禁止直接编辑 `/srv/jingtang/review/state/identity.json`，禁止开启公开注册、自助重置或 `ALLOW_TEST_IDENTITY`。账号停用、密码替换或批量账号变更必须使用经审核的账号操作程序并保留最小审计记录；不得在本仓库提交账号密码文档。

### 5.9 事件处置最小动作

- 官网不可用但 Review 容器健康：检查 `jingtang-public-site`、Caddy 日志、证书、DNS 和端口；不要先重建数据库；
- SaaS `502`：检查 platform health、`jingtang-ingress` 和 `review-platform` 网络别名；
- worker 重复失败：先停止 `jingtang-review-worker-1`，保留数据库 outbox 和安全日志，再根据错误类别修复；
- 磁盘低于 8 GiB：停止新的发布/上传，检查旧 immutable release、Docker 镜像和日志；不得清理 live PostgreSQL、state 或密钥；
- COS/CAM/OAuth 凭据疑似泄露：立即禁止受影响连接或 worker，撤销外部凭据并按受控流程安装新值；
- token、跨租户访问、未授权外部写入或数据丢失：按 [Operations Incident Response](../../docs/OPERATIONS.md#incident-response) 宣告 P1，保护证据并执行 deny-first。

Meta App Secret 疑似泄露或按迁移计划轮换时，先在 JINGTANG 中 deny/disconnect 受影响 Facebook 连接并停止 worker；在 Meta Dashboard 重置 Secret 后，通过受控交互会话原子替换主机文件，不能把值放入命令参数、环境变量或 shell history：

```bash
ssh -t -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo bash -c '\''
    set -euo pipefail
    read -rsp "New Meta App Secret: " JT_META_SECRET
    echo
    test -n "$JT_META_SECRET"
    install -o 65532 -g 65532 -m 0400 /dev/null \
      /srv/jingtang/review/secrets/facebook-app-secret.next
    printf %s "$JT_META_SECRET" > \
      /srv/jingtang/review/secrets/facebook-app-secret.next
    unset JT_META_SECRET
    mv -f /srv/jingtang/review/secrets/facebook-app-secret.next \
      /srv/jingtang/review/secrets/facebook-app-secret
  '\''
  sudo docker restart jingtang-review-platform-1 jingtang-review-worker-1
'
```

随后检查 health、OAuth callback 日志排除、Meta 签名删除回调和一个不产生发布写入的连接/断开流程。未来正式生产切换还必须移除 Review redirect/callback、轮换 Secret、撤销 Review Token、销毁 Review token key 并重新执行完整门禁；durable App ID 不等于复用 Review 凭据或数据。

### 5.10 周期性主机安全维护

至少每月以及每次高危公告后检查待更新包、Docker、时钟和 SSH 实际配置：

```bash
ssh -o IdentitiesOnly=yes -i "$JT_SSH_IDENTITY" jingtang-production '
  sudo apt update
  apt list --upgradable 2>/dev/null
  sudo apt-get --simulate dist-upgrade
  sudo docker version
  sudo docker compose version
  timedatectl status
  sudo systemctl status docker chrony --no-pager
  sudo sshd -T | grep -E \
    "^(passwordauthentication|permitrootlogin|pubkeyauthentication|maxauthtries) "
'
```

`apt update` 只刷新包索引；不要看到更新后直接执行无人审核的全量升级。内核、Docker Engine/Compose、OpenSSH、containerd 或 Caddy 相关升级都按发布变更处理：先审阅安全公告和包差异，在兼容环境验证，生成并恢复演练最新数据库备份，保留已批准的软件回退入口，约定维护窗口，再只安装已批准的版本。禁止用包含 Review 本地 OAuth 根密钥或 detached key store 的整机快照替代允许范围内的加密数据库备份。需要重启主机时先停止新上传/发布并观察 worker 中的 durable work，重启后完整执行 5.1、5.3 和 4.9 节验收。

至少每季度核对腾讯云防火墙、SSH `authorized_keys`、`known_hosts`、CAM 子用户、OAuth 客户端、DNS 记录和操作人员名单，移除过期访问。不得自动轮换 Review OAuth 根密钥；其受控替换要求先 deny/disconnect 受影响连接、完成旧 key retirement，再替换 key/store 并让用户重新连接。

## 6. 退出和交接清单

一次人工部署或维护只有在以下项目均完成后才能结束：

- 目标主机、Git SHA、变更引用和执行人已记录；
- 官网和 Review release 指针正确，四个容器运行且 health 正常；
- 公网只暴露批准端口，Review 保持 `noindex`；
- `pnpm site:production-smoke` 和所需人工登录流程通过；
- 没有“测试、内测、审核环境”等内部对外文案；
- systemd backup/capacity timers active，最近一次任务无失败；
- 新部署或重大发布后，加密备份和隔离恢复演练通过；
- 密钥未进入 Git、普通日志、命令参数、工单、聊天或截图；
- 回退路径仍存在，旧服务器/旧 release 未在观察期内删除；
- 任何未验证项、例外和残余风险已明确移交。
