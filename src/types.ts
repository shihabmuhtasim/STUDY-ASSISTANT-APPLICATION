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
