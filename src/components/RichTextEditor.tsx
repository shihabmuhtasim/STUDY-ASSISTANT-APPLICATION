import React, { useEffect, useRef } from 'react';
import { Bold, Highlighter, Italic, List, ListOrdered, Underline } from 'lucide-react';
import DOMPurify from 'dompurify';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: number;
}

export function toRichTextHtml(value: string) {
  if (!value) return '';
  if (/<[a-z][\s\S]*>/i.test(value)) return DOMPurify.sanitize(value);
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return DOMPurify.sanitize(escaped);
}

export function markdownToRichTextHtml(value: string) {
  if (!value) return '';

  const inline = (text: string) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\$([A-Za-z][A-Za-z0-9_{}^\\]*(?:\s*[=+\-*/]\s*[A-Za-z0-9_.{}^\\]+)?)\$/g, '$1')
    .replace(/\*\*\*(.+?)\*\*\*/g, '**$1**')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');

  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const unordered = trimmed.match(/^[-*+]\s+(.+)/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)/);

    if (unordered || ordered) {
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${nextType}>`);
      }
      html.push(`<li>${inline((unordered || ordered)![1])}</li>`);
      continue;
    }

    closeList();
    if (!trimmed) {
      html.push('<br>');
    } else if (/^###\s+/.test(trimmed)) {
      html.push(`<h3>${inline(trimmed.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^##\s+/.test(trimmed)) {
      html.push(`<h2>${inline(trimmed.replace(/^##\s+/, ''))}</h2>`);
    } else if (/^#\s+/.test(trimmed)) {
      html.push(`<h1>${inline(trimmed.replace(/^#\s+/, ''))}</h1>`);
    } else if (!/^---+$/.test(trimmed)) {
      html.push(`<p>${inline(trimmed)}</p>`);
    }
  }

  closeList();
  return DOMPurify.sanitize(html.join(''));
}

export function richTextToPlainText(value: string) {
  const element = document.createElement('div');
  element.innerHTML = DOMPurify.sanitize(value);
  return element.textContent || '';
}

export function RichTextEditor({ value, onChange, minHeight = 150 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const next = toRichTextHtml(value);
    if (editor && editor.innerHTML !== next && !editor.matches(':focus')) editor.innerHTML = next;
  }, [value]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (savedRange.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange.current);
    }
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, commandValue);
    rememberSelection();
    onChange(editor.innerHTML);
  };

  const iconButton = 'p-1.5 rounded text-slate-600 hover:bg-white hover:text-emerald-700';
  const runFromToolbar = (event: React.MouseEvent<HTMLButtonElement>, command: string, commandValue?: string) => {
    event.preventDefault();
    runCommand(command, commandValue);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
        <button type="button" onMouseDown={(event) => runFromToolbar(event, 'bold')} className={iconButton} title="Bold"><Bold size={15} /></button>
        <button type="button" onMouseDown={(event) => runFromToolbar(event, 'italic')} className={iconButton} title="Italic"><Italic size={15} /></button>
        <button type="button" onMouseDown={(event) => runFromToolbar(event, 'underline')} className={iconButton} title="Underline"><Underline size={15} /></button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <select aria-label="Font" defaultValue="Arial" onChange={(event) => runCommand('fontName', event.target.value)} className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700">
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Mono</option>
        </select>
        <select aria-label="Text size" defaultValue="3" onChange={(event) => runCommand('fontSize', event.target.value)} className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700">
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
        </select>
        <label className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600" title="Text color">
          Text <input aria-label="Text color" type="color" defaultValue="#1e293b" onChange={(event) => runCommand('foreColor', event.target.value)} className="h-4 w-5 border-0 bg-transparent p-0" />
        </label>
        <button type="button" onMouseDown={(event) => runFromToolbar(event, 'backColor', '#fef08a')} className={iconButton} title="Highlight"><Highlighter size={15} /></button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onMouseDown={(event) => runFromToolbar(event, 'insertUnorderedList')} className={iconButton} title="Bulleted list"><List size={15} /></button>
        <button type="button" onMouseDown={(event) => runFromToolbar(event, 'insertOrderedList')} className={iconButton} title="Numbered list"><ListOrdered size={15} /></button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Note content"
        aria-multiline="true"
        data-placeholder="Write your note..."
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={rememberSelection}
        className="rich-text-editor overflow-y-auto p-3 text-sm leading-relaxed text-slate-800 outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
