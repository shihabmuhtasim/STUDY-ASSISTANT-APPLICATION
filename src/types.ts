export interface StudyDocument {
  id: string;
  title: string;
  fileData: string; // Base64 encoded PDF
  totalPages: number;
  createdAt: number;
  updatedAt: number;
}

export interface NoteBlock {
  id: string;
  question?: string;
  content: string;
  createdAt: number;
  isAiGenerated?: boolean;
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
}

export interface AccountIdentity {
  userId: string;
  email: string;
  displayName: string;
}

export interface AccountSummary extends AccountIdentity {
  plan: 'free' | 'pro';
  aiUsage: number;
  aiLimit: number;
  aiRemaining: number;
}
