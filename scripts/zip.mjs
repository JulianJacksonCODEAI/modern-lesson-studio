// Minimal ZIP writer/reader (deflate, forward-slash paths) with no dependencies.
// Windows PowerShell's Compress-Archive writes backslash paths, which some unzip tools and Chrome reject.
import zlib from 'node:zlib';

const dosTime = date =>
  ((date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)) &
  0xffff;
const dosDate = date =>
  (((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()) &
  0xffff;

// entries: [{name:'folder/file.js', data:Buffer}]
export function writeZip(entries, date = new Date()) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const {name, data} of entries) {
    if (name.includes('\\') || name.startsWith('/'))
      throw Error(
        'Zip paths must be relative and use forward slashes: ' + name
      );
    const nameBuf = Buffer.from(name, 'utf8'),
      crc = zlib.crc32(data) >>> 0,
      packed = zlib.deflateRawSync(data, {level: 9});
    const useDeflate = packed.length < data.length,
      body = useDeflate ? packed : data,
      method = useDeflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime(date), 10);
    local.writeUInt16LE(dosDate(date), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime(date), 12);
    central.writeUInt16LE(dosDate(date), 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// Reads every entry back (used by the build to verify the zip it just wrote).
export function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw Error('Not a zip file.');
  const count = buf.readUInt16LE(endAt + 10);
  let at = buf.readUInt32LE(endAt + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50)
      throw Error('Broken zip directory.');
    const method = buf.readUInt16LE(at + 10),
      crc = buf.readUInt32LE(at + 16),
      size = buf.readUInt32LE(at + 20),
      nameLen = buf.readUInt16LE(at + 28),
      extra = buf.readUInt16LE(at + 30),
      comment = buf.readUInt16LE(at + 32),
      local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen),
      dataAt =
        local +
        30 +
        buf.readUInt16LE(local + 26) +
        buf.readUInt16LE(local + 28);
    const body = buf.subarray(dataAt, dataAt + size),
      data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    if (zlib.crc32(data) >>> 0 !== crc)
      throw Error('Zip entry failed its checksum: ' + name);
    out.push({name, data});
    at += 46 + nameLen + extra + comment;
  }
  return out;
}
