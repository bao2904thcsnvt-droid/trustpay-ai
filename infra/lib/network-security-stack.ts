import { CfnOutput, RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";

/**
 * NetworkSecurityStack — nền tảng Zero-Trust cho TrustPay AI.
 *
 * - VPC cô lập (PRIVATE_ISOLATED, không NAT Gateway) để Lambda không ra Internet.
 * - VPC Interface Endpoints (PrivateLink) cho Bedrock, Rekognition, Translate,
 *   KMS, CloudWatch Logs, Secrets Manager; Gateway Endpoint cho DynamoDB & S3.
 * - KMS CMK (tự xoay vòng khóa) cho DynamoDB, S3, biến môi trường Lambda, logs.
 * - AWS WAFv2 WebACL (REGIONAL) chống bot/DDoS + rate-limit.
 */
export class NetworkSecurityStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly kmsKey: kms.Key;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "TrustPayVpc", {
      maxAzs: 3,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
      vpc: this.vpc,
      allowAllOutbound: true,
      description: "SG cho Lambda TrustPay AI (chỉ ra qua VPC Endpoints)",
    });

    this.kmsKey = new kms.Key(this, "TrustPayCmk", {
      alias: "alias/trustpay-ai",
      description: "CMK TrustPay AI — DynamoDB, S3, Lambda env, CloudWatch Logs",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const interfaceServices: Record<string, ec2.InterfaceVpcEndpointAwsService> = {
      Bedrock: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      Rekognition: ec2.InterfaceVpcEndpointAwsService.REKOGNITION,
      Translate: ec2.InterfaceVpcEndpointAwsService.TRANSLATE,
      Comprehend: ec2.InterfaceVpcEndpointAwsService.COMPREHEND,
      Kms: ec2.InterfaceVpcEndpointAwsService.KMS,
      Logs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      SecretsManager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    };

    for (const [name, service] of Object.entries(interfaceServices)) {
      this.vpc.addInterfaceEndpoint(`${name}Endpoint`, {
        service,
        privateDnsEnabled: true,
        securityGroups: [this.lambdaSecurityGroup],
      });
    }

    this.vpc.addGatewayEndpoint("DynamoDbEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });
    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    const webAcl = new wafv2.CfnWebACL(this, "TrustPayWebAcl", {
      defaultAction: { allow: {} },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "trustpay-waf",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "RateLimitPerIp",
          priority: 0,
          action: { block: {} },
          statement: { rateBasedStatement: { limit: 2000, aggregateKeyType: "IP" } },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "trustpay-rate-limit",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedCommonRuleSet",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "trustpay-common",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedKnownBadInputs",
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesKnownBadInputsRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "trustpay-bad-inputs",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedBotControl",
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesBotControlRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "trustpay-bot-control",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    Tags.of(this).add("project", "trustpay-ai");
    Tags.of(this).add("service", "network-security");

    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
    new CfnOutput(this, "KmsKeyArn", { value: this.kmsKey.keyArn });
    new CfnOutput(this, "WebAclArn", {
      value: this.webAclArn,
      description:
        "Gắn WebACL này vào CloudFront/ALB đứng trước API (HTTP API không hỗ trợ gắn WAF trực tiếp).",
    });
  }
}
