/**
 * Minimal Android binary XML (AXML) decoder.
 *
 * Used to inspect the MERGED AndroidManifest.xml that actually ships inside the
 * APK, rather than trusting the patched source manifest. Pure JS so the build
 * gate works without aapt / Android SDK build-tools on PATH.
 *
 * Returns a flat list of elements: { name, attrs: { "android:name": "..." }, path }
 */

const CHUNK_STRING_POOL = 0x001c0001;
const CHUNK_RESOURCE_MAP = 0x00080180;
const CHUNK_START_TAG = 0x00100102;
const CHUNK_END_TAG = 0x00100103;

const TYPE_STRING = 0x03;
const TYPE_INT_BOOLEAN = 0x12;

// Framework attr resource ids we care about when aapt2 blanks the name string.
const ATTR_IDS = {
  0x01010003: "name",
  0x01010010: "exported",
  0x0101000e: "enabled",
  0x01010006: "permission",
  0x01010011: "process",
  0x0101055f: "directBootAware",
  0x01010001: "label",
  0x01010002: "icon",
};


function readStringPool(buf, off) {
  const chunkSize = buf.readUInt32LE(off + 4);
  const stringCount = buf.readUInt32LE(off + 8);
  const flags = buf.readUInt32LE(off + 16);
  const stringsStart = buf.readUInt32LE(off + 20);
  const isUtf8 = (flags & 0x100) !== 0;
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const strOff = off + stringsStart + buf.readUInt32LE(off + 28 + i * 4);
    if (isUtf8) {
      // u8 char-count (possibly 2 bytes), then u8 byte-length (possibly 2 bytes)
      let p = strOff;
      let n = buf[p++];
      if (n & 0x80) n = ((n & 0x7f) << 8) | buf[p++];
      let len = buf[p++];
      if (len & 0x80) len = ((len & 0x7f) << 8) | buf[p++];
      strings.push(buf.slice(p, p + len).toString("utf8"));
    } else {
      let p = strOff;
      let len = buf.readUInt16LE(p);
      p += 2;
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p);
        p += 2;
      }
      strings.push(buf.slice(p, p + len * 2).toString("utf16le"));
    }
  }
  return { strings, chunkSize };
}

export function decodeAxml(buf) {
  if (buf.length < 8) throw new Error("AXML too short");
  let off = 8; // file header
  let strings = null;
  let resourceMap = null;

  const elements = [];
  const stack = [];

  const str = (i) => (i === 0xffffffff || i < 0 ? null : (strings?.[i] ?? null));

  while (off + 8 <= buf.length) {
    const type = buf.readUInt32LE(off) & 0xffffffff;
    const chunkType = buf.readUInt16LE(off);
    const chunkSize = buf.readUInt32LE(off + 4);
    if (chunkSize <= 0) break;

    if (type === CHUNK_STRING_POOL || chunkType === 0x0001) {
      const pool = readStringPool(buf, off);
      strings = pool.strings;
    } else if (type === CHUNK_RESOURCE_MAP) {
      resourceMap = [];
      for (let p = off + 8; p + 4 <= off + chunkSize; p += 4) resourceMap.push(buf.readUInt32LE(p));
    } else if (type === CHUNK_START_TAG) {
      const nameIdx = buf.readUInt32LE(off + 20);
      const attrStart = buf.readUInt16LE(off + 24);
      const attrSize = buf.readUInt16LE(off + 26);
      const attrCount = buf.readUInt16LE(off + 28);
      const name = str(nameIdx);
      const attrs = {};
      for (let i = 0; i < attrCount; i++) {
        const a = off + attrStart + i * attrSize;
        const nsIdx = buf.readUInt32LE(a);
        const aNameIdx = buf.readUInt32LE(a + 4);
        const rawIdx = buf.readUInt32LE(a + 8);
        const dataType = buf[a + 15];
        const data = buf.readUInt32LE(a + 16);
        const ns = str(nsIdx);
        const prefix = ns && ns.includes("android") ? "android:" : ns ? "ns:" : "";
        // aapt2 usually emits EMPTY attribute-name strings and resolves them
        // through the resource map (attr resource id -> framework attr name).
        let localName = str(aNameIdx) || "";
        if (!localName) {
          const resId = resourceMap?.[aNameIdx];
          localName = (resId != null && ATTR_IDS[resId]) || (resId != null ? `attr:0x${resId.toString(16)}` : "");
        }
        const aName = `${prefix}${localName}`;

        let value;
        if (rawIdx !== 0xffffffff && str(rawIdx) != null) value = str(rawIdx);
        else if (dataType === TYPE_STRING) value = str(data);
        else if (dataType === TYPE_INT_BOOLEAN) value = data !== 0 ? "true" : "false";
        else value = String(data);
        attrs[aName] = value;
      }
      stack.push(name);
      elements.push({ name, attrs, path: stack.join("/") });
    } else if (type === CHUNK_END_TAG) {
      stack.pop();
    }
    off += chunkSize;
  }

  if (!strings) throw new Error("AXML string pool not found");
  return elements;
}
