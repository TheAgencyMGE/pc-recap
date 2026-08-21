import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ZIP32_LIMIT = 0xffffffff;
const ZIP_ENTRY_LIMIT = 0xffff;
const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const DOS_TIME = 0;
const DOS_DATE = 33; // 1980-01-01, making archives deterministic across machines.

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(contents) {
  let value = 0xffffffff;
  for (const byte of contents) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

async function collectFiles(root, directory = root) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, absolutePath));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        archivePath: relative(root, absolutePath).split(sep).join('/'),
      });
    } else {
      throw new Error(`Unsupported website entry: ${absolutePath}`);
    }
  }
  return files.sort((left, right) => left.archivePath.localeCompare(right.archivePath));
}

function assertZip32(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP32_LIMIT) {
    throw new Error(`${label} exceeds the ZIP32 archive limit.`);
  }
}

export async function createZipFromDirectory(sourceDirectory, destinationPath) {
  const files = await collectFiles(sourceDirectory);
  if (files.length > ZIP_ENTRY_LIMIT) throw new Error('Website contains too many files for a ZIP32 archive.');

  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;

  for (const file of files) {
    const contents = await readFile(file.absolutePath);
    const compressed = deflateRawSync(contents, { level: 9 });
    const name = Buffer.from(file.archivePath, 'utf8');
    const checksum = crc32(contents);
    assertZip32(contents.length, `${file.archivePath} uncompressed size`);
    assertZip32(compressed.length, `${file.archivePath} compressed size`);
    assertZip32(localOffset, `${file.archivePath} local offset`);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(DEFLATE_METHOD, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(DEFLATE_METHOD, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralChunks.push(centralHeader, name);

    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  assertZip32(localOffset, 'Central directory offset');
  assertZip32(centralDirectory.length, 'Central directory size');

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, Buffer.concat([...localChunks, centralDirectory, end]));
  return { files: files.length };
}
