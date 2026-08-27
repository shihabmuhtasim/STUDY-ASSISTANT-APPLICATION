import React from 'react';
import { BadgeEuro, Check, Mail, Megaphone, ShieldCheck, Sparkles, X } from 'lucide-react';

interface SiteInfoModalProps {
  view: 'plans' | 'contact' | null;
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
            <div><h2 id="site-info-title" className="font-semibold text-slate-950">{isPlans ? 'Simple plans' : 'Contact'}</h2><p className="mt-0.5 text-xs text-slate-500">{isPlans ? 'Start freely and upgrade when your library grows.' : 'Product questions, partnerships, and advertising.'}</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
        </header>

        {isPlans ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <article className="rounded-lg border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-800">Free</p><p className="mt-2 text-3xl font-semibold text-slate-950">€0</p><p className="text-xs text-slate-500">No payment details</p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700"><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />One document in the library</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />100 AI questions</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Notes, annotations, and export</li><li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 text-indigo-600" />Local-first document privacy</li></ul>
              <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">Usage limits will begin after account launch.</p>
            </article>
            <article className="rounded-lg border-2 border-indigo-500 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-indigo-800">Pro</p><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">Coming soon</span></div><p className="mt-2 text-3xl font-semibold text-slate-950">€4<span className="text-sm font-medium text-slate-500">/month</span></p><p className="text-xs text-slate-500">Cancel any time</p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700"><li className="flex gap-2"><Sparkles size={16} className="mt-0.5 text-indigo-600" />Full document library</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />All study and AI tools</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Expanded AI allowance</li><li className="flex gap-2"><Check size={16} className="mt-0.5 text-emerald-600" />Google Drive synchronization</li></ul>
              <button type="button" disabled className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70">Payments opening soon</button>
            </article>
          </div>
        ) : (
          <div className="p-5 sm:p-7">
            <p className="text-2xl font-semibold text-slate-950">Shihab Mohtasim</p>
            <a href="mailto:shihabmuhtasim.cs@gmail.com" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"><Mail size={17} />shihabmuhtasim.cs@gmail.com</a>
            <div className="mt-7 border-t border-slate-200 pt-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><Megaphone size={20} /></span><div><h3 className="font-semibold text-slate-900">Advertising and partnerships</h3><p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">We are open to relevant advertising, education partnerships, and product collaborations that provide genuine value to students.</p><a href="mailto:shihabmuhtasim.cs@gmail.com?subject=Study%20Assistant%20advertising%20or%20partnership" className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Discuss an opportunity</a></div></div></div>
          </div>
        )}
      </div>
    </div>
  );
}
