import openCvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import { evaluateOpenCv, type OpenCv } from './features';

let engine: Promise<OpenCv> | null = null;

/**
 * Downloads opencv.js (WebAssembly embedded, ~11 MB, served compressed) as a static asset the
 * first time real photos are analyzed, then reuses it. A failed download can be retried.
 */
export function loadOpenCv(): Promise<OpenCv> {
  engine ??= fetch(openCvUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error(`The vision engine could not be downloaded (HTTP ${response.status}).`);
      return evaluateOpenCv(await response.text());
    })
    .catch((error: unknown) => {
      engine = null;
      throw error;
    });
  return engine;
}
