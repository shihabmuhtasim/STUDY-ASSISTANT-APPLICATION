import { useEffect } from 'react';

const descriptions: Array<[RegExp, string]> = [
  [/^Library$|^Open NoteMyDoc AI library$/, 'Return to your document library and folders.'],
  [/^Plans$/, 'Compare the available plans and AI usage allowances.'],
  [/^Contact$/, 'View contact information and advertising enquiries.'],
  [/^3-Pane Split$/, 'Show the document, notes and AI assistant together.'],
  [/^Single Tab$/, 'Switch between the document, notes, AI assistant and voice notes.'],
  [/^Document Focus$/, 'Give the document reader the full workspace.'],
  [/^Study whole document$/, 'Ask about the whole document and keep its notes in a separate section.'],
  [/^Export( Pack)?$/, 'Download your document with annotations and study notes as a PDF.'],
  [/^Document Reader$/, 'Read and annotate the document.'],
  [/^Notes \(|^Whole Notes$/, 'Open the notes for the current page or whole document.'],
  [/^AI Assistant$/, 'Ask questions using the current page and wider document context.'],
  [/^Voice Notes/, 'Record lectures, review saved transcripts and regenerate lecture notes.'],
  [/^Save$/, 'Save the current notes.'],
  [/^Add (note )?card$/, 'Add a new note card on the current page.'],
  [/^Draw$/, 'Create a diagram and attach it to your notes.'],
  [/^Insert to notes$/, 'Review this AI response and add it to your notes.'],
  [/^Copy$/, 'Copy this answer to your clipboard.'],
  [/^Attach/, 'Add images or PDF pages to your next AI question.'],
  [/^Custom API$|^Manage Custom API/, 'Add, select or test your own AI provider connections.'],
  [/^Auto fallback$/, 'Try another available AI provider if the selected one fails.'],
  [/^Blank notebook$/, 'Start taking notes and using AI without uploading a document.'],
  [/^New folder$/, 'Create a folder to organize documents in your library.'],
  [/^Auto.*Best available$/, 'Choose an available AI model automatically.'],
  [/^\d+%$/, 'Set the document zoom to this percentage.'],
];

export function controlDescription(label: string) {
  return descriptions.find(([pattern]) => pattern.test(label))?.[1] || label;
}

// Delegation also covers controls that appear later in menus and dialogs.
export function useControlDescriptions() {
  useEffect(() => {
    const describe = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button,a,input,select,textarea,label') : null;
      if (!target || (target.closest('[title]') && !target.hasAttribute('data-control-description'))) return;
      const label = (target.getAttribute('aria-label') || target.textContent || target.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim();
      if (label) { target.title = controlDescription(label); target.setAttribute('data-control-description', label); }
    };
    document.addEventListener('pointerover', describe, true);
    document.addEventListener('focusin', describe, true);
    return () => {
      document.removeEventListener('pointerover', describe, true);
      document.removeEventListener('focusin', describe, true);
    };
  }, []);
}
