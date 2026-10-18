import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = join(root, 'dist', 'client');
const serverDir = join(root, 'dist', 'server');
const outputDir = join(root, 'dist', 'pages');

// Vinext writes a Worker deploy redirect during build. Pages must use the
// repository's Pages config so production bindings (including Workers AI) apply.
await rm(join(root, '.wrangler', 'deploy', 'config.json'), { force: true });
await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, '_server'), { recursive: true });
await cp(clientDir, outputDir, { recursive: true });
await cp(serverDir, join(outputDir, '_server'), { recursive: true });
const security = await transform(await readFile(join(root, 'server/securityHeaders.ts'), 'utf8'), { loader: 'ts', format: 'esm' });
await writeFile(join(outputDir, '_security.js'), security.code);
await writeFile(join(outputDir, '_worker.js'), `import app from './_server/index.js';
import { secureResponse } from './_security.js';

export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    const isStaticAsset = pathname.startsWith('/assets/')
      || pathname === '/pdf.worker.min.mjs'
      || pathname === '/vinext-client-entry-manifest.json';

    if (isStaticAsset && env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return secureResponse(request, response);
    }

    try { return secureResponse(request, await app.fetch(request, env, context)); }
    catch { return secureResponse(request, Response.json({ error: 'The service is temporarily unavailable. Please retry shortly.' }, { status: 503 })); }
  },
};
`);

console.log(`Prepared Cloudflare Pages bundle at ${outputDir}`);
