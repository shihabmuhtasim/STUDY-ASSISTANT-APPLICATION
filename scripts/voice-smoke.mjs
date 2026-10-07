import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_MODULES || '/Users/shihab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const root = process.cwd();
const bundle = await build({ absWorkingDir: root, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {useVoiceNotes} from './src/components/useVoiceNotes';
    import {VoiceNotesPanel,VoiceNotesDialog} from './src/components/VoiceNotesPanel';
    import {markdownToRichTextHtml} from './src/components/RichTextEditor';
    import {StarterPromptsEditor} from './src/components/StarterPromptsEditor';
    window.calls=[];window.engines=[];window.fail=false;
    const realNow=Date.now;window.clock=0;Date.now=()=>realNow()+window.clock;
    class Engine { start(){window.engines.push(this);this.onstart?.();}stop(){setTimeout(()=>this.onend?.(),5);}abort(){this.onend?.();} }
    window.SpeechRecognition=Engine;
    function App(){const [page,setPage]=useState(1),[tab,setTab]=useState('voice'),[notes,setNotes]=useState([]),[open,setOpen]=useState(false);
      const [instructions,setInstructions]=useState('Explain in simple French with examples.'),[editing,setEditing]=useState(false),[prompts,setPrompts]=useState(['Summarize this page','Explain the key ideas','Create 3 quiz questions']);
      const voice=useVoiceNotes({userId:'test',documentId:'voice-test',pageNumber:page,pageText:'Slide '+page,
        instructions,
        onSave:async(job,response)=>setNotes(n=>[...n.filter(x=>x.block.id!==job.id),{pageNumber:job.pageNumber,block:{id:job.id,content:markdownToRichTextHtml(response),source:'voice',createdAt:Date.now()}}])});
      window.voice=voice;
      const panel=<VoiceNotesPanel voice={voice} notes={notes} pageNumber={page} instructions={instructions} onInstructionsChange={setInstructions} onManage={()=>{}} onOpenPage={setPage}/>;
      window.prompts=prompts;
      return <><nav><button onClick={()=>setTab(tab==='voice'?'pdf':'voice')}>Switch tab</button><button onClick={()=>setPage(p=>p+1)}>Next page</button><button onClick={()=>setOpen(true)}>Voice controls</button><button onClick={()=>setEditing(true)}>Edit questions</button></nav><main style={{height:'85vh'}}>{tab==='voice'?panel:<p>Document reader: {page}</p>}</main><VoiceNotesDialog open={open} onClose={()=>setOpen(false)}>{panel}</VoiceNotesDialog><StarterPromptsEditor open={editing} prompts={prompts} defaults={['Summarize this page']} onSave={setPrompts} onClose={()=>setEditing(false)}/></>;
    }createRoot(document.getElementById('root')).render(<App/>);` },
  plugins: [{ name: 'mock-providers', setup(b) {
    b.onResolve({ filter: /services\/ai$|services\/customAI$|\.\/customAI$|services\/connectionStore$/ }, args => ({ path: args.path, namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path.endsWith('/ai')
      ? `export async function askAIAboutPage(input){window.calls.push(input);return {response:'Hosted lecture notes',provider:'gemini',model:'gemini-flash'}}`
      : args.path.endsWith('customAI')
      ? `export async function askCustomAI(input){window.calls.push(input);await new Promise(r=>setTimeout(r,50));if(window.fail)throw Error('Provider unavailable; transcript retained');return {response:'## Lecture notes\\n'+input.pageText+' explained.',model:'test'}} export async function testCustomAIConnection(){}`
      : `export async function loadSavedConnections(){return [{id:'test-key',name:'My lecture API',isStored:true,service:'custom',model:'test',apiKey:''}]} export async function saveEncryptedConnection(c){return c} export async function deleteEncryptedConnection(){}` }));
  } }], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent' });
const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
const css = (await postcss([tailwind({base:root})]).process(await readFile(root+'/app/globals.css','utf8'),{from:root+'/app/globals.css'})).css;
const server = createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1100,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.voice?.ready && window.voice.selectedId);
  await page.waitForFunction(()=>window.voice.connections.length > 0);
  await page.getByRole('combobox',{name:'Recording model'}).selectOption('test-key');
  const speak=async text=>page.evaluate(text=>{window.clock+=6000;window.engines.at(-1).onresult({results:[{isFinal:true,0:{transcript:text}}]});},text);
  await page.getByRole('button',{name:'This page',exact:true}).click();
  await page.getByRole('button',{name:'Stop and create notes',exact:true}).click();
  await page.waitForFunction(()=>window.voice.session.phase==='idle' && window.voice.notice?.includes('skipped'));
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByRole('button',{name:'This page',exact:true}).click();await speak('Hi');
  await page.getByRole('button',{name:'Stop and create notes',exact:true}).click();
  await page.waitForFunction(()=>window.voice.session.phase==='idle' && window.voice.notice?.includes('skipped'));
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByRole('button',{name:'This page',exact:true}).click();
  await page.evaluate(()=>window.engines.at(-1).onresult({results:[{isFinal:true,0:{transcript:'A meaningful but very short recording.'}}]}));
  await page.getByRole('button',{name:'Stop and create notes',exact:true}).click();
  await page.waitForFunction(()=>window.voice.session.phase==='idle' && window.voice.notice?.includes('five seconds'));
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByRole('button',{name:'This page',exact:true}).click();await speak('The lecturer explains page one.');
  await page.getByRole('button',{name:'Switch tab'}).click();assert.equal(await page.evaluate(()=>window.voice.session.phase),'recording');
  await page.getByRole('button',{name:'Next page'}).click();await page.waitForFunction(()=>window.voice.jobs[0]?.status==='saved');
  assert.equal(await page.evaluate(()=>window.calls[0].pageText),'Slide 1');
  assert.ok(await page.evaluate(()=>window.calls[0].prompt.startsWith('Explain in simple French with examples.')));
  await page.getByRole('button',{name:'Switch tab'}).click();await page.locator('main').getByText('Slide 1 explained.',{exact:true}).waitFor();
  await page.locator('main summary').filter({hasText:'Voice-note instructions'}).click();
  await page.locator('main').getByRole('textbox',{name:'Voice-note instructions'}).fill('Create an exam recap in English.');
  await page.getByRole('button',{name:'Save instructions',exact:true}).click();
  await page.getByRole('button',{name:'Auto by page',exact:true}).click();await speak('Page two lecture with detailed examples');
  await page.getByRole('button',{name:'Next page'}).click();await page.waitForFunction(()=>window.voice.session.segment?.pageNumber===3 && window.voice.jobs[1]?.status==='saved');
  assert.ok(await page.evaluate(()=>window.calls[1].prompt.startsWith('Create an exam recap in English.')));
  await speak('Page three lecture with detailed examples');await page.evaluate(()=>window.fail=true);await page.getByRole('button',{name:'Stop and create notes',exact:true}).click();
  await page.waitForFunction(()=>window.voice.jobs.at(-1)?.status==='failed');
  assert.equal(await page.evaluate(()=>window.voice.jobs.at(-1).transcript),'Page three lecture with detailed examples');
  await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'Retry with selected API'}).click();
  await page.waitForFunction(()=>window.voice.jobs.every(j=>j.status==='saved'));
  assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c.pageNumber)),[1,2,3,3]);
  assert.ok(await page.evaluate(()=>window.calls.every(c=>c.connection.id==='test-key')));
  await page.getByRole('combobox',{name:'Recording model'}).selectOption('builtin');
  await page.getByRole('button',{name:'This page',exact:true}).click();await speak('Hosted lecture test with detailed examples');
  await page.getByRole('button',{name:'Stop and create notes',exact:true}).click();
  await page.waitForFunction(()=>window.voice.jobs.length===4 && window.voice.jobs.every(j=>j.status==='saved'));
  assert.equal(await page.evaluate(()=>window.calls.at(-1).purpose),'voice-notes');
  assert.equal(await page.evaluate(()=>window.calls.at(-1).modelPreference),'gemini-flash');
  await page.getByRole('button',{name:'Edit questions',exact:true}).click();
  await page.getByRole('textbox',{name:'Starter question 1',exact:true}).fill('Explain this page using a worked example');
  await page.getByRole('button',{name:'Delete starter question 3',exact:true}).click();
  await page.getByRole('button',{name:'Add question',exact:true}).click();
  await page.getByRole('textbox',{name:'Starter question 3',exact:true}).fill('What should I revise for the exam?');
  await page.getByRole('button',{name:'Save questions',exact:true}).click();
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await page.getByRole('button',{name:'Edit questions',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Starter question 1',exact:true}).inputValue(),'Explain this page using a worked example');
  assert.equal(await page.getByRole('textbox',{name:'Starter question 3',exact:true}).inputValue(),'What should I revise for the exam?');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Voice controls',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.screenshot({path:'/private/tmp/voice-notes-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'/private/tmp/voice-notes-mobile-dark.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS: empty/short recordings make zero AI calls; edited voice instructions reach both providers; starter questions edit/add/delete persist across pages; cross-tab recording, splitting, saved notes, error/retry, dialog, mobile overflow, zero browser errors.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
