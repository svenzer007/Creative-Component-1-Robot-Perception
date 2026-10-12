import './photoLab.css';
import type { Page } from '../../app/page';
import { VisionClient } from '../../vision/visionClient';
import { PhotoLab } from './photoLab';

/** The Photo lab tab: epipolar geometry on the sample room or on your own photos. */
class PhotoPage implements Page {
  private lab: PhotoLab | null = null;
  private readonly client = new VisionClient();

  mount(container: HTMLElement): void {
    this.lab = new PhotoLab(container, this.client);
    this.lab.start();
  }

  activate(): void {
    this.lab?.activate();
  }

  deactivate(): void {
    this.lab?.deactivate();
  }
}

export function createPage(): Page {
  return new PhotoPage();
}
