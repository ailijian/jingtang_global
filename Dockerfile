FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm build:packages \
  && pnpm --filter @jingtang/platform build \
  && pnpm --filter @jingtang/dispatcher build \
  && pnpm --filter @jingtang/worker build

FROM build AS production-pruned

RUN CI=true pnpm install --prod --offline --frozen-lockfile

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF

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

COPY --from=production-pruned --chown=node:node /app/node_modules /app/node_modules
RUN chmod -R a+rX /app/node_modules

COPY --from=production-pruned --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/
COPY --from=production-pruned --chown=node:node /app/apps/platform /app/apps/platform
COPY --from=production-pruned --chown=node:node /app/apps/dispatcher /app/apps/dispatcher
COPY --from=production-pruned --chown=node:node /app/apps/worker /app/apps/worker
COPY --from=production-pruned --chown=node:node /app/packages /app/packages

# Git preserves the checkout directory modes supplied by the packaging host.
# Normalize only the smaller application layer here; the large dependency
# permission layer above remains reusable when application code changes.
RUN chmod -R a+rX /app/apps /app/packages \
  && chmod a+r /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml

USER node

FROM runtime AS migration

# The migration image shares the exact production dependency and application
# layers. Only its execution identity/command differ, so releases do not carry
# a second development dependency tree.
USER root
CMD ["node", "apps/platform/scripts/migrate-review.mjs"]
