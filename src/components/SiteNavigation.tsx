import React, { useState } from 'react';
import { BookOpenCheck, ChevronDown, CircleUserRound, FolderOpen, LogIn, LogOut, Mail, Menu, Moon, ShieldCheck, Sparkles, Sun, Tag, X } from 'lucide-react';
import type { AccountIdentity, AccountSummary } from '../types';

interface SiteNavigationProps {
  account: AccountIdentity | AccountSummary | null;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  isLibraryActive: boolean;
  onLibrary: () => void;
  onPlans: () => void;
  onContact: () => void;
  onAuth: () => void;
  onSignOut: () => void;
}

export function SiteNavigation({ account, theme, onThemeToggle, isLibraryActive, onLibrary, onPlans, onContact, onAuth, onSignOut }: SiteNavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accessLabel = account && 'role' in account && account.role === 'admin'
    ? 'Admin'
    : account && 'plan' in account && account.plan === 'pro'
      ? 'Pro'
      : 'Free';
  const isAdmin = Boolean(account && 'role' in account && account.role === 'admin');

  const run = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <header className="site-navigation relative z-50 shrink-0 border-b border-black/10 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <button type="button" onClick={onLibrary} className="group flex min-w-0 items-center gap-3 text-left" aria-label="Open NoteMyDoc AI library">
          <span className="brand-mark grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#171717] text-white shadow-sm transition group-hover:bg-indigo-600"><BookOpenCheck size={20} /></span>
          <span className="min-w-0"><span className="block truncate text-[17px] font-semibold text-[#171717]">NoteMyDoc AI</span><span className="block truncate text-[11px] font-medium text-slate-500">Chat with every page. Keep every note.</span></span>
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          <button type="button" onClick={onLibrary} aria-current={isLibraryActive ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${isLibraryActive ? 'bg-[#f1f1ee] text-[#171717]' : 'text-slate-600 hover:bg-[#f7f7f5] hover:text-slate-950'}`}><FolderOpen size={15} />Library</button>
          <button type="button" onClick={onPlans} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"><Tag size={15} />Plans</button>
          <button type="button" onClick={onContact} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"><Mail size={15} />Contact</button>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button type="button" onClick={onThemeToggle} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {account ? (
            <div className="relative">
              <button type="button" onClick={() => setAccountOpen((value) => !value)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300" aria-expanded={accountOpen}>
                <CircleUserRound size={17} className="text-indigo-600" /><span className="max-w-32 truncate">{account.displayName}</span><ChevronDown size={14} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-12 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700"><CircleUserRound size={22} /></span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-slate-500">Profile</p>
                      <p className="truncate text-sm font-semibold text-slate-900">{account.displayName}</p>
                      <p className="truncate text-xs text-slate-500">{account.email}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between px-2 py-1 text-xs text-slate-500">
                    <span>Access</span>
                    <span className={`rounded-full px-2 py-1 font-semibold ${accessLabel === 'Free' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-700'}`}>{accessLabel}</span>
                  </div>
                  {account && 'aiRemainingPercent' in account && <div className="px-2 py-1.5 text-xs text-slate-500"><div className="flex items-center justify-between"><span>Monthly AI usage</span><span className="font-semibold text-slate-700">{account.aiRemainingPercent}% left</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${account.aiRemainingPercent}%` }} /></div></div>}
                  {isAdmin && <a href="/admin" className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50"><ShieldCheck size={16} />Admin workspace</a>}
                  <button type="button" onClick={() => { setAccountOpen(false); onSignOut(); }} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"><LogOut size={16} />Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={onAuth} className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><LogIn size={16} />Sign in</button>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <button type="button" onClick={onThemeToggle} className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
          <button type="button" onClick={() => setMenuOpen((value) => !value)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </div>

      {menuOpen && <nav className="absolute inset-x-0 top-[72px] border-b border-slate-200 bg-white p-3 shadow-xl md:hidden" aria-label="Mobile navigation">
        <button type="button" onClick={() => run(onLibrary)} className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">Library</button>
        <button type="button" onClick={() => run(onPlans)} className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">Plans</button>
        <button type="button" onClick={() => run(onContact)} className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">Contact</button>
        <div className="my-2 h-px bg-slate-200" />
        {account ? <><p className="px-3 pt-2 text-xs font-semibold uppercase text-slate-500">{accessLabel} account</p><p className="truncate px-3 py-1 text-sm font-medium text-slate-900">{account.displayName}</p><p className="truncate px-3 pb-2 text-xs text-slate-500">{account.email}</p>{isAdmin && <a href="/admin" className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50"><ShieldCheck size={16} />Admin workspace</a>}<button type="button" onClick={() => run(onSignOut)} className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"><LogOut size={16} />Sign out</button></> : <button type="button" onClick={() => run(onAuth)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"><Sparkles size={16} />Sign in or create account</button>}
      </nav>}
    </header>
  );
}
