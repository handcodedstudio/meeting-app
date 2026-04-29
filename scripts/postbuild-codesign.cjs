// electron-builder afterPack hook. Walks the bundled Python tree and ad-hoc-signs
// every Mach-O so unsigned dev builds run under hardenedRuntime, and so signed
// builds get every binary covered (electron-builder otherwise misses *.so/*.dylib
// and bin/python).
//
// When CSC_LINK / CSC_NAME is set, electron-builder picks up the identity
// automatically — we just re-sign with --deep --force to make sure all
// transitive Mach-Os are covered.

const { spawnSync } = require('node:child_process');
const { existsSync, statSync, readdirSync } = require('node:fs');
const { join, extname } = require('node:path');

const MACHO_MAGIC = Buffer.from([0xcf, 0xfa, 0xed, 0xfe]);
const MACHO_MAGIC_BE = Buffer.from([0xfe, 0xed, 0xfa, 0xcf]);
const MACHO_MAGIC_FAT = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);

function isMachO(file) {
  try {
    const fs = require('node:fs');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return (
      buf.equals(MACHO_MAGIC) ||
      buf.equals(MACHO_MAGIC_BE) ||
      buf.equals(MACHO_MAGIC_FAT)
    );
  } catch {
    return false;
  }
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function sign(path, identity, entitlements) {
  const args = ['--force', '--timestamp=none', '--options', 'runtime'];
  if (entitlements) args.push('--entitlements', entitlements);
  args.push('--sign', identity, path);
  const r = spawnSync('codesign', args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`codesign failed for ${path} (exit ${r.status})`);
  }
}

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin') return;
  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productName;
  const appPath = join(appOutDir, `${productName}.app`);
  const pythonRoot = join(appPath, 'Contents', 'Resources', 'python');
  if (!existsSync(pythonRoot)) {
    console.log('[postbuild-codesign] no bundled python at', pythonRoot, '— skipping.');
    return;
  }

  const identity = process.env.CSC_NAME || process.env.APPLE_SIGNING_IDENTITY || '-';
  const entitlements = join(__dirname, '..', 'build', 'entitlements.mac.plist');
  console.log(`[postbuild-codesign] signing python tree under ${pythonRoot} with identity "${identity}"`);

  const machos = [];
  for (const file of walk(pythonRoot)) {
    const ext = extname(file);
    if (ext === '.py' || ext === '.pyc' || ext === '.txt' || ext === '.md') continue;
    if (statSync(file).size < 4) continue;
    if (isMachO(file)) machos.push(file);
  }

  // Sign deepest first so containers re-seal correctly.
  machos.sort((a, b) => b.length - a.length);
  for (const m of machos) {
    sign(m, identity, existsSync(entitlements) ? entitlements : undefined);
  }
  console.log(`[postbuild-codesign] signed ${machos.length} Mach-O files.`);
};
