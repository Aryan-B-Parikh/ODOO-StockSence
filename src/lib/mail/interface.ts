export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  sendEmail(payload: EmailPayload): Promise<EmailResult>;
}

export interface StoredEmail extends EmailPayload {
  id: string;
  timestamp: string;
}
