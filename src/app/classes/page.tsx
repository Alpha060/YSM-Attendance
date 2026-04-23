'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    CalendarClock, Clock, BookOpen, Building2, Bell, BellOff, BellRing, AlertCircle
} from 'lucide-react';
import { AccessDenied } from '@/components/ui/access-denied';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

interface ClassItem {
    id: string;
    department_id: string;
    department_name: string;
    department_code: string;
    semester: number;
    slot_number: number;
    subject_id: string;
    subject_name: string;
    subject_code: string;
    paper_code: string | null;
    start_time: string | null; // HH:MM:SS or null
    end_time: string | null;
}

export default function ClassesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
    const [notifScheduled, setNotifScheduled] = useState(false);
    const notifTimers = useRef<NodeJS.Timeout[]>([]);
    const [batchConfig, setBatchConfig] = useState<Record<string, Record<string, number>>>({});

    const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            setUser(JSON.parse(userData));
        } catch {
            router.replace('/login');
        }
    }, [router]);

    // Fetch classes & batch config
    useEffect(() => {
        if (!user) return;
        const token = localStorage.getItem('token');
        if (!token) return;

        (async () => {
            try {
                const [classRes, batchRes] = await Promise.all([
                    fetch(`/api/class-schedule/my-classes?date=${today}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch('/api/settings/batch-config', {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ]);

                if (classRes.status === 401) { router.replace('/login'); return; }

                if (classRes.ok) {
                    const data = await classRes.json();
                    setClasses(data.classes || []);
                }

                if (batchRes.ok) {
                    const data = await batchRes.json();
                    setBatchConfig(data.mappings || {});
                }
            } catch (err) {
                console.error('Error fetching classes:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [user, today, router]);

    // Check notification permission
    useEffect(() => {
        if ('Notification' in window) {
            setNotifPermission(Notification.permission);
        }
    }, []);

    // Request notification permission
    const requestNotifPermission = async () => {
        if (!('Notification' in window)) return;
        const permission = await Notification.requestPermission();
        setNotifPermission(permission);
        if (permission === 'granted') {
            // Immediate test notification to prove it works
            showNotification('✅ Notifications Enabled', {
                body: 'You will now receive a reminder 1 minute before your classes start.',
                icon: '/icons/icon-192x192.png',
                tag: 'notif-enabled'
            });
            scheduleNotifications();
        }
    };

    // Helper to show notification (Service Worker prioritized)
    const showNotification = (title: string, options: NotificationOptions) => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, options);
            });
        } else {
            new Notification(title, options);
        }
    };

    // Schedule notifications for upcoming classes
    const scheduleNotifications = useCallback(() => {
        if (notifPermission !== 'granted' || classes.length === 0) return;

        // Clear existing timers
        notifTimers.current.forEach(t => clearTimeout(t));
        notifTimers.current = [];

        const now = new Date();

        classes.forEach(cls => {
            if (!cls.start_time) return;

            const timeParts = cls.start_time.split(':');
            const classTime = new Date();
            classTime.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);

            // Schedule 1 minute before class start
            const notifyTime = new Date(classTime.getTime() - 60 * 1000);
            const delay = notifyTime.getTime() - now.getTime();

            if (delay > 0) {
                const timer = setTimeout(() => {
                    const batchLabel = getBatchLabel(cls.semester, cls.department_code);
                    showNotification('📚 Class Starting Soon!', {
                        body: `Your class is on Semester ${cls.semester} with Batch ${batchLabel}\n${cls.subject_name} — ${cls.department_code}`,
                        icon: '/icons/icon-192x192.png',
                        tag: `class-${cls.id}`,
                        requireInteraction: true,
                    });
                }, delay);
                notifTimers.current.push(timer);
            }
        });

        setNotifScheduled(true);
    }, [classes, notifPermission]);

    // Auto-schedule when classes load and permission is granted
    useEffect(() => {
        if (notifPermission === 'granted' && classes.length > 0 && !notifScheduled) {
            scheduleNotifications();
        }
    }, [classes, notifPermission, notifScheduled, scheduleNotifications]);

    // Cleanup timers
    useEffect(() => {
        return () => {
            notifTimers.current.forEach(t => clearTimeout(t));
        };
    }, []);

    // Batch label helper
    const getBatchLabel = (sem: number, deptCode?: string): string => {
        // Try all dept types to find matching config
        for (const deptType of ['regular', 'vocational', 'pg']) {
            const savedMappings = batchConfig[deptType];
            if (savedMappings && savedMappings[sem.toString()]) {
                const batchStart = savedMappings[sem.toString()];
                const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
                const batchEnd = (batchStart + duration) % 100;
                return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
            }
        }
        // Fallback
        const now = new Date();
        const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        const yearOffset = Math.floor((sem - 1) / 2);
        const batchStart = academicStartYear - yearOffset;
        const batchEnd = (batchStart + 4) % 100;
        return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
    };

    // Format time
    const formatTime = (time: string | null) => {
        if (!time) return '--:--';
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${m} ${ampm}`;
    };

    // Check if class is currently active
    const isClassActive = (startTime: string | null, endTime: string | null) => {
        if (!startTime || !endTime) return false;
        const now = new Date();
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        return nowMins >= startMins && nowMins < endMins;
    };

    // Check if class is upcoming
    const isClassUpcoming = (startTime: string | null) => {
        if (!startTime) return false;
        const now = new Date();
        const [sh, sm] = startTime.split(':').map(Number);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const startMins = sh * 60 + sm;
        return startMins > nowMins;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Loading Classes...</p>
                </div>
            </div>
        );
    }

    if (user && user.role === 'super_admin') {
        return <AccessDenied />;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role as any }}
                    onLogout={handleLogout}
                />
            )}

            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            <main className="flex-1 pt-20 px-4 pb-8 max-w-3xl mx-auto w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                            <CalendarClock className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Classes</h1>
                            <p className="text-xs sm:text-sm text-gray-500">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    </div>

                    {/* Notification Toggle */}
                    {'Notification' in (typeof window !== 'undefined' ? window : {}) && (
                        <button
                            onClick={requestNotifPermission}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${notifPermission === 'granted'
                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                    : notifPermission === 'denied'
                                        ? 'bg-red-100 text-red-600 border border-red-200 cursor-not-allowed'
                                        : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200'
                                }`}
                            disabled={notifPermission === 'denied'}
                            title={
                                notifPermission === 'granted' ? 'Notifications enabled'
                                    : notifPermission === 'denied' ? 'Notifications blocked in browser settings'
                                        : 'Enable notifications for class reminders'
                            }
                        >
                            {notifPermission === 'granted' ? (
                                <><BellRing className="w-3.5 h-3.5" /> On</>
                            ) : notifPermission === 'denied' ? (
                                <><BellOff className="w-3.5 h-3.5" /> Blocked</>
                            ) : (
                                <><Bell className="w-3.5 h-3.5" /> Enable</>
                            )}
                        </button>
                    )}
                </div>

                {/* Notification Info Banner */}
                {notifPermission === 'granted' && notifScheduled && classes.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2 text-xs text-green-700 font-medium">
                        <BellRing className="w-4 h-4 shrink-0" />
                        Notifications scheduled for {classes.filter(c => isClassUpcoming(c.start_time)).length} upcoming class(es)
                    </div>
                )}

                {(() => {
                    const validClasses = classes.filter(c => c.start_time && c.end_time);

                    if (validClasses.length === 0) {
                        return (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                                <div className="bg-gray-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                                    <CalendarClock className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">No Classes Today</h3>
                                <p className="text-sm text-gray-500">No classes have been assigned to you for today.</p>
                            </div>
                        );
                    }

                    return (
                        <div className="space-y-3">
                            {Object.values(validClasses.reduce((acc, cls) => {
                                const key = `${cls.slot_number}`; // Group strictly by slot number since a teacher can only be in one physical class at a time
                                const paperCodeVal = cls.paper_code || cls.subject_code;

                                if (!acc[key]) {
                                    acc[key] = {
                                        ...cls,
                                        department_codes: [cls.department_code],
                                        semesters: [cls.semester],
                                        subject_names: [cls.subject_name],
                                        paper_codes: [paperCodeVal]
                                    };
                                } else {
                                    if (!acc[key].department_codes.includes(cls.department_code)) {
                                        acc[key].department_codes.push(cls.department_code);
                                    }

                                    const isSemExists = acc[key].semesters.some(s => String(s) === String(cls.semester));
                                    if (!isSemExists) {
                                        acc[key].semesters.push(cls.semester);
                                    }

                                    const cleanName = cls.subject_name.trim().toLowerCase();
                                    const isNameExists = acc[key].subject_names.some(n => n.trim().toLowerCase() === cleanName);
                                    if (!isNameExists) {
                                        acc[key].subject_names.push(cls.subject_name);
                                    }

                                    const cleanPaper = paperCodeVal.trim().toLowerCase();
                                    const isPaperExists = acc[key].paper_codes.some(p => p.trim().toLowerCase() === cleanPaper);
                                    if (!isPaperExists) {
                                        acc[key].paper_codes.push(paperCodeVal);
                                    }
                                }
                                return acc;
                            }, {} as Record<string, ClassItem & { department_codes: string[], semesters: number[], subject_names: string[], paper_codes: string[] }>)).map((cls) => {
                                const active = isClassActive(cls.start_time, cls.end_time);
                                const upcoming = isClassUpcoming(cls.start_time);

                                return (
                                    <div
                                        key={cls.id}
                                        className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${active
                                                ? 'border-green-300 ring-2 ring-green-100'
                                                : upcoming
                                                    ? 'border-blue-200'
                                                    : 'border-gray-100 opacity-75'
                                            }`}
                                    >
                                        {/* Active badge */}
                                        {active && (
                                            <div className="bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider py-1 px-4 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                Currently Active
                                            </div>
                                        )}

                                        <div className="p-4 sm:p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    {/* Time */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Clock className={`w-4 h-4 shrink-0 ${active ? 'text-green-600' : 'text-blue-500'}`} />
                                                        <span className={`text-sm font-bold ${active ? 'text-green-700' : 'text-gray-900'}`}>
                                                            {formatTime(cls.start_time)} – {formatTime(cls.end_time)}
                                                        </span>
                                                        <span className="text-xs text-gray-400">Class {cls.slot_number}</span>
                                                    </div>

                                                    {/* Subject */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
                                                        <span className="text-sm font-semibold text-gray-800 truncate">
                                                            {cls.subject_names.join(' / ')}
                                                        </span>
                                                        <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                                                            {cls.paper_codes.join('/')}
                                                        </span>
                                                    </div>

                                                    {/* Semester & Dept */}
                                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg">
                                                            Sem: {cls.semesters.join('/')} ({getBatchLabel(cls.semesters[0], cls.department_codes[0])})
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm">
                                                            <Building2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                                            <span className="font-bold">{cls.department_codes.join('/')}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Slot indicator */}
                                                <div className={`shrink-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center border shadow-sm ${active ? 'bg-green-100 border-green-300 text-green-900 shadow-green-100' : upcoming ? 'bg-blue-100 border-blue-300 text-blue-900 shadow-blue-100' : 'bg-gray-100 border-gray-300 text-gray-800 opacity-90'
                                                    }`}>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5 opacity-60">Class</span>
                                                    <span className="text-2xl font-black leading-none">{cls.slot_number}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* Footer */}
                {classes.filter(c => c.start_time && c.end_time).length > 0 && (
                    <div className="mt-6 text-center text-xs text-gray-400">
                        {classes.filter(c => c.start_time && c.end_time).length} class{classes.filter(c => c.start_time && c.end_time).length !== 1 ? 'es' : ''} scheduled for today
                    </div>
                )}
            </main>
        </div>
    );
}
