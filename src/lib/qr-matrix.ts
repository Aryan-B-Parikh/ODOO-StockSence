/**
 * StockSense — standard ISO/IEC 18004 QR code generation.
 * Generates real, scannable QR codes that camera optical decoders (jsQR, ZXing, iOS Safari, Android)
 * can instantly detect and decode.
 */

import QRCode from 'qrcode'

export interface QrCodeResult {
  size: number
  cells: boolean[]
}

/**
 * Generate a standard QR code matrix.
 * Returns an array of booleans (true = dark module, false = light module)
 * along with the matrix size (e.g. 21x21 for Version 1).
 */
export function generateQrCode(text: string): QrCodeResult {
  try {
    const qr = QRCode.create(text || 'WH', { errorCorrectionLevel: 'M' })
    const size = qr.modules.size
    const cells: boolean[] = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        cells.push(qr.modules.get(r, c) === 1)
      }
    }
    return { size, cells }
  } catch (err) {
    console.error('Failed to generate QR code for:', text, err)
    return { size: 21, cells: new Array(441).fill(false) }
  }
}

/**
 * Legacy compatibility export: returns boolean[] matrix.
 */
export function generateQrMatrix(seed: string): boolean[] {
  return generateQrCode(seed).cells
}

/**
 * Generate a complete, high-contrast, scalable SVG QR Code with quiet-zone margin.
 * Compatible with both web display and print sheets.
 */
export function generateQrSvg(
  text: string,
  options?: { margin?: number; fg?: string; bg?: string }
): string {
  try {
    const qr = QRCode.create(text || 'WH', { errorCorrectionLevel: 'M' })
    const size = qr.modules.size
    const margin = options?.margin ?? 2
    const fg = options?.fg ?? '#000000'
    const bg = options?.bg ?? '#ffffff'
    const totalSize = size + margin * 2

    let path = ''
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (qr.modules.get(r, c) === 1) {
          path += `M${c + margin} ${r + margin}h1v1h-1z `
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" width="100%" height="100%">
      <rect width="100%" height="100%" fill="${bg}"/>
      <path d="${path.trim()}" fill="${fg}"/>
    </svg>`
  } catch {
    return ''
  }
}

export const QR_SIZE = 21
