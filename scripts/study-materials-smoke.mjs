import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/shihab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const bundle = await build({ bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AIAssistant} from './src/components/AIAssistant';
    window.calls=[];
    const noop=()=>{},account={userId:'test',plan:'pro',aiRemainingPercent:100};
    const materials=[{pageNumber:1,text:'Manual note ONE. Lecture transcript FIRST.',images:['data:image/png;base64,AAAA']},{pageNumber:2,text:'Private note TWO.',images:[]}];
    function App(){const [history,setHistory]=useState([]),[page,setPage]=useState(1);return <><button onClick={()=>setPage(2)}>Next test page</button><div style={{height:700}}><AIAssistant pageNumber={page} pageImage='data:image/png;base64,BBBB' pageText={'Slide '+page} documentContext='Whole slides' documentPages={['Slide one','Slide two']} studyMaterials={materials} isDocumentContextLoading={false} history={history} account={account} onRemainingChange={noop} onUpgrade={noop} onAddInteraction={i=>setHistory(h=>[...h,i])} onInsertToNotes={noop} onVoiceControls={noop} voiceActive={false} voicePending={0} onReferenceSelect={noop}/></div></>;}createRoot(document.getElementById('root')).render(<App/>);` },
  plugins: [{ name: 'mock-ai', setup(b) {
    b.onLoad({ filter: /services\/(ai|customAI|cloudData|connectionStore)\.ts$/ }, args => ({ loader: 'js', contents:
      args.path.endsWith('/ai.ts') ? `export class AIRequestError extends Error{};export async function askAIAboutPage(input){window.calls.push({...input,path:'hosted'});return {response:'Test answer',provider:'gemini',model:'gemini-flash'}}` :
      args.path.endsWith('/customAI.ts') ? `export async function askCustomAI(input){window.calls.push({...input,path:'custom'});return {response:'Custom answer',provider:'custom',model:'test-model'}};export async function testCustomAIConnection(){}` :
      args.path.endsWith('/cloudData.ts') ? `export async function loadCloudPreferences(){return null};export async function saveCloudPreferences(){}` :
      `export async function loadSavedConnections(){return [{id:'test-key',service:'nvidia',provider:'openai-compatible',name:'Test custom model',model:'test-model',apiKey:'test'}]};export async function saveEncryptedConnection(){};export async function deleteEncryptedConnection(){}` }));
  }}], logLevel: 'silent' });
const server = createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:'<html><div id="root"></div><script src="/app.js"></script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try {
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const ask=async text=>{await page.getByRole('textbox',{name:'Ask about this page or the whole document…'}).fill(text);await page.getByRole('button',{name:'Send question',exact:true}).click();await page.getByRole('button',{name:'Copy',exact:true}).last().waitFor();};
  assert.equal(await page.getByRole('checkbox',{name:'Include notes and transcripts'}).isChecked(),false);
  await ask('Question without notes');assert.doesNotMatch(await page.evaluate(()=>window.calls[0].documentContext),/Manual note|Lecture transcript/);
  await page.getByRole('checkbox',{name:'Include notes and transcripts'}).check();await ask('Question with notes');
  await page.waitForFunction(()=>window.calls.length===2);let request=await page.evaluate(()=>window.calls.at(-1));
  assert.match(request.documentContext,/Manual note ONE/);assert.match(request.documentContext,/Lecture transcript FIRST/);assert.doesNotMatch(request.documentContext,/Private note TWO/);assert.equal(request.attachmentImages.length,1);
  await page.getByRole('button',{name:'Auto · Best available',exact:true}).click();await page.getByRole('button',{name:'Test custom model',exact:true}).click();await ask('Question to custom model');
  await page.waitForFunction(()=>window.calls.length===3);request=await page.evaluate(()=>window.calls.at(-1));assert.equal(request.path,'custom');assert.match(request.documentContext,/Lecture transcript FIRST/);
  await page.getByRole('button',{name:'Next test page'}).click();await ask('Question about page two');await page.waitForFunction(()=>window.calls.length===4);
  request=await page.evaluate(()=>window.calls.at(-1));assert.match(request.documentContext,/Private note TWO/);assert.doesNotMatch(request.documentContext,/Manual note ONE/);assert.deepEqual(request.attachmentImages,[]);
  assert.deepEqual(errors,[]);console.log('PASS: default opt-out, current-page notes/transcripts/images, hosted and custom providers, page navigation isolation.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
