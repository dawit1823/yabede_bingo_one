/**
 * Modular Payment Architecture
 * Provider Interface Pattern allowing dynamic Manual Payment Methods and future Automated Gateways
 */

import { DepositRequest, PaymentMethodConfig, WithdrawalRequest } from '../types.js';

export interface DepositSubmissionParams {
  userId: string;
  userName: string;
  userTelegramId: number;
  paymentMethod: PaymentMethodConfig;
  amount: number;
  referenceCode: string;
  screenshotUrl?: string;
  note?: string;
  existingReferences: Set<string>;
}

export interface DepositVerificationResult {
  success: boolean;
  deposit?: Partial<DepositRequest>;
  message: string;
  requiresAdminApproval: boolean;
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

    // Register Future Gateway Stubs (seamless drop-in)
    this.providers.set('TELEBIRR_GATEWAY', new AutomatedGatewayProvider('TELEBIRR_GATEWAY', 'Telebirr Merchant API'));
    this.providers.set('CBE_GATEWAY', new AutomatedGatewayProvider('CBE_GATEWAY', 'CBE Birr Merchant API'));
    this.providers.set('CHAPA_GATEWAY', new AutomatedGatewayProvider('CHAPA_GATEWAY', 'Chapa Checkout API'));
    this.providers.set('SANTIMPAY_GATEWAY', new AutomatedGatewayProvider('SANTIMPAY_GATEWAY', 'SantimPay API'));
  }

  public getProvider(providerType: string): IPaymentProvider {
    return this.providers.get(providerType) || this.providers.get('MANUAL')!;
  }
}

export const paymentRegistry = new PaymentProviderRegistry();
