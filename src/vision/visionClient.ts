import type { AnalysisOptions, AnalysisProgress, AnalysisResult, ImageInput, PairAnalysis } from './pipeline';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { Correspondence } from './types';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onRows?: (view: number, startRow: number, endRow: number, rgba: Uint8ClampedArray) => void;
  onProgress?: (progress: AnalysisProgress) => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Promise-based front end for the vision worker. The worker starts on first use. */
export class VisionClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  renderSample(
    width: number,
    height: number,
    views: number,
    onRows: Pending['onRows'],
  ): Promise<void> {
    return this.request({ type: 'render-sample', width, height, views }, { onRows }) as Promise<void>;
  }

  /** Sends copies of the pixels, so the caller keeps its own buffers for drawing and patch search. */
  analyze(images: readonly ImageInput[], options: AnalysisOptions, onProgress: Pending['onProgress']): Promise<AnalysisResult> {
    const copies = images.map((image) => ({ ...image, rgba: image.rgba.slice() }));
    const transfer = copies.map((image) => image.rgba.buffer as ArrayBuffer);
    return this.request({ type: 'analyze', images: copies, options }, { onProgress }, transfer) as Promise<AnalysisResult>;
  }

  estimate(source: number, target: number, matches: Correspondence[], width: number, height: number): Promise<PairAnalysis> {
    return this.request({ type: 'estimate', source, target, matches, width, height }, {}) as Promise<PairAnalysis>;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((entry) => entry.reject(new Error('The vision worker stopped.')));
    this.pending.clear();
  }

  private request(
    message: DistributiveOmit<WorkerRequest, 'id'>,
    callbacks: Omit<Pending, 'resolve' | 'reject'>,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...callbacks });
      this.ensureWorker().postMessage({ ...message, id } as WorkerRequest, transfer);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'vision' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      this.pending.forEach((entry) => entry.reject(new Error(event.message || 'The vision worker failed to start.')));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private receive(message: WorkerResponse): void {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    switch (message.type) {
      case 'sample-rows':
        entry.onRows?.(message.view, message.startRow, message.endRow, message.rgba);
        return;
      case 'progress':
        entry.onProgress?.(message.progress);
        return;
      case 'sample-done':
        this.pending.delete(message.id);
        entry.resolve(undefined);
        return;
      case 'analysis':
        this.pending.delete(message.id);
        entry.resolve(message.result);
        return;
      case 'estimate-result':
        this.pending.delete(message.id);
        entry.resolve(message.pair);
        return;
      case 'error':
        this.pending.delete(message.id);
        entry.reject(new Error(message.message));
    }
  }
}
