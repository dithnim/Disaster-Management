/**
 * Shared Type Definitions for Disaster Management System
 */

// ============================================
// ENUMS
// ============================================

export enum ReportStatus {
  NEW = 'new',
  CLAIMED = 'claimed',
  EN_ROUTE = 'en_route',
  ARRIVED = 'arrived',
  RESCUED = 'rescued',
  CLOSED = 'closed'
}

export enum Severity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export type ReportSource = 'web' | 'sms' | 'app';

// ============================================
// REPORT TYPES
// ============================================

export interface Report {
  id: string;
  shortCode: string;
  lat: number;
  lng: number;
  message: string;
  severity: Severity;
  phone: string | null;
  photoUrl: string | null;
  status: ReportStatus;
  claimedBy: string | null;
  claimedByName: string | null;
  timestamp: number;
  lastUpdate: number;
  eta: string | null;
  batteryLevel: number | null;
  isMedical: boolean;
  isFragile: boolean;
  peopleCount: number;
  source?: ReportSource;
  rawSms?: string;
  notes?: string;
}

export interface SanitizedReport {
  id: string;
  shortCode: string;
  lat: number;
  lng: number;
  message: string;
  severity: Severity;
  photoUrl: string | null;
  status: ReportStatus;
  claimedBy: string | null;
  claimedByName: string | null;
  timestamp: number;
  lastUpdate: number;
  eta: string | null;
  batteryLevel: number | null;
  isMedical: boolean;
  isFragile: boolean;
  peopleCount: number;
}

export interface CreateReportRequest {
  lat: string | number;
  lng: string | number;
  message?: string;
  severity?: Severity;
  phone?: string;
  isMedical?: string | boolean;
  isFragile?: string | boolean;
  peopleCount?: string | number;
  batteryLevel?: string | number;
}

export interface ClaimReportRequest {
  rescuerId: string;
  rescuerName?: string;
  eta?: string;
}

export interface UpdateStatusRequest {
  status: ReportStatus;
  eta?: string;
  notes?: string;
}

// ============================================
// RESCUER TYPES
// ============================================

export interface Rescuer {
  id: string;
  name: string;
  phone: string | null;
  organization: string;
  registeredAt: number;
  isActive: boolean;
}

export interface RegisterRescuerRequest {
  name: string;
  phone?: string;
  organization?: string;
}

// ============================================
// SMS TYPES
// ============================================

export interface SMSCodeInfo {
  message: string;
  severity: Severity;
  isMedical?: boolean;
  isFragile?: boolean;
  peopleCount?: number;
}

export interface ParsedSMS {
  lat: number;
  lng: number;
  message: string;
  severity: Severity;
  isMedical: boolean;
  isFragile: boolean;
  peopleCount: number;
}

export interface TwilioIncomingSMS {
  Body: string;
  From: string;
  To?: string;
  MessageSid?: string;
}

export interface SMSSendResult {
  success: boolean;
  sid?: string;
  mock?: boolean;
  error?: string;
}

// ============================================
// STATS TYPES
// ============================================

export interface Stats {
  total: number;
  byStatus: {
    new: number;
    claimed: number;
    enRoute: number;
    arrived: number;
    rescued: number;
    closed: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  activeRescuers: number;
  connectedClients: number;
  lastUpdate: number;
}

// ============================================
// SOCKET TYPES
// ============================================

export interface ConnectedClient {
  connectedAt: number;
  type?: 'user' | 'rescuer';
  name?: string;
  rescuerId?: string;
}

export interface RescuerJoinData {
  name?: string;
  id?: string;
  organization?: string;
}

export interface RescuerLocationData {
  rescuerId: string;
  lat: number;
  lng: number;
  timestamp?: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface CreateReportResponse {
  ok: boolean;
  id: string;
  shortCode: string;
  message: string;
}

export interface HealthResponse {
  status: string;
  timestamp: number;
  reports: number;
  rescuers: number;
  connectedClients: number;
}
