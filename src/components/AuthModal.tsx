import React, { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { isAuthConfigured, signInWithGoogle } from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const continueWithGoogle = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
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
              <h2 id="auth-title" className="font-semibold text-slate-950">Continue to your workspace</h2>
              <p className="mt-0.5 text-xs text-slate-500">One secure account for your study activity.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close account dialog"><X size={18} /></button>
        </header>

        <div className="p-5">
          <p className="text-sm leading-relaxed text-slate-600">Sign in before adding a document. Google verifies your identity while your uploaded files remain stored in your browser.</p>

          {!isAuthConfigured && <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Google account access is being activated.</p>}
          {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

          <button type="button" onClick={continueWithGoogle} disabled={!isAuthConfigured || isSubmitting} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {isSubmitting ? <Loader2 size={17} className="animate-spin" /> : <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-bold text-blue-600">G</span>}
            {isSubmitting ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <div className="mt-4 flex items-start gap-2 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />New users are registered automatically. Returning users are signed back into the same account.</div>
        </div>
      </div>
    </div>
  );
}
