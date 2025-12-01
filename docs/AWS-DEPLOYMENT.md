# AWS Deployment Guide - Disaster SOS

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS                                       │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│   │ Phones   │    │ Basic    │    │ Laptops  │    │ Tablets  │         │
│   │ (PWA)    │    │ Phones   │    │          │    │          │         │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘         │
│        │               │               │               │                │
│        ▼               ▼               │               │                │
│   ┌─────────┐    ┌──────────┐         │               │                │
│   │  HTTP   │    │   SMS    │         │               │                │
│   └────┬────┘    └────┬─────┘         │               │                │
└────────┼──────────────┼───────────────┼───────────────┼────────────────┘
         │              │               │               │
         ▼              ▼               ▼               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           AWS CLOUD                                     │
│                                                                         │
│  ┌─────────────────┐         ┌─────────────────┐                       │
│  │   CloudFront    │◄────────│    S3 Bucket    │                       │
│  │   (CDN + PWA)   │         │   (Frontend)    │                       │
│  └────────┬────────┘         └─────────────────┘                       │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐         ┌─────────────────┐                       │
│  │  API Gateway    │         │     Twilio      │                       │
│  │  (REST + WS)    │◄────────│  (SMS Webhook)  │                       │
│  └────────┬────────┘         └─────────────────┘                       │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│  │  EC2 / ECS      │    │   DynamoDB      │    │    S3 Bucket    │    │
│  │  (Backend +     │◄──►│   (Reports +    │    │   (Photos)      │    │
│  │   Socket.IO)    │    │    Rescuers)    │    │                 │    │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Prerequisites

1. **AWS Account** with admin access
2. **AWS CLI** installed and configured
3. **Twilio Account** for SMS
4. **Domain name** (optional but recommended)
5. **Node.js 18+** for local testing

---

## 🚀 Step-by-Step Deployment

### Step 1: Create DynamoDB Tables

```bash
# Create Reports Table
aws dynamodb create-table \
    --table-name disaster-sos-reports \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=status,AttributeType=S \
        AttributeName=timestamp,AttributeType=N \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        "[{\"IndexName\": \"status-timestamp-index\",\"KeySchema\":[{\"AttributeName\":\"status\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"timestamp\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region ap-south-1

# Create Rescuers Table
aws dynamodb create-table \
    --table-name disaster-sos-rescuers \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region ap-south-1
```

### Step 2: Create S3 Buckets

```bash
# Create bucket for photos
aws s3 mb s3://disaster-sos-uploads-YOUR-ACCOUNT-ID --region ap-south-1

# Enable CORS
aws s3api put-bucket-cors --bucket disaster-sos-uploads-YOUR-ACCOUNT-ID --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'

# Create bucket for frontend (static hosting)
aws s3 mb s3://disaster-sos-frontend-YOUR-ACCOUNT-ID --region ap-south-1
aws s3 website s3://disaster-sos-frontend-YOUR-ACCOUNT-ID --index-document index.html --error-document index.html
```

### Step 3: Deploy Backend to EC2

```bash
# Launch EC2 instance (Amazon Linux 2023)
aws ec2 run-instances \
    --image-id ami-0c55b159cbfafe1f0 \
    --instance-type t3.micro \
    --key-name your-key-pair \
    --security-groups disaster-sos-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=disaster-sos-api}]'

# SSH into instance and setup
ssh -i your-key.pem ec2-user@YOUR-INSTANCE-IP

# On EC2:
sudo yum update -y
sudo yum install -y nodejs npm git

# Clone your repo
git clone https://github.com/YOUR-REPO/disaster-management.git
cd disaster-management/backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env  # Fill in your values

# Install PM2 for process management
sudo npm install -g pm2

# Start the server
pm2 start server.js --name disaster-sos-api
pm2 startup
pm2 save
```

### Step 4: Setup Application Load Balancer (ALB)

```bash
# Create target group
aws elbv2 create-target-group \
    --name disaster-sos-targets \
    --protocol HTTP \
    --port 3000 \
    --vpc-id YOUR-VPC-ID \
    --health-check-path /api/health

# Create ALB
aws elbv2 create-load-balancer \
    --name disaster-sos-alb \
    --subnets subnet-xxx subnet-yyy \
    --security-groups sg-xxx

# Add HTTPS listener (requires ACM certificate)
aws elbv2 create-listener \
    --load-balancer-arn YOUR-ALB-ARN \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=YOUR-CERT-ARN \
    --default-actions Type=forward,TargetGroupArn=YOUR-TG-ARN
```

### Step 5: Deploy Frontend to S3 + CloudFront

