/**
 * Utility Functions
 */

import { Report, SanitizedReport } from '../types';

/**
 * Generate a 4-character alphanumeric short code
 */
export function generateShortCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Sanitize a report for client consumption (remove sensitive data)
 */
export function sanitizeReport(report: Report): SanitizedReport {
  return {
    id: report.id,
    shortCode: report.shortCode,
    lat: report.lat,
    lng: report.lng,
    message: report.message,
    severity: report.severity,
    photoUrl: report.photoUrl,
    status: report.status,
    claimedBy: report.claimedBy,
    claimedByName: report.claimedByName,
    timestamp: report.timestamp,
    lastUpdate: report.lastUpdate,
    eta: report.eta,
    batteryLevel: report.batteryLevel,
    isMedical: report.isMedical,
    isFragile: report.isFragile,
    peopleCount: report.peopleCount
  };
}

/**
 * Parse boolean from string or boolean value
 */
export function parseBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return false;
}

/**
 * Parse integer with fallback
 */
export function parseIntSafe(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Parse float with fallback
 */
export function parseFloatSafe(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}
