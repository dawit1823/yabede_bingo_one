/**
 * Modular Payment Architecture
 * Provider Interface Pattern allowing dynamic Manual Payment Methods and future Automated Gateways
 */

import { DepositRequest, PaymentMethodConfig, WithdrawalRequest } from '../types.js';
import { getChekiClient } from './chekiClient.js';
import { logger } from './logger.js';

export interface DepositSubmissionParams {
  userId: string;
  userName: string;
  userTelegramId: number;
  paymentMethod: PaymentMethodConfig;
  amount: number;
  referenceCode: string;
  mobileNumber?: string;
  senderAccountDigits?: string;
  screenshotUrl?: string;
  note?: string;
  existingReferences: Set<string>;
}

export interface DepositVerificationResult {
  success: boolean;
  deposit?: Partial<DepositRequest>;
  message: string;
  requiresAdminApproval: boolean;
  autoApproved?: boolean;
  verificationDetails?: any;
}

export interface WithdrawalProcessResult {
  success: boolean;
  message: string;
  transactionRef?: string;
}

/**
 * Standard Payment Provider Interface
 * Both Manual Payment Provider and future Direct Gateway APIs (Chapa, Telebirr Merchant, SantimPay)
 * implement this interface.
 */
export interface IPaymentProvider {
  providerType: string;
  name: string;
  isManual: boolean;

  /**
   * Submit deposit request
   */
  submitDeposit(params: DepositSubmissionParams): Promise<DepositVerificationResult>;

  /**
   * Process withdrawal request
   */
  processWithdrawal(withdrawal: WithdrawalRequest): Promise<WithdrawalProcessResult>;
}

/**
 * Manual Payment Provider Implementation
 * Handles offline peer-to-peer / bank transfer verification via Admin Manual Review
 */
export class ManualPaymentProvider implements IPaymentProvider {
  public providerType = 'MANUAL';
  public name = 'Manual Payment Provider';
  public isManual = true;

  public async submitDeposit(params: DepositSubmissionParams): Promise<DepositVerificationResult> {
    const { referenceCode, amount, existingReferences, paymentMethod } = params;

    // 1. Basic reference validation
    const cleanRef = referenceCode ? referenceCode.trim().toUpperCase() : '';
    if (!cleanRef || cleanRef.length < 4) {
      return {
        success: false,
        message: 'Please provide a valid transaction reference number (min 4 characters).',
        requiresAdminApproval: true,
      };
    }

    // 2. Duplicate reference check to prevent duplicate claim attempts
    if (existingReferences.has(cleanRef)) {
      return {
        success: false,
        message: 'This transaction reference number has already been submitted or processed!',
        requiresAdminApproval: true,
      };
    }

    // 3. Amount check
    if (amount <= 0 || isNaN(amount)) {
      return {
        success: false,
        message: 'Please enter a valid deposit amount in Birr.',
        requiresAdminApproval: true,
      };
    }

    // Manual deposits always require Admin verification before crediting wallet
    return {
      success: true,
      message: `Your deposit request via ${paymentMethod.name} has been submitted successfully and is awaiting admin verification.`,
      requiresAdminApproval: true,
      deposit: {
        referenceCode: cleanRef,
        amount,
        status: 'PENDING',
      },
    };
  }

  public async processWithdrawal(withdrawal: WithdrawalRequest): Promise<WithdrawalProcessResult> {
    // Manual withdrawal payout processed by Admin transfer
    return {
      success: true,
      message: `Manual withdrawal request of ${withdrawal.amount} Birr to ${withdrawal.paymentMethodName} (${withdrawal.accountNumber}) pending admin transfer.`,
      transactionRef: `WD-MANUAL-${withdrawal.id}`,
    };
  }
}

/**
 * Automated Verification Provider Implementation using cheki-verify SDK
 * Verifies Ethiopian mobile banking & wallet receipts (CBE, Telebirr, CBE Birr, Awash, BOA, Dashen, etc.)
 */
export class ChekiVerificationProvider implements IPaymentProvider {
  public providerType = 'CHEKI_VERIFY';
  public name = 'Cheki Automated Receipt Verification';
  public isManual = false;

