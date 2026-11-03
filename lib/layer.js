/**
 * Mount one pet: build its DOM, wire the page-backed host, hand the stage to
 * the renderer. Returns a disposer so a slot remount cannot leak a frame loop.
 */

import { createPet } from "./app.js";
import { PET_HTML } from "./markup.js";

export function mountPet({ host }) {
  const root = document.createElement("div");
  root.id = "dshpet-root";
  root.innerHTML = PET_HTML;

  host.attachRoot(root);
  const pet = createPet({ host, root });

  let disposeTimer = null;
  const settle = () => {
    // The renderer only learns the pet's real bounds after its first frame.
    host.attach(pet);
    disposeTimer = setTimeout(() => host.attach(pet), 260);
  };
  settle();

  return {
    root,
    host,
    pet,
    dispose() {
      clearTimeout(disposeTimer);
      try { pet.pauseLoop(); } catch { /* already gone */ }
      host.dispose();
    },
  };
}
