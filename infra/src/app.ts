import { App } from "aws-cdk-lib";

import { PlatformFoundationStack } from "./platform-foundation-stack.js";

const app = new App();
const stage = app.node.tryGetContext("stage") === "production" ? "production" : "staging";

new PlatformFoundationStack(app, `Jingtang-${stage}-Foundation`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-southeast-1",
  },
  stage,
  description:
    "JINGTANG isolated SaaS foundation: Cognito, private PostgreSQL, ECS, and queue boundaries.",
});
