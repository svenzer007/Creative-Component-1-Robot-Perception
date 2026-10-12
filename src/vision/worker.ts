import { loadOpenCv } from './opencvLoader';
import { analyzeImages, estimatePair } from './pipeline';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { createSampleCameras, renderSampleRows } from './syntheticScene';

/*
 * Vision worker: renders the sample room and runs feature matching plus estimation off the main
 * thread, so the Photo lab keeps animating while it works. OpenCV.js is imported lazily, the first
 * time real analysis is requested.
 */

const scope = self as unknown as {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const post = (message: WorkerResponse, transfer: Transferable[] = []): void => scope.postMessage(message, transfer);

function renderSample(request: Extract<WorkerRequest, { type: 'render-sample' }>): void {
  const cameras = createSampleCameras(request.width, request.height).slice(0, request.views);
  const rowsPerChunk = 24;
  const buffers = cameras.map((camera) => new Uint8ClampedArray(camera.width * camera.height * 4));
  for (let startRow = 0; startRow < request.height; startRow += rowsPerChunk) {
    const endRow = Math.min(request.height, startRow + rowsPerChunk);
    cameras.forEach((camera, view) => {
      renderSampleRows(camera, buffers[view], startRow, endRow);
      const rows = buffers[view].slice(startRow * camera.width * 4, endRow * camera.width * 4);
      post({ type: 'sample-rows', id: request.id, view, startRow, endRow, rgba: rows }, [rows.buffer]);
    });
  }
  post({ type: 'sample-done', id: request.id });
}

async function handle(request: WorkerRequest): Promise<void> {
  if (request.type === 'render-sample') {
    renderSample(request);
    return;
  }
  if (request.type === 'estimate') {
    const pair = estimatePair(request.source, request.target, request.matches, request.width, request.height);
    post({ type: 'estimate-result', id: request.id, pair });
    return;
  }
  post({ type: 'progress', id: request.id, progress: { stage: 'engine', completed: 0, total: 1 } });
  const cv = await loadOpenCv();
  post({ type: 'progress', id: request.id, progress: { stage: 'engine', completed: 1, total: 1 } });
  const result = analyzeImages(cv, request.images, request.options, (progress) => {
    post({ type: 'progress', id: request.id, progress });
  });
  post({ type: 'analysis', id: request.id, result });
}

scope.onmessage = (event) => {
  handle(event.data).catch((error: unknown) => {
    post({ type: 'error', id: event.data.id, message: error instanceof Error ? error.message : String(error) });
  });
};
