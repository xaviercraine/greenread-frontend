// src/hooks/useOfflineQueue.ts
// localStorage write-ahead queue for Live Tournament Tracker.
// Used by participant scoring (submit_score) and marshal app (mark_foursome_status).
//
// Behavior:
//   - Items are saved to localStorage immediately, then processed sequentially.
//   - If submitFn returns { conflict: true }, the queue pauses and onConflict is called.
//   - Caller resolves the conflict, then calls resumeQueue().
//   - removeFromQueue(id) cancels a queued item (v3.1: marshal undo while offline).
//   - Syncs pending items on reconnect (online event) and tab focus (visibilitychange).

import { useEffect, useRef, useState, useCallback } from "react";

export interface QueueItem<T> {
  id: string;
  payload: T;
  addedAt: number;
}

interface UseOfflineQueueOptions<T> {
  // Unique key for localStorage (e.g., "marshal_queue_<token>" or "score_queue_<session>")
  storageKey: string;

  // Async function that submits one item to the server.
  // Return the server response. Throw on network error (item stays queued).
  submitFn: (payload: T) => Promise<any>;

  // Called when submitFn returns a response with conflict: true.
  // The queue pauses until resumeQueue() is called.
  onConflict?: (item: QueueItem<T>, serverResponse: any) => void;

  // Called when submitFn throws (network error, server 500, etc).
  // Item stays in queue for retry. Non-blocking.
  onError?: (item: QueueItem<T>, error: Error) => void;

  // Called after an item is successfully submitted.
  onSuccess?: (item: QueueItem<T>, serverResponse: any) => void;
}

interface UseOfflineQueueResult<T> {
  // Add an item to the queue. Returns the generated item ID.
  enqueue: (payload: T) => string;

  // Remove an item by ID (v3.1: undo cancels the queued write).
  removeFromQueue: (id: string) => void;

  // Resume processing after a conflict is resolved.
  resumeQueue: () => void;

  // Number of items waiting to be submitted.
  pendingCount: number;

  // "synced" | "pending" | "paused" (conflict)
  status: "synced" | "pending" | "paused";
}

export function useOfflineQueue<T>(
  options: UseOfflineQueueOptions<T>
): UseOfflineQueueResult<T> {
  const { storageKey, submitFn, onConflict, onError, onSuccess } = options;

  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<"synced" | "pending" | "paused">("synced");
  const processingRef = useRef(false);
  const pausedRef = useRef(false);

  // ── localStorage helpers ──

  const readQueue = useCallback((): QueueItem<T>[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const writeQueue = useCallback(
    (items: QueueItem<T>[]) => {
      if (typeof window === "undefined") return;
      localStorage.setItem(storageKey, JSON.stringify(items));
      setPendingCount(items.length);
      setStatus(items.length === 0 ? "synced" : pausedRef.current ? "paused" : "pending");
    },
    [storageKey]
  );

  // ── Process queue sequentially ──

  const processQueue = useCallback(async () => {
    if (processingRef.current || pausedRef.current) return;
    processingRef.current = true;

    while (true) {
      if (pausedRef.current) break;

      const queue = readQueue();
      if (queue.length === 0) {
        setStatus("synced");
        break;
      }

      const item = queue[0];
      setStatus("pending");

      try {
        const response = await submitFn(item.payload);

        // Check for version conflict
        if (response && response.conflict === true) {
          pausedRef.current = true;
          setStatus("paused");
          onConflict?.(item, response);
          break;
        }

        // Success: remove from queue
        const updated = readQueue().filter((q) => q.id !== item.id);
        writeQueue(updated);
        onSuccess?.(item, response);
      } catch (e: any) {
        // Network error or server error: stop processing, keep item queued
        onError?.(item, e);
        break;
      }
    }

    processingRef.current = false;
  }, [readQueue, writeQueue, submitFn, onConflict, onError, onSuccess]);

  // ── Public: enqueue ──

  const enqueue = useCallback(
    (payload: T): string => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const item: QueueItem<T> = { id, payload, addedAt: Date.now() };
      const queue = readQueue();
      queue.push(item);
      writeQueue(queue);

      // Trigger processing if not paused
      if (!pausedRef.current) {
        processQueue();
      }

      return id;
    },
    [readQueue, writeQueue, processQueue]
  );

  // ── Public: removeFromQueue (v3.1 undo) ──

  const removeFromQueue = useCallback(
    (id: string) => {
      const queue = readQueue().filter((q) => q.id !== id);
      writeQueue(queue);
    },
    [readQueue, writeQueue]
  );

  // ── Public: resumeQueue (after conflict resolution) ──

  const resumeQueue = useCallback(() => {
    // Remove the conflicted item (first in queue — caller already resolved it)
    const queue = readQueue();
    if (queue.length > 0) {
      writeQueue(queue.slice(1));
    }
    pausedRef.current = false;
    setStatus(queue.length > 1 ? "pending" : "synced");
    processQueue();
  }, [readQueue, writeQueue, processQueue]);

  // ── Initialize: read existing queue on mount ──

  useEffect(() => {
    const queue = readQueue();
    setPendingCount(queue.length);
    if (queue.length > 0) {
      setStatus("pending");
      processQueue();
    }
  }, [readQueue, processQueue]);

  // ── Sync on reconnect and tab focus ──

  useEffect(() => {
    const onOnline = () => {
      if (!pausedRef.current) processQueue();
    };

    const onFocus = () => {
      if (!document.hidden && !pausedRef.current) processQueue();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [processQueue]);

  return { enqueue, removeFromQueue, resumeQueue, pendingCount, status };
}
