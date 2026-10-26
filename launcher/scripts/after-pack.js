// macOS: appen er ikke signeret med et Apple-certifikat, men Apple Silicon kræver mindst en ad hoc-signatur.
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  // Den universelle app sættes sammen af to midlertidige builds (…-temp). De må ikke signeres hver for sig, ellers kan de ikke slås sammen.
  if (/-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
