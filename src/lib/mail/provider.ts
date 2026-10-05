import nodemailer from 'nodemailer';
import type { EmailPayload, EmailProvider, EmailResult, StoredEmail } from './interface';

export class ConsoleEmailProvider implements EmailProvider {
  private readonly outbox: StoredEmail[] = [];
  private readonly maxStored = 100;

  async sendEmail(payload: EmailPayload): Promise<EmailResult> {
    const id = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const stored: StoredEmail = {
      ...payload,
      id,
      timestamp: new Date().toISOString(),
    };

    this.outbox.unshift(stored);
    if (this.outbox.length > this.maxStored) {
      this.outbox.pop();
    }

    const recipients = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
    console.log('\n📧 [EMAIL DISPATCHED via CONSOLE]');
    console.log(`To: ${recipients}`);
    console.log(`Subject: ${payload.subject}`);
    console.log('--- Content Snippet ---');
    console.log(payload.text.slice(0, 200).replace(/\n/g, ' ') + (payload.text.length > 200 ? '...' : ''));
    console.log('-----------------------\n');

    return { success: true, messageId: id };
  }

  getInbox(): StoredEmail[] {
    return [...this.outbox];
  }

  clear(): void {
    this.outbox.length = 0;
  }
}

export class BrevoEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly outbox: StoredEmail[] = [];
  private readonly maxStored = 100;

  constructor(options: { apiKey: string; senderEmail: string; senderName?: string }) {
    this.apiKey = options.apiKey;
    this.senderEmail = options.senderEmail;
    this.senderName = options.senderName || 'StockSense';
  }

  async sendEmail(payload: EmailPayload): Promise<EmailResult> {
    const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
    const to = recipients.map((email) => ({ email }));

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: this.senderName, email: this.senderEmail },
          to,
          subject: payload.subject,
          htmlContent: payload.html,
          textContent: payload.text,
          ...(payload.replyTo ? { replyTo: { email: payload.replyTo } } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Brevo API HTTP ${res.status}`);
      }

      const messageId = (data.messageId as string) || `brevo_${Date.now()}`;
      const stored: StoredEmail = {
        ...payload,
        id: messageId,
        timestamp: new Date().toISOString(),
      };
      this.outbox.unshift(stored);
      if (this.outbox.length > this.maxStored) this.outbox.pop();

      console.log(`\n📧 [REAL EMAIL DELIVERED via Brevo API]`);
      console.log(`To: ${recipients.join(', ')}`);
      console.log(`Subject: ${payload.subject}`);
      console.log(`Message ID: ${messageId}\n`);

      return { success: true, messageId };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[mail] Brevo delivery failure:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  getInbox(): StoredEmail[] {
    return [...this.outbox];
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private defaultFrom: string;

  constructor(options: {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    from: string;
  }) {
    this.defaultFrom = options.from;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure ?? options.port === 465,
      auth: options.auth,
    });
  }

  async sendEmail(payload: EmailPayload): Promise<EmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.defaultFrom,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
      });
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[mail] SMTP transport failure:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }
}

let globalProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (globalProvider) return globalProvider;

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    globalProvider = new BrevoEmailProvider({
      apiKey: brevoApiKey,
      senderEmail: process.env.BREVO_SENDER_EMAIL || 'usearyan1974@gmail.com',
      senderName: process.env.BREVO_SENDER_NAME || 'StockSense',
    });
    return globalProvider;
  }

  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    globalProvider = new SmtpEmailProvider({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      from: process.env.SMTP_FROM ?? 'noreply@stocksense.app',
    });
    return globalProvider;
  }

  globalProvider = new ConsoleEmailProvider();
  return globalProvider;
}
