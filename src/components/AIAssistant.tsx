import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, Copy, Crown, HelpCircle, Image as ImageIcon, KeyRound, ListFilter, Loader2, Lock, Mic, Plus, Quote, Radio, Send, Sparkles, Square } from 'lucide-react';
import { AccountIdentity, AccountSummary, AIInteraction, AIModelPreference, AISourceReference, CustomAIConnection } from '../types';
import { AIRequestError, askAIAboutPage } from '../services/ai';
import { askCustomAI } from '../services/customAI';
import { v4 as uuidv4 } from 'uuid';
import Markdown from 'react-markdown';
import { EditInsertModal } from './EditInsertModal';
import { AIConnectionsModal } from './AIConnectionsModal';
import { loadCloudPreferences, saveCloudPreferences } from '../services/cloudData';
import { deleteEncryptedConnection, loadSavedConnections, saveEncryptedConnection } from '../services/connectionStore';
import { buildQuestionContextBundle } from '../utils/documentContext';
import { referencesUsedInAnswer } from '../utils/answerReferences';

interface AIAssistantProps {
  pageNumber: number;
  pageImage: string | null;
  pageText: string;
  documentContext: string;
  documentPages?: string[];
  isDocumentContextLoading: boolean;
  documentContextProgress?: string | null;
  scope?: 'page' | 'document';
  history: AIInteraction[];
  account: AccountSummary | AccountIdentity | null;
  onRemainingChange: (remaining: number, remainingPercent?: number) => void;
  onUpgrade: () => void;
  onAddInteraction: (interaction: AIInteraction) => void;
  onInsertToNotes: (text: string, questionHeader?: string) => void;
  onInsertRecordingNotes: (pageNumber: number, text: string, questionHeader?: string) => void;
  onReferenceSelect: (reference: AISourceReference) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognition() {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}

function lectureNotesPrompt(transcript: string) {
  return `Create clear class notes using both the lecture transcription and the supplied PDF page content. Keep the lecturer's terminology and explanations where useful. Explain the slide through the lecturer's explanation, and capture examples, definitions, warnings, comparisons, and every important point said aloud. Do not invent details. Organize the notes with short headings and bullet points. Do not mention these instructions.\n\nLecture transcription:\n${transcript.slice(0, 20_000)}`;
}

const pageQuickPrompts = ['Summarize this page', 'Explain the key ideas', 'Create 3 quiz questions'];
const documentQuickPrompts = ['Summarize the whole document', 'Create a complete study guide', 'List the main topics and conclusions'];
const modelOptions: Array<{ value: AIModelPreference; label: string }> = [
  { value: 'basic', label: 'Study Basic' },
  { value: 'auto', label: 'Auto · Best available' },
  { value: 'gemini-flash', label: 'Gemini 3.6 Flash' },
  { value: 'gemini-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { value: 'qwen', label: 'Qwen 3' },
  { value: 'glm', label: 'GLM 4.7 Flash' },
  { value: 'gemma', label: 'Gemma 4' },
  { value: 'llama', label: 'Llama 3.2' },
  { value: 'nemotron', label: 'NVIDIA Nemotron 3' },
];
const CONNECTIONS_SESSION_KEY = 'study-assistant-session-ai-connections';
const SELECTED_CONNECTION_SESSION_KEY = 'study-assistant-session-selected-ai-connection';
const customServices = new Set(['openai', 'openrouter', 'nvidia', 'groq', 'together', 'gemini', 'anthropic', 'custom']);
const customProviders = new Set(['openai-compatible', 'gemini', 'anthropic']);

function isCustomAIConnection(item: unknown): item is CustomAIConnection {
  if (!item || typeof item !== 'object') return false;
  const connection = item as Partial<CustomAIConnection>;
  return typeof connection.id === 'string'
    && typeof connection.name === 'string'
    && typeof connection.apiKey === 'string'
    && typeof connection.model === 'string'
    && typeof connection.service === 'string'
    && customServices.has(connection.service)
    && typeof connection.provider === 'string'
    && customProviders.has(connection.provider)
    && (connection.baseUrl === undefined || typeof connection.baseUrl === 'string');
}

function displayModel(model: string) {
  if (model.includes('llama-3.2-1b')) return 'Study Basic';
  if (model === 'gemini-3.6-flash') return 'Gemini 3.6 Flash';
  if (model === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash-Lite';
  if (model.includes('qwen')) return 'Qwen 3';
  if (model.includes('glm-4.7')) return 'GLM 4.7 Flash';
  if (model.includes('gemma-4')) return 'Gemma 4';
  if (model.includes('nemotron-3')) return 'NVIDIA Nemotron 3';
  if (model.includes('llama')) return 'Llama';
  if (model === 'page-text-fallback') return 'Page text';
  return model;
}

function normalizeModelResponse(value: string) {
  return value
    .replace(/\\\$/g, '$')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([A-Za-z][A-Za-z0-9_{}^\\]*(?:\s*[=+\-*/]\s*[A-Za-z0-9_.{}^\\]+)?)\$/g, '$1')
    .replace(/\*\*\*(.+?)\*\*\*/g, '**$1**')
    .replace(/^\s*\*{3,}\s*$/gm, '')
    .replace(/\\([*_`])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function AIAssistant({
  pageNumber,
  pageImage,
  pageText,
  documentContext,
  documentPages = [],
  isDocumentContextLoading,
  documentContextProgress,
  scope = 'page',
  history,
  account,
  onRemainingChange,
  onUpgrade,
  onAddInteraction,
  onInsertToNotes,
  onInsertRecordingNotes,
  onReferenceSelect,
}: AIAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeImage, setIncludeImage] = useState(false);
  const [modelPreference, setModelPreference] = useState<AIModelPreference>('auto');
  const [allowFallback, setAllowFallback] = useState(true);
  const [referencesEnabled, setReferencesEnabled] = useState(false);
  const [manualRangeEnabled, setManualRangeEnabled] = useState(false);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [connections, setConnections] = useState<CustomAIConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'page' | 'continuous' | null>(null);
  const [recordingPage, setRecordingPage] = useState<number | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [voiceJobs, setVoiceJobs] = useState(0);
  const assistantRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const continuousRecordingRef = useRef(false);
  const recordingSnapshotRef = useRef<{ pageNumber: number; connectionId: string } | null>(null);
  const latestPageRef = useRef({ pageNumber, pageText, documentPages });
  const previousPageRef = useRef(pageNumber);
  const [modelMenuMaxHeight, setModelMenuMaxHeight] = useState(288);
  const [insertModalState, setInsertModalState] = useState({ isOpen: false, promptQuestion: '', aiResponse: '' });
  const hasProAccess = Boolean(account && 'plan' in account && account.plan === 'pro');
  const remainingPercent = account && 'aiRemainingPercent' in account ? account.aiRemainingPercent : 0;
  const maxPage = Math.max(1, documentPages.length);

  useEffect(() => {
    if (manualRangeEnabled) return;
    setRangeStart(Math.min(pageNumber, maxPage));
    setRangeEnd(Math.min(maxPage, pageNumber + 2));
  }, [manualRangeEnabled, maxPage, pageNumber]);

  useEffect(() => {
    const savedModel = window.localStorage.getItem('study-assistant-model') as AIModelPreference | null;
    let sessionConnections: CustomAIConnection[] = [];
    try {
      const parsed: unknown = JSON.parse(window.sessionStorage.getItem(CONNECTIONS_SESSION_KEY) || '[]');
      sessionConnections = Array.isArray(parsed) ? parsed.filter(isCustomAIConnection) : [];
    } catch {
      sessionConnections = [];
    }
    const savedConnectionId = window.sessionStorage.getItem(SELECTED_CONNECTION_SESSION_KEY);
    const selectedId = sessionConnections.some((item) => item.id === savedConnectionId) ? savedConnectionId : sessionConnections[0]?.id || null;
    setConnections(sessionConnections);
    setSelectedConnectionId(selectedId);
    if (savedModel === 'custom' && selectedId && hasProAccess) setModelPreference('custom');
    else if (savedModel && modelOptions.some((option) => option.value === savedModel)) setModelPreference(savedModel);
    setAllowFallback(window.localStorage.getItem('study-assistant-fallback') !== 'false');
    setReferencesEnabled(window.localStorage.getItem('study-assistant-references') === 'true');
    if (account) {
      if (!hasProAccess) {
        setModelPreference('basic');
        setAllowFallback(false);
      }
      Promise.all([
        (async () => {
          for (const connection of sessionConnections) await saveEncryptedConnection(connection);
          const saved = await loadSavedConnections();
          setConnections(saved);
          window.sessionStorage.removeItem(CONNECTIONS_SESSION_KEY);
          return saved;
        })(),
        loadCloudPreferences(account.userId),
      ])
        .then(([saved, cloud]) => {
          if (!cloud) {
            setSelectedConnectionId(saved[0]?.id || null);
            if (!hasProAccess) {
              setModelPreference('basic');
              setAllowFallback(false);
            }
            return;
          }
          if (hasProAccess) {
            if (cloud.modelPreference === 'basic') setModelPreference('auto');
            else if (modelOptions.some((option) => option.value === cloud.modelPreference) || cloud.modelPreference === 'custom') setModelPreference(cloud.modelPreference);
            setAllowFallback(cloud.allowFallback !== false);
          } else {
            setModelPreference('basic');
            setAllowFallback(false);
          }
          setReferencesEnabled(cloud.referencesEnabled === true);
          setSelectedConnectionId(saved.some((connection) => connection.id === cloud.selectedConnectionId) ? cloud.selectedConnectionId : saved[0]?.id || null);
        })
        .catch((loadError) => console.error('Failed to load cloud AI settings', loadError))
        .finally(() => setPreferencesLoaded(true));
    } else {
      setConnections([]);
      setSelectedConnectionId(null);
      setConnectionsOpen(false);
      setModelPreference('basic');
      setAllowFallback(false);
      setPreferencesLoaded(true);
    }
  }, [account?.userId, hasProAccess]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem('study-assistant-model', modelPreference);
    window.localStorage.setItem('study-assistant-fallback', String(allowFallback));
    window.localStorage.setItem('study-assistant-references', String(referencesEnabled));
    if (selectedConnectionId) window.sessionStorage.setItem(SELECTED_CONNECTION_SESSION_KEY, selectedConnectionId);
    else window.sessionStorage.removeItem(SELECTED_CONNECTION_SESSION_KEY);
    if (account) saveCloudPreferences(account.userId, { modelPreference: hasProAccess ? modelPreference : 'basic', allowFallback: hasProAccess ? allowFallback : false, selectedConnectionId, referencesEnabled }).catch((saveError) => console.error('Failed to save cloud AI preferences', saveError));
  }, [modelPreference, allowFallback, referencesEnabled, selectedConnectionId, preferencesLoaded, account?.userId, hasProAccess]);

  useEffect(() => {
    setIncludeImage(scope === 'page' && hasProAccess && !pageText.trim());
    setError(null);
  }, [pageNumber, pageText, hasProAccess, scope]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const fitMenuInsideAssistant = () => {
      const assistantBounds = assistantRef.current?.getBoundingClientRect();
      const triggerBounds = modelTriggerRef.current?.getBoundingClientRect();
      if (!assistantBounds || !triggerBounds) return;
      const availableHeight = Math.floor(triggerBounds.top - assistantBounds.top - 16);
      setModelMenuMaxHeight(Math.max(64, Math.min(420, availableHeight)));
    };
    const frame = window.requestAnimationFrame(() => {
      fitMenuInsideAssistant();
      if (modelMenuRef.current) modelMenuRef.current.scrollTop = 0;
    });
    const observer = new ResizeObserver(fitMenuInsideAssistant);
    if (assistantRef.current) observer.observe(assistantRef.current);
    if (modelTriggerRef.current) observer.observe(modelTriggerRef.current);
    window.addEventListener('resize', fitMenuInsideAssistant);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', fitMenuInsideAssistant);
    };
  }, [modelMenuOpen]);

  const handleAsk = async (text: string) => {
    if (!text.trim() || isLoading || isDocumentContextLoading) return;
    if (scope === 'page' && !pageText.trim() && !pageImage) {
      setError('The page is still being prepared. Try again in a moment.');
      return;
    }
    if (scope === 'document' && !documentContext.trim()) {
      setError('The whole document is still being prepared. Try again in a moment.');
      return;
    }

    setIsLoading(true);
    setPendingPrompt(text.trim());
    setError(null);
    setPrompt('');
    try {
      const activeConnection = connections.find((connection) => connection.id === selectedConnectionId);
      if (modelPreference === 'custom' && !activeConnection) {
        setConnectionsOpen(true);
        throw new AIRequestError('Add or select an API connection before using your model.');
      }
      const normalizedStart = Math.max(1, Math.min(maxPage, rangeStart));
      const normalizedEnd = Math.max(normalizedStart, Math.min(maxPage, rangeEnd));
      const selectedRange = manualRangeEnabled ? { start: normalizedStart, end: normalizedEnd } : undefined;
      const contextBundle = buildQuestionContextBundle(documentPages, text, pageNumber, scope, referencesEnabled, undefined, selectedRange);
      const request = {
        prompt: text.trim(),
        pageNumber,
        pageText,
        documentContext: contextBundle.context || documentContext.slice(0, scope === 'document' ? 20_000 : 14_000),
        pageImage: scope === 'page' && includeImage ? pageImage || undefined : undefined,
        history,
        scope,
        referencesEnabled,
      };
      let result;
      if (modelPreference === 'custom' && activeConnection) {
        try {
          result = { ...(await askCustomAI({ ...request, connection: activeConnection })), requestedModel: 'custom' as const, fallbackUsed: false };
        } catch (customError) {
          if (!allowFallback) throw customError;
          const fallback = await askAIAboutPage({ ...request, modelPreference: 'auto', allowFallback: true });
          result = { ...fallback, requestedModel: 'custom' as const, fallbackUsed: true };
        }
      } else {
        result = await askAIAboutPage({ ...request, modelPreference, allowFallback });
      }
      if (typeof result.remaining === 'number') onRemainingChange(result.remaining, result.remainingPercent);
      const cleanedResponse = normalizeModelResponse(result.response);
      const usedReferences = referencesEnabled ? referencesUsedInAnswer(cleanedResponse, contextBundle.references) : [];
      onAddInteraction({
        id: uuidv4(),
        prompt: text.trim(),
        response: cleanedResponse,
        createdAt: Date.now(),
        insertedIntoNotes: false,
        provider: result.provider,
        model: result.model,
        requestedModel: result.requestedModel,
        fallbackUsed: result.fallbackUsed,
        references: usedReferences.length > 0 ? usedReferences : undefined,
      });
    } catch (requestError) {
      if (requestError instanceof AIRequestError) {
        if (typeof requestError.remaining === 'number') onRemainingChange(requestError.remaining, requestError.remainingPercent);
        setError(requestError.message);
      }
      else setError('The AI assistant could not answer right now. Try again.');
    } finally {
      setPendingPrompt(null);
      setIsLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('The answer could not be copied automatically.');
    }
  };

  const activeConnection = connections.find((connection) => connection.id === selectedConnectionId) || null;
  const activeModelLabel = modelPreference === 'custom'
    ? activeConnection?.name || 'Custom model'
    : modelOptions.find((option) => option.value === modelPreference)?.label || 'Auto · Best available';

  const processVoiceTranscript = async (snapshot: { pageNumber: number; connectionId: string }, transcript: string) => {
    const connection = connections.find((item) => item.id === snapshot.connectionId);
    if (!connection) {
      setVoiceNotice('The selected Custom API connection is no longer available.');
      return;
    }
    const current = latestPageRef.current;
    const recordedPageText = current.documentPages[snapshot.pageNumber - 1]
      || (current.pageNumber === snapshot.pageNumber ? current.pageText : '');
    setVoiceNotice(null);
    setVoiceJobs((count) => count + 1);
    try {
      const result = await askCustomAI({
        connection,
        prompt: lectureNotesPrompt(transcript),
        pageNumber: snapshot.pageNumber,
        pageText: recordedPageText,
        documentContext: `[Page ${snapshot.pageNumber}]\n${recordedPageText}`,
        scope: 'page',
        referencesEnabled: false,
        history: [],
      });
      onInsertRecordingNotes(snapshot.pageNumber, normalizeModelResponse(result.response), `Lecture notes - Page ${snapshot.pageNumber}`);
      setVoiceNotice(`Lecture notes were added to page ${snapshot.pageNumber}.`);
    } catch (voiceError) {
      setVoiceNotice(voiceError instanceof Error ? voiceError.message : 'Your Custom API could not create the lecture notes.');
    } finally {
      setVoiceJobs((count) => Math.max(0, count - 1));
    }
  };

  const startVoiceRecording = (mode: 'page' | 'continuous') => {
    if (recognitionRef.current) return;
    const connection = connections.find((item) => item.id === selectedConnectionId) || connections[0];
    if (!connection) {
      setVoiceNotice('Add a Custom API connection before recording. Voice notes never use the shared AI allowance.');
      setConnectionsOpen(true);
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceNotice('Voice transcription is not supported in this browser. Use the latest Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    const snapshot = { pageNumber: latestPageRef.current.pageNumber, connectionId: connection.id };
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    recordingSnapshotRef.current = snapshot;
    continuousRecordingRef.current = mode === 'continuous';
    recognitionRef.current = recognition;
    setRecordingMode(mode);
    setRecordingPage(snapshot.pageNumber);
    setVoiceNotice(null);

    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || '';
        if (result.isFinal) transcriptRef.current += `${text} `;
        else interim += text;
      }
      interimTranscriptRef.current = interim;
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        continuousRecordingRef.current = false;
        setVoiceNotice('Microphone access was blocked. Allow microphone access and try again.');
      } else {
        setVoiceNotice(`Voice transcription stopped: ${event.error}.`);
      }
    };
    recognition.onend = () => {
      const finishedSnapshot = recordingSnapshotRef.current;
      const finishedTranscript = `${transcriptRef.current} ${interimTranscriptRef.current}`.trim();
      const shouldContinue = continuousRecordingRef.current;
      recognitionRef.current = null;
      recordingSnapshotRef.current = null;
      transcriptRef.current = '';
      interimTranscriptRef.current = '';
      if (finishedSnapshot && finishedTranscript) void processVoiceTranscript(finishedSnapshot, finishedTranscript);
      else if (!shouldContinue) setVoiceNotice('No speech was detected in this recording.');

      if (shouldContinue) {
        window.setTimeout(() => startVoiceRecording('continuous'), 120);
      } else {
        setRecordingMode(null);
        setRecordingPage(null);
      }
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      continuousRecordingRef.current = false;
      setRecordingMode(null);
      setRecordingPage(null);
      setVoiceNotice('Voice recording could not start. Check microphone permission and try again.');
    }
  };

  const stopVoiceRecording = () => {
    continuousRecordingRef.current = false;
    setVoiceNotice('Finishing the transcription...');
    recognitionRef.current?.stop();
  };

  useEffect(() => {
    latestPageRef.current = { pageNumber, pageText, documentPages };
    if (previousPageRef.current !== pageNumber) {
      previousPageRef.current = pageNumber;
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  }, [documentPages, pageNumber, pageText]);

  useEffect(() => () => {
    continuousRecordingRef.current = false;
    recognitionRef.current?.abort();
  }, []);

  const chooseModel = (value: AIModelPreference) => {
    setModelPreference(value);
    setModelMenuOpen(false);
  };

  const saveConnection = async (connection: CustomAIConnection) => {
    const saved = await saveEncryptedConnection(connection);
    setConnections((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved]);
  };

  const deleteConnection = async (id: string) => {
    await deleteEncryptedConnection(id);
    setConnections((current) => {
      const next = current.filter((item) => item.id !== id);
      if (selectedConnectionId === id) {
        setSelectedConnectionId(next[0]?.id || null);
        if (next.length === 0) setModelPreference(hasProAccess ? 'auto' : 'basic');
      }
      return next;
    });
  };

  return (
    <div ref={assistantRef} className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
      <div className="relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-indigo-600 shrink-0" />
          <h3 className="font-medium text-slate-800 text-sm truncate">{scope === 'document' ? 'AI Document Assistant' : 'AI Page Assistant'}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden whitespace-nowrap text-xs font-medium text-slate-500 xl:inline">Document-aware</span>
          <button type="button" onClick={() => setIncludeImage((enabled) => !enabled)} disabled={!hasProAccess || !pageImage || scope === 'document'} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${includeImage ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title={includeImage ? 'Page image is included' : 'Include the current page image'} aria-label="Include page image" aria-pressed={includeImage}><ImageIcon size={15} /></button>
          <button type="button" onClick={() => setReferencesEnabled((enabled) => !enabled)} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${referencesEnabled ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title={referencesEnabled ? 'References are enabled' : 'Add clickable PDF references'} aria-label="References" aria-pressed={referencesEnabled}><Quote size={15} /></button>
          <div className="relative">
            <button type="button" onClick={() => { setRangeMenuOpen((open) => !open); setVoiceMenuOpen(false); setVoiceHelpOpen(false); }} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${manualRangeEnabled ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title="Choose which PDF pages the AI should use" aria-label="Manual page range" aria-expanded={rangeMenuOpen}><ListFilter size={15} /></button>
            {rangeMenuOpen && <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl">
              <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={manualRangeEnabled} onChange={(event) => setManualRangeEnabled(event.target.checked)} className="accent-indigo-600" />Use a manual page range</label>
              <p className="mt-1 text-[11px] text-slate-500">Limit answers to consecutive pages you choose.</p>
              {manualRangeEnabled && <div className="mt-3 flex items-center gap-1.5"><span>Pages</span><input type="number" min={1} max={maxPage} value={rangeStart} onChange={(event) => { const next = Math.max(1, Math.min(maxPage, Number(event.target.value) || 1)); setRangeStart(next); setRangeEnd((current) => Math.max(current, next)); }} className="h-8 w-14 rounded border border-slate-200 px-1.5 text-center" aria-label="First context page" /><span>to</span><input type="number" min={rangeStart} max={maxPage} value={rangeEnd} onChange={(event) => setRangeEnd(Math.max(rangeStart, Math.min(maxPage, Number(event.target.value) || rangeStart)))} className="h-8 w-14 rounded border border-slate-200 px-1.5 text-center" aria-label="Last context page" /><span>of {maxPage}</span></div>}
            </div>}
          </div>
          <div className="relative flex items-center gap-0.5">
            <button type="button" onClick={() => { setVoiceMenuOpen((open) => !open); setVoiceHelpOpen(false); setRangeMenuOpen(false); }} className={`relative grid h-8 w-8 place-items-center rounded-md border transition-colors ${recordingMode ? 'border-red-300 bg-red-50 text-red-700' : voiceJobs > 0 ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title="Lecture voice notes" aria-label="Lecture voice notes" aria-expanded={voiceMenuOpen}><Mic size={15} />{recordingMode && <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}</button>
            <button type="button" onClick={() => { setVoiceHelpOpen((open) => !open); setVoiceMenuOpen(false); setRangeMenuOpen(false); }} className="grid h-8 w-7 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-indigo-700" title="How voice notes work" aria-label="How voice notes work" aria-expanded={voiceHelpOpen}><HelpCircle size={15} /></button>
            {voiceHelpOpen && <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-xl">Your browser transcribes the lecture. NoteMyDoc combines that transcript with the current PDF page and sends it only to your selected Custom API. Shared AI usage is never consumed.</div>}
            {voiceMenuOpen && <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold text-slate-800">Lecture voice notes</p><p className="mt-0.5 text-[11px] text-slate-500">Custom API required</p></div><button type="button" onClick={() => setConnectionsOpen(true)} className="max-w-32 truncate rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-indigo-300">{activeConnection?.name || 'Add Custom API'}</button></div>
              {recordingMode ? <button type="button" onClick={stopVoiceRecording} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"><Square size={12} fill="currentColor" />Stop and create notes</button> : activeConnection ? <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => { startVoiceRecording('page'); setVoiceMenuOpen(false); }} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-indigo-200 px-2 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"><Mic size={13} />This page</button><button type="button" onClick={() => { startVoiceRecording('continuous'); setVoiceMenuOpen(false); }} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><Radio size={13} />Auto by page</button></div> : <button type="button" onClick={() => setConnectionsOpen(true)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><KeyRound size={13} />Add Custom API to record</button>}
              {(recordingMode || voiceJobs > 0) && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500" aria-live="polite">{recordingMode ? <><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Recording page {recordingPage}{recordingMode === 'continuous' ? ' - auto by page' : ''}</> : <><Loader2 size={12} className="animate-spin text-indigo-600" />Creating voice notes...</>}</p>}
              {voiceNotice && <p className="mt-2 text-[11px] text-slate-600" aria-live="polite">{voiceNotice}</p>}
            </div>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {history.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles size={24} className="mx-auto text-indigo-500" />
            <p className="mt-3 font-medium text-slate-700 text-sm">{scope === 'document' ? 'Ask about the whole document' : `Ask about page ${pageNumber}`}</p>
            <p className="text-xs text-slate-500 mt-1">{scope === 'document' ? 'Answers consider every indexed page and can be inserted into whole-document notes.' : "Answers are grounded in this page's text and optional page image."}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(scope === 'document' ? documentQuickPrompts : pageQuickPrompts).map((item) => (
                <button key={item} type="button" onClick={() => handleAsk(item)} disabled={isDocumentContextLoading} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40">{item}</button>
              ))}
            </div>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex justify-end"><div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium max-w-[85%]">{item.prompt}</div></div>
              <div className="bg-indigo-50/70 text-indigo-950 px-4 py-3 rounded-lg text-sm border border-indigo-100 space-y-3">
                <div className="prose prose-sm prose-slate max-w-none leading-relaxed"><Markdown>{item.response}</Markdown></div>
                {referencesUsedInAnswer(item.response, item.references || []).length > 0 && (
                  <div className="rounded-md border border-indigo-100 bg-white/80 p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-indigo-700"><Quote size={12} />Sources</div>
                    <div className="flex flex-wrap gap-2">
                      {referencesUsedInAnswer(item.response, item.references || []).map((reference) => (
                        <button key={`${reference.number}-${reference.pageNumber}-${reference.quote.slice(0, 20)}`} type="button" onClick={() => onReferenceSelect(reference)} className="group flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-slate-900" title={reference.quote}>
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-indigo-600 font-bold text-white">{reference.number}</span>
                          <span className="truncate">Page {reference.pageNumber} · {reference.quote}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {item.model && <div className="flex items-center gap-1.5 text-[11px] text-indigo-700"><Bot size={13} />Answered by {displayModel(item.model)}{item.fallbackUsed ? ' · automatic fallback' : ''}</div>}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-100">
                  <button type="button" onClick={() => setInsertModalState({ isOpen: true, promptQuestion: item.prompt, aiResponse: item.response })} className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-white hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200"><Plus size={14} />Insert to notes</button>
                  <button type="button" onClick={() => handleCopy(item.id, item.response)} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
                    {copiedId === item.id ? <><Check size={14} className="text-emerald-600" />Copied</> : <><Copy size={14} />Copy</>}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {pendingPrompt && (
          <div className="space-y-3" aria-live="polite">
            <div className="flex justify-end"><div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium max-w-[85%]">{pendingPrompt}</div></div>
            <div className="flex items-center gap-2 bg-indigo-50/70 border border-indigo-100 rounded-lg px-4 py-3 text-sm text-indigo-800">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              <span>{scope === 'document' ? 'Finding the best passages and preparing an answer…' : `Thinking about page ${pageNumber} and the document…`}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 bg-white shrink-0">
        {isDocumentContextLoading && <p className="mb-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin text-indigo-600" />{documentContextProgress || 'Indexing the whole document…'}</p>}
        {error && <p role="alert" className="mb-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="relative flex items-center gap-2 text-xs text-slate-600">
            <Bot size={14} className="text-indigo-600" />
            <button ref={modelTriggerRef} type="button" onClick={() => setModelMenuOpen((open) => !open)} className="flex max-w-52 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300" aria-haspopup="menu" aria-expanded={modelMenuOpen}>
              <span className="truncate">{hasProAccess ? activeModelLabel : 'Study Basic'}</span><ChevronDown size={13} className="shrink-0" />
            </button>
            {modelMenuOpen && <div ref={modelMenuRef} style={{ maxHeight: modelMenuMaxHeight }} className="custom-scrollbar absolute bottom-10 left-5 z-40 w-64 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl" role="menu">
              {!hasProAccess && <><button type="button" onClick={() => chooseModel('basic')} className="flex w-full items-center justify-between rounded-md bg-indigo-50 px-3 py-2 text-left text-xs font-semibold text-indigo-800"><span className="flex items-center gap-2"><Check size={14} />Study Basic</span><span className="text-[10px] font-medium text-indigo-600">Included</span></button><div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase text-slate-400">Premium models</div></>}
              {modelOptions.filter((option) => option.value !== 'basic').map((option) => hasProAccess
                ? <button key={option.value} type="button" onClick={() => chooseModel(option.value)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 ${modelPreference === option.value ? 'font-semibold text-indigo-700' : 'text-slate-700'}`} role="menuitem"><span>{option.label}</span>{modelPreference === option.value && <Check size={14} />}</button>
                : <button key={option.value} type="button" onClick={() => { setModelMenuOpen(false); onUpgrade(); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" role="menuitem"><span className="flex items-center gap-2"><Crown size={13} />{option.label}</span><Lock size={13} /></button>)}
              {hasProAccess && connections.length > 0 && <><div className="mx-2 my-1 h-px bg-slate-100" /><div className="px-3 py-1 text-[10px] font-semibold uppercase text-slate-400">Your models</div>{connections.map((connection) => <button key={connection.id} type="button" onClick={() => { setSelectedConnectionId(connection.id); chooseModel('custom'); }} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 ${modelPreference === 'custom' && activeConnection?.id === connection.id ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}><span className="truncate">{connection.name}</span>{modelPreference === 'custom' && activeConnection?.id === connection.id && <Check size={14} />}</button>)}</>}
            </div>}
            <button type="button" onClick={() => hasProAccess ? setConnectionsOpen(true) : onUpgrade()} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${hasProAccess ? 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:text-indigo-700'}`} title={hasProAccess ? 'Manage Custom API connections' : 'Custom API requires Premium'} aria-label={hasProAccess ? 'Manage Custom API connections' : 'Upgrade for Custom API'}><KeyRound size={14} /><span>Custom API</span>{!hasProAccess && <Lock size={12} />}</button>
          </div>
          {hasProAccess ? <div className="flex items-center gap-3"><span className="text-xs font-semibold text-indigo-700">{remainingPercent}% left</span><label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={allowFallback} onChange={(event) => setAllowFallback(event.target.checked)} className="accent-indigo-600" />Auto fallback</label></div> : <button type="button" onClick={onUpgrade} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"><Lock size={12} />{remainingPercent}% AI usage left · Upgrade</button>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); handleAsk(prompt); }} className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={isDocumentContextLoading ? 'Preparing document context…' : scope === 'document' ? 'Ask anything about the whole document…' : 'Ask about this page or the whole document…'}
            disabled={isLoading || isDocumentContextLoading}
            maxLength={4000}
            className="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:border-indigo-500 disabled:opacity-60"
          />
          <button type="submit" disabled={!prompt.trim() || isLoading || isDocumentContextLoading} className="absolute right-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30" aria-label="Send question"><Send size={18} /></button>
        </form>
      </div>

      <EditInsertModal
        isOpen={insertModalState.isOpen}
        onClose={() => setInsertModalState((current) => ({ ...current, isOpen: false }))}
        promptQuestion={insertModalState.promptQuestion}
        aiResponse={insertModalState.aiResponse}
        onConfirmInsert={onInsertToNotes}
      />
      <AIConnectionsModal
        isOpen={connectionsOpen}
        connections={connections}
        selectedId={selectedConnectionId}
        onSelect={(id) => { setSelectedConnectionId(id); if (hasProAccess) setModelPreference('custom'); }}
        onSave={saveConnection}
        onDelete={deleteConnection}
        onClose={() => setConnectionsOpen(false)}
      />
    </div>
  );
}
