/**
 * Twilio SMS Service
 */

import { SMSSendResult } from '../types';

/**
 * Send SMS via Twilio
 */
export async function sendSMS(to: string, message: string): Promise<SMSSendResult> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[SMS MOCK] To ${to}: ${message}`);
    return { success: true, mock: true };
  }
  
  try {
    // Dynamic import to avoid issues when Twilio is not configured
    const twilio = await import('twilio');
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });
    
    console.log(`[SMS SENT] To ${to}: ${message.substring(0, 50)}...`);
    return { success: true, sid: result.sid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SMS ERROR]', errorMessage);
    return { success: false, error: errorMessage };
  }
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
    claimed: `Your SOS (${shortCode}) has been claimed by ${claimedByName || 'a rescuer'}. Help is being dispatched.`,
    en_route: `Rescuer is on the way to your location (${shortCode}). ETA: ${eta || 'Soon'}. Stay safe.`,
    arrived: `Rescuer has arrived at your location (${shortCode}). Look for help nearby.`,
    rescued: `Glad you're safe! Case ${shortCode} marked as rescued.`
  };
  
  return messages[status] || null;
}
