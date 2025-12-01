import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly reportsTable: dynamodb.Table;
  public readonly rescuersTable: dynamodb.Table;
  public readonly uploadsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // DynamoDB Table: Reports
    // ============================================
    this.reportsTable = new dynamodb.Table(this, 'ReportsTable', {
      tableName: 'disaster-reports',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep data on stack deletion
      pointInTimeRecovery: true, // Enable backups
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // Enable DynamoDB Streams
    });

    // GSI for querying by shortCode
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: 'shortCode-index',
      partitionKey: {
        name: 'shortCode',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying by status
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying by severity
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: 'severity-index',
      partitionKey: {
        name: 'severity',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // DynamoDB Table: Rescuers
    // ============================================
    this.rescuersTable = new dynamodb.Table(this, 'RescuersTable', {
      tableName: 'disaster-rescuers',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // GSI for querying active rescuers
    this.rescuersTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // S3 Bucket: Photo Uploads
    // ============================================
    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      bucketName: `disaster-uploads-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'], // Will be restricted in production
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'DeleteOldUploads',
          enabled: true,
          expiration: cdk.Duration.days(90), // Auto-delete after 90 days
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'ReportsTableName', {
      value: this.reportsTable.tableName,
      description: 'DynamoDB Reports Table Name',
      exportName: 'ReportsTableName',
    });

    new cdk.CfnOutput(this, 'RescuersTableName', {
      value: this.rescuersTable.tableName,
      description: 'DynamoDB Rescuers Table Name',
      exportName: 'RescuersTableName',
    });

    new cdk.CfnOutput(this, 'UploadsBucketName', {
      value: this.uploadsBucket.bucketName,
      description: 'S3 Uploads Bucket Name',
      exportName: 'UploadsBucketName',
    });

    new cdk.CfnOutput(this, 'UploadsBucketArn', {
      value: this.uploadsBucket.bucketArn,
      description: 'S3 Uploads Bucket ARN',
      exportName: 'UploadsBucketArn',
    });
  }
}
