import React from 'react';
import { BadgeEuro, Check, Mail, Megaphone, ShieldCheck, Sparkles, X } from 'lucide-react';

interface SiteInfoModalProps {
  view: 'plans' | 'contact' | 'privacy' | null;
  onClose: () => void;
}

export function SiteInfoModal({ view, onClose }: SiteInfoModalProps) {
  if (!view) return null;
  const isPlans = view === 'plans';

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="site-info-title">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${isPlans ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>{isPlans ? <BadgeEuro size={20} /> : <Mail size={20} />}</span>
            <div><h2 id="site-info-title" className="font-semibold text-slate-950">{isPlans ? 'Simple plans' : view === 'privacy' ? 'Privacy and your data' : 'Contact'}</h2><p className="mt-0.5 text-xs text-slate-500">{isPlans ? 'Start freely and upgrade when your library grows.' : view === 'privacy' ? 'What is saved, synced and sent to AI.' : 'Product questions, partnerships, and advertising.'}</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
        </header>

        {isPlans ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <article className="rounded-lg border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-800">Free</p><p className="mt-2 text-3xl font-semibold text-slate-950">€0</p><p className="text-xs text-slate-500">No payment details</p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700"><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Efficient Study Basic AI</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Monthly AI usage allowance</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Usage reflects question and answer complexity</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Notes, annotations, and export</li><li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 text-indigo-600" />Local-first document privacy</li></ul>
              <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">No payment details required.</p>
            </article>
            <article className="rounded-lg border-2 border-indigo-500 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-indigo-800">Pro</p><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">Coming soon</span></div><p className="mt-2 text-3xl font-semibold text-slate-950">€4<span className="text-sm font-medium text-slate-500">/month</span></p><p className="text-xs text-slate-500">Cancel any time</p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700"><li className="flex gap-2"><Sparkles size={16} className="mt-0.5 text-indigo-600" />Premium AI models</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />20× larger monthly AI allowance</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Automatic model fallback</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Custom API connections</li></ul>
              <button type="button" disabled className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70">Payments opening soon</button>
            </article>
          </div>
        ) : view === 'privacy' ? (
          <article className="space-y-5 p-5 text-sm leading-relaxed text-slate-600 sm:p-7">
            <section><h3 className="font-semibold text-slate-950">Your account and study data</h3><p>Google provides sign-in. Your profile, document metadata, saved notes, chats, voice transcripts and preferences may be stored in Firebase and Cloudflare services for your account. Documents can also remain in this browser. This is not end-to-end encrypted storage.</p></section>
            <section><h3 className="font-semibold text-slate-950">Optional Google Drive backup</h3><p>Connecting Drive allows document backup to the Google account you select. Disconnecting Drive does not delete existing backups. Files already downloaded on another device may remain there.</p></section>
            <section><h3 className="font-semibold text-slate-950">When you use AI</h3><p>Your question, recent conversation and relevant document content are sent through our backend to the selected provider, or a fallback provider when enabled. Page images and attachments are included when selected. Include notes and transcripts is off by default; enabling it also shares the selected pages' study material. Voice-note generation shares transcripts and page context with its chosen model.</p><p className="mt-2">Speech recognition may process microphone audio using your browser's speech service. We save transcripts and generated notes rather than intentionally keeping raw audio recordings.</p></section>
            <section><h3 className="font-semibold text-slate-950">Provider policies and sensitive content</h3><p>AI providers have their own retention and data-use terms, which can differ by service, region and account tier. Do not submit confidential or sensitive content unless those terms are appropriate for it. AI answers may be inaccurate.</p><a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" className="text-indigo-700 underline">Google Gemini API data-use terms</a></section>
            <section><h3 className="font-semibold text-slate-950">Custom API keys and service usage</h3><p>Saved custom API keys are encrypted for your account and decrypted by the backend when needed. Usage counters and request health records track service activity without deliberately recording document content or transcripts in those metrics.</p></section>
            <section><h3 className="font-semibold text-slate-950">Removing your data</h3><p>Delete documents from the Library and remove custom connections in Custom API. Check Google Drive for any remaining backup files. For account deletion or privacy requests, contact <a href="mailto:shihabmuhtasim.cs@gmail.com" className="text-indigo-700 underline">shihabmuhtasim.cs@gmail.com</a>. Provider retention and previously downloaded copies are separate.</p></section>
            <p className="border-t border-slate-200 pt-4 text-xs">Service contact: Shihab Muhtasim. Updated 18 October 2026.</p>
          </article>
        ) : (
          <div className="p-5 sm:p-7">
            <p className="text-2xl font-semibold text-slate-950">Shihab Muhtasim</p>
            <p className="mt-1 text-sm text-slate-500">Founder of NoteMyDoc AI</p>
            <a href="mailto:shihabmuhtasim.cs@gmail.com" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"><Mail size={17} />shihabmuhtasim.cs@gmail.com</a>
            <div className="mt-7 border-t border-slate-200 pt-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><Megaphone size={20} /></span><div><h3 className="font-semibold text-slate-900">Advertising and partnerships</h3><p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">We are open to relevant advertising, education partnerships, and product collaborations that provide genuine value to students.</p><a href="mailto:shihabmuhtasim.cs@gmail.com?subject=NoteMyDoc%20AI%20advertising%20or%20partnership" className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Discuss an opportunity</a></div></div></div>
          </div>
        )}
      </div>
    </div>
  );
}
