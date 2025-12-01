import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export interface BackendStackProps extends cdk.StackProps {
  reportsTable: dynamodb.Table;
  rescuersTable: dynamodb.Table;
  uploadsBucket: s3.Bucket;
}

export class BackendStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly websocketUrl: string;
  public readonly restApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const { reportsTable, rescuersTable, uploadsBucket } = props;

    // ============================================
    // WebSocket Connections Table
    // ============================================
    const connectionsTable = new dynamodb.Table(this, "ConnectionsTable", {
      tableName: "disaster-websocket-connections",
      partitionKey: {
        name: "connectionId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    // GSI for querying by connection type
    connectionsTable.addGlobalSecondaryIndex({
      indexName: "type-index",
      partitionKey: {
        name: "connectionType",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // Main API Lambda Function (NodejsFunction uses esbuild locally)
    // ============================================
    const apiHandler = new nodejs.NodejsFunction(this, "ApiHandler", {
      functionName: "disaster-management-api",
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../../backend/src/lambda.ts"),
      handler: "handler",
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: "production",
        REPORTS_TABLE: reportsTable.tableName,
        RESCUERS_TABLE: rescuersTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
        UPLOADS_BUCKET: uploadsBucket.bucketName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        externalModules: [],
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    // Grant permissions
    reportsTable.grantReadWriteData(apiHandler);
    rescuersTable.grantReadWriteData(apiHandler);
    connectionsTable.grantReadWriteData(apiHandler);
    uploadsBucket.grantReadWrite(apiHandler);

    // ============================================
    // REST API Gateway
    // ============================================
    const api = new apigateway.RestApi(this, "DisasterApi", {
      restApiName: "Disaster Management API",
      description: "REST API for disaster management and rescue coordination",
      deployOptions: {
        stageName: "prod",
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
        ],
      },
      binaryMediaTypes: ["multipart/form-data", "image/*"],
    });

    // Proxy all requests to Lambda
    const lambdaIntegration = new apigateway.LambdaIntegration(apiHandler, {
      proxy: true,
    });

    // API routes - proxy all under /api
    const apiResource = api.root.addResource("api");
    apiResource.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
    });

    // Also handle /api directly
    apiResource.addMethod("ANY", lambdaIntegration);

    this.apiUrl = api.url;
    this.restApi = api;

    // ============================================
    // WebSocket Lambda Function
    // ============================================
    const wsHandler = new nodejs.NodejsFunction(this, "WebSocketHandler", {
      functionName: "disaster-management-websocket",
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../../backend/src/websocket.ts"),
      handler: "handler",
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: "production",
        CONNECTIONS_TABLE: connectionsTable.tableName,
        REPORTS_TABLE: reportsTable.tableName,
        RESCUERS_TABLE: rescuersTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
        externalModules: [],
        nodeModules: [],
        forceDockerBundling: false,
      },
    });

    // Grant permissions
    connectionsTable.grantReadWriteData(wsHandler);
    reportsTable.grantReadData(wsHandler);
    rescuersTable.grantReadWriteData(wsHandler);

    // WebSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, "WebSocketApi", {
      apiName: "disaster-management-websocket",
      description: "WebSocket API for real-time updates",
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          "ConnectIntegration",
          wsHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          "DisconnectIntegration",
          wsHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          "DefaultIntegration",
          wsHandler
        ),
      },
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(
      this,
      "WebSocketStage",
      {
        webSocketApi,
        stageName: "prod",
        autoDeploy: true,
      }
    );

    this.websocketUrl = webSocketStage.url;

    // Grant WebSocket management permissions
    wsHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["execute-api:ManageConnections"],
        resources: [
          `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${webSocketApi.apiId}/*`,
        ],
      })
    );

    // Add WebSocket URL to API handler environment
    apiHandler.addEnvironment(
      "WEBSOCKET_API_ENDPOINT",
      this.websocketUrl.replace("wss://", "https://")
    );

    // Grant API handler permission to send WebSocket messages
    apiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["execute-api:ManageConnections"],
        resources: [
          `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${webSocketApi.apiId}/*`,
        ],
      })
    );

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.apiUrl,
      description: "REST API Gateway URL",
      exportName: "ApiUrl",
    });

    new cdk.CfnOutput(this, "WebSocketUrl", {
      value: this.websocketUrl,
      description: "WebSocket API URL",
      exportName: "WebSocketUrl",
    });

    new cdk.CfnOutput(this, "ApiHandlerArn", {
      value: apiHandler.functionArn,
      description: "API Lambda Function ARN",
      exportName: "ApiHandlerArn",
    });

    new cdk.CfnOutput(this, "ConnectionsTableName", {
      value: connectionsTable.tableName,
      description: "WebSocket Connections Table",
      exportName: "ConnectionsTableName",
    });
  }
}
