const fs = require("node:fs");
const { app } = require("electron");

process.on("uncaughtException", (error) => {
  try { fs.writeFileSync("/tmp/dsh-pet-harness-error.txt", String(error?.stack ?? error)); } catch { /* ignore */ }
  console.error("[harness] uncaught", error);
});
process.on("unhandledRejection", (error) => {
  try { fs.writeFileSync("/tmp/dsh-pet-harness-error.txt", String(error?.stack ?? error)); } catch { /* ignore */ }
  console.error("[harness] rejection", error);
});

import("./main.js").catch((error) => {
  try { fs.writeFileSync("/tmp/dsh-pet-harness-error.txt", String(error?.stack ?? error)); } catch { /* ignore */ }
  console.error("[harness] failed to start", error);
  app.quit();
});
