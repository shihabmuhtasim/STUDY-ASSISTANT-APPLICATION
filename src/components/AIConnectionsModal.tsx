import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CustomAIConnection, CustomAIProvider, CustomAIService } from '../types';
import { testCustomAIConnection } from '../services/customAI';

interface AIConnectionsModalProps {
  isOpen: boolean;
  connections: CustomAIConnection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSave: (connection: CustomAIConnection) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const SERVICES: Record<CustomAIService, { label: string; provider: CustomAIProvider; baseUrl?: string }> = {
  openai: { label: 'OpenAI', provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1' },
  nvidia: { label: 'NVIDIA NIM', provider: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  groq: { label: 'Groq', provider: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1' },
  together: { label: 'Together AI', provider: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1' },
  gemini: { label: 'Google Gemini', provider: 'gemini' },
  anthropic: { label: 'Anthropic Claude', provider: 'anthropic' },
  custom: { label: 'Other compatible API', provider: 'openai-compatible' },
};

const emptyDraft = () => ({ id: '', name: '', service: 'openrouter' as CustomAIService, apiKey: '', model: '', baseUrl: SERVICES.openrouter.baseUrl || '' });

function serviceDetails(service: CustomAIService) {
  return SERVICES[service] || SERVICES.custom;
}

function maskedKey(key: string) {
  return key.length > 4 ? `••••${key.slice(-4)}` : '••••';
}

export function AIConnectionsModal({ isOpen, connections, selectedId, onSelect, onSave, onDelete, onClose }: AIConnectionsModalProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<{ id: string; status: 'testing' | 'success' | 'error'; message?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraft(emptyDraft());
      setShowKey(false);
      setTestState(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const service = serviceDetails(draft.service);
  const existingConnection = connections.find((connection) => connection.id === draft.id);
  const hasKey = Boolean(draft.apiKey.trim() || existingConnection?.isStored);
  const hasValidNvidiaKey = draft.service !== 'nvidia' || !draft.apiKey.trim() || draft.apiKey.trim().startsWith('nvapi-');
  const canSave = Boolean(hasKey && draft.model.trim() && hasValidNvidiaKey && (draft.service !== 'custom' || /^https:\/\//i.test(draft.baseUrl.trim())));

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const id = draft.id || crypto.randomUUID();
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({
        id,
        name: draft.name.trim() || `${service.label} · ${draft.model.trim()}`,
        service: draft.service,
        provider: service.provider,
        apiKey: draft.apiKey.trim(),
        model: draft.model.trim(),
        baseUrl: service.provider === 'openai-compatible' ? (draft.service === 'custom' ? draft.baseUrl.trim() : service.baseUrl) : undefined,
      });
      onSelect(id);
      setDraft(emptyDraft());
      setShowKey(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Connection could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const editConnection = (connection: CustomAIConnection) => {
    setDraft({
      id: connection.id,
      name: connection.name,
      service: connection.service,
      apiKey: '',
      model: connection.model,
      baseUrl: connection.baseUrl || serviceDetails(connection.service).baseUrl || '',
    });
    setShowKey(false);
  };

  const testConnection = async (connection: CustomAIConnection) => {
    if (connection.service === 'nvidia' && !connection.isStored && !connection.apiKey.startsWith('nvapi-')) {
      setTestState({ id: connection.id, status: 'error', message: 'Replace this with the NVIDIA key beginning with nvapi-, not the model ID.' });
      return;
    }
    setTestState({ id: connection.id, status: 'testing', message: 'Contacting the provider…' });
    try {
      await testCustomAIConnection(connection);
      setTestState({ id: connection.id, status: 'success', message: 'Connection works.' });
    } catch (error) {
      setTestState({ id: connection.id, status: 'error', message: error instanceof Error ? error.message : 'Connection failed.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 sm:p-6 grid place-items-center" role="dialog" aria-modal="true" aria-labelledby="ai-connections-title">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-lg shadow-2xl border border-slate-200">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 grid place-items-center shrink-0"><KeyRound size={18} /></span>
            <div>
              <h2 id="ai-connections-title" className="font-semibold text-slate-900">Your AI connections</h2>
              <p className="mt-0.5 text-xs text-slate-500">Keys are encrypted for your account and used only by the secure backend when you select that provider.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close AI connections"><X size={18} /></button>
        </header>

        <div className="p-5 space-y-6">
          {connections.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-slate-500">Saved connections</h3>
              <div className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                {connections.map((connection) => (
                  <div key={connection.id} className="py-3 flex items-center gap-3">
                    <input type="radio" name="active-ai-connection" checked={selectedId === connection.id} onChange={() => onSelect(connection.id)} className="accent-indigo-600" aria-label={`Use ${connection.name}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{connection.name}</p>
                      <p className="text-xs text-slate-500 truncate">{serviceDetails(connection.service).label} · {connection.model} · {connection.keyHint ? `••••${connection.keyHint}` : maskedKey(connection.apiKey)}</p>
                      {testState?.id === connection.id && testState.message && <p className={`mt-1 text-xs ${testState.status === 'success' ? 'text-emerald-700' : testState.status === 'testing' ? 'text-indigo-700' : 'text-red-700'}`}>{testState.message}</p>}
                    </div>
                    <button type="button" onClick={() => testConnection(connection)} disabled={testState?.id === connection.id && testState.status === 'testing'} className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-50 disabled:opacity-50">
                      {testState?.id === connection.id && testState.status === 'testing' ? <Loader2 size={14} className="animate-spin" /> : testState?.id === connection.id && testState.status === 'success' ? <CheckCircle2 size={14} /> : 'Test'}
                    </button>
                    <button type="button" onClick={() => editConnection(connection)} className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-md" aria-label={`Edit ${connection.name}`}><Pencil size={15} /></button>
                    <button type="button" onClick={() => { if (window.confirm(`Delete “${connection.name}”?`)) void onDelete(connection.id); }} className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md" aria-label={`Delete ${connection.name}`}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Plus size={16} />{draft.id ? 'Edit connection' : 'Add connection'}</h3>
            <form onSubmit={saveDraft} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-600">
                Provider
                <select value={draft.service} onChange={(event) => { const next = event.target.value as CustomAIService; setDraft((current) => ({ ...current, service: next, baseUrl: SERVICES[next].baseUrl || '' })); }} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md bg-white text-sm text-slate-800 focus:border-indigo-500">
                  {Object.entries(SERVICES).map(([value, details]) => <option key={value} value={value}>{details.label}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Connection name
                <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="My study model" maxLength={80} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:border-indigo-500" />
              </label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                Model ID
                <input required value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder="Paste the exact model ID from your provider" maxLength={160} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:border-indigo-500" />
              </label>
              {draft.service === 'custom' && (
                <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                  Secure API base URL
                  <input required type="url" value={draft.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://provider.example/v1" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:border-indigo-500" />
                </label>
              )}
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                API key
                <span className="relative mt-1 block">
                  <input required={!existingConnection?.isStored} type={showKey ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={existingConnection?.isStored ? 'Leave blank to keep the saved key' : 'Paste your provider API key'} autoComplete="off" className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-md text-sm focus:border-indigo-500" />
                  <button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" aria-label={showKey ? 'Hide API key' : 'Show API key'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </span>
                {draft.service === 'nvidia' && <span className={`mt-1 block text-[11px] ${draft.apiKey && !hasValidNvidiaKey ? 'text-red-700' : 'text-slate-500'}`}>NVIDIA Build keys begin with nvapi-.</span>}
              </label>
              {saveError && <p role="alert" className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</p>}
              <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-slate-500">ChatGPT Plus and Claude Pro do not include API access; use a provider-issued API key.</p>
                <div className="flex gap-2 shrink-0">
                  {draft.id && <button type="button" onClick={() => setDraft(emptyDraft())} className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancel edit</button>}
                  <button type="submit" disabled={!canSave || isSaving} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-40">{isSaving && <Loader2 size={13} className="animate-spin" />}{isSaving ? 'Encrypting…' : 'Save connection'}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
