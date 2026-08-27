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

async function extractLegacyDocText(buffer: ArrayBuffer) {
  const module = await import('jsdoc');
  const docToText = module.default;
  const text = docToText(buffer)?.trim();
  if (!text) throw new Error('This older Word file could not be read. Open it in Word and save it as a .docx file, then upload it again.');
  return text;
}

async function textToPdf(text: string) {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  let y = margin;

  const addPage = () => {
    pdf.addPage();
    y = margin;
  };

  pdf.setTextColor('#172033');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.setLineHeightFactor(1.35);

  const paragraphs = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n\f\n').split('\n');
  for (const paragraph of paragraphs) {
    if (paragraph === '\f') {
      if (y > margin) addPage();
      continue;
    }
    const lines = (pdf.splitTextToSize(paragraph || ' ', contentWidth) as string[]) || [' '];
    for (const line of lines) {
      if (y + 15 > bottom) addPage();
      pdf.text(line, margin, y);
      y += 14;
    }
    y += 3;
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
    text = await extractLegacyDocText(await file.arrayBuffer());
  } else if (extension === 'html' || extension === 'htm') {
    text = htmlToText(await file.text());
  } else if (extension === 'rtf') {
    text = rtfToText(await file.text());
  } else {
    text = (await file.text()).trim();
  }

  if (!text) throw new Error('No readable text was found in this document.');
  return {
    fileData: await textToPdf(text),
    sourceFormat: extension === 'doc' || extension === 'docx' ? 'Word' : extension.toUpperCase(),
  };
}
