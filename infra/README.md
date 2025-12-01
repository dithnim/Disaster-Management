# AWS CDK Infrastructure for Disaster Management

This directory contains the AWS CDK infrastructure code for deploying the Disaster Management application using a **serverless architecture with AWS Lambda**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USERS                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│   │ Phones   │    │ Basic    │    │ Laptops  │    │ Tablets  │                │
│   │ (PWA)    │    │ Phones   │    │          │    │          │                │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘                │
│        │ HTTPS         │ SMS           │ HTTPS         │ HTTPS                 │
└────────┼───────────────┼───────────────┼───────────────┼───────────────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AWS CLOUD (Serverless)                                │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         CloudFront CDN                                   │   │
│  │    Static Assets (S3) + API Gateway Proxy + WebSocket Passthrough        │   │
│  └────────────────────────────┬────────────────────┬───────────────────────┘   │
│                               │                    │                            │
│              ┌────────────────┴────┐    ┌──────────┴──────────┐                │
│              ▼                     │    ▼                     │                │
│  ┌─────────────────────┐           │  ┌──────────────────────┐│                │
│  │   S3 Bucket         │           │  │   API Gateway        ││                │
│  │   (Frontend PWA)    │           │  │   (REST API)         ││                │
│  └─────────────────────┘           │  └──────────┬───────────┘│                │
│                                    │             │            │                │
│  ┌─────────────────────┐           │             ▼            │                │
│  │   API Gateway v2    │◄──────────┘  ┌──────────────────────┐│                │
│  │   (WebSocket)       │              │   Lambda Function    ││                │
│  └──────────┬──────────┘              │   (REST Handler)     ││                │
│             │                         └──────────┬───────────┘│                │
│             ▼                                    │            │                │
│  ┌─────────────────────┐                         │            │                │
│  │   Lambda Function   │                         │            │                │
│  │   (WebSocket)       │                         │            │                │
│  └──────────┬──────────┘                         │            │                │
│             │                                    │            │                │
│             └────────────────────┬───────────────┘            │                │
│                                  ▼                            │                │
│  ┌──────────────────────────────────────────────────────────┐ │                │
│  │                      Data Layer                          │ │                │
│  │                                                          │ │                │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐ │ │                │
│  │  │   DynamoDB    │  │   DynamoDB    │  │   DynamoDB   │ │ │                │
│  │  │   Reports     │  │   Rescuers    │  │  Connections │ │ │                │
│  │  └───────────────┘  └───────────────┘  └──────────────┘ │ │                │
│  │                                                          │ │                │
│  │  ┌───────────────────────────────────────────────────┐  │ │                │
│  │  │              S3 Bucket (Photo Uploads)             │  │ │                │
│  │  └───────────────────────────────────────────────────┘  │ │                │
│  └──────────────────────────────────────────────────────────┘ │                │
│                                                                 │                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Stack Details

### 1. DatabaseStack (`DisasterManagementDatabaseStack`)

**DynamoDB Tables:**
- `disaster-reports` - Stores all SOS reports
  - Partition Key: `id` (String)
  - GSIs: `shortCode-index`, `status-index`, `severity-index`
- `disaster-rescuers` - Stores rescuer information
  - Partition Key: `id` (String)
  - GSI: `isActive-index`

**S3 Bucket:**
- Photo uploads with presigned URLs
- 90-day lifecycle expiration
- CORS enabled for web uploads

### 2. BackendStack (`DisasterManagementBackendStack`)

**Lambda Functions:**
- `disaster-management-api` (512MB, 30s timeout)
  - Handles all REST API requests via serverless-http + Express
  - X-Ray tracing enabled
- `disaster-management-websocket` (256MB, 30s timeout)
  - Handles WebSocket connect/disconnect/message events

**API Gateway (REST):**
- Proxy integration to Lambda
- CORS enabled
- Rate limiting: 50 req/sec, burst 100

**API Gateway v2 (WebSocket):**
- Routes: `$connect`, `$disconnect`, `$default`
- Manages real-time updates to connected clients

**DynamoDB (WebSocket Connections):**
- `disaster-websocket-connections`
- TTL for automatic cleanup
- GSI for connection type queries

### 3. FrontendStack (`DisasterManagementFrontendStack`)

**S3 Bucket:**
- Static website hosting
- Private access via CloudFront OAI

**CloudFront Distribution:**
- Global CDN with edge caching
- HTTPS enforcement
- SPA routing (all paths → index.html)
- Cache invalidation on deploy

## Prerequisites

1. **AWS CLI** configured with credentials
   ```bash
   aws configure
   ```

2. **Node.js 20+** installed

3. **AWS CDK CLI** installed
   ```bash
   npm install -g aws-cdk
   ```

4. **esbuild** (installed as dev dependency for Lambda bundling)

## Deployment

### 1. Install Dependencies

```bash
cd infra
npm install
```

### 2. Bootstrap CDK (first time only)

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 3. Synthesize Templates

```bash
cdk synth
```

### 4. Deploy All Stacks

```bash
# Deploy all stacks in order
cdk deploy --all

# Or deploy individually
cdk deploy DisasterManagementDatabaseStack
cdk deploy DisasterManagementBackendStack
cdk deploy DisasterManagementFrontendStack
```

### 5. Build and Deploy Frontend

After infrastructure is deployed:

```bash
# Build frontend
cd ../frontend
npm install
npm run build

# Sync to S3
aws s3 sync dist/ s3://BUCKET-NAME --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id DIST-ID --paths "/*"
```

## Stack Outputs

After deployment, you'll get:

| Output | Description |
|--------|-------------|
| `ApiUrl` | REST API Gateway endpoint |
| `WebSocketUrl` | WebSocket API endpoint |
| `FrontendUrl` | CloudFront distribution URL |
| `UploadsBucketName` | S3 bucket for photo uploads |

## Environment Configuration

Update the frontend to use the deployed API URLs:

```typescript
// frontend/src/config.ts
export const API_URL = 'https://xxxx.execute-api.region.amazonaws.com/prod';
export const WS_URL = 'wss://xxxx.execute-api.region.amazonaws.com/prod';
```

## Cost Estimation (Monthly)

| Service | Estimated Cost |
|---------|---------------|
| Lambda (1M requests) | ~$0.20 |
| API Gateway REST (1M requests) | ~$3.50 |
| API Gateway WebSocket (1M messages) | ~$1.00 |
| DynamoDB (On-demand) | ~$5-20 |
| S3 + CloudFront | ~$1-5 |
| **Total** | **~$10-30/month** |

*Note: Costs scale with usage. AWS Free Tier covers most development usage.*

## Useful Commands

```bash
# List all stacks
cdk list

# Compare deployed with local
cdk diff

# Destroy all stacks (careful!)
cdk destroy --all

# View synthesized CloudFormation
cat cdk.out/DisasterManagementBackendStack.template.json
```

## Troubleshooting

### esbuild Bundling Errors
Make sure esbuild is installed:
```bash
npm install esbuild --save-dev
```

### Permission Errors
Ensure your AWS credentials have sufficient permissions for:
- DynamoDB, S3, Lambda, API Gateway, CloudFront, IAM

### WebSocket Connection Issues
1. Check CORS settings on API Gateway
2. Verify WebSocket URL uses `wss://` protocol
3. Check Lambda CloudWatch logs for errors

## Security Considerations

1. **No hardcoded secrets** - Use AWS Secrets Manager or Parameter Store
2. **Least privilege IAM** - Lambda roles have minimal required permissions
3. **HTTPS enforced** - CloudFront redirects HTTP to HTTPS
4. **Private S3** - No public access; CloudFront OAI or presigned URLs only
