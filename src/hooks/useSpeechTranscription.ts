import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechEngineInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: {
      length: number;
      [index: number]: {
        isFinal: boolean;
        [subIndex: number]: { transcript: string; confidence: number };
      };
    };
  }) => void) | null;
}

type SpeechEngineConstructor = new () => SpeechEngineInstance;

function getSpeechEngineConstructor(): SpeechEngineConstructor | null {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechEngineConstructor;
    webkitSpeechRecognition?: SpeechEngineConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechEngineConstructor());
}

export interface UseSpeechTranscriptionOptions {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  lang?: string;
}

export function useSpeechTranscription(options: UseSpeechTranscriptionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechEngineInstance | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isSupported = isSpeechRecognitionSupported();

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors if already stopped
      }
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    const Engine = getSpeechEngineConstructor();
    if (!Engine) {
      setError('Live speech transcription is not supported in this browser. Try Chrome, Edge, or Safari.');
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
    }

    try {
      const recognition = new Engine();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = optionsRef.current.lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            currentFinal += text + ' ';
          } else {
            currentInterim += text;
          }
        }

        const combined = (currentFinal + currentInterim).trim();
        setTranscript(combined);
        optionsRef.current.onTranscript?.(combined, Boolean(currentFinal));
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          // Silence timeout, ignore
          return;
        }
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied. Allow microphone access in your browser.');
        } else {
          setError(`Speech recognition: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start microphone.');
      setIsListening(false);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript: () => setTranscript(''),
  };
}
