# PowerShell Deployment script for Disaster Management application

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "  Disaster Management - AWS Deployment"
Write-Host "========================================"

# Check prerequisites
try { aws --version | Out-Null } catch { throw "AWS CLI is required but not installed." }
try { cdk --version | Out-Null } catch { throw "CDK CLI is required. Run: npm install -g aws-cdk" }
try { docker --version | Out-Null } catch { throw "Docker is required but not installed." }

# Get directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InfraDir = Split-Path -Parent $ScriptDir
$RootDir = Split-Path -Parent $InfraDir

Write-Host ""
Write-Host "Step 1: Installing infrastructure dependencies..."
Set-Location $InfraDir
npm install

Write-Host ""
Write-Host "Step 2: Building backend..."
Set-Location "$RootDir\backend"
npm install
npm run build

Write-Host ""
Write-Host "Step 3: Building frontend..."
Set-Location "$RootDir\frontend"
npm install
npm run build

Write-Host ""
Write-Host "Step 4: Deploying CDK stacks..."
Set-Location $InfraDir
cdk deploy --all --require-approval never

Write-Host ""
Write-Host "Step 5: Retrieving stack outputs..."
$WebsiteBucket = aws cloudformation describe-stacks --stack-name DisasterManagementFrontendStack --query "Stacks[0].Outputs[?ExportName=='WebsiteBucketName'].OutputValue" --output text
$DistributionId = aws cloudformation describe-stacks --stack-name DisasterManagementFrontendStack --query "Stacks[0].Outputs[?ExportName=='DistributionId'].OutputValue" --output text
$WebsiteUrl = aws cloudformation describe-stacks --stack-name DisasterManagementFrontendStack --query "Stacks[0].Outputs[?ExportName=='WebsiteUrl'].OutputValue" --output text

Write-Host ""
Write-Host "Step 6: Uploading frontend to S3..."
Set-Location "$RootDir\frontend"
aws s3 sync dist/ "s3://$WebsiteBucket" --delete

Write-Host ""
Write-Host "Step 7: Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" | Out-Null

Write-Host ""
Write-Host "========================================"
Write-Host "  Deployment Complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "Website URL: $WebsiteUrl"
Write-Host ""
Write-Host "Note: CloudFront may take a few minutes to propagate changes globally."

# Return to original directory
Set-Location $ScriptDir
