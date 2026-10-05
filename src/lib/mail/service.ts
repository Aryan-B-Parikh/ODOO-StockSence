import type { EmailProvider, StoredEmail } from './interface';
import { ConsoleEmailProvider, getEmailProvider } from './provider';
import {
  dailyDigestTemplate,
  deliveryDispatchTemplate,
  goodsReceiptTemplate,
  lowStockTemplate,
  otpTemplate,
} from './templates';

export class MailService {
  private readonly provider: EmailProvider;
  private readonly lowStockDebounce = new Map<number, number>();
  private readonly DEBOUNCE_MS = 6 * 60 * 60 * 1000; // 6 hours

  constructor(provider?: EmailProvider) {
    this.provider = provider ?? getEmailProvider();
  }

  /** UC-1: Low-Stock & Reorder Point Alerts */
  async sendLowStockAlert(
    recipients: string[],
    params: {
      productId: number;
      productName: string;
      sku: string;
      unit: string;
      onHand: number;
      reorderPoint: number;
      locationCode?: string;
    },
  ): Promise<void> {
    if (!recipients || recipients.length === 0) return;

    const now = Date.now();
    const lastSent = this.lowStockDebounce.get(params.productId) ?? 0;
    if (now - lastSent < this.DEBOUNCE_MS) {
      console.log(`[mail] Low-stock alert debounced for product ${params.sku} (already notified recently)`);
      return;
    }
    this.lowStockDebounce.set(params.productId, now);

    const { html, text } = lowStockTemplate(params);
    await this.provider.sendEmail({
      to: recipients,
      subject: `⚠️ [LOW-STOCK ALERT] Reorder Required for ${params.productName} (${params.sku})`,
      html,
      text,
    });
  }

  /** UC-2: Real Email OTP for Password Recovery */
  async sendOtpEmail(email: string, name: string, otpCode: string): Promise<void> {
    if (!email) return;

    const { html, text } = otpTemplate({
      name,
      otpCode,
      expiresInMinutes: 10,
    });

    await this.provider.sendEmail({
      to: email,
      subject: `[StockSense] Password Reset Verification Code: ${otpCode}`,
      html,
      text,
    });
  }

  /** UC-3: Customer Delivery Dispatch & Packing Slip */
  async sendDeliveryDispatch(
    customerEmail: string,
    params: {
      code: string;
      customerName: string;
      destination: string;
      lines: Array<{ sku: string; productName: string; qty: number; unit: string }>;
    },
  ): Promise<void> {
    if (!customerEmail) return;

    const { html, text } = deliveryDispatchTemplate(params);
    await this.provider.sendEmail({
      to: customerEmail,
      subject: `📦 [DISPATCH CONFIRMATION] Order ${params.code} Dispatched`,
      html,
      text,
    });
  }

  /** UC-4: Goods Receipt Note (GRN) to Vendors */
  async sendGoodsReceiptNote(
    vendorEmail: string,
    params: {
      code: string;
      supplierName: string;
      warehouseName: string;
      lines: Array<{ sku: string; productName: string; expectedQty: number; receivedQty: number; unit: string }>;
    },
  ): Promise<void> {
    if (!vendorEmail) return;

    const { html, text } = goodsReceiptTemplate(params);
    await this.provider.sendEmail({
      to: vendorEmail,
      subject: `📄 [GOODS RECEIPT NOTE] Acknowledgment for ${params.code}`,
      html,
      text,
    });
  }

  /** UC-5: Daily Warehouse Shift Digest (07:30 AM) */
  async sendDailyDigest(
    recipients: string[],
    params: {
      date: string;
      totalProducts: number;
      lowStockCount: number;
      pendingReceipts: number;
      pendingDeliveries: number;
      openFlags: number;
    },
  ): Promise<void> {
    if (!recipients || recipients.length === 0) return;

    const { html, text } = dailyDigestTemplate(params);
    await this.provider.sendEmail({
      to: recipients,
      subject: `📊 [DAILY DIGEST] Warehouse Operations Summary — ${params.date}`,
      html,
      text,
    });
  }

  getRecentEmails(): StoredEmail[] {
    if ('getInbox' in this.provider && typeof (this.provider as { getInbox?: () => StoredEmail[] }).getInbox === 'function') {
      return (this.provider as { getInbox: () => StoredEmail[] }).getInbox();
    }
    return [];
  }
}

export const mailService = new MailService();
