/**
 * Disaster Management API Server
 * Real-time rescue coordination system
 * 
 * TypeScript version
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';

import {
  Report,
  Rescuer,
  ReportStatus,
  Severity,
  SanitizedReport,
  ConnectedClient,
  Stats,
  CreateReportRequest,
  ClaimReportRequest,
  UpdateStatusRequest,
  RegisterRescuerRequest,
  TwilioIncomingSMS,
  RescuerJoinData,
  RescuerLocationData
} from './types';

import { parseSMS } from './utils/smsParser';
import { sendSMS, getStatusNotificationMessage } from './services/smsService';
import { generateShortCode, sanitizeReport, parseBoolean, parseIntSafe } from './utils/helpers';

// ============================================
// APP SETUP
// ============================================

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const sosLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Too many SOS requests. Please wait.' }
});

// ============================================
// FILE UPLOAD SETUP
// ============================================

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error('Only images are allowed'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
});

app.use('/uploads', express.static(uploadDir));

// ============================================
// IN-MEMORY DATA STORE
// ============================================

const reports = new Map<string, Report>();
const rescuers = new Map<string, Rescuer>();
const connectedClients = new Map<string, ConnectedClient>();

// ============================================
// BROADCAST FUNCTIONS
// ============================================

function broadcastToRescuers(event: string, data: SanitizedReport): void {
  io.to('rescuers').emit(event, data);
}

function broadcastToAll(event: string, data: SanitizedReport): void {
  io.emit(event, data);
}

// ============================================
// SMS NOTIFICATION HELPER
// ============================================

async function notifyUserViaSMS(report: Report, status: string): Promise<void> {
  if (!report.phone) return;
  
  const message = getStatusNotificationMessage(
    report.shortCode,
    status,
    report.claimedByName,
    report.eta
  );
  
  if (message) {
    await sendSMS(report.phone, message);
  }
}

// ============================================
// REST API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    reports: reports.size,
    rescuers: rescuers.size,
    connectedClients: connectedClients.size
  });
});

// Create a new distress report (SOS)
app.post('/api/reports', sosLimiter, upload.single('photo'), (req: Request, res: Response) => {
  try {
    const body = req.body as CreateReportRequest;
    const { lat, lng, message, severity, phone, isMedical, isFragile, peopleCount, batteryLevel } = body;
    
    if (!lat || !lng) {
      res.status(400).json({ error: 'Location (lat, lng) is required' });
      return;
    }

    const id = uuidv4();
    const shortCode = generateShortCode();
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const report: Report = {
      id,
      shortCode,
      lat: parseFloat(String(lat)),
      lng: parseFloat(String(lng)),
      message: message || 'Need help!',
      severity: Object.values(Severity).includes(severity as Severity) ? severity as Severity : Severity.HIGH,
      phone: phone || null,
      photoUrl,
      status: ReportStatus.NEW,
      claimedBy: null,
      claimedByName: null,
      timestamp: Date.now(),
      lastUpdate: Date.now(),
      eta: null,
      batteryLevel: batteryLevel ? parseIntSafe(batteryLevel, 0) : null,
      isMedical: parseBoolean(isMedical),
      isFragile: parseBoolean(isFragile),
      peopleCount: parseIntSafe(peopleCount, 1),
      source: 'web'
    };

    reports.set(id, report);
    broadcastToRescuers('report:new', sanitizeReport(report));

    console.log(`[SOS] New report: ${shortCode} at ${lat}, ${lng}`);

    res.status(201).json({ 
      ok: true, 
      id, 
      shortCode,
      message: 'SOS sent successfully. Help is on the way.'
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// Get all reports
app.get('/api/reports', (req: Request, res: Response) => {
  const { status, severity } = req.query;
  let result = Array.from(reports.values());

  if (status) {
    result = result.filter(r => r.status === status);
  }
  if (severity) {
    result = result.filter(r => r.severity === severity);
  }

  result.sort((a, b) => b.timestamp - a.timestamp);
  res.json(result.map(sanitizeReport));
});

// Get single report
app.get('/api/reports/:identifier', (req: Request, res: Response) => {
  const { identifier } = req.params;
  
  let report = reports.get(identifier);
  
  if (!report) {
    report = Array.from(reports.values()).find(r => r.shortCode === identifier.toUpperCase());
  }

  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  res.json(sanitizeReport(report));
});

// Claim a report
app.post('/api/reports/:id/claim', (req: Request, res: Response) => {
  const { id } = req.params;
  const { rescuerId, rescuerName, eta } = req.body as ClaimReportRequest;

  const report = reports.get(id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  if (report.status !== ReportStatus.NEW) {
    res.status(400).json({ error: 'Report already claimed or closed' });
    return;
  }

  report.status = ReportStatus.CLAIMED;
  report.claimedBy = rescuerId;
  report.claimedByName = rescuerName || 'Rescuer';
  report.eta = eta || null;
  report.lastUpdate = Date.now();

  broadcastToAll('report:update', sanitizeReport(report));

  if (report.phone && report.source === 'sms') {
    notifyUserViaSMS(report, 'claimed').catch(console.error);
  }

  console.log(`[CLAIM] Report ${report.shortCode} claimed by ${rescuerName}`);
  res.json({ ok: true, report: sanitizeReport(report) });
});

// Update report status
app.put('/api/reports/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, eta, notes } = req.body as UpdateStatusRequest;

  const report = reports.get(id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  if (!Object.values(ReportStatus).includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  report.status = status;
  if (eta) report.eta = eta;
  if (notes) report.notes = notes;
  report.lastUpdate = Date.now();

  broadcastToAll('report:update', sanitizeReport(report));

  if (report.phone && report.source === 'sms') {
    notifyUserViaSMS(report, status).catch(console.error);
  }

  console.log(`[STATUS] Report ${report.shortCode} updated to ${status}`);
  res.json({ ok: true, report: sanitizeReport(report) });
});

// Release a report
app.post('/api/reports/:id/release', (req: Request, res: Response) => {
  const { id } = req.params;

  const report = reports.get(id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  report.status = ReportStatus.NEW;
  report.claimedBy = null;
  report.claimedByName = null;
  report.eta = null;
  report.lastUpdate = Date.now();

  broadcastToAll('report:update', sanitizeReport(report));

  console.log(`[RELEASE] Report ${report.shortCode} released`);
  res.json({ ok: true, report: sanitizeReport(report) });
});

// Register rescuer
app.post('/api/rescuers/register', (req: Request, res: Response) => {
  const { name, phone, organization } = req.body as RegisterRescuerRequest;

  if (!name) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const id = uuidv4();
  const rescuer: Rescuer = {
    id,
    name,
    phone: phone || null,
    organization: organization || 'Independent',
    registeredAt: Date.now(),
    isActive: true
  };

  rescuers.set(id, rescuer);

  console.log(`[RESCUER] Registered: ${name} (${rescuer.organization})`);
  res.status(201).json({ ok: true, rescuer });
});

// Get rescuers list
app.get('/api/rescuers', (_req: Request, res: Response) => {
  res.json(Array.from(rescuers.values()));
});

// Get stats
app.get('/api/stats', (_req: Request, res: Response) => {
  const allReports = Array.from(reports.values());
  
  const stats: Stats = {
    total: allReports.length,
    byStatus: {
      new: allReports.filter(r => r.status === ReportStatus.NEW).length,
      claimed: allReports.filter(r => r.status === ReportStatus.CLAIMED).length,
      enRoute: allReports.filter(r => r.status === ReportStatus.EN_ROUTE).length,
      arrived: allReports.filter(r => r.status === ReportStatus.ARRIVED).length,
      rescued: allReports.filter(r => r.status === ReportStatus.RESCUED).length,
      closed: allReports.filter(r => r.status === ReportStatus.CLOSED).length
    },
    bySeverity: {
      critical: allReports.filter(r => r.severity === Severity.CRITICAL).length,
      high: allReports.filter(r => r.severity === Severity.HIGH).length,
      medium: allReports.filter(r => r.severity === Severity.MEDIUM).length,
      low: allReports.filter(r => r.severity === Severity.LOW).length
    },
    activeRescuers: rescuers.size,
    connectedClients: connectedClients.size,
    lastUpdate: Date.now()
  };

  res.json(stats);
});

// ============================================
// SMS ENDPOINTS
// ============================================

app.post('/api/sms/incoming', (req: Request, res: Response) => {
  const { Body, From } = req.body as TwilioIncomingSMS;
  
  console.log(`[SMS IN] From: ${From} | Body: ${Body}`);
  
  try {
    const parsed = parseSMS(Body);
    
    if (parsed) {
      const id = uuidv4();
      const shortCode = generateShortCode();
      
      const report: Report = {
        id,
        shortCode,
        lat: parsed.lat,
        lng: parsed.lng,
        message: parsed.message,
        severity: parsed.severity,
        phone: From,
        photoUrl: null,
        status: ReportStatus.NEW,
        claimedBy: null,
        claimedByName: null,
        timestamp: Date.now(),
        lastUpdate: Date.now(),
        eta: null,
        batteryLevel: null,
        isMedical: parsed.isMedical,
        isFragile: parsed.isFragile,
        peopleCount: parsed.peopleCount,
        source: 'sms',
        rawSms: Body
      };

      reports.set(id, report);
      broadcastToRescuers('report:new', sanitizeReport(report));

      console.log(`[SMS SOS] Created report ${shortCode} at ${parsed.lat},${parsed.lng}`);
      
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>SOS RECEIVED! Code: ${shortCode}
Location: ${parsed.lat.toFixed(4)},${parsed.lng.toFixed(4)}
Help is coming. Stay safe.
Track: ${process.env.FRONTEND_URL || 'app'}/track/${shortCode}</Message>
</Response>`);
    } else {
      res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>DISASTER SOS - Send in these formats:

H 6.912 79.852 A
(H=Help, then LAT LON, A=Adult)

Codes: A=Adult M=Medical C=Child F=Fire W=Water B=Building I=Injured

Or: SOS 6.912,79.852 your message</Message>
</Response>`);
    }
  } catch (error) {
    console.error('[SMS ERROR]', error);
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error. Try: H 6.912 79.852 A</Message>
</Response>`);
  }
});

app.post('/api/sms/send', async (req: Request, res: Response) => {
  const { reportId, message } = req.body as { reportId: string; message: string };
  
  const report = reports.get(reportId);
  if (!report || !report.phone) {
    res.status(400).json({ error: 'Report not found or no phone number' });
    return;
  }
  
  const result = await sendSMS(report.phone, message);
  res.json(result);
});

// ============================================
// SOCKET.IO EVENTS
// ============================================

io.on('connection', (socket: Socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  connectedClients.set(socket.id, { connectedAt: Date.now() });

  socket.on('rescuer:join', (data: RescuerJoinData) => {
    socket.join('rescuers');
    connectedClients.set(socket.id, { 
      ...connectedClients.get(socket.id)!, 
      type: 'rescuer', 
      name: data.name,
      rescuerId: data.id
    });
    console.log(`[WS] Rescuer joined: ${data.name || socket.id}`);
    
    socket.emit('reports:sync', Array.from(reports.values()).map(sanitizeReport));
  });

  socket.on('user:track', (shortCode: string) => {
    socket.join(`report:${shortCode}`);
    const report = Array.from(reports.values()).find(r => r.shortCode === shortCode);
    if (report) {
      socket.emit('report:status', sanitizeReport(report));
    }
  });

  socket.on('rescuer:location', (data: RescuerLocationData) => {
    io.to('rescuers').emit('rescuer:location', { 
      ...data, 
      timestamp: Date.now() 
    });
  });

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║       🚨 DISASTER MANAGEMENT API SERVER 🚨                   ║
║══════════════════════════════════════════════════════════════║
║  Server running on port ${PORT}                                 ║
║  WebSocket enabled for real-time updates                     ║
║  TypeScript: Enabled                                         ║
║                                                              ║
║  Endpoints:                                                  ║
║  POST   /api/reports          - Create SOS report            ║
║  GET    /api/reports          - List all reports             ║
║  GET    /api/reports/:id      - Get single report            ║
║  POST   /api/reports/:id/claim   - Claim a report            ║
║  PUT    /api/reports/:id/status  - Update status             ║
║  POST   /api/rescuers/register   - Register rescuer          ║
║  GET    /api/stats            - Get statistics               ║
║  POST   /api/sms/incoming     - SMS webhook                  ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

export { app, io };
