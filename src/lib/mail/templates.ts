/**
 * StockSense — Email Notification HTML & Plain-text Templates.
 * Styled with StockSense Emerald (#059669) & Crisp White Design.
 */

function layout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #059669; padding: 24px; color: #ffffff; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 28px 24px; font-size: 14px; line-height: 1.6; }
    .footer { background: #f8fafc; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #f1f5f9; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { background: #ecfdf5; color: #065f46; text-align: left; padding: 10px 12px; font-weight: 600; border-bottom: 2px solid #a7f3d0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-emerald { background: #d1fae5; color: #065f46; }
    .badge-rose { background: #ffe4e6; color: #9f1239; }
    .code-box { background: #f1f5f9; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 22px; text-align: center; letter-spacing: 6px; font-weight: bold; color: #0f172a; margin: 16px 0; }
    .kpi-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .kpi-card { flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .kpi-val { font-size: 20px; font-weight: bold; color: #059669; }
    .kpi-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>StockSense</h1>
      <p>Warehouse Inventory Intelligence</p>
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      This is an automated notification from StockSense Warehouse Management System.<br>
      © ${new Date().getFullYear()} StockSense. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}

// 1. Low-Stock & Reorder Point Alerts
export function lowStockTemplate(params: {
  productName: string;
  sku: string;
  unit: string;
  onHand: number;
  reorderPoint: number;
  locationCode?: string;
}): { html: string; text: string } {
  const html = layout(
    `Low Stock Alert: ${params.productName}`,
    `
    <span class="badge badge-rose">⚠️ Reorder Triggered</span>
    <h2 style="margin: 12px 0 8px; font-size: 18px; color: #0f172a;">Critical Low Stock Detected</h2>
    <p>Stock level for <strong>${params.productName}</strong> (<code>${params.sku}</code>) has fallen to or below the configured reorder threshold.</p>
    <table>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col" style="text-align: right;">Quantity</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><strong>Current On-Hand</strong></td><td style="text-align: right; color: #e11d48; font-weight: bold;">${params.onHand} ${params.unit}</td></tr>
        <tr><td><strong>Reorder Threshold</strong></td><td style="text-align: right;">${params.reorderPoint} ${params.unit}</td></tr>
        ${params.locationCode ? `<tr><td><strong>Location</strong></td><td style="text-align: right;">${params.locationCode}</td></tr>` : ''}
      </tbody>
    </table>
    <p style="margin-top: 16px; color: #475569;">Please generate an inbound purchase order or approve the suggested reorder draft in StockSense to avoid fulfillment disruption.</p>
    `
  );

  const text = `[StockSense LOW STOCK ALERT]\nProduct: ${params.productName} (${params.sku})\nOn Hand: ${params.onHand} ${params.unit}\nReorder Point: ${params.reorderPoint} ${params.unit}\nLocation: ${params.locationCode ?? 'N/A'}\n\nPlease restock immediately.`;
  return { html, text };
}

// 2. Real Email OTP for Password Recovery
export function otpTemplate(params: {
  name: string;
  otpCode: string;
  expiresInMinutes: number;
}): { html: string; text: string } {
  const html = layout(
    `StockSense Password Reset Code: ${params.otpCode}`,
    `
    <h2 style="margin: 0 0 12px; font-size: 18px; color: #0f172a;">Password Recovery Verification</h2>
    <p>Hello <strong>${params.name}</strong>,</p>
    <p>A request was made to verify your identity or reset your password in StockSense. Use the 6-digit verification code below to proceed:</p>
    <div class="code-box">${params.otpCode}</div>
    <p style="font-size: 13px; color: #64748b;">This code expires in <strong>${params.expiresInMinutes} minutes</strong>. If you did not initiate this request, you can safely disregard this email.</p>
    `
  );

  const text = `[StockSense Password Reset]\nHello ${params.name},\nYour verification code is: ${params.otpCode}\nThis code will expire in ${params.expiresInMinutes} minutes.\nIf you did not request this, please ignore this email.`;
  return { html, text };
}

// 3. Customer Delivery Dispatch & Packing Slip
export function deliveryDispatchTemplate(params: {
  code: string;
  customerName: string;
  destination: string;
  lines: Array<{ sku: string; productName: string; qty: number; unit: string }>;
}): { html: string; text: string } {
  const rows = params.lines
    .map(
      (l) => `<tr>
      <td><strong>${l.productName}</strong><br><span style="color: #64748b; font-size: 11px;">SKU: ${l.sku}</span></td>
      <td style="text-align: right; font-weight: 600;">${l.qty} ${l.unit}</td>
    </tr>`
    )
    .join('');

  const html = layout(
    `Order ${params.code} Dispatched`,
    `
    <span class="badge badge-emerald">✓ Dispatched & Fulfilled</span>
    <h2 style="margin: 12px 0 8px; font-size: 18px; color: #0f172a;">Delivery Dispatch & Packing Slip</h2>
    <p>Dear <strong>${params.customerName}</strong>,</p>
    <p>Your order <strong>${params.code}</strong> has been packed and dispatched from our warehouse to <strong>${params.destination}</strong>.</p>
    <table>
      <thead>
        <tr>
          <th scope="col">Item Details</th>
          <th scope="col" style="text-align: right;">Quantity</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="margin-top: 16px; color: #475569;">Thank you for your business. Please inspect your package upon arrival.</p>
    `
  );

  const textRows = params.lines.map((l) => `- ${l.productName} (${l.sku}): ${l.qty} ${l.unit}`).join('\n');
  const text = `[StockSense DISPATCH CONFIRMATION]\nOrder: ${params.code}\nCustomer: ${params.customerName}\nDestination: ${params.destination}\n\nItems Dispatched:\n${textRows}\n\nThank you!`;
  return { html, text };
}

// 4. Goods Receipt Note (GRN) to Vendors
export function goodsReceiptTemplate(params: {
  code: string;
  supplierName: string;
  warehouseName: string;
  lines: Array<{ sku: string; productName: string; expectedQty: number; receivedQty: number; unit: string }>;
}): { html: string; text: string } {
  const rows = params.lines
    .map(
      (l) => `<tr>
      <td><strong>${l.productName}</strong><br><span style="color: #64748b; font-size: 11px;">SKU: ${l.sku}</span></td>
      <td style="text-align: right;">${l.expectedQty} ${l.unit}</td>
      <td style="text-align: right; font-weight: bold; color: #059669;">${l.receivedQty} ${l.unit}</td>
    </tr>`
    )
    .join('');

  const html = layout(
    `Goods Receipt Note: ${params.code}`,
    `
    <span class="badge badge-emerald">✓ Inbound Goods Acknowledged</span>
    <h2 style="margin: 12px 0 8px; font-size: 18px; color: #0f172a;">Goods Receipt Note (GRN)</h2>
    <p>Dear <strong>${params.supplierName}</strong>,</p>
    <p>We confirm that shipment <strong>${params.code}</strong> has been received and verified into stock at <strong>${params.warehouseName}</strong>.</p>
    <table>
      <thead>
        <tr>
          <th scope="col">Product / SKU</th>
          <th scope="col" style="text-align: right;">Expected</th>
          <th scope="col" style="text-align: right;">Received</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="margin-top: 16px; color: #475569;">This note acts as the official warehouse inbound fulfillment acknowledgment.</p>
    `
  );

  const textRows = params.lines
    .map((l) => `- ${l.productName} (${l.sku}): Expected ${l.expectedQty}, Received ${l.receivedQty} ${l.unit}`)
    .join('\n');
  const text = `[StockSense GOODS RECEIPT NOTE]\nReceipt Code: ${params.code}\nSupplier: ${params.supplierName}\nWarehouse: ${params.warehouseName}\n\nReceived Items:\n${textRows}`;
  return { html, text };
}

// 5. Daily Warehouse Shift Digest
export function dailyDigestTemplate(params: {
  date: string;
  totalProducts: number;
  lowStockCount: number;
  pendingReceipts: number;
  pendingDeliveries: number;
  openFlags: number;
}): { html: string; text: string } {
  const html = layout(
    `Daily Warehouse Operations Digest — ${params.date}`,
    `
    <span class="badge badge-emerald">📊 07:30 AM Shift Briefing</span>
    <h2 style="margin: 12px 0 8px; font-size: 18px; color: #0f172a;">Warehouse Morning Operations Digest</h2>
    <p>Here is your daily operational briefing for <strong>${params.date}</strong>:</p>
    
    <table>
      <tbody>
        <tr><td><strong>Total Active SKUs in Stock</strong></td><td style="text-align: right; font-weight: bold;">${params.totalProducts}</td></tr>
        <tr><td><strong>Items at/below Reorder Point</strong></td><td style="text-align: right; font-weight: bold; color: ${params.lowStockCount > 0 ? '#e11d48' : '#059669'};">${params.lowStockCount}</td></tr>
        <tr><td><strong>Expected Inbound Receipts</strong></td><td style="text-align: right; font-weight: bold;">${params.pendingReceipts}</td></tr>
        <tr><td><strong>Pending Outbound Deliveries</strong></td><td style="text-align: right; font-weight: bold;">${params.pendingDeliveries}</td></tr>
        <tr><td><strong>Open Discrepancy Flags</strong></td><td style="text-align: right; font-weight: bold; color: ${params.openFlags > 0 ? '#d97706' : '#059669'};">${params.openFlags}</td></tr>
      </tbody>
    </table>
    
    <p style="margin-top: 16px; color: #475569;">Have a productive shift. Open StockSense to review pending warehouse tasks.</p>
    `
  );

  const text = `[StockSense DAILY OPERATIONS DIGEST]\nDate: ${params.date}\nActive Products: ${params.totalProducts}\nLow Stock Items: ${params.lowStockCount}\nPending Receipts: ${params.pendingReceipts}\nPending Deliveries: ${params.pendingDeliveries}\nOpen Flags: ${params.openFlags}`;
  return { html, text };
}
