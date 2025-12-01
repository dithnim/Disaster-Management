/**
 * SMS Parser Module
 * Supports multiple message formats for disaster SOS
 */

import { Severity, SMSCodeInfo, ParsedSMS } from "../types";

// ============================================
// SMS CODE DEFINITIONS
// ============================================

export const SMS_CODES: Record<string, SMSCodeInfo> = {
  // Situation codes
  A: { message: "Adult trapped", severity: Severity.HIGH },
  C: {
    message: "Child/Children in danger",
    severity: Severity.CRITICAL,
    isFragile: true,
  },
  M: {
    message: "Medical emergency",
    severity: Severity.CRITICAL,
    isMedical: true,
  },
  F: { message: "Fire emergency", severity: Severity.CRITICAL },
  W: { message: "Flooding/Water emergency", severity: Severity.HIGH },
  B: { message: "Building collapse", severity: Severity.CRITICAL },
  E: {
    message: "Elderly person needs help",
    severity: Severity.HIGH,
    isFragile: true,
  },
  P: {
    message: "Pregnant woman needs help",
    severity: Severity.CRITICAL,
    isMedical: true,
    isFragile: true,
  },
  I: { message: "Injured person", severity: Severity.HIGH, isMedical: true },
  T: {
    message: "Multiple people trapped",
    severity: Severity.CRITICAL,
    peopleCount: 3,
  },
  // Combined codes
  MC: {
    message: "Medical emergency with child",
    severity: Severity.CRITICAL,
    isMedical: true,
    isFragile: true,
  },
  MI: {
    message: "Multiple injured",
    severity: Severity.CRITICAL,
    isMedical: true,
    peopleCount: 2,
  },
  BT: {
    message: "Building collapse, people trapped",
    severity: Severity.CRITICAL,
    peopleCount: 3,
  },
  WE: {
    message: "Flooding with elderly",
    severity: Severity.CRITICAL,
    isFragile: true,
  },
};

/**
 * Detect severity from message text
 */
export function detectSeverity(text: string): Severity {
  const critical =
    /critical|dying|dead|fire|collaps|child|baby|pregnant|heart|breath|bleed/i;
  const high = /injur|trapped|flood|water|stuck|help|urgent|emergency/i;
  const medium = /need|assist|support/i;

  if (critical.test(text)) return Severity.CRITICAL;
  if (high.test(text)) return Severity.HIGH;
  if (medium.test(text)) return Severity.MEDIUM;
  return Severity.HIGH; // Default to high for emergencies
}

/**
 * Detect number of people from message text
 */
export function detectPeopleCount(text: string): number {
  const numMatch = text.match(
    /(\d+)\s*(?:people|persons|adults|children|family)/i
  );
  if (numMatch) return parseInt(numMatch[1], 10);
  if (/family|group|multiple|many|several/i.test(text)) return 3;
  if (/couple|two|2/i.test(text)) return 2;
  return 1;
}

/**
 * Parse SMS message into structured data
 *
 * Supported formats:
 * 1. FULL: "HELP LAT:6.912 LON:79.852 MSG:injured"
 * 2. STANDARD: "SOS 6.912,79.852 Need help"
 * 3. COMPRESSED: "H 6.912 79.852 A"
 * 4. MINIMAL: "6.912 79.852"
 */
export function parseSMS(body: string): ParsedSMS | null {
  const text = body.trim();
  let parsed: ParsedSMS | null = null;

  // Format 1: FULL FORMAT - "HELP LAT:6.912 LON:79.852 MSG:injured"
  const fullMatch = text.match(
    /^(?:HELP|SOS)\s+LAT[:\s]*([-\d.]+)\s+LON[:\s]*([-\d.]+)(?:\s+MSG[:\s]*(.*))?$/i
  );
  if (fullMatch) {
    parsed = {
      lat: parseFloat(fullMatch[1]),
      lng: parseFloat(fullMatch[2]),
      message: fullMatch[3] || "Emergency via SMS",
      severity: Severity.HIGH,
      isMedical: false,
      isFragile: false,
      peopleCount: 1,
    };
  }

  // Format 2: STANDARD - "SOS 6.912,79.852 Need help"
  if (!parsed) {
    const stdMatch = text.match(
      /^(?:HELP|SOS)\s+([-\d.]+)[,\s]+([-\d.]+)\s*(.*)$/i
    );
    if (stdMatch) {
      const msg = stdMatch[3] || "";
      parsed = {
        lat: parseFloat(stdMatch[1]),
        lng: parseFloat(stdMatch[2]),
        message: msg || "Emergency via SMS",
        severity: detectSeverity(msg),
        isMedical: /medical|injur|blood|heart|breath|pain/i.test(msg),
        isFragile: /child|baby|elderly|old|pregnant/i.test(msg),
        peopleCount: detectPeopleCount(msg),
      };
    }
  }

  // Format 3: COMPRESSED - "H 6.912 79.852 A" or "H 6.912 79.852 MC"
  if (!parsed) {
    const compMatch = text.match(
      /^H\s+([-\d.]+)\s+([-\d.]+)(?:\s+([A-Z]+))?$/i
    );
    if (compMatch) {
      const code = (compMatch[3] || "A").toUpperCase();
      const codeInfo = SMS_CODES[code] || SMS_CODES["A"];
      parsed = {
        lat: parseFloat(compMatch[1]),
        lng: parseFloat(compMatch[2]),
        message: codeInfo.message,
        severity: codeInfo.severity || Severity.HIGH,
        isMedical: codeInfo.isMedical || false,
        isFragile: codeInfo.isFragile || false,
        peopleCount: codeInfo.peopleCount || 1,
      };
    }
  }

  // Format 4: Just coordinates - "6.912 79.852" or "6.912,79.852"
  if (!parsed) {
    const coordMatch = text.match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
    if (coordMatch) {
      parsed = {
        lat: parseFloat(coordMatch[1]),
        lng: parseFloat(coordMatch[2]),
        message: "Emergency - location only",
        severity: Severity.HIGH,
        isMedical: false,
        isFragile: false,
        peopleCount: 1,
      };
    }
  }

  // Validate coordinates
  if (parsed) {
    if (isNaN(parsed.lat) || isNaN(parsed.lng)) {
      return null;
    }
    // Basic coordinate validation
    if (
      parsed.lat < -90 ||
      parsed.lat > 90 ||
      parsed.lng < -180 ||
      parsed.lng > 180
    ) {
      return null;
    }
  }

  return parsed;
}
