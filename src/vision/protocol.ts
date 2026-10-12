import type { AnalysisOptions, AnalysisProgress, AnalysisResult, ImageInput, PairAnalysis } from './pipeline';
import type { Correspondence } from './types';

/** Messages between the Photo lab and its vision worker. Every request carries an id. */
export type WorkerRequest =
  | { type: 'render-sample'; id: number; width: number; height: number; views: number }
  | { type: 'analyze'; id: number; images: ImageInput[]; options: AnalysisOptions }
  | { type: 'estimate'; id: number; source: number; target: number; matches: Correspondence[]; width: number; height: number };

export type WorkerResponse =
  | { type: 'sample-rows'; id: number; view: number; startRow: number; endRow: number; rgba: Uint8ClampedArray<ArrayBuffer> }
  | { type: 'sample-done'; id: number }
  | { type: 'progress'; id: number; progress: AnalysisProgress }
  | { type: 'analysis'; id: number; result: AnalysisResult }
  | { type: 'estimate-result'; id: number; pair: PairAnalysis }
  | { type: 'error'; id: number; message: string };
