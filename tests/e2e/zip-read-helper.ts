/**
 * Lecteur ZIP store minimal pour les tests e2e (sans dépendance).
 */
export function unzipSync(data: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  while (offset + 4 <= data.length) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x02014b50 || sig === 0x06054b50) break; // central / end
    if (sig !== 0x04034b50) break;
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const comp = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameBytes = data.subarray(offset + 30, offset + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const start = offset + 30 + nameLen + extraLen;
    const payload = data.subarray(start, start + size);
    if (comp !== 0) throw new Error(`ZIP compressé non supporté : ${name}`);
    out.set(name, payload.slice());
    offset = start + size;
  }
  return out;
}

export function strFromU8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
