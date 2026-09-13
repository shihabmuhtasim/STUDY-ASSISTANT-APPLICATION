export interface StudyDocument {
  id: string;
  title: string;
  fileData: string | Blob; // Legacy data URL or locally stored PDF Blob
  sourceFormat?: string;
  originalFileName?: string;
  driveFileId?: string;
  mimeType?: string;
  fileSize?: number;
  cloudStatus?: 'local' | 'syncing' | 'synced' | 'error';
  defaultNoteHeading?: string;
  folderId?: string;
  totalPages: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudyFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface NoteBlock {
  id: string;
  question?: string;
  content: string;
  createdAt: number;
  isAiGenerated?: boolean;
  source?: 'voice';
}

export interface InkAnnotation {
  id: string;
  tool: 'pen' | 'highlight';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface TextAnnotation {
  id: string;
  tool: 'text';
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  text: string;
}

export type AnnotationStroke = InkAnnotation | TextAnnotation;
export type AnnotationTool = 'pen' | 'highlight' | 'eraser' | 'text';

export interface PageNote {
  id: string;
  documentId: string;
  pageNumber: number;
  content: string;
  blocks?: NoteBlock[];
  aiHistory: AIInteraction[];
}

export interface AIInteraction {
  id: string;
  prompt: string;
  response: string;
  createdAt: number;
  insertedIntoNotes: boolean;
  provider?: 'cloudflare' | 'gemini' | 'custom' | 'local';
  model?: string;
  requestedModel?: AIModelPreference;
  fallbackUsed?: boolean;
  references?: AISourceReference[];
}

export interface AISourceReference {
  number: number;
  pageNumber: number;
  quote: string;
}

export interface PDFCitationTarget extends AISourceReference {
  requestId: number;
}

export type AIModelPreference = 'auto' | 'basic' | 'gemini-flash' | 'gemini-flash-lite' | 'qwen' | 'llama' | 'gemma' | 'glm' | 'nemotron' | 'custom';

export type CustomAIService = 'openai' | 'openrouter' | 'nvidia' | 'groq' | 'together' | 'gemini' | 'anthropic' | 'custom';
export type CustomAIProvider = 'openai-compatible' | 'gemini' | 'anthropic';

export interface CustomAIConnection {
  id: string;
  name: string;
  service: CustomAIService;
  provider: CustomAIProvider;
  apiKey: string;
  keyHint?: string;
  isStored?: boolean;
  model: string;
  baseUrl?: string;
}

export interface AccountIdentity {
  userId: string;
  email: string;
  displayName: string;
}

export interface AccountSummary extends AccountIdentity {
  plan: 'free' | 'pro';
  role: 'user' | 'admin';
  aiUsage: number;
  aiLimit: number;
  aiRemaining: number;
  aiRemainingPercent: number;
  aiResetAt: number;
}
