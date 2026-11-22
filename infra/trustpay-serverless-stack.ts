import * as path from "path";
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { HttpApi, HttpMethod, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

export interface TrustPayServerlessStackProps extends StackProps {
  readonly vpc: ec2.IVpc;
  readonly kmsKey: kms.IKey;
  readonly lambdaSecurityGroup: ec2.ISecurityGroup;
  readonly webAclArn: string;
  readonly bedrockModelId: string;
}

/**
 * TrustPayServerlessStack — lõi hạ tầng serverless.
 *
 * API Gateway HTTP API → 2 Lambda (/api/analyze, /api/verify-face) chạy trong
 * VPC private subnets, ghi vết kiểm toán bất biến vào DynamoDB Single-Table, với
 * IAM Role đặc quyền tối thiểu (bedrock:InvokeModel, rekognition:CompareFaces/
 * DetectText, dynamodb:PutItem). Dữ liệu mã hóa KMS CMK.
 */
export class TrustPayServerlessStack extends Stack {
  public readonly analyzeFunctionName: string;
  public readonly verifyFaceFunctionName: string;
  public readonly httpApiId: string;

  constructor(scope: Construct, id: string, props: TrustPayServerlessStackProps) {
    super(scope, id, props);

    // 1. Bảng DynamoDB Single-Table (Audit Trail + Blacklist + Ledger + Idempotency).
    const table = new dynamodb.Table(this, "CoreTable", {
      tableName: "TrustPayCore",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: props.kmsKey,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
    });

    // 2. Bucket tài sản (ảnh tham chiếu eKYC + ảnh bằng chứng đã khử nhận dạng).
    const assetsBucket = new s3.Bucket(this, "AssetsBucket", {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.kmsKey,
      bucketKeyEnabled: true,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ prefix: "evidence/", expiration: Duration.days(180) }],
    });

    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.lambdaSecurityGroup],
      tracing: lambda.Tracing.ACTIVE,
      environmentEncryption: props.kmsKey,
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        externalModules: ["@aws-sdk/*"],
        tsconfig: path.join(__dirname, "tsconfig.json"),
      },
      projectRoot: __dirname,
      depsLockFilePath: path.join(__dirname, "package-lock.json"),
    };

    // 3a. Lambda /api/analyze.
    const analyzeFn = new NodejsFunction(this, "AnalyzeFunction", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "lambda", "analyze.ts"),
      handler: "handler",
      environment: {
        BEDROCK_MODEL_ID: props.bedrockModelId,
        TABLE_NAME: table.tableName,
        ASSETS_BUCKET: assetsBucket.bucketName,
        TRUSTPAY_DEMO_MODE: "false",
      },
    });

    // 3b. Lambda /api/verify-face.
    const verifyFaceFn = new NodejsFunction(this, "VerifyFaceFunction", {
      ...commonLambdaProps,
      entry: path.join(__dirname, "lambda", "verify-face.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        REFERENCE_FACE_BUCKET: assetsBucket.bucketName,
        FACE_SIMILARITY_THRESHOLD: "90",
        TRUSTPAY_DEMO_MODE: "false",
      },
    });

    // 4. IAM đặc quyền tối thiểu.
    const bedrockModelArn = `arn:aws:bedrock:${this.region}::foundation-model/${props.bedrockModelId}`;
    analyzeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [bedrockModelArn],
      }),
    );
    analyzeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["rekognition:DetectText"],
        resources: ["*"],
      }),
    );
    analyzeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["translate:TranslateText", "comprehend:DetectDominantLanguage"],
        resources: ["*"],
      }),
    );
    analyzeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [table.tableArn],
      }),
    );
    analyzeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`${assetsBucket.bucketArn}/evidence/*`],
      }),
    );

    verifyFaceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["rekognition:CompareFaces"],
        resources: ["*"],
      }),
    );
    verifyFaceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${assetsBucket.bucketArn}/reference-faces/*`],
      }),
    );
    verifyFaceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [table.tableArn],
      }),
    );

    // KMS: cấp quyền tối thiểu cho mã hóa DynamoDB/S3 phía server.
    props.kmsKey.grantEncryptDecrypt(analyzeFn);
    props.kmsKey.grantEncryptDecrypt(verifyFaceFn);

    // 5. API Gateway HTTP API.
    const httpApi = new HttpApi(this, "TrustPayHttpApi", {
      apiName: "trustpay-ai",
      description: "TrustPay AI — biên AI serverless",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ["content-type", "x-user-ref"],
      },
    });
    httpApi.addRoutes({
      path: "/api/analyze",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("AnalyzeIntegration", analyzeFn),
    });
    httpApi.addRoutes({
      path: "/api/verify-face",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("VerifyFaceIntegration", verifyFaceFn),
    });

    this.analyzeFunctionName = analyzeFn.functionName;
    this.verifyFaceFunctionName = verifyFaceFn.functionName;
    this.httpApiId = httpApi.apiId;

    Tags.of(this).add("project", "trustpay-ai");
    Tags.of(this).add("service", "serverless-core");

    new CfnOutput(this, "HttpApiEndpoint", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "CoreTableName", { value: table.tableName });
    new CfnOutput(this, "AssetsBucketName", { value: assetsBucket.bucketName });
    new CfnOutput(this, "AssociatedWebAclArn", {
      value: props.webAclArn,
      description: "WebACL dự kiến gắn qua CloudFront/ALB đứng trước HTTP API.",
    });
  }
}
