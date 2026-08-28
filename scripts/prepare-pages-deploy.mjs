import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
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
await writeFile(join(outputDir, '_worker.js'), `import app from './_server/index.js';

export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    const isStaticAsset = pathname.startsWith('/assets/')
      || pathname === '/pdf.worker.min.mjs'
      || pathname === '/vinext-client-entry-manifest.json';

    if (isStaticAsset && env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    }

    return app.fetch(request, env, context);
  },
};
`);

console.log(`Prepared Cloudflare Pages bundle at ${outputDir}`);
