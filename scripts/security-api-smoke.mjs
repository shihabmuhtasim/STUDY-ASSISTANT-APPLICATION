import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const output = await build({ write: false, bundle: true, platform: 'node', format: 'cjs', packages: 'external', stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
import assert from 'node:assert/strict';
import { POST as hosted } from './app/api/ai/chat/route';
import { POST as custom } from './app/api/ai/custom/route';
import { saveConnection,connectionWithDecryptedKey,listConnections } from './server/userConnections';
const request=(path,body,extra={})=>new Request('https://notemydocai.pages.dev'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-token',...extra},body:JSON.stringify(body)});
export async function run(){
globalThis.mock={providerCalls:0,released:0,busy:false,allowance:true,auth:true};
for(const body of [null,[],{prompt:5,pageNumber:1},{prompt:'Test',pageNumber:1,history:[{}]}]) assert.equal((await hosted(request('/api/ai/chat',body))).status,400);
assert.equal((await hosted(request('/api/ai/chat',{prompt:'Test',pageNumber:1},{origin:'https://attacker.example'}))).status,403);
assert.equal(globalThis.mock.providerCalls,0);
globalThis.mock.auth=false;assert.equal((await hosted(request('/api/ai/chat',{prompt:'Test',pageNumber:1}))).status,401);globalThis.mock.auth=true;
globalThis.mock.busy=true;const busy=await hosted(request('/api/ai/chat',{prompt:'Test',pageNumber:1}));assert.equal(busy.status,429);assert.equal(busy.headers.get('retry-after'),'60');globalThis.mock.busy=false;
globalThis.mock.allowance=false;assert.equal((await hosted(request('/api/ai/chat',{prompt:'Test',pageNumber:1}))).status,429);assert.equal(globalThis.mock.released,1);globalThis.mock.allowance=true;
assert.equal((await hosted(request('/api/ai/chat',{prompt:'Test',pageNumber:1}))).status,200);assert.equal(globalThis.mock.providerCalls,1);assert.equal(globalThis.mock.released,2);
const connection={id:'test-key',name:'Test',service:'openai',provider:'openai-compatible',baseUrl:'https://api.openai.com/v1',model:'test-model',apiKey:'synthetic-private-key'};
const failed=await custom(request('/api/ai/custom',{prompt:'Test',pageNumber:1,transientConnection:connection,history:[]}));assert.equal(failed.status,502);assert.doesNotMatch(JSON.stringify(await failed.json()),/synthetic-private-key/);assert.equal(globalThis.mock.released,3);
const originalFetch=globalThis.fetch;const documents=new Map();const user=uid=>({uid,idToken:'synthetic-token',email:uid+'@example.com',displayName:uid});
try{globalThis.fetch=async(url,init={})=>{if(init.method==='PATCH'){const data=JSON.parse(init.body);documents.set(String(url),data);return Response.json(data);}if(documents.has(String(url)))return Response.json(documents.get(String(url)));if(String(url).endsWith('/aiConnections'))return Response.json({documents:[...documents.values()]});return new Response('',{status:404});};
const stored=await saveConnection(user('owner-one'),connection);assert.equal(stored.apiKey,'');assert.ok(!JSON.stringify([...documents.values()]).includes(connection.apiKey));assert.equal((await connectionWithDecryptedKey(user('owner-one'),'test-key')).apiKey,connection.apiKey);assert.equal(await connectionWithDecryptedKey(user('owner-two'),'test-key'),null);
const encrypted=[...documents.values()][0];documents.set('https://firestore.googleapis.com/v1/projects/ai-pdf-study-assistant/databases/(default)/documents/users/owner-two/aiConnections/test-key',encrypted);await assert.rejects(()=>connectionWithDecryptedKey(user('owner-two'),'test-key'));
assert.equal((await listConnections(user('owner-one')))[0].apiKey,'');
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: authenticated API guards, invalid/cross-origin requests, busy/allowance responses, lease release, credential redaction, encrypted key storage and owner-bound decryption.');}
` }, plugins: [{ name: 'synthetic-backends', setup(b) {
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const env={USER_DATA_ENCRYPTION_KEY:"synthetic-encryption-secret-for-test-only"}'}));
  b.onLoad({filter:/server\/firebaseUser\.ts$/},()=>({contents:'export async function verifyFirebaseRequest(){return globalThis.mock.auth?{uid:"test-user",email:"test@example.com",emailVerified:true,idToken:"synthetic-token"}:null}'}));
  b.onLoad({filter:/server\/aiCapacity\.ts$/},()=>({contents:'export async function acquireAIRequest(){return globalThis.mock.busy?null:async()=>{globalThis.mock.released++}};export function capacityBusyResponse(){return Response.json({code:"AI_BUSY"},{status:429,headers:{"retry-after":"60"}})}'}));
  b.onLoad({filter:/server\/accounts\.ts$/},()=>({contents:'export async function getAccountSummary(){return {plan:"pro",role:"user",aiLimit:1000,aiRemaining:1000}};export async function reserveAIAllowance(){return {allowed:globalThis.mock.allowance,account:{aiLimit:1000},reservedUnits:10,remaining:1000}};export async function settleAIAllowance(){return 10};export async function releaseAIAllowance(){};export async function recordAIUsage(){};export async function recordAIRequestEvent(){}'}));
  b.onLoad({filter:/server\/aiRouter\.ts$/},()=>({contents:'export async function routeAIRequest(){globalThis.mock.providerCalls++;return {provider:"gemini",model:"test-model",text:"Synthetic answer"}}'}));
  b.onLoad({filter:/server\/customProvider\.ts$/},()=>({contents:'export async function callCustomProvider(input){throw new Error("Rejected "+input.connection.apiKey)}'}));
}}] });
const module = {exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports);await module.exports.run();
