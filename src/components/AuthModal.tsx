import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import type { AccountIdentity } from '../types';
import { accountFromSupabaseUser, isAuthConfigured, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (account: AccountIdentity) => void;
}

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await signUpWithEmail(email.trim(), password, name.trim());
        if (signUpError) throw signUpError;
        if (data.user && data.session) {
          onAuthenticated(accountFromSupabaseUser(data.user));
          onClose();
        } else {
          setNotice('Check your inbox and verify your email before signing in.');
        }
      } else {
        const { data, error: signInError } = await signInWithEmail(email.trim(), password);
        if (signInError) throw signInError;
        if (data.user) {
          onAuthenticated(accountFromSupabaseUser(data.user));
          onClose();
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Account access failed. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueWithGoogle = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: googleError } = await signInWithGoogle();
      if (googleError) throw googleError;
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : 'Google sign-in could not start.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><ShieldCheck size={20} /></span>
            <div>
              <h2 id="auth-title" className="font-semibold text-slate-950">Your study account</h2>
              <p className="mt-0.5 text-xs text-slate-500">Keep your identity separate from your document content.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close account dialog"><X size={18} /></button>
        </header>

        <div className="p-5">
          <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}><LogIn size={15} className="mr-1.5 inline" />Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}><UserPlus size={15} className="mr-1.5 inline" />Create account</button>
          </div>

          {!isAuthConfigured && <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Account setup is being connected. The study workspace remains available without signing in.</p>}
          {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          {notice && <p role="status" className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{notice}</p>}

          <button type="button" onClick={continueWithGoogle} disabled={!isAuthConfigured || isSubmitting} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-bold text-blue-600">G</span>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase text-slate-400"><span className="h-px flex-1 bg-slate-200" /><span>or use email</span><span className="h-px flex-1 bg-slate-200" /></div>

          <form onSubmit={submitEmail} className="space-y-3">
            {mode === 'signup' && <label className="block text-xs font-medium text-slate-600">Name<input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500" /></label>}
            <label className="block text-xs font-medium text-slate-600">Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500" /></label>
            <label className="block text-xs font-medium text-slate-600">Password<span className="relative mt-1 block"><input required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="w-full rounded-md border border-slate-200 py-2 pl-3 pr-10 text-sm focus:border-indigo-500" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
            <button type="submit" disabled={!isAuthConfigured || isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <>{mode === 'signup' ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
