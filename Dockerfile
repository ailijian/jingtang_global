FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dispatcher/package.json apps/dispatcher/package.json
COPY apps/platform/package.json apps/platform/package.json
COPY apps/site/package.json apps/site/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/integrations/package.json packages/integrations/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS packages-build

COPY tsconfig.base.json ./
COPY packages /app/packages
RUN pnpm build:packages

FROM packages-build AS platform-build

COPY apps/platform /app/apps/platform
RUN pnpm --filter @jingtang/platform build

FROM packages-build AS dispatcher-build

COPY apps/dispatcher /app/apps/dispatcher
RUN pnpm --filter @jingtang/dispatcher build

FROM packages-build AS worker-build

COPY apps/worker /app/apps/worker
RUN pnpm --filter @jingtang/worker build

FROM dependencies AS production-dependencies

RUN CI=true pnpm install --prod --offline --frozen-lockfile

FROM packages-build AS package-code

# Workspace-level dependency links come from the production-only stage.
RUN find packages -mindepth 2 -maxdepth 2 -type d -name node_modules \
    -exec rm -rf -- '{}' + \
  && chmod -R a+rX /app/packages

FROM platform-build AS platform-code

# Keep generated framework links inside build output such as .next.
RUN rm -rf /app/apps/platform/node_modules \
  && chmod -R a+rX /app/apps/platform

FROM dispatcher-build AS dispatcher-code

RUN rm -rf /app/apps/dispatcher/node_modules \
  && chmod -R a+rX /app/apps/dispatcher

FROM worker-build AS worker-code

RUN rm -rf /app/apps/worker/node_modules \
  && chmod -R a+rX /app/apps/worker

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime-base

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  && rm -f \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg

COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
RUN chmod -R a+rX /app/node_modules

COPY --from=production-dependencies --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/
COPY --from=production-dependencies --chown=node:node /app/apps/platform /app/apps/platform
COPY --from=production-dependencies --chown=node:node /app/apps/dispatcher /app/apps/dispatcher
COPY --from=production-dependencies --chown=node:node /app/apps/worker /app/apps/worker
COPY --from=production-dependencies --chown=node:node /app/packages /app/packages

# Application and build output remain separate from the stable production
# dependency layers, so ordinary code releases do not resend dependencies.
COPY --from=platform-code --chown=node:node /app/apps/platform /app/apps/platform
COPY --from=dispatcher-code --chown=node:node /app/apps/dispatcher /app/apps/dispatcher
COPY --from=worker-code --chown=node:node /app/apps/worker /app/apps/worker
COPY --from=package-code --chown=node:node /app/packages /app/packages

USER node

FROM runtime-base AS runtime

# Keep release identity in the final metadata-only stage so a new Git SHA does
# not invalidate stable operating-system and production-dependency layers.
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF

FROM runtime-base AS migration

# The migration image shares the exact production dependency and application
# layers. Only its execution identity/command differ, so releases do not carry
# a second development dependency tree.
# Keep the image non-root by default. The Review Compose profile explicitly
# elevates only its one-shot migration job to read the root-managed admin URL.
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
CMD ["node", "apps/platform/scripts/migrate-review.mjs"]
