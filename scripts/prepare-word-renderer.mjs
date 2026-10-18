import { build } from 'esbuild';

// A separate browser context prevents app CSS and global DOM lookups from
// interfering with Word pagination, fonts, and canvas overlays.
await build({
  stdin: {
    contents: "export {render} from 'docx-renderer'; export {createMsDocViewer} from 'msdoc-viewer';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'StudyWordRenderer',
  minify: true,
  outfile: 'public/word-renderer.js',
  alias: { konva: 'konva/lib/index.js' },
});
