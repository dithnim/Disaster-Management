/**
 * AWS Lambda Handler for REST API
 * Wraps the Express app for Lambda execution
 */

import serverless from "serverless-http";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand as DocScanCommand,
  QueryCommand as DocQueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

import { Report, ReportStatus, Severity, SanitizedReport } from "./types";
import { parseSMS } from "./utils/smsParser";
import {
  generateShortCode,
  sanitizeReport,
  parseBoolean,
  parseIntSafe,
} from "./utils/helpers";

// ============================================
// AWS Clients
// ============================================
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

// Tables
const REPORTS_TABLE = process.env.REPORTS_TABLE || "disaster-reports";
const RESCUERS_TABLE = process.env.RESCUERS_TABLE || "disaster-rescuers";
const CONNECTIONS_TABLE =
  process.env.CONNECTIONS_TABLE || "disaster-websocket-connections";
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "disaster-uploads";
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;

// ============================================
// Express App
// ============================================
const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ============================================
// WebSocket Broadcast Helper
// ============================================
async function broadcastToConnections(
  connectionType: string,
  event: string,
  data: unknown
): Promise<void> {
  if (!WEBSOCKET_ENDPOINT) return;

  const apiGateway = new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_ENDPOINT,
  });

  try {
    // Get all connections of the specified type
    const result = await docClient.send(
      new DocQueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: "type-index",
        KeyConditionExpression: "connectionType = :type",
        ExpressionAttributeValues: {
          ":type": connectionType,
        },
      })
    );

    const connections = result.Items || [];
    const message = JSON.stringify({ event, data });

    // Send to all connections
    await Promise.all(
      connections.map(async (conn) => {
        try {
          await apiGateway.send(
            new PostToConnectionCommand({
              ConnectionId: conn.connectionId as string,
              Data: Buffer.from(message),
            })
          );
        } catch (err: unknown) {
          // Remove stale connections
          if ((err as { statusCode?: number }).statusCode === 410) {
            await docClient.send(
              new UpdateCommand({
                TableName: CONNECTIONS_TABLE,
                Key: { connectionId: conn.connectionId },
                UpdateExpression: "REMOVE connectionId",
              })
            );
          }
        }
      })
    );
  } catch (error) {
    console.error("Broadcast error:", error);
  }
}

// ============================================
// API Routes
// ============================================

// Health check
app.get("/api/health", (_req: Request, res: Response): void => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    lambda: true,
  });
});

// Get all reports
app.get("/api/reports", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await docClient.send(
      new DocScanCommand({
        TableName: REPORTS_TABLE,
      })
    );

    const reports = (result.Items || [])
      .sort(
        (a, b) =>
          ((b.timestamp as number) || 0) - ((a.timestamp as number) || 0)
      )
      .map((item) => sanitizeReport(item as Report)) as SanitizedReport[];

    res.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// Get single report by ID or shortCode
app.get(
  "/api/reports/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Try by ID first
      let item: Record<string, unknown> | undefined;

      const result = await docClient.send(
        new GetCommand({
          TableName: REPORTS_TABLE,
          Key: { id },
        })
      );

      item = result.Item;

      if (!item) {
        // Try by shortCode
        const queryResult = await docClient.send(
          new DocQueryCommand({
            TableName: REPORTS_TABLE,
            IndexName: "shortCode-index",
            KeyConditionExpression: "shortCode = :code",
            ExpressionAttributeValues: {
              ":code": id.toUpperCase(),
            },
          })
        );

        if (queryResult.Items && queryResult.Items.length > 0) {
          item = queryResult.Items[0];
        }
      }

      if (!item) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      res.json(sanitizeReport(item as unknown as Report));
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  }
);

// Create new report
app.post("/api/reports", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      lat,
      lng,
      message = "Need help!",
      severity = "high",
      phone,
      isMedical,
      isFragile,
      peopleCount,
      batteryLevel,
    } = req.body;

    if (!lat || !lng) {
      res.status(400).json({ error: "Location (lat, lng) is required" });
      return;
    }

    const report: Report = {
      id: uuidv4(),
      shortCode: generateShortCode(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      message,
      severity: severity as Severity,
      status: "new" as ReportStatus,
      timestamp: Date.now(),
      lastUpdate: Date.now(),
      phone: phone || null,
      photoUrl: null,
      claimedBy: null,
      claimedByName: null,
      eta: null,
      batteryLevel: batteryLevel ? parseInt(batteryLevel) : null,
      isMedical: parseBoolean(isMedical),
      isFragile: parseBoolean(isFragile),
      peopleCount: parseIntSafe(peopleCount, 1),
      source: "web",
    };

    await docClient.send(
      new PutCommand({
        TableName: REPORTS_TABLE,
        Item: report,
      })
    );

    // Broadcast to rescuers
    await broadcastToConnections(
      "rescuer",
      "report:new",
      sanitizeReport(report)
    );

    res.status(201).json({
      ok: true,
      id: report.id,
      shortCode: report.shortCode,
    });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ error: "Failed to create report" });
  }
});

