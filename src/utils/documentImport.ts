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

async function waitForRenderedAssets(container: HTMLElement) {
  await document.fonts?.ready;
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    if (image.complete) {
      await image.decode?.().catch(() => undefined);
      return;
    }
    await new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
      window.setTimeout(resolve, 3_000);
    });
  }));
}

async function renderedPagesToPdf(pages: HTMLElement[]) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  let pdf: InstanceType<typeof jsPDF> | null = null;

  for (const [index, page] of pages.entries()) {
    const canvas = await html2canvas(page, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: Math.min(2, Math.max(1.4, window.devicePixelRatio || 1)),
      useCORS: true,
    });
    const width = canvas.width * 0.75;
    const height = canvas.height * 0.75;
    const orientation = width > height ? 'landscape' : 'portrait';

    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [width, height], orientation });
    else pdf.addPage([width, height], orientation);

    const pageText = (page.innerText || page.textContent || '').replace(/\s+/g, ' ').trim();
    if (pageText) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(4);
      pdf.setTextColor(255, 255, 255);
      pdf.text(pdf.splitTextToSize(pageText, Math.max(20, width - 8)), 4, 5);
    }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, width, height, undefined, 'FAST');
    if (index % 2 === 1) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  if (!pdf) throw new Error('No readable pages were found in this Word document.');
  return pdf.output('blob');
}

async function wordToPdf(file: File, extension: 'doc' | 'docx') {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;background:#fff;z-index:-1;pointer-events:none;';
  document.body.appendChild(host);

  let dispose: (() => void) | undefined;
  try {
    let pages: HTMLElement[] = [];
    if (extension === 'docx') {
      const [{ render }, mammoth] = await Promise.all([import('docx-renderer'), import('mammoth')]);
      const styleHost = document.createElement('div');
      const bodyHost = document.createElement('div');
      host.appendChild(styleHost);
      host.appendChild(bodyHost);
      const result = await render(file, bodyHost, styleHost, {
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true,
      });
      dispose = result.dispose;
      pages = result.pages.map((page) => page.element);

      // Some Word files omit rendered page-break hints. Keep the visual renderer,
      // but retain a text conversion fallback if it cannot produce a page.
      if (pages.length === 0) {
        const text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.trim();
        return textToPdf(text);
      }
    } else {
      const { createMsDocViewer } = await import('msdoc-viewer');
      const viewer = createMsDocViewer(host);
      await viewer.load(file);
      dispose = () => viewer.destroy();
      pages = Array.from(host.querySelectorAll<HTMLElement>('.msdoc-page:not(.msdoc-page-measure)'));
      for (const page of pages) {
        page.style.border = '0';
        page.style.boxShadow = 'none';
        page.querySelectorAll('.msdoc-page-guides, .msdoc-page-label').forEach((element) => element.remove());
      }
    }

    await waitForRenderedAssets(host);
    return await renderedPagesToPdf(pages);
  } finally {
    dispose?.();
    host.remove();
  }
}

export async function prepareStudyFile(file: File): Promise<PreparedStudyFile> {
  const extension = extensionOf(file.name);
  if (!isSupportedDocument(file)) throw new Error('Choose a PDF, Word, text, Markdown, HTML, RTF, or CSV document.');

  if (extension === 'pdf') {
    return { fileData: file, sourceFormat: 'PDF' };
  }

  let text = '';
  if (extension === 'docx') {
    return { fileData: await wordToPdf(file, 'docx'), sourceFormat: 'Word' };
  } else if (extension === 'doc') {
    try {
      return { fileData: await wordToPdf(file, 'doc'), sourceFormat: 'Word' };
    } catch (error) {
      console.error('Visual .doc rendering failed; using text fallback.', error);
      text = await extractLegacyDocText(await file.arrayBuffer());
    }
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
