import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  reauthenticateWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { AccountIdentity, AccountSummary } from '../types';

const firebaseConfig = {
  apiKey: 'AIzaSyBTQydgSo-CmDM8kAXunBCqqUlKG8oTS5I',
  authDomain: 'ai-pdf-study-assistant.firebaseapp.com',
  projectId: 'ai-pdf-study-assistant',
  storageBucket: 'ai-pdf-study-assistant.firebasestorage.app',
  messagingSenderId: '478556485094',
  appId: '1:478556485094:web:5538b0a73fc14ea750d227',
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const isAuthConfigured = true;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
const driveProvider = new GoogleAuthProvider();
driveProvider.addScope('https://www.googleapis.com/auth/drive.file');
driveProvider.setCustomParameters({ prompt: 'select_account' });

export function accountFromFirebaseUser(user: User): AccountIdentity {
  return {
    userId: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Student',
  };
}

export async function accountSummaryFromFirebaseUser(user: User): Promise<AccountSummary | AccountIdentity> {
  const identity = accountFromFirebaseUser(user);
  const response = await fetch('/api/account', {
    headers: { authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
  });
  if (!response.ok) return identity;
  const data = await response.json() as { account?: AccountSummary };
  return data.account || identity;
}

export function subscribeToAccount(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function signInWithGoogle() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  return signInWithPopup(firebaseAuth, googleProvider);
}

export async function signOutAccount() {
  await signOut(firebaseAuth);
}

export async function connectGoogleDrive() {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Sign in before connecting Google Drive.');
  const result = await reauthenticateWithPopup(user, driveProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) throw new Error('Google Drive did not provide access.');
  return credential.accessToken;
}