  public async submitDeposit(params: DepositSubmissionParams): Promise<DepositVerificationResult> {
    const { referenceCode, amount, existingReferences, paymentMethod } = params;

    // 1. Basic reference validation
    const cleanRef = referenceCode ? referenceCode.trim().toUpperCase() : '';
    if (!cleanRef || cleanRef.length < 4) {
      return {
        success: false,
        message: 'Please provide a valid transaction reference number (min 4 characters).',
        requiresAdminApproval: true,
      };
    }

    // 2. Duplicate reference check to prevent duplicate claims
    if (existingReferences.has(cleanRef)) {
      return {
        success: false,
        message: 'This transaction reference number has already been submitted or processed!',
        requiresAdminApproval: true,
      };
    }

    // 3. Amount check
    if (amount <= 0 || isNaN(amount)) {
      return {
        success: false,
        message: 'Please enter a valid deposit amount in Birr.',
        requiresAdminApproval: true,
      };
    }

    // 4. Resolve bank/wallet code
    let bankCode = (paymentMethod.chekiBankCode || '').trim().toLowerCase();
    if (!bankCode) {
      const pmName = (paymentMethod.name || '').toLowerCase();
      if (pmName.includes('telebirr')) bankCode = 'telebirr';
      else if (pmName.includes('cbe birr') || pmName.includes('cbebirr')) bankCode = 'cbebirr';
      else if (pmName.includes('cbe') || pmName.includes('commercial bank')) bankCode = 'cbe';
      else if (pmName.includes('awash')) bankCode = 'awash';
      else if (pmName.includes('dashen')) bankCode = 'dashen';
      else if (pmName.includes('boa') || pmName.includes('abyssinia')) bankCode = 'boa';
      else if (pmName.includes('mpesa') || pmName.includes('m-pesa')) bankCode = 'mpesa';
      else bankCode = 'cbe';
    }

    // 5. Build options for verification
    const verifyOptions: any = {};
    if (params.senderAccountDigits) {
      if (bankCode === 'telebirr' || bankCode === 'mpesa' || bankCode === 'cbebirr') {
        verifyOptions.phoneNumber = params.senderAccountDigits;
      } else {
        verifyOptions.accountNumber = params.senderAccountDigits;
      }
    }
    if (params.mobileNumber && !verifyOptions.phoneNumber) {
      verifyOptions.phoneNumber = params.mobileNumber;
    }
    if (!verifyOptions.accountNumber && paymentMethod.accountNumber) {
      verifyOptions.accountNumber = paymentMethod.accountNumber;
    }

    // 6. Call Cheki verification with timeout & error handling
    const cheki = getChekiClient();
    let result: any = null;

    try {
      result = await Promise.race([
        cheki.verify(bankCode, cleanRef, verifyOptions),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Cheki verification timed out after 15s')), 15000)
        ),
      ]);
    } catch (err: any) {
      logger.warn(`[ChekiProvider] Verification error for ref ${cleanRef} (${bankCode}):`, err.message || err);
      // Fall back safely to manual admin review without rejecting the user's submission
      return {
        success: true,
        message: `Your deposit request via ${paymentMethod.name} has been submitted and queued for manual admin verification (automated service was inconclusive: ${err.message || 'Service unreachable'}).`,
        requiresAdminApproval: true,
        autoApproved: false,
        verificationDetails: {
          error: err.message || 'Automated verification error',
          bankCode,
          timestamp: new Date().toISOString(),
        },
        deposit: {
          referenceCode: cleanRef,
          amount,
          status: 'PENDING',
          mobileNumber: params.mobileNumber,
          senderAccountDigits: params.senderAccountDigits,
          screenshotUrl: params.screenshotUrl,
          note: params.note
            ? `${params.note} [Auto-verify note: Inconclusive check (${err.message || 'Error'}) - queued for admin review]`
            : `[Auto-verify note: Inconclusive check (${err.message || 'Error'}) - queued for admin review]`,
        },
      };
    }

    // 7. Evaluate verification response
    if (!result || !result.verified || !result.success) {
      logger.info(`[ChekiProvider] Receipt ref ${cleanRef} not verified: ${result?.reason || 'Unknown status'}`);
      return {
        success: true,
        message: `Your deposit request via ${paymentMethod.name} has been submitted for manual admin review (${result?.reason || 'Receipt could not be verified automatically'}).`,
        requiresAdminApproval: true,
        autoApproved: false,
        verificationDetails: result,
        deposit: {
          referenceCode: cleanRef,
          amount,
          status: 'PENDING',
          mobileNumber: params.mobileNumber,
          senderAccountDigits: params.senderAccountDigits,
          screenshotUrl: params.screenshotUrl,
          note: params.note
            ? `${params.note} [Auto-verify note: ${result?.reason || 'Receipt unverified'}]`
            : `[Auto-verify note: ${result?.reason || 'Receipt unverified'}]`,
        },
      };
    }

