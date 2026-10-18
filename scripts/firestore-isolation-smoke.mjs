import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const paths = process.env.FIREBASE_TEST_MODULES ? [process.env.FIREBASE_TEST_MODULES] : [process.cwd()];
const { initializeTestEnvironment, assertSucceeds, assertFails } = require(require.resolve('@firebase/rules-unit-testing', { paths }));
const { doc, setDoc, getDoc, deleteDoc } = require(require.resolve('firebase/firestore', { paths }));
const environment = await initializeTestEnvironment({ projectId: 'demo-notemydoc-security', firestore: { host: '127.0.0.1', port: 8908, rules: await readFile('firestore.rules', 'utf8') } });
try {
  const owner = environment.authenticatedContext('owner-one').firestore();
  const other = environment.authenticatedContext('owner-two').firestore();
  const guest = environment.unauthenticatedContext().firestore();
  const protectedPaths = ['users/owner-one/documents/test-document', 'users/owner-one/documents/test-document/pages/1', 'users/owner-one/documents/test-document/pages/voice-lecture', 'users/owner-one/settings/preferences', 'users/owner-one/aiConnections/test-connection'];
  for (const path of protectedPaths) {
    await assertSucceeds(setDoc(doc(owner, path), { test: 'synthetic private data' }));
    await assertSucceeds(getDoc(doc(owner, path)));
    await assertFails(getDoc(doc(other, path)));
    await assertFails(setDoc(doc(other, path), { test: 'overwrite' }));
    await assertFails(deleteDoc(doc(other, path)));
    await assertFails(getDoc(doc(guest, path)));
  }
  await assertFails(setDoc(doc(owner, 'users/owner-one'), { plan: 'pro', role: 'admin', questionsUsed: 0, questionLimit: 1_000_000 }));
  await assertSucceeds(setDoc(doc(other, 'users/owner-two/documents/own-document'), { test: 'own data' }));
  console.log('PASS: Firestore emulator denies cross-account and unauthenticated reads/writes/deletes for documents, notes, voice transcripts, preferences and encrypted connections; owner access works.');
} finally { await environment.cleanup(); }
