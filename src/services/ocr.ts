import type { LoggerMessage, Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;
let activeProgress: ((message: LoggerMessage) => void) | null = null;

async function worker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker('eng', undefined, {
        logger: (message) => activeProgress?.(message),
      }))
      .catch((error) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

export async function recognizeScannedPage(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: number) => void,
) {
  activeProgress = (message) => {
    if (message.status === 'recognizing text') onProgress?.(message.progress);
  };
  try {
    const result = await (await worker()).recognize(canvas);
    return result.data.text.replace(/\s+/g, ' ').trim();
  } finally {
    activeProgress = null;
  }
}
