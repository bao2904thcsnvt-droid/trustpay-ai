#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { NetworkSecurityStack } from "../lib/network-security-stack";
import { ObservabilityFinOpsStack } from "../lib/observability-finops-stack";
import { TrustPayServerlessStack } from "../trustpay-serverless-stack";

const app = new App();

const region =
  (app.node.tryGetContext("trustpay:defaultRegion") as string | undefined) ??
  process.env.CDK_DEFAULT_REGION ??
  "ap-southeast-1";
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region };

const bedrockModelId =
  (app.node.tryGetContext("trustpay:bedrockModelId") as string | undefined) ??
  "anthropic.claude-3-5-sonnet-20240620-v1:0";

// 1. Hạ tầng mạng & bảo mật nền tảng (Zero-Trust).
const network = new NetworkSecurityStack(app, "TrustPayNetworkSecurityStack", { env });

// 2. Lõi serverless (API + Lambda + DynamoDB + IAM least-privilege).
const serverless = new TrustPayServerlessStack(app, "TrustPayServerlessStack", {
  env,
  vpc: network.vpc,
  kmsKey: network.kmsKey,
  lambdaSecurityGroup: network.lambdaSecurityGroup,
  webAclArn: network.webAclArn,
  bedrockModelId,
});
serverless.addDependency(network);

// 3. Quan sát & FinOps.
const observability = new ObservabilityFinOpsStack(app, "TrustPayObservabilityFinOpsStack", {
  env,
  analyzeFunctionName: serverless.analyzeFunctionName,
  verifyFaceFunctionName: serverless.verifyFaceFunctionName,
  httpApiId: serverless.httpApiId,
  monthlyBudgetUsd: Number(process.env.TRUSTPAY_MONTHLY_BUDGET_USD ?? 500),
  alarmEmail: process.env.TRUSTPAY_ALARM_EMAIL,
});
observability.addDependency(serverless);

Tags.of(app).add("project", "trustpay-ai");
Tags.of(app).add("managed-by", "aws-cdk");

app.synth();
