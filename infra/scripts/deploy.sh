#!/bin/bash
# Deployment script for Disaster Management application

set -e

echo "========================================"
echo "  Disaster Management - AWS Deployment"
echo "========================================"

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "AWS CLI is required but not installed. Aborting."; exit 1; }
command -v cdk >/dev/null 2>&1 || { echo "CDK CLI is required but not installed. Run: npm install -g aws-cdk"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting."; exit 1; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "Step 1: Installing infrastructure dependencies..."
cd "$SCRIPT_DIR"
npm install

echo ""
echo "Step 2: Building backend..."
cd "$ROOT_DIR/backend"
npm install
npm run build

echo ""
echo "Step 3: Building frontend..."
cd "$ROOT_DIR/frontend"
npm install
npm run build

echo ""
echo "Step 4: Deploying CDK stacks..."
cd "$SCRIPT_DIR"
cdk deploy --all --require-approval never

echo ""
echo "Step 5: Retrieving stack outputs..."
WEBSITE_BUCKET=$(aws cloudformation describe-stacks --stack-name DisasterManagementFrontendStack --query "Stacks[0].Outputs[?ExportName=='WebsiteBucketName'].OutputValue" --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name DisasterManagementFrontendStack --query "Stacks[0].Outputs[?ExportName=='DistributionId'].OutputValue" --output text)
WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name DisasterManagementFrontendStack --query "Stacks[0].Outputs[?ExportName=='WebsiteUrl'].OutputValue" --output text)

echo ""
echo "Step 6: Uploading frontend to S3..."
cd "$ROOT_DIR/frontend"
aws s3 sync dist/ "s3://$WEBSITE_BUCKET" --delete

echo ""
echo "Step 7: Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" > /dev/null

echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "Website URL: $WEBSITE_URL"
echo ""
echo "Note: CloudFront may take a few minutes to propagate changes globally."
