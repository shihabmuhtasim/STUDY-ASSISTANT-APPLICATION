'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, Bot, Gauge, PauseCircle, PlayCircle, RefreshCw, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react';
import { firebaseAuth, subscribeToAccount } from '../services/auth';

type AdminOverview = {
  summary: {
    users: number;
    freeUsers: number;
    proUsers: number;
    activeUsers30d: number;
    requests24h: number;
    errorRate24h: number;
    fallbackRate24h: number;
    averageLatency24h: number;
  };
  users: Array<{
    id: string;
    email: string;
    displayName: string;
    plan: 'free' | 'pro';
    role: 'user' | 'admin';
    createdAt: number;
    lastSeenAt: number;
    usage: number;
    usagePercentLeft: number;
  }>;
  modelHealth: Array<{ provider: string; model: string; requests: number; errors: number; fallbacks: number; latency: number }>;
  modelControls: Array<{ id: string; label: string; provider: string; enabled: boolean }>;
  hostedAIPaused: boolean;
  audits: Array<{ action: string; target: string; details: string | null; createdAt: number }>;
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setError('Sign in with the administrator Google account to continue.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/overview', {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
        cache: 'no-store',
      });
      const data = await response.json() as AdminOverview & { error?: string };
      if (!response.ok) throw new Error(data.error || 'The admin workspace could not be loaded.');
      setOverview(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The admin workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => subscribeToAccount((user) => {
    if (user) load();
    else {
      setOverview(null);
      setLoading(false);
      setError('Sign in with the administrator Google account to continue.');
    }
  }), [load]);

  const action = async (key: string, body: Record<string, unknown>) => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    setActing(key);
    setError(null);
    try {
      const response = await fetch('/api/admin/overview', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'The change could not be saved.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The change could not be saved.');
    } finally {
      setActing(null);
    }
  };

  const visibleUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return overview?.users || [];
    return (overview?.users || []).filter((user) => `${user.displayName} ${user.email}`.toLowerCase().includes(term));
  }, [overview, query]);

  if (loading && !overview) return <AdminShell><div className="grid min-h-[55vh] place-items-center text-sm font-medium text-slate-500"><RefreshCw className="mb-3 animate-spin" />Loading administrator workspace...</div></AdminShell>;

  if (!overview) return <AdminShell><div className="mx-auto mt-24 max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto mb-4 text-indigo-600" size={34} /><h1 className="text-xl font-semibold text-slate-950">Administrator access</h1><p className="mt-2 text-sm leading-6 text-slate-600">{error}</p><a href="/" className="mt-6 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Return to Study Assistant</a></div></AdminShell>;

  const metrics = [
    { label: 'Registered users', value: overview.summary.users, note: `${overview.summary.freeUsers} Free · ${overview.summary.proUsers} Pro`, icon: Users },
    { label: 'Active in 30 days', value: overview.summary.activeUsers30d, note: 'Signed-in users', icon: Activity },
    { label: 'AI requests today', value: overview.summary.requests24h, note: `${overview.summary.fallbackRate24h}% fallback`, icon: Bot },
    { label: 'Average response', value: `${(overview.summary.averageLatency24h / 1000).toFixed(1)}s`, note: `${overview.summary.errorRate24h}% errors`, icon: Gauge },
  ];

  return <AdminShell>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase text-indigo-600">Operations</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Study Assistant admin</h1><p className="mt-1 text-sm text-slate-500">Users, AI reliability, access, and safety controls.</p></div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </div>

      {error && <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Service summary">
        {metrics.map(({ label, value, note, icon: Icon }) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><Icon size={18} className="text-indigo-600" /></div><p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>)}
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">User access</h2><p className="text-xs text-slate-500">The 100 most recently active accounts</p></div><label className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" className="h-9 w-56 rounded-md border border-slate-200 pl-9 pr-3 text-sm" /></label></div>
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3 font-semibold">User</th><th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">AI left</th><th className="px-4 py-3 font-semibold">Last active</th><th className="px-5 py-3 text-right font-semibold">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{visibleUsers.map((user) => <tr key={user.id}><td className="px-5 py-3"><p className="font-medium text-slate-900">{user.displayName || 'Student'}</p><p className="text-xs text-slate-500">{user.email}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : user.plan === 'pro' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{user.role === 'admin' ? 'Admin' : user.plan === 'pro' ? 'Pro' : 'Free'}</span></td><td className="px-4 py-3 font-medium text-slate-700">{user.usagePercentLeft}%</td><td className="px-4 py-3 text-xs text-slate-500">{dateTime.format(user.lastSeenAt)}</td><td className="px-5 py-3"><div className="flex justify-end gap-2">{user.role !== 'admin' && <button type="button" disabled={acting !== null} onClick={() => action(`plan:${user.id}`, { action: 'user-plan', userId: user.id, plan: user.plan === 'pro' ? 'free' : 'pro' })} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Make {user.plan === 'pro' ? 'Free' : 'Pro'}</button>}<button type="button" title="Reset monthly AI usage" disabled={acting !== null} onClick={() => action(`usage:${user.id}`, { action: 'reset-usage', userId: user.id })} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={14} /></button></div></td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className={`rounded-lg border p-5 shadow-sm ${overview.hostedAIPaused ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">Hosted AI</h2><p className="mt-1 text-sm text-slate-600">{overview.hostedAIPaused ? 'Paused. Users receive the local document fallback.' : 'Available to signed-in users.'}</p></div>{overview.hostedAIPaused ? <PauseCircle className="text-red-600" /> : <ShieldCheck className="text-emerald-600" />}</div><button type="button" disabled={acting !== null} onClick={() => action('hosted-ai', { action: 'hosted-ai', paused: !overview.hostedAIPaused })} className={`mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold disabled:opacity-50 ${overview.hostedAIPaused ? 'bg-emerald-700 text-white' : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'}`}>{overview.hostedAIPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}{overview.hostedAIPaused ? 'Resume hosted AI' : 'Pause hosted AI'}</button></section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Model availability</h2><p className="mt-1 text-xs text-slate-500">Disable an unhealthy model without redeploying.</p><div className="mt-4 divide-y divide-slate-100">{overview.modelControls.map((model) => <div key={model.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{model.label}</p><p className="text-xs text-slate-500">{model.provider}</p></div><button type="button" role="switch" aria-checked={model.enabled} aria-label={`${model.enabled ? 'Disable' : 'Enable'} ${model.label}`} disabled={acting !== null} onClick={() => action(`model:${model.id}`, { action: 'model-control', model: model.id, enabled: !model.enabled })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${model.enabled ? 'bg-indigo-600' : 'bg-slate-300'} disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${model.enabled ? 'left-6' : 'left-1'}`} /></button></div>)}</div></section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Model health · 7 days</h2><div className="mt-4 space-y-2">{overview.modelHealth.length ? overview.modelHealth.map((model) => <div key={`${model.provider}:${model.model}`} className="grid grid-cols-[1fr_auto] gap-4 rounded-md bg-slate-50 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{model.model}</p><p className="text-xs text-slate-500">{model.provider}</p></div><p className="text-right text-xs text-slate-500"><span className="font-semibold text-slate-700">{model.requests}</span> requests<br />{model.errors} errors · {(model.latency / 1000).toFixed(1)}s</p></div>) : <p className="py-6 text-center text-sm text-slate-500">Health data appears after AI requests are made.</p>}</div></section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Recent administrator activity</h2><div className="mt-4 divide-y divide-slate-100">{overview.audits.length ? overview.audits.map((event, index) => <div key={`${event.createdAt}:${index}`} className="py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-800">{event.action.replaceAll('.', ' ')}</p><time className="shrink-0 text-xs text-slate-500">{dateTime.format(event.createdAt)}</time></div><p className="mt-1 truncate text-xs text-slate-500">{event.target}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No administrator changes yet.</p>}</div></section>
      </div>
    </main>
  </AdminShell>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950"><ArrowLeft size={17} />Study Assistant</a><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck size={18} className="text-indigo-600" />Admin</div></div></header>{children}</div>;
}