```bash
cd frontend

# Build for production
npm run build

# Upload to S3
aws s3 sync dist/ s3://disaster-sos-frontend-YOUR-ACCOUNT-ID --delete

# Create CloudFront distribution
aws cloudfront create-distribution \
    --origin-domain-name disaster-sos-frontend-YOUR-ACCOUNT-ID.s3.amazonaws.com \
    --default-root-object index.html
```

### Step 6: Configure Twilio SMS Webhook

1. Log into [Twilio Console](https://console.twilio.com)
2. Go to **Phone Numbers** → Your Number
3. Under **Messaging**, set webhook:
   - **When a message comes in**: `https://YOUR-ALB-DOMAIN/api/sms/incoming`
   - **HTTP Method**: POST

---

## 📱 SMS Message Formats

Users can send SOS via SMS in these formats:

### Compressed Format (Fastest to type)
```
H 6.912 79.852 A
```
- `H` = Help/SOS
- `6.912 79.852` = Latitude Longitude
- `A` = Situation code

### Situation Codes
| Code | Meaning | Severity |
|------|---------|----------|
| A | Adult trapped | High |
| C | Child/Children | Critical |
| M | Medical emergency | Critical |
| F | Fire | Critical |
| W | Water/Flood | High |
| B | Building collapse | Critical |
| E | Elderly | High |
| P | Pregnant | Critical |
| I | Injured | High |
| T | Multiple trapped | Critical |

### Combined Codes
```
H 6.912 79.852 MC    (Medical + Child)
H 6.912 79.852 BT    (Building + Trapped)
```

### Full Format
```
HELP LAT:6.912 LON:79.852 MSG:injured child
```

### Standard Format
```
SOS 6.912,79.852 Need help, flooding in basement
```

### Minimal (Just Location)
```
6.912 79.852
```

---

## 💰 Cost Estimation (Monthly)

| Service | Specification | Est. Cost |
|---------|--------------|-----------|
| EC2 (t3.micro) | 1 instance, 24/7 | $8.50 |
| ALB | 1 load balancer | $16.20 |
| DynamoDB | On-demand, ~10K reports/month | $2.50 |
| S3 (photos) | 10GB storage | $0.25 |
| S3 (frontend) | Static hosting | $0.50 |
| CloudFront | 100GB transfer | $8.50 |
| Twilio SMS | ~1000 SMS/month | $7.50 |
| **Total** | | **~$44/month** |

For higher availability:
- Add EC2 instances: +$8.50 each
- Use RDS PostgreSQL: +$15/month
- Enable DynamoDB autoscaling: variable

---

## 🔒 Security Checklist

- [ ] HTTPS/TLS on all endpoints
- [ ] Security groups restrict access
- [ ] IAM roles (not access keys) for EC2
- [ ] DynamoDB encryption at rest
- [ ] S3 bucket policies (no public write)
- [ ] Rate limiting on API
- [ ] WAF rules on ALB
- [ ] CloudTrail logging enabled
- [ ] Regular security patches

---

## 📊 Monitoring Setup

### CloudWatch Alarms
```bash
# CPU utilization alarm
aws cloudwatch put-metric-alarm \
    --alarm-name disaster-sos-cpu \
    --metric-name CPUUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2 \
    --alarm-actions YOUR-SNS-TOPIC-ARN

# DynamoDB throttling alarm
aws cloudwatch put-metric-alarm \
    --alarm-name disaster-sos-throttle \
    --metric-name ThrottledRequests \
    --namespace AWS/DynamoDB \
    --statistic Sum \
    --period 60 \
    --threshold 1 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions YOUR-SNS-TOPIC-ARN
```

---

## 🔄 CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to EC2
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/disaster-management
            git pull
            cd backend && npm install
            pm2 restart disaster-sos-api

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build
        run: |
          cd frontend
          npm install
          npm run build
      
      - name: Deploy to S3
        uses: jakejarvis/s3-sync-action@master
        with:
          args: --delete
        env:
          AWS_S3_BUCKET: ${{ secrets.S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: 'frontend/dist'
```

---

## 🆘 Troubleshooting

### SMS not working
1. Check Twilio webhook URL is correct
2. Verify ALB security group allows Twilio IPs
3. Check CloudWatch logs for errors
4. Test with: `curl -X POST YOUR-URL/api/sms/incoming -d "Body=H 6.9 79.8 A&From=+1234"`

### WebSocket disconnecting
1. ALB idle timeout should be 300+ seconds
2. Enable sticky sessions on target group
3. Check EC2 security group allows WebSocket

### High latency
1. Enable CloudFront caching
2. Check DynamoDB read capacity
3. Consider adding EC2 instances

---

## 📞 Emergency Contacts Setup

For Sri Lanka integration, coordinate with:
- National Disaster Relief Services Centre: 117
- Police Emergency: 119
- Ambulance: 110
- Fire & Rescue: 111

The system can be configured to auto-forward critical reports to these numbers.
