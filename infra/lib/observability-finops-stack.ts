import { CfnOutput, Duration, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as budgets from "aws-cdk-lib/aws-budgets";

export interface ObservabilityFinOpsStackProps extends StackProps {
  readonly analyzeFunctionName: string;
  readonly verifyFaceFunctionName: string;
  readonly httpApiId: string;
  readonly monthlyBudgetUsd: number;
  readonly alarmEmail?: string;
}

/**
 * ObservabilityFinOpsStack — quan sát thời gian thực + kiểm soát chi phí.
 *
 * - CloudWatch Dashboard: độ trễ P99, lỗi, lời gọi, throttle của 2 Lambda; đếm
 *   token Bedrock (metric tùy biến từ ứng dụng), tỷ lệ chặn gian lận.
 * - Anomaly Detection alarm (ANOMALY_DETECTION_BAND) cho lưu lượng bất thường.
 * - AWS X-Ray: Lambda bật tracing ACTIVE (ở ServerlessStack) → Service Map.
 * - AWS Budgets: cảnh báo chi phí hằng tháng.
 */
export class ObservabilityFinOpsStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityFinOpsStackProps) {
    super(scope, id, props);

    const alarmTopic = new sns.Topic(this, "TrustPayAlarmTopic", {
      displayName: "TrustPay AI — cảnh báo vận hành & chi phí",
    });
    if (props.alarmEmail) {
      alarmTopic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));
    }

    const lambdaMetric = (
      functionName: string,
      metricName: string,
      statistic: string,
    ): cw.Metric =>
      new cw.Metric({
        namespace: "AWS/Lambda",
        metricName,
        dimensionsMap: { FunctionName: functionName },
        statistic,
        period: Duration.minutes(1),
      });

    const analyzeP99 = lambdaMetric(props.analyzeFunctionName, "Duration", "p99");
    const analyzeErrors = lambdaMetric(props.analyzeFunctionName, "Errors", "Sum");
    const analyzeInvocations = lambdaMetric(props.analyzeFunctionName, "Invocations", "Sum");
    const analyzeThrottles = lambdaMetric(props.analyzeFunctionName, "Throttles", "Sum");
    const verifyP99 = lambdaMetric(props.verifyFaceFunctionName, "Duration", "p99");
    const verifyErrors = lambdaMetric(props.verifyFaceFunctionName, "Errors", "Sum");

    // Metric tùy biến do ứng dụng phát (EMF): token Bedrock & tỷ lệ chặn gian lận.
    const bedrockTokens = new cw.Metric({
      namespace: "TrustPayAI",
      metricName: "BedrockInputTokens",
      statistic: "Sum",
      period: Duration.minutes(5),
    });
    const fraudBlockRate = new cw.Metric({
      namespace: "TrustPayAI",
      metricName: "FraudBlockRate",
      statistic: "Average",
      period: Duration.minutes(5),
    });
    const fallbackRate = new cw.Metric({
      namespace: "TrustPayAI",
      metricName: "FallbackRate",
      statistic: "Average",
      period: Duration.minutes(5),
    });

    // Alarm độ trễ P99.
    const latencyAlarm = analyzeP99.createAlarm(this, "AnalyzeP99LatencyAlarm", {
      threshold: 2500,
      evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "P99 /api/analyze vượt 2500ms",
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    latencyAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // Alarm lỗi.
    const errorAlarm = analyzeErrors.createAlarm(this, "AnalyzeErrorsAlarm", {
      threshold: 25,
      evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: "Số lỗi /api/analyze tăng bất thường",
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    errorAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // Alarm Anomaly Detection trên lưu lượng (phát hiện tấn công / tăng đột biến).
    const anomalyAlarm = new cw.CfnAlarm(this, "InvocationsAnomalyAlarm", {
      alarmDescription: "Phát hiện lưu lượng /api/analyze bất thường (ANOMALY_DETECTION_BAND)",
      comparisonOperator: "LessThanLowerOrGreaterThanUpperThreshold",
      evaluationPeriods: 3,
      thresholdMetricId: "ad1",
      treatMissingData: "notBreaching",
      metrics: [
        {
          id: "m1",
          returnData: true,
          metricStat: {
            metric: {
              namespace: "AWS/Lambda",
              metricName: "Invocations",
              dimensions: [{ name: "FunctionName", value: props.analyzeFunctionName }],
            },
            period: 300,
            stat: "Sum",
          },
        },
        {
          id: "ad1",
          expression: "ANOMALY_DETECTION_BAND(m1, 2)",
          label: "Invocations (expected)",
          returnData: true,
        },
      ],
    });
    anomalyAlarm.alarmActions = [alarmTopic.topicArn];

    // Dashboard.
    const dashboard = new cw.Dashboard(this, "TrustPayDashboard", {
      dashboardName: "TrustPay-AI-Operations",
    });
    dashboard.addWidgets(
      new cw.TextWidget({
        markdown:
          "# TrustPay AI — Bảng điều khiển vận hành\nĐộ trễ P99 · Tỷ lệ chặn gian lận · Token Bedrock · Tỷ lệ Fallback.\nAWS X-Ray Service Map: xem console X-Ray (Lambda bật tracing ACTIVE).",
        width: 24,
        height: 3,
      }),
    );
    dashboard.addWidgets(
      new cw.GraphWidget({
        title: "Độ trễ P99 (ms)",
        left: [analyzeP99, verifyP99],
        width: 12,
      }),
      new cw.GraphWidget({
        title: "Lỗi & Throttle",
        left: [analyzeErrors, verifyErrors, analyzeThrottles],
        width: 12,
      }),
    );
    dashboard.addWidgets(
      new cw.GraphWidget({ title: "Lời gọi /api/analyze", left: [analyzeInvocations], width: 8 }),
      new cw.GraphWidget({ title: "Token đầu vào Bedrock", left: [bedrockTokens], width: 8 }),
      new cw.GraphWidget({
        title: "Tỷ lệ chặn gian lận & Fallback",
        left: [fraudBlockRate, fallbackRate],
        width: 8,
      }),
    );

    // AWS Budgets — cảnh báo chi phí.
    new budgets.CfnBudget(this, "MonthlyCostBudget", {
      budget: {
        budgetName: "trustpay-ai-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: props.monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: props.alarmEmail
        ? [
            {
              notification: {
                notificationType: "ACTUAL",
                comparisonOperator: "GREATER_THAN",
                threshold: 80,
                thresholdType: "PERCENTAGE",
              },
              subscribers: [{ subscriptionType: "EMAIL", address: props.alarmEmail }],
            },
            {
              notification: {
                notificationType: "FORECASTED",
                comparisonOperator: "GREATER_THAN",
                threshold: 100,
                thresholdType: "PERCENTAGE",
              },
              subscribers: [{ subscriptionType: "EMAIL", address: props.alarmEmail }],
            },
          ]
        : undefined,
    });

    Tags.of(this).add("project", "trustpay-ai");
    Tags.of(this).add("service", "observability-finops");

    new CfnOutput(this, "DashboardName", { value: dashboard.dashboardName });
    new CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
    new CfnOutput(this, "MonitoredHttpApiId", { value: props.httpApiId });
  }
}
