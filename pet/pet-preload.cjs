const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  init: "dsh-pet:init",
  save: "dsh-pet:save",
  interactive: "dsh-pet:interactive",
  modal: "dsh-pet:modal",
  hot: "dsh-pet:hot",
  dragStart: "dsh-pet:drag-start",
  dragEnd: "dsh-pet:drag-end",
  jump: "dsh-pet:jump",
  notify: "dsh-pet:notify",
  setConfig: "dsh-pet:set-config",
  recall: "dsh-pet:recall",
  reset: "dsh-pet:reset",
  touch: "dsh-pet:touch",
  log: "dsh-pet:log",
  event: "dsh-pet:event",
};

const listeners = new Set();
ipcRenderer.on(CH.event, (_event, payload) => {
  for (const listener of listeners) {
    try { listener(payload); } catch { /* a pet UI error must not break the bridge */ }
  }
});

contextBridge.exposeInMainWorld("petHost", {
  init: () => ipcRenderer.invoke(CH.init),
  save: (state) => ipcRenderer.send(CH.save, state),
  setInteractive: (value) => ipcRenderer.send(CH.interactive, Boolean(value)),
  setModal: (value) => ipcRenderer.send(CH.modal, Boolean(value)),
  setHotRects: (rects) => ipcRenderer.send(CH.hot, rects),
  dragStart: (offset) => ipcRenderer.send(CH.dragStart, offset),
  dragEnd: (point) => ipcRenderer.send(CH.dragEnd, point),
  jump: (sessionId) => ipcRenderer.send(CH.jump, sessionId),
  notify: (notification) => ipcRenderer.send(CH.notify, notification),
  setConfig: (patch) => ipcRenderer.invoke(CH.setConfig, patch),
  recall: () => ipcRenderer.send(CH.recall),
  reset: () => ipcRenderer.invoke(CH.reset),
  touch: () => ipcRenderer.send(CH.touch),
  log: (message) => ipcRenderer.send(CH.log, String(message)),
  onEvent: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
});
