import QRCode from 'qrcode';
import jsQR from 'jsqr';
import sharp from 'sharp';

export function generateQrSvg(text: string, options?: { margin?: number }): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const margin = options?.margin ?? 2;
  const totalSize = size + margin * 2;

  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c) === 1) {
        path += `M${c + margin} ${r + margin}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <path d="${path.trim()}" fill="#000000"/>
  </svg>`;
}

async function run() {
  const svg = generateQrSvg('A1-S1');
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(250, 250)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const res = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  console.log('Test decode result:', res?.data);
}

run();