    // 8. Amount sanity check
    if (typeof result.amount === 'number' && result.amount > 0) {
      if (Math.abs(result.amount - amount) > 0.05) {
        logger.warn(`[ChekiProvider] Amount discrepancy for ref ${cleanRef}: Claimed ${amount}, receipt has ${result.amount}`);
        return {
          success: true,
          message: `Deposit submitted for manual review: claimed amount (${amount} Birr) differs from receipt amount (${result.amount} Birr).`,
          requiresAdminApproval: true,
          autoApproved: false,
          verificationDetails: {
            ...result,
            mismatchReason: `Claimed ${amount} != receipt ${result.amount}`,
          },
          deposit: {
            referenceCode: cleanRef,
            amount,
            status: 'PENDING',
            mobileNumber: params.mobileNumber,
            senderAccountDigits: params.senderAccountDigits,
            screenshotUrl: params.screenshotUrl,
            note: params.note
              ? `${params.note} [Auto-verify alert: Claimed ${amount} Birr vs verified receipt ${result.amount} Birr]`
              : `[Auto-verify alert: Claimed ${amount} Birr vs verified receipt ${result.amount} Birr]`,
          },
        };
      }
    }

    // 9. Receiver name check (if configured)
    if (paymentMethod.expectedReceiverName && result.receiverName) {
      const normExpected = paymentMethod.expectedReceiverName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const normActual = result.receiverName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normExpected && !normActual.includes(normExpected) && !normExpected.includes(normActual)) {
        logger.warn(`[ChekiProvider] Receiver name mismatch for ref ${cleanRef}: expected ${paymentMethod.expectedReceiverName}, got ${result.receiverName}`);
        return {
          success: true,
          message: `Deposit submitted for manual review: receiver name on receipt differs from expected merchant account.`,
          requiresAdminApproval: true,
          autoApproved: false,
          verificationDetails: {
            ...result,
            mismatchReason: `Expected receiver name "${paymentMethod.expectedReceiverName}", got "${result.receiverName}"`,
          },
          deposit: {
            referenceCode: cleanRef,
            amount,
            status: 'PENDING',
            mobileNumber: params.mobileNumber,
            senderAccountDigits: params.senderAccountDigits,
            screenshotUrl: params.screenshotUrl,
            note: params.note
              ? `${params.note} [Auto-verify alert: Expected receiver ${paymentMethod.expectedReceiverName}, receipt has ${result.receiverName}]`
              : `[Auto-verify alert: Expected receiver ${paymentMethod.expectedReceiverName}, receipt has ${result.receiverName}]`,
          },
        };
      }
    }

    // 10. Receiver account check (if configured)
    if (paymentMethod.expectedReceiverAccount && result.receiverAccount) {
      const normExpectedAcc = paymentMethod.expectedReceiverAccount.trim().replace(/\D/g, '');
      const normActualAcc = result.receiverAccount.trim().replace(/\D/g, '');
      if (normExpectedAcc && !normActualAcc.includes(normExpectedAcc) && !normExpectedAcc.includes(normActualAcc)) {
        logger.warn(`[ChekiProvider] Receiver account mismatch for ref ${cleanRef}: expected ${paymentMethod.expectedReceiverAccount}, got ${result.receiverAccount}`);
        return {
          success: true,
          message: `Deposit submitted for manual review: receiver account number differs from expected merchant account.`,
          requiresAdminApproval: true,
          autoApproved: false,
          verificationDetails: {
            ...result,
            mismatchReason: `Expected receiver account "${paymentMethod.expectedReceiverAccount}", got "${result.receiverAccount}"`,
          },
          deposit: {
            referenceCode: cleanRef,
            amount,
            status: 'PENDING',
            mobileNumber: params.mobileNumber,
            senderAccountDigits: params.senderAccountDigits,
            screenshotUrl: params.screenshotUrl,
            note: params.note
              ? `${params.note} [Auto-verify alert: Expected receiver account ${paymentMethod.expectedReceiverAccount}, receipt has ${result.receiverAccount}]`
              : `[Auto-verify alert: Expected receiver account ${paymentMethod.expectedReceiverAccount}, receipt has ${result.receiverAccount}]`,
          },
        };
      }
    }

    // 11. All criteria met: auto-approval success!
    logger.info(`[ChekiProvider] Deposit ref ${cleanRef} automatically verified and approved via ${bankCode}!`);
    return {
      success: true,
      message: `Your deposit of ${amount} Birr via ${paymentMethod.name} has been verified and credited automatically!`,
      requiresAdminApproval: false,
      autoApproved: true,
      verificationDetails: result,
      deposit: {
        referenceCode: cleanRef,
        amount,
        status: 'APPROVED',
        autoApproved: true,
        mobileNumber: params.mobileNumber,
        senderAccountDigits: params.senderAccountDigits,
        screenshotUrl: params.screenshotUrl,
        note: params.note,
      },
    };
  }

  public async processWithdrawal(withdrawal: WithdrawalRequest): Promise<WithdrawalProcessResult> {
    return {
      success: true,
      message: `Manual withdrawal request of ${withdrawal.amount} Birr to ${withdrawal.paymentMethodName} (${withdrawal.accountNumber}) pending admin transfer.`,
      transactionRef: `WD-CHEKI-${withdrawal.id}`,
    };
  }
}

