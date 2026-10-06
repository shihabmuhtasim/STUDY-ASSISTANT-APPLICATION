import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:['/Users/shihab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}));
const root=process.cwd();
const bundle=await build({bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {PDFViewer} from './src/components/PDFViewer';import {prepareChatAttachment} from './src/utils/chatAttachments';import {PDFDocument,StandardFonts} from 'pdf-lib';
const noop=()=>{};
async function boot(){const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([600,500]).drawText('Selectable PDF text: this entire sentence can be copied.',{x:40,y:350,size:18,font});const bytes=await pdf.save();const file=new Blob([bytes]);
window.attachTest=async()=>{const p=await prepareChatAttachment(new File([bytes],'slide.pdf',{type:'application/pdf'}));const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,100,100);const png=await new Promise(resolve=>canvas.toBlob(resolve));const i=await prepareChatAttachment(new File([png],'diagram.png',{type:'image/png'}));return {pdf:p.images.length,image:i.images.length,data:i.images[0]};};
function App(){const [strokes,setStrokes]=useState([]);window.strokes=strokes;return <div style={{height:750}}><PDFViewer file={file} pageNumber={1} setPageNumber={noop} onPageRenderSuccess={image=>window.pageImage=image} onPageTextReady={noop} onDocumentContextReady={noop} onDocumentPagesReady={noop} onDocumentContextLoadingChange={noop} onDocumentContextProgress={noop} onDocumentLoaded={noop} annotations={strokes} onAnnotationsChange={setStrokes}/></div>;}createRoot(document.getElementById('root')).render(<App/>);}boot();`},define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss');
const css=(await postcss([tailwind({base:root})]).process(await readFile(root+'/app/globals.css','utf8'),{from:root+'/app/globals.css'})).css+await readFile(root+'/node_modules/react-pdf/dist/Page/TextLayer.css','utf8');
const worker=await readFile(root+'/public/pdf.worker.min.mjs');
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'||req.url==='/pdf.worker.min.mjs'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:req.url==='/pdf.worker.min.mjs'?worker:'<html><style>'+css+'</style><div id="root"></div><script src="/app.js"></script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1200,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.pageImage);
const span=page.locator('.react-pdf__Page__textContent span').first();const bounds=await span.boundingBox();await page.mouse.move(bounds.x+1,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width-2,bounds.y+bounds.height/2,{steps:20});await page.mouse.up();assert.match(await page.evaluate(()=>window.getSelection().toString()),/Selectable PDF text/);
const attachment=await page.evaluate(()=>window.attachTest());assert.equal(attachment.pdf,1);assert.equal(attachment.image,1);assert.match(attachment.data,/data:image\/jpeg;base64/);
await page.getByTitle('Draw on PDF',{exact:true}).click();await page.getByTitle('Highlighter',{exact:true}).click();await page.getByLabel('Highlighter width').fill('60');const canvas=page.locator('canvas').last();const b=await canvas.boundingBox();await page.mouse.move(b.x+50,b.y+100);await page.mouse.down();await page.mouse.move(b.x+250,b.y+100,{steps:10});await page.mouse.up();assert.equal(await page.evaluate(()=>window.strokes[0].width),.06);await page.screenshot({path:'/private/tmp/pdf-vision-ui-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/pdf-vision-ui-mobile.png'});assert.deepEqual(errors,[]);console.log('PASS: native PDF text selection, PDF/image attachment rendering, page image capture, adjustable highlighter width, desktop/mobile rendering.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
