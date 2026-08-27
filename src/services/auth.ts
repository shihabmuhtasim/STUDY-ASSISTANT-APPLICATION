import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
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
      plan: 'free',
      questionsUsed: 0,
      questionLimit: 100,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    snapshot = await getDoc(profileRef);
  } else {
    await setDoc(profileRef, {
      email: identity.email,
      displayName: identity.displayName,
      photoURL: user.photoURL || null,
      lastLoginAt: serverTimestamp(),
    }, { merge: true });
  }

  const profile = snapshot.data();
  const aiUsage = Number(profile?.questionsUsed) || 0;
  const aiLimit = Number(profile?.questionLimit) || 100;
  return {
    ...identity,
    plan: profile?.plan === 'pro' ? 'pro' : 'free',
    aiUsage,
    aiLimit,
    aiRemaining: Math.max(0, aiLimit - aiUsage),
  };
}

export function subscribeToAccount(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function finishGoogleRedirect() {
  return getRedirectResult(firebaseAuth);
}

export async function signInWithGoogle() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  return signInWithRedirect(firebaseAuth, googleProvider);
}

export async function signOutAccount() {
  await signOut(firebaseAuth);
}
