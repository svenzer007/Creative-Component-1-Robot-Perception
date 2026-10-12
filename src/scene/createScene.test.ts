import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { describe, expect, it, vi } from 'vitest';
import { clearOwnedGroup } from './createScene';

function attachedLabel(text: string, host: HTMLElement): CSS2DObject {
  const element = document.createElement('span');
  element.textContent = text;
  host.append(element);
  return new CSS2DObject(element);
}

describe('clearOwnedGroup', () => {
  it('detaches direct and nested CSS2D labels and disposes render resources', () => {
    const labelLayer = document.createElement('div');
    document.body.append(labelLayer);
    const owned = new THREE.Group();
    const camera = new THREE.Group();
    const imagePlane = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    material.addEventListener('dispose', materialDisposed);

    imagePlane.add(new THREE.Mesh(geometry, material));
    imagePlane.add(attachedLabel('C2 image plane · z=1', labelLayer));
    camera.add(imagePlane, attachedLabel('C2', labelLayer));
    owned.add(camera, attachedLabel('baseline', labelLayer));

    expect(labelLayer.childElementCount).toBe(3);
    clearOwnedGroup(owned);

    expect(owned.children).toHaveLength(0);
    expect(labelLayer.childElementCount).toBe(0);
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    labelLayer.remove();
  });

  it('keeps owned object and label counts stable across repeated rebuilds', () => {
    const labelLayer = document.createElement('div');
    document.body.append(labelLayer);
    const owned = new THREE.Group();

    for (let update = 0; update < 12; update += 1) {
      clearOwnedGroup(owned);
      const camera1 = new THREE.Group();
      const camera2 = new THREE.Group();
      camera1.add(attachedLabel('C1 image plane · z=1', labelLayer), attachedLabel('C1', labelLayer));
      camera2.add(attachedLabel('C2 image plane · z=1', labelLayer), attachedLabel('C2', labelLayer));
      owned.add(camera1, camera2);

      expect(owned.children).toHaveLength(2);
      expect(labelLayer.childElementCount).toBe(4);
    }

    clearOwnedGroup(owned);
    expect(owned.children).toHaveLength(0);
    expect(labelLayer.childElementCount).toBe(0);
    labelLayer.remove();
  });
});