// Claim report
app.post(
  "/api/reports/:id/claim",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { rescuerId, rescuerName } = req.body;

      // First, check if the report is already claimed
      const existingReport = await docClient.send(
        new GetCommand({
          TableName: REPORTS_TABLE,
          Key: { id },
        })
      );

      if (!existingReport.Item) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      const report = existingReport.Item as Report;

      // Check if already claimed by someone else
      if (
        report.claimedBy &&
        report.claimedBy !== rescuerId &&
        report.status !== "new" &&
        report.status !== "closed"
      ) {
        res.status(409).json({
          error: "Report already claimed",
          claimedBy: report.claimedByName || "Another rescuer",
          status: report.status,
        });
        return;
      }

      const result = await docClient.send(
        new UpdateCommand({
          TableName: REPORTS_TABLE,
          Key: { id },
          UpdateExpression:
            "SET #status = :status, claimedBy = :rescuerId, claimedByName = :rescuerName, claimedAt = :now, lastUpdate = :now",
          ConditionExpression:
            "attribute_not_exists(claimedBy) OR claimedBy = :rescuerId OR #status = :newStatus",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "claimed",
            ":rescuerId": rescuerId,
            ":rescuerName": rescuerName,
            ":now": Date.now(),
            ":newStatus": "new",
          },
          ReturnValues: "ALL_NEW",
        })
      );

      const updatedReport = result.Attributes as Report;

      // Broadcast update
      await broadcastToConnections(
        "rescuer",
        "report:update",
        sanitizeReport(updatedReport)
      );

      res.json({ ok: true, report: sanitizeReport(updatedReport) });
    } catch (error: unknown) {
      console.error("Error claiming report:", error);
      // Check if it's a conditional check failed error (race condition)
      if (
        (error as { name?: string }).name === "ConditionalCheckFailedException"
      ) {
        res.status(409).json({
          error: "Report was just claimed by another rescuer",
        });
        return;
      }
      res.status(500).json({ error: "Failed to claim report" });
    }
  }
);

// Update report status
app.put(
  "/api/reports/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status, eta } = req.body;

      const updateExpr = eta
        ? "SET #status = :status, eta = :eta, lastUpdate = :now"
        : "SET #status = :status, lastUpdate = :now";

      const exprValues: Record<string, unknown> = {
        ":status": status,
        ":now": Date.now(),
      };

      if (eta) {
        exprValues[":eta"] = eta;
      }

      const result = await docClient.send(
        new UpdateCommand({
          TableName: REPORTS_TABLE,
          Key: { id },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: exprValues,
          ReturnValues: "ALL_NEW",
        })
      );

      const updatedReport = result.Attributes as Report;

      // Broadcast update
      await broadcastToConnections(
        "rescuer",
        "report:update",
        sanitizeReport(updatedReport)
      );

      res.json({ ok: true, report: sanitizeReport(updatedReport) });
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  }
);

// Release report
app.post(
  "/api/reports/:id/release",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const result = await docClient.send(
        new UpdateCommand({
          TableName: REPORTS_TABLE,
          Key: { id },
          UpdateExpression:
            "SET #status = :status, lastUpdate = :now REMOVE claimedBy, claimedByName, claimedAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "new",
            ":now": Date.now(),
          },
          ReturnValues: "ALL_NEW",
        })
      );

      const updatedReport = result.Attributes as Report;

      // Broadcast update
      await broadcastToConnections(
        "rescuer",
        "report:update",
        sanitizeReport(updatedReport)
      );

      res.json({ ok: true, report: sanitizeReport(updatedReport) });
    } catch (error) {
      console.error("Error releasing report:", error);
      res.status(500).json({ error: "Failed to release report" });
    }
  }
);

// Register rescuer (only called once on first registration)
app.post(
  "/api/rescuers/register",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, phone, organization } = req.body;

      if (!name) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      const rescuer = {
        id: uuidv4(),
        name,
        phone: phone || null,
        organization: organization || "Independent",
        registeredAt: Date.now(),
        lastSeen: Date.now(),
        isActive: true,
      };

      await docClient.send(
        new PutCommand({
          TableName: RESCUERS_TABLE,
          Item: rescuer,
        })
      );

      res.status(201).json({ ok: true, rescuer });
    } catch (error) {
      console.error("Error registering rescuer:", error);
      res.status(500).json({ error: "Failed to register rescuer" });
    }
  }
);

