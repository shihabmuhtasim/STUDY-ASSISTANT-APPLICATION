import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/shihab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const root = process.cwd();
const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{Library}from'./src/components/Library';import{StudyInterface}from'./src/components/StudyInterface';import{PDFDocument,StandardFonts}from'pdf-lib';
const noop=()=>{};
async function boot(){const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);for(let n=1;n<=3;n++)pdf.addPage([500,650]).drawText('Study page '+n,{x:50,y:550,size:20,font});const fileData=new Blob([await pdf.save()]);
const docs=[{id:'algebra',title:'Algebra lecture',fileData,totalPages:3,createdAt:1,updatedAt:2},{id:'biology',title:'Biology notes',fileData,totalPages:3,createdAt:1,updatedAt:1,folderId:'science'}];
function App(){const[documents,setDocuments]=useState(docs),[folders,setFolders]=useState([{id:'science',name:'Science',createdAt:1},{id:'math',name:'Mathematics',createdAt:2}]),[current,setCurrent]=useState(null);window.documents=documents;window.folders=folders;window.current=current;window.openNotebook=()=>{setCurrent(null);setTimeout(()=>setCurrent({...docs[0],id:'notebook',kind:'notebook'}),0);};
return current?<div style={{height:'100vh'}}><StudyInterface document={current} onBack={()=>setCurrent(null)} account={null} onAccountChange={noop} onUpdateDocument={setCurrent} onStudyModeChange={noop} onUpgrade={noop} onCreateEditedDocument={async(next)=>setCurrent(next)}/></div>:<Library documents={documents} folders={folders} onOpenDocument={setCurrent} onAddDocument={async()=>{}} onDeleteDocument={id=>setDocuments(items=>items.filter(d=>d.id!==id))} onUpdateDocument={doc=>setDocuments(items=>items.map(d=>d.id===doc.id?doc:d))} onCreateFolder={async name=>setFolders(items=>[...items,{id:name.toLowerCase(),name,createdAt:3}])} onRenameFolder={async(id,name)=>setFolders(items=>items.map(f=>f.id===id?{...f,name}:f))} onDeleteFolder={async id=>{setFolders(items=>items.filter(f=>f.id!==id));setDocuments(items=>items.map(d=>d.folderId===id?{...d,folderId:undefined}:d));}} account={{userId:'tester',displayName:'Student'}} onRequireAuth={noop} driveConnected={false} driveLinked={false} driveBusy={false} onConnectDrive={noop} onDisconnectDrive={noop} focusRequest={0}/>;
}createRoot(document.getElementById('root')).render(<App/>);}boot();` }, plugins: [{ name: 'mock-cloud', setup(b) {
  b.onLoad({ filter: /services\/cloudData\.ts$/ }, () => ({ loader: 'js', contents: 'export async function loadCloudWorkspace(){return {notes:{},annotations:{}}};export async function saveCloudPage(){};export async function loadCloudVoiceJobs(){return []};export async function saveCloudVoiceJob(){};export async function loadCloudPreferences(){return null};export async function saveCloudPreferences(){}' }));
  b.onLoad({ filter: /services\/auth\.ts$/ }, () => ({ loader: 'js', contents: 'export const firebaseAuth={currentUser:null}' }));
} }], logLevel: 'silent' });
const css = (await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(await readFile('app/globals.css', 'utf8'), { from: root + '/app/globals.css' })).css + await readFile('node_modules/react-pdf/dist/Page/TextLayer.css', 'utf8') + await readFile('node_modules/react-pdf/dist/Page/AnnotationLayer.css', 'utf8');
const worker = await readFile('public/pdf.worker.min.mjs');
const server = createServer((req, res) => {
  res.setHeader('content-type', req.url.endsWith('.js') || req.url.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/pdf.worker.min.mjs' ? worker : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.log('Browser error:', error.message); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const articles = page.locator('#notemydoc-library article');
  await articles.first().waitFor();
  assert.equal(await articles.count(), 2);
  await page.getByRole('tab', { name: 'Organize', exact: true }).click();
  assert.equal(await articles.count(), 1);
  await page.getByRole('button', { name: 'Drag Algebra lecture', exact: true }).dragTo(page.locator('[data-folder-id="math"]'));
  await page.waitForFunction(() => window.documents.find(d => d.id === 'algebra').folderId === 'math');
  await page.getByRole('button', { name: 'Open folder Mathematics', exact: true }).click();
  assert.equal(await articles.count(), 1);
  await page.getByLabel('Move Algebra lecture to folder').selectOption('science');
  assert.equal(await articles.count(), 0);
  await page.getByRole('button', { name: 'Open folder Science', exact: true }).click();
  assert.equal(await articles.count(), 2);
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('Revision');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Open folder Revision', exact: true }).waitFor();
  page.once('dialog', dialog => dialog.accept('Exam revision'));
  await page.getByRole('button', { name: 'Rename Revision', exact: true }).click();
  await page.getByRole('button', { name: 'Open folder Exam revision', exact: true }).waitFor();
  await page.screenshot({ path: '/private/tmp/organizer-desktop.png', fullPage: true });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.waitForTimeout(250);
  await page.locator('#notemydoc-library').screenshot({ path: '/private/tmp/organizer-dark.png' });
  await page.evaluate(() => delete document.documentElement.dataset.theme);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete Science', exact: true }).click();
  await page.getByRole('tab', { name: /All documents/ }).click();
  assert.equal(await articles.count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Organize', exact: true }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#notemydoc-library').screenshot({ path: '/private/tmp/organizer-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.getByRole('tab', { name: /All documents/ }).click();
  await articles.filter({ hasText: 'Algebra lecture' }).getByRole('button', { name: 'Continue studying' }).click();
  const layout = page.getByLabel('Split panel layout', { exact: true });
  for (const [preset, panels] of [['pdf-notes', ['pdf', 'notes']], ['pdf-ai', ['pdf', 'ai']], ['notes-ai', ['notes', 'ai']], ['columns', ['pdf', 'notes', 'ai']]]) {
    await layout.selectOption(preset);
    await page.waitForFunction(count => document.querySelectorAll('[data-study-panel]').length === count, panels.length);
    assert.deepEqual(await page.locator('[data-study-panel]').evaluateAll(items => items.map(item => item.dataset.studyPanel)), panels);
    const boxes = await page.locator('[data-study-panel]').evaluateAll(items => items.map(item => { const b = item.getBoundingClientRect(); return { x: b.x, right: b.right, width: b.width, height: b.height }; }));
    assert.ok(boxes.every(box => box.width > 200 && box.height > 200));
    for (let n = 1; n < boxes.length; n++) assert.ok(boxes[n].x >= boxes[n - 1].right - 1);
    if (preset === 'notes-ai') {
      await page.getByRole('button', { name: 'Next study page', exact: true }).click();
      await page.getByText('Page 2 / 3', { exact: true }).waitFor();
      assert.equal(await page.locator('.react-pdf__Document').count(), 1);
      await page.screenshot({ path: '/private/tmp/split-notes-ai.png' });
    }
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.react-pdf__Page__canvas')].some(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; return data.some((value, index) => index % 4 === 0 && value < 100); }));
  await page.screenshot({ path: '/private/tmp/split-three-columns.png' });
  await layout.selectOption('classic');
  assert.equal(await page.locator('[data-study-panel]').count(), 0);
  await page.getByRole('button', { name: 'Single Tab', exact: true }).click();
  await page.getByRole('button', { name: 'Document Reader', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.evaluate(() => window.openNotebook());
  await page.waitForFunction(() => window.current?.kind === 'notebook');
  await page.getByLabel('Split panel layout', { exact: true }).selectOption('notes-ai');
  await page.waitForFunction(() => document.querySelectorAll('[data-study-panel]').length === 2);
  assert.deepEqual(await page.locator('[data-study-panel]').evaluateAll(items => items.map(item => item.dataset.studyPanel)), ['notes', 'ai']);
  assert.equal(await page.locator('.react-pdf__Document').count(), 0);
  await page.getByRole('button', { name: 'Single Tab', exact: true }).click();
  await page.getByRole('button', { name: 'Voice Notes', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: organizer drag/drop, move menu, folder create/rename/delete, all-document view, mobile/dark layouts, every two-panel pairing, three columns, page navigation without visible PDF, and existing layouts.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
