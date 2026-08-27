export const SUPPORTED_DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'csv'] as const;

export const DOCUMENT_ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/rtf',
  'text/rtf',
  'text/csv',
  ...SUPPORTED_DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

export interface PreparedStudyFile {
  fileData: Blob;
  sourceFormat: string;
}

function extensionOf(fileName: string) {
  return fileName.toLowerCase().split('.').pop() || '';
}

export function isSupportedDocument(file: File) {
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(extensionOf(file.name) as typeof SUPPORTED_DOCUMENT_EXTENSIONS[number]);
}

function htmlToText(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent || '').replace(/\u00a0/g, ' ').trim();
}

function rtfToText(rtf: string) {
  return rtf
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'[0-9a-fA-F]{2}/g, (match) => String.fromCharCode(Number.parseInt(match.slice(2), 16)))
    .replace(/\\u(-?\d+)\??/g, (_, value: string) => String.fromCharCode((Number(value) + 65_536) % 65_536))
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\([\\{}])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLegacyDocText(buffer: ArrayBuffer) {
  const clean = (value: string) => value
    .replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const candidates = [
    clean(new TextDecoder('windows-1252').decode(buffer)),
    clean(new TextDecoder('utf-16le').decode(buffer)),
  ];
  const best = candidates.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)[0] || '';
  if (best.length < 40) {
    throw new Error('This older Word file could not be read. Open it in Word and save it as a .docx file, then upload it again.');
  }
  return best;
}

async function textToPdf(text: string, title: string) {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  let y = margin;

  const addPage = () => {
    pdf.addPage();
    y = margin;
  };

  pdf.setTextColor('#172033');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  const titleLines = pdf.splitTextToSize(title, contentWidth) as string[];
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 21 + 18;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setLineHeightFactor(1.45);

  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  for (const paragraph of paragraphs) {
    const lines = (pdf.splitTextToSize(paragraph || ' ', contentWidth) as string[]) || [' '];
    for (const line of lines) {
      if (y + 18 > bottom) addPage();
      pdf.text(line, margin, y);
      y += 16;
    }
    y += 5;
  }

  return pdf.output('blob');
}

export async function prepareStudyFile(file: File): Promise<PreparedStudyFile> {
  const extension = extensionOf(file.name);
  if (!isSupportedDocument(file)) throw new Error('Choose a PDF, Word, text, Markdown, HTML, RTF, or CSV document.');

  if (extension === 'pdf') {
    return { fileData: file, sourceFormat: 'PDF' };
  }

  let text = '';
  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value.trim();
  } else if (extension === 'doc') {
    text = extractLegacyDocText(await file.arrayBuffer());
  } else if (extension === 'html' || extension === 'htm') {
    text = htmlToText(await file.text());
  } else if (extension === 'rtf') {
    text = rtfToText(await file.text());
  } else {
    text = (await file.text()).trim();
  }

  if (!text) throw new Error('No readable text was found in this document.');
  return {
    fileData: await textToPdf(text, file.name.replace(/\.[^.]+$/, '')),
    sourceFormat: extension === 'doc' || extension === 'docx' ? 'Word' : extension.toUpperCase(),
  };
}
