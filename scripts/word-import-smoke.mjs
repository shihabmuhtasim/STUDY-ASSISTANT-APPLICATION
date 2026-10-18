import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import './prepare-word-renderer.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/shihab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const zip = new JSZip();
zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
zip.file('word/settings.xml', '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/></w:settings>');
zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="3277AA"/><w:sz w:val="36"/><w:highlight w:val="yellow"/></w:rPr><w:t>Formatted Word heading</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="180" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/></w:rPr><w:t>Normal text retains its font, spacing, and readable wrapping.</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="24"/><w:highlight w:val="yellow"/></w:rPr><w:t>A highlighted sentence wraps naturally without covering adjacent lines. This deliberately longer passage checks that highlighting follows the text rather than becoming a giant rectangular block across the page.</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:insideV w:val="single" w:sz="8"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Left table cell</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Right table cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:r><w:t>Second page after an explicit page break.</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
const fixture = await zip.generateAsync({ type: 'nodebuffer' });
const bundle = await build({ bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, stdin: { resolveDir: process.cwd(), contents: `
import {prepareStudyFile} from './src/utils/documentImport';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
window.convert=async()=>{
 const bytes=await (await fetch('/fixture.docx')).arrayBuffer();
 const prepared=await prepareStudyFile(new File([bytes],'formatted.docx'));
 const pdf=await getDocument({data:await prepared.fileData.arrayBuffer()}).promise;
 const page=await pdf.getPage(1),viewport=page.getViewport({scale:1});
 const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
 await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
 document.body.replaceChildren(canvas);
 const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 let yellow=0,ink=0,firstYellow=Infinity,firstBlue=Infinity;for(let i=0;i<pixels.length;i+=4){const y=Math.floor(i/4/canvas.width);if(pixels[i]>210&&pixels[i+1]>210&&pixels[i+2]<80){yellow++;firstYellow=Math.min(firstYellow,y);}if(pixels[i]<100&&pixels[i+1]<150&&pixels[i+2]<180)ink++;if(pixels[i]<120&&pixels[i+2]>pixels[i]+35&&pixels[i+1]>70)firstBlue=Math.min(firstBlue,y);}
 return {pages:pdf.numPages,width:viewport.width,height:viewport.height,yellow,ink,highlightOffset:firstBlue-firstYellow,text:(await page.getTextContent()).items.map(i=>i.str).join(' '),frames:document.querySelectorAll('iframe').length};
};` }, logLevel: 'silent' });
const worker = await readFile('public/pdf.worker.min.mjs');
const renderer = await readFile('public/word-renderer.js');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', /\.m?js(?:\?|$)/.test(req.url) ? 'text/javascript; charset=utf-8' : req.url.endsWith('.docx') ? 'application/octet-stream' : 'text/html; charset=utf-8');
  res.end(req.url.startsWith('/word-renderer.js') ? renderer : req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/fixture.docx' ? fixture : req.url === '/pdf.worker.min.mjs' ? worker : '<html><style>body{color:white;background:black;font-family:monospace}*{line-height:3}p{font-size:40px}span{letter-spacing:5px}img{display:block;max-width:100%}</style><script src="/app.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  page.on('console', message => console.log('browser:', message.text()));
  page.on('pageerror', error => console.log('browser error:', error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => window.convert);
  const result = await Promise.race([page.evaluate(() => window.convert()), new Promise((_, reject) => setTimeout(() => reject(new Error('Word conversion exceeded 45 seconds')), 45000).unref())]);
  console.log(result);
  await page.screenshot({ path: '/private/tmp/word-import-proof.png' });
  assert.equal(result.pages, 2);
  assert.ok(Math.abs(result.width - 612) < 1);
  assert.ok(Math.abs(result.height - 792) < 1);
  assert.ok(result.yellow > 1000 && result.yellow < 22000, 'Highlights must be visible without giant blocks');
  assert.ok(result.ink > 1500, 'Text must remain visible under hostile app styles');
  assert.ok(result.highlightOffset >= 0 && result.highlightOffset < 10, 'Heading highlight must align with its text, not float above it');
  assert.match(result.text, /Normal text retains/);
  assert.match(result.text, /Right table cell/);
  assert.equal(result.frames, 0);
  await page.screenshot({ path: '/private/tmp/word-import-proof.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForFunction(() => window.convert);
  const mobile = await page.evaluate(() => window.convert());
  assert.equal(mobile.pages, result.pages);
  assert.equal(mobile.width, result.width);
  assert.equal(mobile.yellow, result.yellow);
  console.log('PASS: Word typography/highlights isolated from app styles, correct physical page dimensions, explicit pagination, table text, mobile consistency, and conversion cleanup.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
