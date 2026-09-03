/**
 * Cheki Receipt Verification SDK Singleton Client
 * Handles Ethiopian bank and mobile wallet receipt verification (CBE, Telebirr, BOA, Dashen, etc.)
 */

import { Cheki, ChekiConfig } from 'cheki-verify';
import { logger } from './logger.js';

let chekiInstance: Cheki | null = null;

export function getChekiClient(): Cheki {
  if (!chekiInstance) {
    const config: ChekiConfig = {
      timeoutMs: 15000, // 15-second timeout safeguard for bank endpoints
      maxRetries: 2,
    };
    chekiInstance = new Cheki(config);
    logger.info('[ChekiClient] Initialized Cheki verification client with 15s timeout guard.');
  }
  return chekiInstance;
}

export const chekiClient = getChekiClient();
