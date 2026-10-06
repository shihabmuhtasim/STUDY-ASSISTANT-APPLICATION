export interface ChatAttachment { id: string; name: string; images: string[] }

export async function prepareChatAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Chat attachments must be under 20 MB each.');
  const images: string[] = [];
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const { pdfjs } = await import('react-pdf');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 6) throw new Error('Attach a PDF with up to six pages. Split larger PDFs before attaching.');
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index), original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1600 / Math.max(original.width, original.height)) });
        const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as never).promise;
        images.push(canvas.toDataURL('image/jpeg', .82)); page.cleanup();
      }
    } finally { await task.destroy(); }
  } else {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, PNG, JPEG, or WebP file.');
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas'), scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    images.push(canvas.toDataURL('image/jpeg', .82));
  }
  return { id: crypto.randomUUID(), name: file.name, images };
}
