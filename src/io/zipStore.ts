/**
 * ZIP non compressé (store) — sans dépendance, pour le mode téléchargement admin.
 */
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

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

export interface ZipEntry {
  path: string;
  data: Uint8Array | string;
}

function asBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return data;
}

/** Construit un .zip (méthode store) prêt à télécharger. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path.replace(/\\/g, '/'));
    const data = asBytes(entry.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    local.set([0x50, 0x4b, 0x03, 0x04], 0);
    local.set(u16(20), 4);
    local.set(u16(0), 6);
    local.set(u16(0), 8);
    local.set(u16(0), 10);
    local.set(u16(0), 12);
    local.set(u32(crc), 14);
    local.set(u32(data.length), 18);
    local.set(u32(data.length), 22);
    local.set(u16(name.length), 26);
    local.set(u16(0), 28);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    central.set([0x50, 0x4b, 0x01, 0x02], 0);
    central.set(u16(20), 4);
    central.set(u16(20), 6);
    central.set(u16(0), 8);
    central.set(u16(0), 10);
    central.set(u16(0), 12);
    central.set(u16(0), 14);
    central.set(u32(crc), 16);
    central.set(u32(data.length), 20);
    central.set(u32(data.length), 24);
    central.set(u16(name.length), 28);
    central.set(u16(0), 30);
    central.set(u16(0), 32);
    central.set(u16(0), 34);
    central.set(u16(0), 36);
    central.set(u32(0), 38);
    central.set(u32(offset), 42);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  end.set([0x50, 0x4b, 0x05, 0x06], 0);
  end.set(u16(0), 4);
  end.set(u16(0), 6);
  end.set(u16(entries.length), 8);
  end.set(u16(entries.length), 10);
  end.set(u32(centralSize), 12);
  end.set(u32(offset), 16);
  end.set(u16(0), 20);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of locals) {
    out.set(part, o);
    o += part.length;
  }
  for (const part of centrals) {
    out.set(part, o);
    o += part.length;
  }
  out.set(end, o);
  return out;
}
