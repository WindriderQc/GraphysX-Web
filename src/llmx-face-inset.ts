import { PerspectiveCamera, Vector2, Vector3, Vector4, type Object3D, type Scene, type WebGLRenderer } from "three";

/** A second view of the existing rig. No extra world, animation loop or audio player. */
export function createLlmXFaceInset(renderer: WebGLRenderer, scene: Scene, surface: HTMLElement,
  faceObject: () => Object3D | null, onActivate: () => void,
  worldEffect: () => Object3D | null = () => null) {
  const button = document.createElement('button');
  button.className = 'gx-llmx-face-inset';
  button.type = 'button';
  button.hidden = true;
  button.setAttribute('aria-label', 'Afficher le visage en grand');
  button.title = 'Revenir au visage';
  button.innerHTML = '<span data-face-inset-view></span><span class="gx-llmx-face-inset-caption">Notre agent <span aria-hidden="true">↗</span></span>';
  button.addEventListener('click', onActivate);
  surface.append(button);
  const view = button.querySelector<HTMLElement>('[data-face-inset-view]')!;
  const camera = new PerspectiveCamera(35, 1, 0.1, 30);
  const target = new Vector3(), size = new Vector2(), viewport = new Vector4(), scissor = new Vector4();
  let frames = 0;
  let active = false;

  function update(visible: boolean) {
    const object = faceObject();
    const nextActive = visible && !!object;
    if (nextActive !== active) {
      button.hidden = !nextActive;
      surface.classList.toggle('face-inset-open', nextActive);
      active = nextActive;
    }
    if (!active || !object) return;
    object.updateWorldMatrix(true, false);
    camera.position.set(0.18, 0.03, 4.1).applyMatrix4(object.matrixWorld);
    target.set(0, 0, 0).applyMatrix4(object.matrixWorld);
    camera.up.set(0, 1, 0).transformDirection(object.matrixWorld);
    camera.lookAt(target);
  }

  function render() {
    if (!active || !view.isConnected) return;
    const canvas = renderer.domElement.getBoundingClientRect(), rect = view.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return;
    renderer.getSize(size);
    const x = (rect.left - canvas.left) * size.x / canvas.width;
    const y = (canvas.bottom - rect.bottom) * size.y / canvas.height;
    const width = rect.width * size.x / canvas.width, height = rect.height * size.y / canvas.height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const renderTarget = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace(), mipLevel = renderer.getActiveMipmapLevel();
    renderer.getViewport(viewport); renderer.getScissor(scissor);
    const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
    const shadowRefresh = renderer.shadowMap.needsUpdate;
    const effect = worldEffect(), effectVisible = effect?.visible;
    try {
      // Large thinking sprites belong to the world view. In a close portrait
      // their overlapping rings obscure the silhouette; keep the rig and lights.
      if (effect) effect.visible = false;
      renderer.setRenderTarget(null);
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      renderer.autoClear = true;
      // Reuse the main pass's shadow maps and budget; the portrait needs no extra refresh.
      renderer.shadowMap.needsUpdate = false;
      renderer.render(scene, camera);
      frames++;
    } finally {
      if (effect) effect.visible = effectVisible!;
      renderer.setRenderTarget(renderTarget, cubeFace, mipLevel);
      renderer.setViewport(viewport); renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear;
      renderer.shadowMap.needsUpdate = shadowRefresh;
    }
  }

  return {
    camera, update, render,
    get visible() { return active; },
    state: () => ({ visible: active, frames, faceId: faceObject()?.userData.entityId ?? 'llmx-face' }),
    dispose() { active = false; button.removeEventListener('click', onActivate); button.remove(); surface.classList.remove('face-inset-open'); },
  };
}
