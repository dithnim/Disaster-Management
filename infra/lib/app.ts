#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BackendStack } from "./stacks/backend-stack";
import { FrontendStack } from "./stacks/frontend-stack";
import { DatabaseStack } from "./stacks/database-stack";

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "ap-south-1", // Mumbai region for Sri Lanka proximity
};

// Application name prefix
const appName = "DisasterManagement";

// Database Stack - DynamoDB tables and S3 bucket
const databaseStack = new DatabaseStack(app, `${appName}DatabaseStack`, {
  env,
  description: "DynamoDB tables and S3 bucket for Disaster Management app",
});

// Backend Stack - ECS Fargate service with API
const backendStack = new BackendStack(app, `${appName}BackendStack`, {
  env,
  description: "Backend API service running on ECS Fargate",
  reportsTable: databaseStack.reportsTable,
  rescuersTable: databaseStack.rescuersTable,
  uploadsBucket: databaseStack.uploadsBucket,
});

// Add dependency
backendStack.addDependency(databaseStack);

// Frontend Stack - S3 + CloudFront static hosting
const frontendStack = new FrontendStack(app, `${appName}FrontendStack`, {
  env,
  description: "Frontend static hosting with S3 and CloudFront",
  restApi: backendStack.restApi,
  apiUrl: backendStack.apiUrl,
});

// Add dependency
frontendStack.addDependency(backendStack);

// Tags for all resources
cdk.Tags.of(app).add("Application", "DisasterManagement");
cdk.Tags.of(app).add("Environment", "Production");
cdk.Tags.of(app).add("ManagedBy", "CDK");
