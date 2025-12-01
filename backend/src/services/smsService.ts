/**
 * Twilio SMS Service
 * Handles sending and receiving SMS for Disaster SOS System
 */

import { SMSSendResult } from "../types";

// Twilio client (lazy initialized)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let twilioClient: any = null;

/**
 * Get or initialize Twilio client
 */
async function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return null;
  }

  if (!twilioClient) {
    const twilio = await import("twilio");
    twilioClient = twilio.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  return twilioClient;
}

/**
 * Normalize Sri Lankan phone numbers to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/\s+/g, "").replace(/-/g, "");

  // Sri Lankan numbers
  if (normalized.startsWith("0")) {
    normalized = "+94" + normalized.substring(1);
  } else if (normalized.startsWith("94") && !normalized.startsWith("+")) {
    normalized = "+" + normalized;
  } else if (!normalized.startsWith("+")) {
    normalized = "+94" + normalized;
  }

  return normalized;
}

/**
 * Send SMS via Twilio
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<SMSSendResult> {
  const client = await getTwilioClient();

  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[SMS MOCK] To ${to}: ${message}`);
    return { success: true, mock: true };
  }

  try {
    const normalizedTo = normalizePhoneNumber(to);

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalizedTo,
    });

    console.log(
      `[SMS SENT] To ${normalizedTo}: ${message.substring(0, 50)}...`
    );
    return { success: true, sid: result.sid };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[SMS ERROR]", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send SOS confirmation SMS
 */
export async function sendSOSConfirmation(
  phone: string,
  shortCode: string
): Promise<SMSSendResult> {
  const message = `🆘 DisasterSOS: Your report ${shortCode} has been received. Help is being dispatched. Track status: Reply with "STATUS ${shortCode}"`;
  return sendSMS(phone, message);
}

/**
 * Send status update SMS
 */
export async function sendStatusUpdate(
  phone: string,
  shortCode: string,
  status: string,
  rescuerName?: string | null,
  eta?: string | null
): Promise<SMSSendResult> {
  const message = getStatusNotificationMessage(
    shortCode,
    status,
    rescuerName,
    eta
  );
  if (!message) {
    return { success: false, error: "No message for this status" };
  }
  return sendSMS(phone, message);
}

/**
 * Get status notification messages
 */
export function getStatusNotificationMessage(
  shortCode: string,
  status: string,
  claimedByName?: string | null,
  eta?: string | null
): string | null {
  const messages: Record<string, string> = {
    claimed: `🚨 DisasterSOS: Your SOS (${shortCode}) has been claimed by ${
      claimedByName || "a rescuer"
    }. Help is on the way!`,
    en_route: `🚗 DisasterSOS: Rescuer is traveling to your location (${shortCode}). ETA: ${
      eta || "Soon"
    }. Stay where you are.`,
    arrived: `📍 DisasterSOS: Rescuer has ARRIVED at your location (${shortCode}). Look for help nearby!`,
    rescued: `✅ DisasterSOS: Glad you're safe! Case ${shortCode} marked as rescued. Stay safe!`,
  };

  return messages[status] || null;
}

/**
 * Generate help response for invalid SMS format
 */
export function getHelpMessage(): string {
  return `🆘 DisasterSOS Help:

Send SOS with your location:
• SOS 6.9271 79.8612 trapped in flood
• HELP 6.9271,79.8612 need medical
• H 6.9271 79.8612 M (M=Medical)

Codes: M=Medical, C=Child, E=Elderly, F=Fire, W=Water/Flood

Or share your Google Maps link!`;
}

/**
 * Validate Twilio webhook signature
 */
export async function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  const client = await getTwilioClient();
  if (!client || !process.env.TWILIO_AUTH_TOKEN) {
    // Skip validation in mock mode
    return true;
  }

  try {
    const twilio = await import("twilio");
    return twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      params
    );
  } catch (error) {
    console.error("Twilio signature validation error:", error);
    return false;
  }
}

export default {
  sendSMS,
  sendSOSConfirmation,
  sendStatusUpdate,
  getStatusNotificationMessage,
  getHelpMessage,
  normalizePhoneNumber,
  validateTwilioSignature,
};
