/**
 * AWS Lambda Handler for WebSocket API
 * Handles connect, disconnect, and message events
 */

import {
  APIGatewayProxyResult,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

// ============================================
// AWS Clients
// ============================================
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Tables
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'disaster-websocket-connections';
const REPORTS_TABLE = process.env.REPORTS_TABLE || 'disaster-reports';
const RESCUERS_TABLE = process.env.RESCUERS_TABLE || 'disaster-rescuers';

// ============================================
// Types
// ============================================
interface WebSocketMessage {
  action: string;
  data?: unknown;
}

interface Connection {
  connectionId: string;
  connectionType: string;
  rescuerId?: string;
  rescuerName?: string;
  trackingCode?: string;
  connectedAt: number;
  ttl: number;
}

// ============================================
// Helper Functions
// ============================================
async function sendToConnection(
  endpoint: string,
  connectionId: string,
  data: unknown
): Promise<boolean> {
  const client = new ApiGatewayManagementApiClient({ endpoint });

  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      })
    );
    return true;
  } catch (error: unknown) {
    if ((error as { statusCode?: number }).statusCode === 410) {
      // Connection is stale, remove it
      await docClient.send(
        new DeleteCommand({
          TableName: CONNECTIONS_TABLE,
          Key: { connectionId },
        })
      );
    }
    return false;
  }
}

async function broadcastToType(
  endpoint: string,
  connectionType: string,
  event: string,
  data: unknown,
  excludeConnectionId?: string
): Promise<void> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: CONNECTIONS_TABLE,
      IndexName: 'type-index',
      KeyConditionExpression: 'connectionType = :type',
      ExpressionAttributeValues: {
        ':type': connectionType,
      },
    })
  );

  const connections = result.Items || [];

  await Promise.all(
    connections
      .filter((conn) => conn.connectionId !== excludeConnectionId)
      .map((conn) =>
        sendToConnection(endpoint, conn.connectionId, { event, data })
      )
  );
}

async function getReports(): Promise<unknown[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: REPORTS_TABLE,
    })
  );

  return (result.Items || []).sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );
}

// ============================================
// Route Handlers
// ============================================
async function handleConnect(
  connectionId: string,
  _event: APIGatewayProxyWebsocketEventV2
): Promise<void> {
  // Connection will be updated with type when client sends identify message
  const connection: Connection = {
    connectionId,
    connectionType: 'unknown',
    connectedAt: Date.now(),
    ttl: Math.floor(Date.now() / 1000) + 86400, // 24 hour TTL
  };

  await docClient.send(
    new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: connection,
    })
  );
}

async function handleDisconnect(connectionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    })
  );
}

async function handleMessage(
  connectionId: string,
  event: APIGatewayProxyWebsocketEventV2,
  message: WebSocketMessage
): Promise<void> {
  const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;

  switch (message.action) {
    case 'rescuer:join': {
      const data = message.data as { id: string; name: string; organization?: string };
      
      // Update connection as rescuer
      await docClient.send(
        new PutCommand({
          TableName: CONNECTIONS_TABLE,
          Item: {
            connectionId,
            connectionType: 'rescuer',
            rescuerId: data.id,
            rescuerName: data.name,
            connectedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          },
        })
      );

      // Update rescuer status
      await docClient.send(
        new PutCommand({
          TableName: RESCUERS_TABLE,
          Item: {
            id: data.id,
            name: data.name,
            organization: data.organization,
            status: 'active',
            lastSeen: Date.now(),
          },
        })
      );

      // Send current reports to rescuer
      const reports = await getReports();
      await sendToConnection(endpoint, connectionId, {
        event: 'reports:sync',
        data: reports,
      });
      break;
    }

    case 'user:track': {
      const shortCode = message.data as string;
      
      // Update connection with tracking info
      await docClient.send(
        new PutCommand({
          TableName: CONNECTIONS_TABLE,
          Item: {
            connectionId,
            connectionType: 'user',
            trackingCode: shortCode.toUpperCase(),
            connectedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400,
          },
        })
      );
      break;
    }

    case 'rescuer:location': {
      const data = message.data as { rescuerId: string; lat: number; lng: number };
      
      // Update rescuer location
      await docClient.send(
        new PutCommand({
          TableName: RESCUERS_TABLE,
          Item: {
            id: data.rescuerId,
            lat: data.lat,
            lng: data.lng,
            lastSeen: Date.now(),
          },
        })
      );

      // Broadcast to other rescuers
      await broadcastToType(endpoint, 'rescuer', 'rescuer:location', data, connectionId);
      break;
    }

    default:
      console.log('Unknown action:', message.action);
  }
}

// ============================================
// Main Handler
// ============================================
export async function handler(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  try {
    switch (routeKey) {
      case '$connect':
        await handleConnect(connectionId, event);
        break;

      case '$disconnect':
        await handleDisconnect(connectionId);
        break;

      case '$default':
        if (event.body) {
          const message = JSON.parse(event.body) as WebSocketMessage;
          await handleMessage(connectionId, event, message);
        }
        break;

      default:
        console.log('Unknown route:', routeKey);
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('WebSocket error:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}
