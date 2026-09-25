/** PNG RGBA 8 bits, sans dépendance. Sert à embarquer les carreaux dans le projet. */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function asBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(data.byteLength);
  const bytes = new Uint8Array(copy);
  bytes.set(data);
  return bytes;
}

async function pipe(stream: CompressionStream | DecompressionStream, data: Uint8Array): Promise<Uint8Array> {
  const output = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(asBytes(data));
  await writer.close();
  return new Uint8Array(await output);
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  return pipe(new CompressionStream('deflate'), data);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  return pipe(new DecompressionStream('deflate'), data);
}

export async function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  if (width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new Error('Image PNG invalide.');
  }
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1);
    raw[start] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), start + 1);
  }
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const compressed = await deflate(raw);
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

export async function decodePng(png: Uint8Array): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  if (png.length < 8 || !SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error('Le carreau embarqué n’est pas un PNG.');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= png.length) {
    const view = new DataView(png.buffer, png.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const type = String.fromCharCode(png[offset + 4] ?? 0, png[offset + 5] ?? 0, png[offset + 6] ?? 0, png[offset + 7] ?? 0);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) throw new Error('PNG tronqué.');
    const data = png.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('Le PNG du projet doit être en couleurs RGBA 8 bits.');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (width < 1 || height < 1 || idat.length === 0) throw new Error('PNG incomplet.');
  const compressed = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of idat) {
    compressed.set(part, cursor);
    cursor += part.length;
  }
  const raw = await inflate(compressed);
  const expected = (width * 4 + 1) * height;
  if (raw.length < expected) throw new Error('Données PNG trop courtes.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width * 4 + 1)];
    if (filter !== 0) throw new Error('Filtre PNG non pris en charge.');
    const start = y * (width * 4 + 1) + 1;
    rgba.set(raw.subarray(start, start + width * 4), y * width * 4);
  }
  return { width, height, rgba };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
