'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseRealtimeDataOptions {
    /** Which database tables to watch for changes */
    tables: string[];
    /** Callback fired when a watched table changes */
    onTableChange: (table: string) => void;
    /** Whether to enable the real-time connection (default: true) */
    enabled?: boolean;
    /** Debounce delay in ms to batch rapid changes (default: 400ms) */
    debounceMs?: number;
    /** Polling interval in ms as fallback when SSE fails (default: 15000ms) */
    pollingIntervalMs?: number;
}

/**
 * React hook for real-time data updates via Server-Sent Events.
 * 
 * Connects to `/api/realtime` and listens for PostgreSQL NOTIFY events.
 * When a watched table changes, it calls the provided `onTableChange` callback
 * (typically used to re-fetch data from the API).
 * 
 * Features:
 * - Debounced: rapid successive changes are batched
 * - Auto-reconnects on errors (native EventSource behavior)
 * - Polling fallback when SSE connection fails
 * - Cleans up on unmount
 * - Skips self-triggered events via a brief ignore window
 * 
 * @example
 * ```tsx
 * useRealtimeData({
 *   tables: ['students', 'departments'],
 *   onTableChange: () => {
 *     fetchStudents(token);
 *     fetchDepartments(token);
 *   }
 * });
 * ```
 */
export function useRealtimeData({
    tables,
    onTableChange,
    enabled = true,
    debounceMs = 400,
    pollingIntervalMs = 15000,
}: UseRealtimeDataOptions) {
    const onTableChangeRef = useRef(onTableChange);
    onTableChangeRef.current = onTableChange;

    const tablesRef = useRef(tables);
    tablesRef.current = tables;

    // Track pending debounce timers per table
    const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Self-mutation ignore window: when we trigger a mutation ourselves,
    // we briefly ignore incoming SSE events for that table to avoid double-refresh
    const ignoredTablesRef = useRef<Set<string>>(new Set());

    // Track whether SSE is actually connected and receiving data
    const sseConnectedRef = useRef(false);
    const sseErrorCountRef = useRef(0);

    const cleanup = useCallback(() => {
        debounceTimers.current.forEach((timer) => clearTimeout(timer));
        debounceTimers.current.clear();
    }, []);

    useEffect(() => {
        if (!enabled) return;

        let eventSource: EventSource | null = null;
        let pollingTimer: NodeJS.Timeout | null = null;
        let disposed = false;

        const connect = () => {
            if (disposed) return;

            try {
                eventSource = new EventSource('/api/realtime');
            } catch {
                // SSE not supported or failed to create — use polling only
                startPolling();
                return;
            }

            eventSource.onopen = () => {
                sseErrorCountRef.current = 0;
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Connection confirmed — SSE is working
                    if (data.type === 'connected') {
                        sseConnectedRef.current = true;
                        // Stop polling if SSE is confirmed working
                        if (pollingTimer) {
                            clearInterval(pollingTimer);
                            pollingTimer = null;
                        }
                        return;
                    }

                    if (data.type === 'error') return;

                    const changedTable = data.table;
                    if (!changedTable) return;

                    // Check if this table is in our watch list
                    if (!tablesRef.current.includes(changedTable)) return;

                    // Check if we should ignore this (self-mutation)
                    if (ignoredTablesRef.current.has(changedTable)) return;

                    // Debounce: clear existing timer for this table
                    const existing = debounceTimers.current.get(changedTable);
                    if (existing) clearTimeout(existing);

                    const timer = setTimeout(() => {
                        debounceTimers.current.delete(changedTable);
                        onTableChangeRef.current(changedTable);
                    }, debounceMs);

                    debounceTimers.current.set(changedTable, timer);
                } catch {
                    // Ignore parse errors (e.g., keep-alive comments)
                }
            };

            eventSource.onerror = () => {
                // EventSource auto-reconnects, but track errors
                sseConnectedRef.current = false;
                sseErrorCountRef.current++;
                cleanup();

                // After 3 consecutive errors, start polling as fallback
                if (sseErrorCountRef.current >= 3 && !pollingTimer) {
                    startPolling();
                }
            };
        };

        // Polling fallback: periodically trigger onTableChange
        const startPolling = () => {
            if (pollingTimer || disposed) return;
            pollingTimer = setInterval(() => {
                if (disposed) return;
                // Only poll if SSE is not connected
                if (!sseConnectedRef.current) {
                    tablesRef.current.forEach((table) => {
                        onTableChangeRef.current(table);
                    });
                }
            }, pollingIntervalMs);
        };

        connect();

        // Start polling immediately as a safety net — it will
        // auto-stop once SSE confirms it's connected
        const pollingStartDelay = setTimeout(() => {
            if (!sseConnectedRef.current && !disposed) {
                startPolling();
            }
        }, 5000);

        return () => {
            disposed = true;
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            if (pollingTimer) {
                clearInterval(pollingTimer);
                pollingTimer = null;
            }
            clearTimeout(pollingStartDelay);
            cleanup();
        };
    }, [enabled, debounceMs, pollingIntervalMs, cleanup]);

    /**
     * Call this before making a mutation to temporarily ignore
     * SSE events for the given tables (prevents double-refresh).
     * The ignore window lasts 2 seconds.
     */
    const ignoreSelfMutation = useCallback((tableNames: string[]) => {
        tableNames.forEach((t) => {
            ignoredTablesRef.current.add(t);
            setTimeout(() => {
                ignoredTablesRef.current.delete(t);
            }, 2000);
        });
    }, []);

    return { ignoreSelfMutation };
}
