import { useEffect, useRef } from 'react';

export function usePolling(task, delayMs, enabled = true) {
  const taskRef = useRef(task);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled || !delayMs) return undefined;

    let cancelled = false;

    const run = async () => {
      if (cancelled || inFlightRef.current || document.hidden) return;
      inFlightRef.current = true;
      try {
        await taskRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    timerRef.current = window.setInterval(run, delayMs);

    const onVisibility = () => {
      if (!document.hidden) run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    run();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [delayMs, enabled]);
}
