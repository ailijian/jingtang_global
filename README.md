# JINGTANG Global

JINGTANG Global is a TypeScript monorepo for the public overseas website, controlled-publishing SaaS, and asynchronous execution worker. The D2 foundation provides identity, server-managed sessions, bilingual locale preference, Workspace isolation, membership roles, audit events, and the verification harness. Content, channel authorization, and external publishing remain intentionally unavailable until later accepted Delivery stages.

## Local setup

Requirements: Node.js 24 LTS, pnpm 11, and Docker.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm local:up
pnpm db:migrate
pnpm dev
```

The SaaS runs at `http://localhost:3100`. Local identity is synthetic and isolated from Cognito; the test confirmation/reset code is `000000`. Values prefixed `d2-test-` and mock identity are rejected by production configuration.

## Canonical verification

```bash
pnpm verify
```

The command blocks on formatting, lint, static types, builds, unit/contract/i18n/migration/integration/E2E checks, secret signatures, and high-severity production dependency findings. Migration and integration checks provision disposable PostgreSQL 17 containers and remove them after the run.

Architecture, security, contract, and Delivery knowledge is routed from [`docs/README.md`](docs/README.md). Repository operating instructions are in [`AGENTS.md`](AGENTS.md).
