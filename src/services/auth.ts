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
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
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
driveProvider.setCustomParameters({ prompt: 'consent select_account' });

export function accountFromFirebaseUser(user: User): AccountIdentity {
  return {
    userId: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Student',
  };
}

export async function accountSummaryFromFirebaseUser(user: User): Promise<AccountSummary | AccountIdentity> {
  const identity = accountFromFirebaseUser(user);
  const profileRef = doc(firestore, 'users', user.uid);
  let snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    await setDoc(profileRef, {
      email: identity.email,
      displayName: identity.displayName,
      photoURL: user.photoURL || null,
      plan: 'pro',
      questionsUsed: 0,
      questionLimit: 1_000_000,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    snapshot = await getDoc(profileRef);
  } else {
    await setDoc(profileRef, {
      email: identity.email,
      displayName: identity.displayName,
      photoURL: user.photoURL || null,
      plan: 'pro',
      questionLimit: 1_000_000,
      lastLoginAt: serverTimestamp(),
    }, { merge: true });
    snapshot = await getDoc(profileRef);
  }

  const profile = snapshot.data();
  const aiUsage = Number(profile?.questionsUsed) || 0;
  const aiLimit = Number(profile?.questionLimit) || 100;
  return {
    ...identity,
    plan: 'pro',
    aiUsage,
    aiLimit,
    aiRemaining: Math.max(0, aiLimit - aiUsage),
  };
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