// Rescuer heartbeat - updates lastSeen timestamp
app.post(
  "/api/rescuers/heartbeat",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.body;

      if (!id) {
        res.status(400).json({ error: "Rescuer ID is required" });
        return;
      }

      await docClient.send(
        new UpdateCommand({
          TableName: RESCUERS_TABLE,
          Key: { id },
          UpdateExpression: "SET lastSeen = :now, isActive = :active",
          ExpressionAttributeValues: {
            ":now": Date.now(),
            ":active": true,
          },
        })
      );

      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating rescuer heartbeat:", error);
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  }
);

// Get stats
app.get("/api/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    // Consider rescuers active if seen in last 5 minutes
    const ACTIVE_THRESHOLD = 5 * 60 * 1000;
    const activeThreshold = Date.now() - ACTIVE_THRESHOLD;

    const [reportsResult, rescuersResult, connectionsResult] =
      await Promise.all([
        docClient.send(new DocScanCommand({ TableName: REPORTS_TABLE })),
        docClient.send(
          new DocScanCommand({
            TableName: RESCUERS_TABLE,
            FilterExpression: "lastSeen >= :threshold",
            ExpressionAttributeValues: { ":threshold": activeThreshold },
          })
        ),
        docClient.send(new DocScanCommand({ TableName: CONNECTIONS_TABLE })),
      ]);

    const reports = reportsResult.Items || [];
    // Count only rescuers seen in last 5 minutes
    const activeRescuers = rescuersResult.Items || [];

    const stats = {
      total: reports.length,
      byStatus: {
        new: reports.filter((r) => r.status === "new").length,
        claimed: reports.filter((r) => r.status === "claimed").length,
        enRoute: reports.filter((r) => r.status === "en_route").length,
        arrived: reports.filter((r) => r.status === "arrived").length,
        rescued: reports.filter((r) => r.status === "rescued").length,
        closed: reports.filter((r) => r.status === "closed").length,
      },
      bySeverity: {
        critical: reports.filter((r) => r.severity === "critical").length,
        high: reports.filter((r) => r.severity === "high").length,
        medium: reports.filter((r) => r.severity === "medium").length,
        low: reports.filter((r) => r.severity === "low").length,
      },
      activeRescuers: activeRescuers.length,
      connectedClients: connectionsResult.Items?.length || 0,
      lastUpdate: Date.now(),
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// SMS incoming webhook
app.post(
  "/api/sms/incoming",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { From: phone, Body: body } = req.body;

      if (!body) {
        res.status(400).json({ error: "No message body" });
        return;
      }

      const parsed = parseSMS(body);

      if (!parsed) {
        res.status(400).json({ error: "Could not parse SMS" });
        return;
      }

      const report: Report = {
        id: uuidv4(),
        shortCode: generateShortCode(),
        lat: parsed.lat,
        lng: parsed.lng,
        message: parsed.message || "SOS via SMS",
        severity: parsed.severity || ("high" as Severity),
        status: "new" as ReportStatus,
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        phone: phone || null,
        photoUrl: null,
        claimedBy: null,
        claimedByName: null,
        eta: null,
        batteryLevel: null,
        isMedical: parsed.isMedical || false,
        isFragile: parsed.isFragile || false,
        peopleCount: parsed.peopleCount || 1,
        source: "sms",
      };

      await docClient.send(
        new PutCommand({
          TableName: REPORTS_TABLE,
          Item: report,
        })
      );

      // Broadcast to rescuers
      await broadcastToConnections(
        "rescuer",
        "report:new",
        sanitizeReport(report)
      );

      // TwiML response
      res.type("text/xml").send(`
      <?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>SOS received! Code: ${report.shortCode}. Help is on the way.</Message>
      </Response>
    `);
    } catch (error) {
      console.error("SMS error:", error);
      res.status(500).json({ error: "Failed to process SMS" });
    }
  }
);

// Get presigned URL for upload
app.get(
  "/api/upload/presigned",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filename, contentType } = req.query;

      if (!filename) {
        res.status(400).json({ error: "Filename required" });
        return;
      }

      const key = `uploads/${Date.now()}-${uuidv4()}-${filename}`;

      const command = new PutObjectCommand({
        Bucket: UPLOADS_BUCKET,
        Key: key,
        ContentType: (contentType as string) || "image/jpeg",
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      res.json({
        uploadUrl: signedUrl,
        key,
        url: `https://${UPLOADS_BUCKET}.s3.amazonaws.com/${key}`,
      });
    } catch (error) {
      console.error("Presigned URL error:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  }
);

// ============================================
// Export Lambda Handler
// ============================================
export const handler = serverless(app);
