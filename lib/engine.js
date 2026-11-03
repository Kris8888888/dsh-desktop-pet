/**
 * Translate the active DSH session into the few facts the pet understands.
 *
 * Runs once per page with one timer and two store subscriptions; the pet drops
 * everything when it is disabled.
 */
export function installEngine(ctx, host) {
  let sessionId = null;
  let primed = false;
  let lastSeq = -1;
  let lastState = "idle";
  let lastError = null;

  const emit = (kind, extra = {}) => {
    try { host.emit({ type: "dsh", kind, ...extra }); } catch { /* pet bridge is optional */ }
  };

  const mainId = () => {
    try { return ctx.uiSession.current.getSnapshot()?.sessionId ?? null; } catch { return null; }
  };

  const titleOf = (id) => {
    try {
      const row = ctx.sessions.list.getSnapshot().byId?.[id];
      const t = row?.title;
      return typeof t === "string" && t ? t : undefined;
    } catch { return undefined; }
  };

  const tokensIn = (event) => {
    const usage = event?.data?.usage;
    if (!usage || typeof usage !== "object") return 0;
    const input = Number(usage.inputTokens) || 0;
    const output = Number(usage.outputTokens) || 0;
    // cacheReadTokens is deliberately excluded: reading the cache is not a meal.
    return Math.max(0, Math.round(input + output));
  };

  const tick = () => {
    const id = mainId();
    if (id !== sessionId) {
      sessionId = id;
      primed = false;
      lastSeq = -1;
      lastState = "idle";
      lastError = null;
    }
    if (!id) return;

    let binding;
    try { binding = ctx.sessions.binding(id); } catch { binding = undefined; }
    const status = (() => {
      try { return ctx.uiSession.sessionStatus.getSnapshot().get(id); } catch { return undefined; }
    })();
    const waiting = status?.pendingInteraction !== undefined;
    const running = status?.running === true;
    const next = waiting ? "waiting" : running ? "working" : "idle";
    const title = titleOf(id);

    if (next !== lastState) {
      if (next === "waiting") {
        emit("waiting", { sessionId: id, ...(title ? { title } : {}) });
      } else if (next === "working") {
        if (lastState === "waiting") emit("waiting-clear", { sessionId: id });
        emit("working", { sessionId: id });
      } else {
        if (lastState === "waiting") {
          emit("waiting-clear", { sessionId: id });
          emit("done", { sessionId: id });
        } else if (lastState === "working") emit("done", { sessionId: id });
        else emit("idle", { sessionId: id });
      }
      lastState = next;
    }

    const events = (() => {
      try { return binding?.session?.eventSource?.getSnapshot?.().entries; } catch { return undefined; }
    })();
    if (!Array.isArray(events) || events.length === 0) return;
    if (!primed) {
      // The tail page already contains history. Remember it as "already
      // eaten" so opening the app does not feed yesterday's conversation.
      for (const entry of events) {
        const seq = entry?.event?.seq;
        if (typeof seq === "number" && seq > lastSeq) lastSeq = seq;
      }
      primed = true;
      return;
    }
    let meal = 0;
    // New entries are appended, so walk from the tail and stop at the last seq
    // already accounted for. A long session does not cost a full scan.
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]?.event;
      const seq = event?.seq;
      if (typeof seq !== "number") continue;
      if (seq <= lastSeq) break;
      if (event.type === "assistant/message") meal += tokensIn(event);
      lastSeq = seq;
    }
    if (meal > 0) emit("tokens", { sessionId: id, tokens: meal });

    const snapshot = (() => {
      try { return binding?.session?.getSnapshot?.(); } catch { return undefined; }
    })();
    const agentError = snapshot?.lastAgentError;
    if (typeof agentError === "string" && agentError && agentError !== lastError) {
      lastError = agentError;
      emit("error", { sessionId: id, message: agentError.slice(0, 160) });
    }
  };

  ctx.effect(() => {
    const timer = setInterval(tick, 1100);
    const offMain = (() => {
      try { return ctx.uiSession.current.subscribe(tick); } catch { return () => {}; }
    })();
    const offStatus = (() => {
      try { return ctx.uiSession.sessionStatus.subscribe(tick); } catch { return () => {}; }
    })();
    tick();
    return () => {
      clearInterval(timer);
      offMain();
      offStatus();
    };
  }, "desktop-pet: session bridge");
}