/**
 * Gateway Payment Provider Stub (For Future Automated Integrations)
 * Examples: Telebirr Merchant API, CBE Birr API, Chapa, SantimPay
 */
export class AutomatedGatewayProvider implements IPaymentProvider {
  public providerType: string;
  public name: string;
  public isManual = false;

  constructor(providerType: string, name: string) {
    this.providerType = providerType;
    this.name = name;
  }

  public async submitDeposit(params: DepositSubmissionParams): Promise<DepositVerificationResult> {
    // Simulated automated instant webhook / API callback
    return {
      success: true,
      message: `Automated payment verified via ${this.name} API.`,
      requiresAdminApproval: false,
      autoApproved: true,
      deposit: {
        referenceCode: params.referenceCode,
        amount: params.amount,
        status: 'APPROVED',
      },
    };
  }

  public async processWithdrawal(withdrawal: WithdrawalRequest): Promise<WithdrawalProcessResult> {
    return {
      success: true,
      message: `Automated payout via ${this.name} API completed.`,
      transactionRef: `GW-API-${Date.now()}`,
    };
  }
}

/**
 * Centralized Payment Provider Registry
 */
export class PaymentProviderRegistry {
  private providers: Map<string, IPaymentProvider> = new Map();

  constructor() {
    // Register Manual Provider as default
    const manualProvider = new ManualPaymentProvider();
    this.providers.set('MANUAL', manualProvider);

    // Register Cheki Automated Verification Provider
    const chekiProvider = new ChekiVerificationProvider();
    this.providers.set('CHEKI_VERIFY', chekiProvider);

    // Register Future Gateway Stubs (seamless drop-in)
    this.providers.set('TELEBIRR_GATEWAY', new AutomatedGatewayProvider('TELEBIRR_GATEWAY', 'Telebirr Merchant API'));
    this.providers.set('CBE_GATEWAY', new AutomatedGatewayProvider('CBE_GATEWAY', 'CBE Birr Merchant API'));
    this.providers.set('CHAPA_GATEWAY', new AutomatedGatewayProvider('CHAPA_GATEWAY', 'Chapa Checkout API'));
    this.providers.set('SANTIMPAY_GATEWAY', new AutomatedGatewayProvider('SANTIMPAY_GATEWAY', 'SantimPay API'));
  }

  public getProvider(providerType?: string, paymentMethod?: PaymentMethodConfig): IPaymentProvider {
    // If auto-verify is enabled on the payment method, prefer Cheki verification provider
    if (paymentMethod?.autoVerifyEnabled || providerType === 'CHEKI_VERIFY') {
      return this.providers.get('CHEKI_VERIFY')!;
    }
    if (providerType && this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }
    return this.providers.get('MANUAL')!;
  }
}

export const paymentRegistry = new PaymentProviderRegistry();
