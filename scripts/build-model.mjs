#!/usr/bin/env node
/**
 * Builds the on-device speech model served at public/models/ (see docs/decisions/0001-offline-asr.md).
 *
 * 1. Download the upstream Vosk small English model zip (pinned by SHA-256; cached in .cache/).
 * 2. Replace graph/Gr.fst (the 24 MB general language model) with a one-state stub that keeps
 *    its word symbol tables. Cadence always decodes with a per-script grammar, which Vosk
 *    compiles against HCLr.fst + the word table, so the LM itself is never used.
 * 3. Write a deterministic .tar.gz (sorted entries, fixed mtime, gzip without a timestamp) and a
 *    manifest with its size and SHA-256, which the app checks after downloading.
 *
 * Usage: node scripts/build-model.mjs   (no dependencies; Node ≥ 20)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = {
  url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
  sha256: '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498',
  dir: 'vosk-model-small-en-us-0.15',
};
/** Keep in sync with MODEL_INFO.file in src/engines/offline/model.ts. */
const OUT_NAME = 'vosk-small-en-us-0.15-lite';
const OUT_DIR = join(ROOT, 'public', 'models');
const CACHE = join(ROOT, '.cache', 'models');
/**
 * A .tar.gz, but not named one: static servers (sirv/vite preview, some CDNs) label `.gz` files
 * `Content-Encoding: gzip`, so the browser would hand us the inflated tar and the hash check
 * fails. vosk-browser detects gzip from the bytes, not the name.
 */
const ARCHIVE_EXT = '.tar.gz.bin';
/** Fixed mtime for reproducible archives (2020-01-01). */
const MTIME = 1577836800;
/** Files the browser build doesn't need. */
const DROP = new Set(['README']);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function fetchUpstream() {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, UPSTREAM.dir + '.zip');
  if (!existsSync(path)) {
    console.log(`Downloading ${UPSTREAM.url}`);
    const res = await fetch(UPSTREAM.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${UPSTREAM.url}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const buf = readFileSync(path);
  const got = sha256(buf);
  if (got !== UPSTREAM.sha256) {
    throw new Error(
      `Upstream checksum mismatch: ${got} (expected ${UPSTREAM.sha256}). Delete ${path} to retry.`,
    );
  }
  return buf;
}

/** Minimal zip reader (central directory; stored or deflated entries). */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else throw new Error(`Unsupported zip method ${method} for ${name}`);
  }
  return files;
}

/**
 * OpenFst binary: header, then input/output symbol tables (flags bits 0/1), then the body.
 * Returns a VectorFst with one final start state, no arcs, and the original symbol tables.
 */
function stubFst(src) {
  const FST_MAGIC = 2125659606;
  const SYM_MAGIC = 2125658996;
  let off = 0;
  const i32 = () => ((off += 4), src.readInt32LE(off - 4));
  const i64 = () => ((off += 8), Number(src.readBigInt64LE(off - 8)));
  const str = () => {
    const n = i32();
    off += n;
    return src.subarray(off - n, off);
  };
  if (i32() !== FST_MAGIC) throw new Error('Gr.fst: bad magic');
  str(); // fst type
  const arcType = str();
  i32(); // version
  const flags = i32();
  off += 8 + 8 * 3; // properties, start, numstates, numarcs
  if ((flags & 3) !== 3) throw new Error('Gr.fst: expected input and output symbol tables');
  const symStart = off;
  for (let t = 0; t < 2; t++) {
    if (i32() !== SYM_MAGIC) throw new Error('Gr.fst: bad symbol table');
    str();
    i64();
    const size = i64();
    for (let k = 0; k < size; k++) {
      str();
      i64();
    }
  }
  const syms = src.subarray(symStart, off);
  const wstr = (b) => {
    const len = Buffer.alloc(4);
    len.writeInt32LE(b.length);
    return Buffer.concat([len, b]);
  };
  const K_EXPANDED_MUTABLE = 0x3n;
  let h = 0;
  const tail = Buffer.alloc(4 + 4 + 8 + 24);
  tail.writeInt32LE(2, h); // VectorFst version
  tail.writeInt32LE(3, (h += 4)); // flags: both symbol tables
  tail.writeBigUInt64LE(K_EXPANDED_MUTABLE, (h += 4));
  tail.writeBigInt64LE(0n, (h += 8)); // start
  tail.writeBigInt64LE(1n, (h += 8)); // numstates
  tail.writeBigInt64LE(0n, (h += 8)); // numarcs
  const magic = Buffer.alloc(4);
  magic.writeInt32LE(FST_MAGIC);
  const state = Buffer.alloc(12);
  state.writeFloatLE(0, 0); // final weight One (tropical)
  state.writeBigInt64LE(0n, 4); // no arcs
  return Buffer.concat([magic, wstr(Buffer.from('vector')), wstr(arcType), tail, syms, state]);
}

/** Deterministic ustar archive. */
function tar(entries) {
  const blocks = [];
  const octal = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  const header = (name, size, type) => {
    const b = Buffer.alloc(512);
    if (Buffer.byteLength(name) > 100) throw new Error(`tar: name too long: ${name}`);
    b.write(name, 0);
    b.write(octal(type === '5' ? 0o755 : 0o644, 8), 100);
    b.write(octal(0, 8), 108);
    b.write(octal(0, 8), 116);
    b.write(octal(size, 12), 124);
    b.write(octal(MTIME, 12), 136);
    b.write('        ', 148);
    b.write(type, 156);
    b.write('ustar\0' + '00', 257);
    let sum = 0;
    for (const x of b) sum += x;
    b.write(octal(sum, 7) + ' ', 148);
    return b;
  };
  const dirs = new Set();
  for (const [name] of entries) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/');
  }
  const all = [...[...dirs].map((d) => [d, null]), ...entries].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  );
  for (const [name, data] of all) {
    if (data === null) {
      blocks.push(header(name, 0, '5'));
      continue;
    }
    blocks.push(header(name, data.length, '0'), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

const files = unzip(await fetchUpstream());
const entries = [];
for (const [name, data] of files) {
  const base = name.split('/').pop();
  if (DROP.has(base)) continue;
  entries.push([name, name.endsWith('/graph/Gr.fst') ? stubFst(data) : data]);
}
if (!entries.some(([n]) => n.endsWith('/graph/Gr.fst'))) throw new Error('Gr.fst not found');
const archive = gzipSync(tar(entries), { level: 9 });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, OUT_NAME + ARCHIVE_EXT), archive);
const manifest = { file: OUT_NAME + ARCHIVE_EXT, bytes: archive.length, sha256: sha256(archive) };
writeFileSync(join(OUT_DIR, OUT_NAME + '.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Wrote public/models/${manifest.file}: ${(manifest.bytes / 1e6).toFixed(1)} MB, sha256 ${manifest.sha256}`,
);
