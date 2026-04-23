'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { flushQueue, getQueueCount } from '@/lib/offlineQueue';
import { OfflineToast } from '@/components/ui/OfflineToast';

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  refreshPendingCount: () => void;
}

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  pendingCount: 0,
  refreshPendingCount: () => {},
});

export function useOfflineStatus() {
  return useContext(OfflineContext);
}

interface ToastMessage {
  id: number;
  type: 'offline' | 'online' | 'syncing' | 'synced' | 'queued' | 'error';
  message: string;
}

export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const wasOfflineRef = useRef(false);

  const addToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getQueueCount();
      setPendingCount(count);
    } catch {
      // IndexedDB may not be available
    }
  }, []);

  // Check for new deployment and force refresh + logout
  useEffect(() => {
    const currentBuild = process.env.NEXT_PUBLIC_BUILD_ID || '';
    const storedBuild = localStorage.getItem('app_build_id');
    
    if (storedBuild && storedBuild !== currentBuild) {
      console.log(`[Version] New build detected: ${storedBuild} → ${currentBuild}. Clearing session...`);
      // Clear all user data (forces re-login)
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Clear session caches
      try { sessionStorage.clear(); } catch {}
      // Clear service worker caches
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
      // Unregister old service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(r => r.unregister());
        });
      }
      // Save new build ID and hard reload
      localStorage.setItem('app_build_id', currentBuild);
      window.location.reload();
      return;
    }

    // First visit or same build — just store it
    if (!storedBuild) {
      localStorage.setItem('app_build_id', currentBuild);
    }
  }, []);

  // Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);
          // Check for updates on every load
          registration.update();

          // Detect when a new SW is found and installing
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  console.log('[SW] New service worker activated');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error('SW registration failed:', err);
        });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, data } = event.data;

        switch (type) {
          case 'SW_VERSION': {
            const storedVersion = localStorage.getItem('sw_app_version');
            if (storedVersion && storedVersion !== data.version) {
              addToast('synced', `App updated to ${data.version} ✨`);
            }
            localStorage.setItem('sw_app_version', data.version);
            break;
          }
          case 'ATTENDANCE_QUEUED':
            addToast('queued', `Attendance saved offline (${data.count} records)`);
            refreshPendingCount();
            break;
          case 'SYNC_STARTED':
            addToast('syncing', `Syncing ${data.count} pending record(s)...`);
            break;
          case 'SYNC_COMPLETED':
            if (data.failCount === 0) {
              addToast('synced', `All ${data.successCount} record(s) synced!`);
            } else {
              addToast('error', `Synced ${data.successCount}, failed ${data.failCount}`);
            }
            refreshPendingCount();
            break;
        }
      });
    }
  }, [addToast, refreshPendingCount]);

  // Online/Offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);

      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        addToast('online', 'Back online');

        // Flush offline queue
        const count = await getQueueCount();
        if (count > 0) {
          addToast('syncing', `Syncing ${count} pending record(s)...`);
          try {
            const result = await flushQueue();
            if (result.failed === 0) {
              addToast('synced', `All ${result.success} record(s) synced successfully!`);
            } else {
              addToast('error', `Synced ${result.success}, failed ${result.failed}`);
            }
          } catch {
            addToast('error', 'Failed to sync offline records');
          }
          refreshPendingCount();
        }

        // Also tell service worker to sync
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
      addToast('offline', "You're offline — attendance will be saved locally");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      wasOfflineRef.current = true;
    }

    // Initial pending count check
    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addToast, refreshPendingCount]);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, refreshPendingCount }}>
      {children}
      <OfflineToast toasts={toasts} onRemove={removeToast} />
    </OfflineContext.Provider>
  );
}
