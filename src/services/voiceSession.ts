export interface SpeechEngine {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface VoiceSegment {
  id: string;
  pageNumber: number;
  pageText: string;
  connectionId: string;
  transcript: string;
  createdAt: number;
}

export interface VoiceSessionState {
  phase: 'idle' | 'starting' | 'recording' | 'finishing';
  mode: 'page' | 'continuous' | null;
  segment: VoiceSegment | null;
  error: string | null;
}

export const idleVoiceState: VoiceSessionState = { phase: 'idle', mode: null, segment: null, error: null };

// The session belongs to the document, not any of its tab/panel views.
export class VoiceSession {
  private state: VoiceSessionState = { ...idleVoiceState };
  private page = { pageNumber: 1, pageText: '' };
  private engine: SpeechEngine | null = null;
  private baseTranscript = '';
  private boundary = false;
  private disposed = false;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private language = 'en-US';
  private options: {
    createEngine: () => SpeechEngine;
    onState: (state: VoiceSessionState) => void;
    onSegment: (segment: VoiceSegment, interrupted?: boolean) => void;
  };

  constructor(options: VoiceSession['options']) { this.options = options; }

  private publish() {
    this.options.onState({ ...this.state, segment: this.state.segment ? { ...this.state.segment } : null });
  }

  setPage(pageNumber: number, pageText: string) {
    this.page = { pageNumber, pageText };
    if (!this.state.segment) return;
    if (this.state.segment.pageNumber === pageNumber) {
      if (pageText) this.state.segment.pageText = pageText;
      return;
    }
    if (this.state.mode === 'page') this.state.mode = null;
    this.finish();
  }

  start(mode: 'page' | 'continuous', connectionId: string, language: string) {
    if (this.disposed || this.state.segment) return;
    this.language = language;
    this.state = {
      phase: 'starting', mode, error: null,
      segment: { ...this.page, id: crypto.randomUUID(), connectionId, transcript: '', createdAt: Date.now() },
    };
    this.begin();
  }

  stop() {
    this.state.mode = null;
    this.finish();
  }

  private begin() {
    if (this.disposed || !this.state.segment || !this.state.mode) return;
    this.boundary = false;
    this.state.phase = 'starting';
    this.baseTranscript = this.state.segment.transcript;
    this.publish();
    try {
      const engine = this.options.createEngine();
      this.engine = engine;
      engine.continuous = true;
      engine.interimResults = true;
      engine.lang = this.language;
      engine.onstart = () => {
        if (this.engine !== engine || this.boundary) return;
        this.state.phase = 'recording';
        this.publish();
      };
      engine.onresult = (event) => {
        if (this.engine !== engine || !this.state.segment) return;
        // Results contain the entire current recognition run, including revised interim words.
        const words = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ');
        this.state.segment.transcript = `${this.baseTranscript} ${words}`.trim();
        this.publish();
      };
      engine.onerror = ({ error }) => {
        if (this.engine !== engine || error === 'no-speech' || error === 'aborted') return;
        this.state.error = error === 'not-allowed' || error === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow access in your browser and try again.'
          : `Live transcription failed (${error}). Check your microphone and connection, then try again.`;
        this.state.mode = null;
        this.finish();
      };
      engine.onend = () => this.ended(engine);
      engine.start();
    } catch (error) {
      this.engine = null;
      this.state.error = error instanceof Error ? error.message : 'Microphone could not start.';
      this.state.mode = null;
      this.complete();
    }
  }

  private finish() {
    clearTimeout(this.restartTimer);
    if (!this.state.segment || this.boundary) return;
    this.boundary = true;
    this.state.phase = 'finishing';
    this.publish();
    if (!this.engine) { this.complete(); return; }
    const engine = this.engine;
    // Some speech implementations omit onend after stop. Preserve the received words anyway.
    this.stopTimer = setTimeout(() => {
      if (this.engine !== engine) return;
      this.detach(engine);
      try { engine.abort(); } catch { /* Already stopped. */ }
      this.complete();
    }, 1500);
    try { engine.stop(); } catch { this.ended(engine); }
  }

  private detach(engine: SpeechEngine) {
    engine.onstart = engine.onresult = engine.onerror = engine.onend = null;
    this.engine = null;
    clearTimeout(this.stopTimer);
  }

  private ended(engine: SpeechEngine) {
    if (this.engine !== engine) return;
    this.detach(engine);
    if (this.boundary || !this.state.mode) { this.complete(); return; }
    // Browser silence/time limits do not end a page recording or submit partial notes.
    this.state.phase = 'starting';
    this.publish();
    this.restartTimer = setTimeout(() => this.begin(), 150);
  }

  private complete(interrupted = false) {
    const segment = this.state.segment;
    const mode = this.state.mode;
    const error = this.state.error;
    this.boundary = false;
    this.state = { ...idleVoiceState, error };
    if (segment) this.options.onSegment({ ...segment }, interrupted);
    this.publish();
    if (segment && mode === 'continuous' && !this.disposed && !error) {
      this.start('continuous', segment.connectionId, this.language);
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.restartTimer);
    clearTimeout(this.stopTimer);
    if (this.engine) {
      const engine = this.engine;
      this.detach(engine);
      try { engine.abort(); } catch { /* Already stopped. */ }
    }
    this.complete(true);
  }
}

export function lecturePrompt(transcript: string) {
  return `Take class notes from this lecture transcription and the supplied PDF page. Explain the slide using the lecturer's explanation. Keep their terminology and wording where useful. Include examples, definitions, comparisons, warnings and important details. Clearly distinguish anything said beyond the slide. Do not invent details. Use short headings and bullet points.\n\nLecture transcription:\n${transcript}`;
}

export function transcriptChunks(transcript: string, limit = 16000): string[] {
  const chunks: string[] = [];
  let remaining = transcript.trim();
  while (remaining.length > limit) {
    const space = remaining.lastIndexOf(' ', limit);
    const end = space > limit / 2 ? space : limit;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
