import { useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import type { CustomAIConnection } from '../types';
import { askCustomAI } from '../services/customAI';
import { loadSavedConnections } from '../services/connectionStore';
import { idleVoiceState, lecturePrompt, transcriptChunks, VoiceSession } from '../services/voiceSession';
import type { SpeechEngine, VoiceSegment, VoiceSessionState } from '../services/voiceSession';

export interface VoiceJob extends VoiceSegment {
  status: 'processing' | 'failed' | 'saved';
  error?: string;
  parts: string[];
}

export function useVoiceNotes(options: {
  userId?: string; documentId: string; pageNumber: number; pageText: string;
  onSave: (job: VoiceJob, response: string) => Promise<void>;
}) {
  const [session, setSession] = useState<VoiceSessionState>(idleVoiceState);
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [connections, setConnections] = useState<CustomAIConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controller = useRef<VoiceSession | null>(null);
  const latest = useRef({ options, connections, selectedId });
  latest.current = { options, connections, selectedId };
  const jobsRef = useRef<VoiceJob[]>([]);
  const generation = useRef(0);
  const running = useRef(new Set<string>());
  const persistence = useRef(Promise.resolve());
  const key = `voice-notes:${options.userId || 'guest'}:${options.documentId}`;

  const update = (job: VoiceJob) => {
    const next = jobsRef.current.some((item) => item.id === job.id)
      ? jobsRef.current.map((item) => item.id === job.id ? job : item) : [...jobsRef.current, job];
    jobsRef.current = next;
    setJobs(next);
    persistence.current = persistence.current.catch(() => undefined).then(() => set(key, next));
    return persistence.current;
  };
  const process = async (initial: VoiceJob) => {
    if (running.current.has(initial.id)) return;
    running.current.add(initial.id);
    const run = generation.current;
    let job = { ...initial, status: 'processing' as VoiceJob['status'], error: undefined };
    try {
      if (!job.transcript.trim()) throw new Error('No speech was detected. Check the live transcript and microphone, then record again.');
      await update(job);
      const connection = latest.current.connections.find((item) => item.id === job.connectionId);
      if (!connection) throw new Error('Custom API unavailable. Select a connection and retry. Your transcript is kept.');
      const chunks = transcriptChunks(job.transcript);
      for (let part = job.parts.length; part < chunks.length; part += 1) {
        // Never use the shared AI router or fallback for lecture recordings.
        const result = await askCustomAI({ connection, prompt: lecturePrompt(chunks[part]),
          pageNumber: job.pageNumber, pageText: job.pageText, documentContext: `[Page ${job.pageNumber}]\n${job.pageText}`,
          scope: 'page', referencesEnabled: false, history: [] });
        if (run !== generation.current) return;
        job = { ...job, parts: [...job.parts, result.response] };
        await update(job);
      }
      await latest.current.options.onSave(job, job.parts.join('\n\n'));
      if (run === generation.current) await update({ ...job, status: 'saved' });
    } catch (error) {
      if (run === generation.current) await update({ ...job, status: 'failed', error: error instanceof Error ? error.message : 'Could not create notes. Your transcript is kept.' })
        .catch(() => setNotice('Browser storage is unavailable. Keep this screen open and copy your transcript.'));
    } finally { running.current.delete(initial.id); }
  };
  const processRef = useRef(process);
  processRef.current = process;

  const refreshConnections = async () => {
    if (!options.userId) return;
    try {
      const saved = await loadSavedConnections();
      setConnections(saved);
      setSelectedId((current) => saved.some((item) => item.id === current) ? current
        : saved.find((item) => item.id === window.sessionStorage.getItem('study-assistant-session-selected-ai-connection'))?.id || saved[0]?.id || null);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load Custom API connections.'); }
  };
  useEffect(() => {
    void refreshConnections();
    window.addEventListener('study-ai-connections-changed', refreshConnections);
    return () => window.removeEventListener('study-ai-connections-changed', refreshConnections);
  }, [options.userId]);

  useEffect(() => {
    const run = ++generation.current;
    setReady(false);
    const voice = new VoiceSession({
      createEngine: () => {
        const browser = window as typeof window & { SpeechRecognition?: new () => SpeechEngine; webkitSpeechRecognition?: new () => SpeechEngine };
        const Engine = browser.SpeechRecognition || browser.webkitSpeechRecognition;
        if (!Engine) throw new Error('Live transcription is unavailable in this browser. Use Chrome or Edge.');
        return new Engine();
      },
      onState: (state) => { if (generation.current === run) setSession(state); },
      onSegment: (segment, interrupted) => {
        const job: VoiceJob = { ...segment, status: 'failed', parts: [], error: 'Recording interrupted. Retry to create notes from the recovered transcript.' };
        if (interrupted) void update(job).catch(() => undefined);
        else void processRef.current(job);
      },
    });
    controller.current = voice;
    voice.setPage(latest.current.options.pageNumber, latest.current.options.pageText);
    void persistence.current.catch(() => undefined).then(() => get<VoiceJob[]>(key)).then((saved) => {
      if (generation.current !== run) return;
      jobsRef.current = (saved || []).map((job) => job.status === 'processing'
        ? { ...job, status: 'failed', error: 'Processing was interrupted. Retry to finish creating notes.' } : job);
      setJobs(jobsRef.current);
      setReady(true);
    }).catch(() => setNotice('Browser storage is unavailable. Enable it before recording.'));
    return () => { generation.current += 1; voice.dispose(); controller.current = null; };
  }, [key]);

  useEffect(() => { controller.current?.setPage(options.pageNumber, options.pageText); }, [options.pageNumber, options.pageText]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (session.phase !== 'idle' || jobs.some((job) => job.status === 'processing')) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session.phase, jobs]);

  return { session, jobs, ready, notice, connections, selectedId, select: setSelectedId, refreshConnections,
    start: (mode: 'page' | 'continuous') => {
      if (!ready || !selectedId) return;
      setNotice(null);
      controller.current?.start(mode, selectedId, navigator.language || 'en-US');
    },
    stop: () => controller.current?.stop(),
    retry: (job: VoiceJob) => {
      if (!selectedId) { setNotice('Add a Custom API before retrying.'); return; }
      void processRef.current({ ...job, connectionId: selectedId, parts: selectedId === job.connectionId ? job.parts : [] });
    },
  };
}
export type VoiceNotesController = ReturnType<typeof useVoiceNotes>;
