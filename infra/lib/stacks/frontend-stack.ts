import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface FrontendStackProps extends cdk.StackProps {
  restApi: apigateway.RestApi;
  apiUrl: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly distributionUrl: string;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { restApi, apiUrl } = props;

    // ============================================
    // S3 Bucket for Static Hosting
    // ============================================
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: `disaster-management-frontend-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ============================================
    // Origin Access Identity for CloudFront
    // ============================================
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "OAI",
      {
        comment: "OAI for Disaster Management Frontend",
      }
    );

    // Grant read access to CloudFront
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [websiteBucket.arnForObjects("*")],
        principals: [
          new iam.CanonicalUserPrincipal(
            originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
          ),
        ],
      })
    );

    // ============================================
    // CloudFront Distribution
    // ============================================
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Disaster Management Frontend",
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.RestApiOrigin(restApi),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // Store values
    this.distributionUrl = `https://${distribution.distributionDomainName}`;
    this.bucketName = websiteBucket.bucketName;

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, "WebsiteUrl", {
      value: this.distributionUrl,
      description: "CloudFront Distribution URL",
      exportName: "WebsiteUrl",
    });

    new cdk.CfnOutput(this, "WebsiteBucketName", {
      value: this.bucketName,
      description: "S3 Bucket Name for Frontend",
      exportName: "WebsiteBucketName",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
      description: "CloudFront Distribution ID",
      exportName: "DistributionId",
    });

    new cdk.CfnOutput(this, "BackendApiUrl", {
      value: apiUrl,
      description: "Backend API URL",
    });

    // ============================================
    // Deployment Instructions Output
    // ============================================
    new cdk.CfnOutput(this, "DeploymentInstructions", {
      value: `To deploy frontend: cd frontend && npm run build && aws s3 sync dist/ s3://${websiteBucket.bucketName} --delete && aws cloudfront create-invalidation --distribution-id ${distribution.distributionId} --paths "/*"`,
      description: "Command to deploy frontend",
    });
  }
}
