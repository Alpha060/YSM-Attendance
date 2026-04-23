'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { CustomClockPicker } from '@/components/ui/CustomClockPicker';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import {
    CalendarClock, Clock, Check, X, Building2, Loader2, AlertCircle, Download, CalendarOff
} from 'lucide-react';
import { AccessDenied } from '@/components/ui/access-denied';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
}

interface Department {
    id: string;
    name: string;
    code: string;
    deptType: string;
    degreeType?: string;
}

interface TeacherSubject {
    subjectId: string;
    code: string;
    paperCode: string | null;
    name: string;
    semesters: number[];
    degreeType?: string;
}

interface Teacher {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    department_id: string;
    subjects: TeacherSubject[];
    departments: { id: string; code: string }[];
}

interface TimeSlot {
    slotNumber: number;
    startTime: string;
    endTime: string;
}

interface Assignment {
    semester: number;
    slot_number: number;
    teacher_id: string;
    subject_id: string;
    department_id?: string;
}

// Cell key: dept-semester-slot
const cellKey = (deptId: string, semester: number, slot: number) => `${deptId}-${semester}-${slot}`;

export default function ClassSchedulePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Data
    const [departments, setDepartments] = useState<Department[]>([]);
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [batchConfig, setBatchConfig] = useState<Record<string, Record<string, number>>>({});

    // Time slots (shared across departments)
    const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(
        Array.from({ length: 6 }, (_, i) => ({ slotNumber: i + 1, startTime: '', endTime: '' }))
    );
    const [savingTimes, setSavingTimes] = useState(false);

    // Assignments: Map<cellKey(deptId-sem-slot), { teacherId, subjectId }>
    const [assignments, setAssignments] = useState<Map<string, { teacherId: string; subjectId: string }>>(new Map());
    const [savingCell, setSavingCell] = useState<string | null>(null);
    const [clockPicker, setClockPicker] = useState<{ isOpen: boolean, index: number, type: 'startTime' | 'endTime', value: string } | null>(null);

    const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [todayHoliday, setTodayHoliday] = useState<string | null>(null);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // Auth check
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        try {
            const parsed = JSON.parse(userData);
            setUser(parsed);
        } catch { router.replace('/login'); }
    }, [router]);

    // Fetch all data once
    useEffect(() => {
        if (!user) return;
        if (user.role !== 'hod') {
            setLoading(false);
            return;
        }
        const token = localStorage.getItem('token');
        if (!token) return;

        (async () => {
            try {
                // Fetch departments, teachers, batch config in parallel
                const [deptRes, teacherRes, batchRes, holidayRes] = await Promise.all([
                    fetch('/api/me/departments', { headers: { Authorization: `Bearer ${token}` } }),
                    fetch('/api/teachers', { headers: { Authorization: `Bearer ${token}` } }),
                    fetch('/api/settings/batch-config', { headers: { Authorization: `Bearer ${token}` } }),
                    fetch('/api/holidays', { headers: { Authorization: `Bearer ${token}` } }),
                ]);

                // Check if today is Sunday or a holiday
                let isHoliday = false;
                let holidayName = '';
                const todayDate = new Date();
                const isSunday = todayDate.getDay() === 0;
                if (isSunday) {
                    isHoliday = true;
                    holidayName = 'Sunday';
                    setTodayHoliday('Sunday');
                }

                // Check if today is a holiday from DB
                if (!isHoliday && holidayRes.ok) {
                    const holidayData = await holidayRes.json();
                    const holidays = holidayData.holidays || [];
                    const todayHol = holidays.find((h: any) => {
                        const hDate = new Date(h.date).toISOString().split('T')[0];
                        return hDate === today;
                    });
                    if (todayHol) {
                        isHoliday = true;
                        holidayName = todayHol.name;
                        setTodayHoliday(todayHol.name);
                    }
                }

                if (deptRes.status === 401) { router.replace('/login'); return; }

                const deptData = await deptRes.json();
                const depts: Department[] = deptData.departments || [];
                setDepartments(depts);
                try { sessionStorage.setItem('cache_departments', JSON.stringify(depts)); } catch { }

                if (teacherRes.ok) {
                    const teacherData = await teacherRes.json();
                    setAllTeachers(teacherData.teachers || []);
                    try { sessionStorage.setItem('cache_teachers_all', JSON.stringify(teacherData.teachers || [])); } catch { }
                }

                if (batchRes.ok) {
                    const batchData = await batchRes.json();
                    setBatchConfig(batchData.mappings || {});
                    try { sessionStorage.setItem('cache_batch_config', JSON.stringify(batchData.mappings || {})); } catch { }
                }

                // Fetch time slots (use first department's config)
                if (depts.length > 0) {
                    const timeRes = await fetch(
                        `/api/class-schedule/time-slots?departmentId=${depts[0].id}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (timeRes.ok) {
                        const timeData = await timeRes.json();
                        const existingSlots = (timeData.slots || []) as { slot_number: number | string; start_time: string; end_time: string }[];
                        const merged = Array.from({ length: 6 }, (_, i) => {
                            const existing = existingSlots.find(s => Number(s.slot_number) === i + 1);
                            return {
                                slotNumber: i + 1,
                                startTime: existing && existing.start_time ? String(existing.start_time).slice(0, 5) : '',
                                endTime: existing && existing.end_time ? String(existing.end_time).slice(0, 5) : '',
                            };
                        });
                        setTimeSlots(merged);
                    }

                    // Fetch ALL assignments for the day in a single bulk request!
                    try {
                        const assRes = await fetch(
                            `/api/class-schedule/assignments?date=${today}`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        if (assRes.ok) {
                            const assData = await assRes.json();
                            const rawAssignments = assData.assignments || [];

                            // If today is a holiday, auto-cleanup existing assignments
                            if (isHoliday && rawAssignments.length > 0) {
                                // Delete all assignments for today across all departments
                                await Promise.all(depts.map(dept =>
                                    fetch(
                                        `/api/class-schedule/assignments?departmentId=${dept.id}&date=${today}`,
                                        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
                                    )
                                ));
                                setAssignments(new Map());
                            } else {
                                const assignmentMap = new Map<string, { teacherId: string; subjectId: string }>();
                                rawAssignments.forEach((a: any) => {
                                    const dId = a.department_id || depts[0].id;
                                    assignmentMap.set(cellKey(dId, a.semester, a.slot_number), {
                                        teacherId: a.teacher_id,
                                        subjectId: a.subject_id,
                                    });
                                });
                                setAssignments(assignmentMap);
                            }
                        }
                    } catch (err) {
                        console.error('Error fetching assignments:', err);
                    }
                }
            } catch (err) {
                console.error('Error loading schedule data:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [user, today, router]);

    // Real-time updates: re-fetch assignments when schedule changes
    useRealtimeData({
        tables: ['daily_class_assignments', 'class_time_slots', 'users'],
        onTableChange: useCallback(() => {
            // Full page re-fetch is expensive, so we just reload it
            if (!user) return;
            if (user.role !== 'hod') return;
            const token = localStorage.getItem('token');
            if (!token) return;

            // Re-fetch assignments & teachers silently
            (async () => {
                try {
                    const [teacherRes, assRes] = await Promise.all([
                        fetch('/api/teachers', { headers: { Authorization: `Bearer ${token}` } }),
                        fetch(`/api/class-schedule/assignments?date=${today}`, { headers: { Authorization: `Bearer ${token}` } }),
                    ]);
                    if (teacherRes.ok) {
                        const data = await teacherRes.json();
                        setAllTeachers(data.teachers || []);
                    }
                    if (assRes.ok) {
                        const data = await assRes.json();
                        const map = new Map<string, { teacherId: string; subjectId: string }>();
                        (data.assignments || []).forEach((a: any) => {
                            const dId = a.department_id || departments[0]?.id;
                            map.set(cellKey(dId, a.semester, a.slot_number), {
                                teacherId: a.teacher_id,
                                subjectId: a.subject_id,
                            });
                        });
                        setAssignments(map);
                    }
                } catch (err) {
                    console.error('Realtime refresh error:', err);
                }
            })();
        }, [user, today, departments]),
    });

    // Batch label helpers
    const getBatchLabel = (sem: number, deptType: string): string => {
        const savedMappings = batchConfig[deptType];
        if (savedMappings && savedMappings[sem.toString()]) {
            const batchStart = savedMappings[sem.toString()];
            const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
            const batchEnd = (batchStart + duration) % 100;
            return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
        }
        const now = new Date();
        const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        const yearOffset = Math.floor((sem - 1) / 2);
        const batchStart = academicStartYear - yearOffset;
        const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
        const batchEnd = (batchStart + duration) % 100;
        return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
    };

    const isSemesterActive = (sem: number, deptType: string): boolean => {
        const savedMappings = batchConfig[deptType];
        if (!savedMappings || Object.keys(savedMappings).length === 0) return true;
        return !!savedMappings[sem.toString()];
    };

    // Build semester rows: union of all departments' active semesters
    // Each semester has sub-rows per department
    const semesterRows = (() => {
        const allSemesters = new Set<number>();
        departments.forEach(dept => {
            const maxSem = (dept.deptType === 'vocational' || dept.deptType === 'pg') ? 6 : 8;
            for (let s = 1; s <= maxSem; s++) {
                if (isSemesterActive(s, dept.deptType)) {
                    allSemesters.add(s);
                }
            }
        });
        return Array.from(allSemesters).sort((a, b) => a - b);
    })();

    // Get departments that have a given semester active (Sorted alphabetically by code)
    const getDepartmentsForSemester = (sem: number): Department[] => {
        return departments.filter(dept => {
            const maxSem = (dept.deptType === 'vocational' || dept.deptType === 'pg') ? 6 : 8;
            return sem <= maxSem && isSemesterActive(sem, dept.deptType);
        }).sort((a, b) => a.code.localeCompare(b.code));
    };

    // Hours mapping for custom variable time picker
    const hours = Array.from({ length: 12 }, (_, i) => (i + 7).toString().padStart(2, '0'));
    // Minutes mapping
    const mins = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    // Get teachers for a specific department
    const getTeachersForDept = (deptId: string): Teacher[] => {
        return allTeachers.filter((t: any) => {
            if (t.department_id === deptId) return true;
            if (t.departments && t.departments.some((d: any) => d.id === deptId)) return true;
            return false;
        });
    };

    // Get teachers for a department+semester (filtered by subject match)
    const getTeachersForDeptSemester = (deptId: string, semester: number): Teacher[] => {
        return getTeachersForDept(deptId).filter(t => {
            if (!t.subjects) return false;
            return t.subjects.some(s => s.semesters && s.semesters.includes(semester));
        });
    };

    // Get teacher's subjects for a semester, filtering by department's degree type if possible
    const getTeacherSubjectsForSemester = (teacherId: string, semester: number, deptId: string): TeacherSubject[] => {
        const teacher = allTeachers.find(t => t.id === teacherId);
        if (!teacher || !teacher.subjects) return [];

        const dept = departments.find(d => d.id === deptId);

        return teacher.subjects.filter(s => {
            if (!s.semesters || !s.semesters.includes(semester)) return false;
            // Support backward compatibility if degree_type isn't set, but if it is, enforce it
            if (dept && s.degreeType && dept.degreeType) {
                return s.degreeType === dept.degreeType;
            }
            return true;
        });
    };

    // Get strictly available teachers for a specific cell (Prevents double booking in the same slot across different semesters)
    const getTeachersForCell = (deptId: string, semester: number, slotNumber: number): Teacher[] => {
        return getTeachersForDeptSemester(deptId, semester).filter(t => {
            for (const [key, assignment] of Array.from(assignments.entries())) {
                const parts = key.split('-');
                const assignedSem = parseInt(parts[parts.length - 2], 10);
                const assignedSlot = parseInt(parts[parts.length - 1], 10);

                if (assignedSlot === slotNumber && assignedSem !== semester && assignment.teacherId === t.id) {
                    return false; // Teacher is busy in another semester for this slot
                }
            }
            return true;
        });
    };

    // Only display assignment columns for slots that have configured times
    const displaySlots = timeSlots.filter(s => s.startTime && s.endTime);

    // Ref to track latest timeSlots for auto-save
    const timeSlotsRef = useRef(timeSlots);
    timeSlotsRef.current = timeSlots;
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const userEditedTimes = useRef(false);

    // Time slot handlers
    const handleTimeChange = (index: number, field: 'startTime' | 'endTime', value: string) => {
        userEditedTimes.current = true;
        setTimeSlots(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            if (field === 'endTime' && index < 5) {
                updated[index + 1] = { ...updated[index + 1], startTime: value };
            }
            return updated;
        });
    };

    // Auto-save time slots with debounce (only after user edits)
    useEffect(() => {
        if (!userEditedTimes.current) return;
        if (departments.length === 0) return;

        const hasValidSlot = timeSlots.some(s => s.startTime && s.endTime);
        if (!hasValidSlot) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTimeSlots();
        }, 800);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeSlots]);

    // Save time slots to ALL departments
    const saveTimeSlots = async () => {
        const token = localStorage.getItem('token');
        if (!token || departments.length === 0) return;

        const currentSlots = timeSlotsRef.current;
        const validSlots = currentSlots
            .filter(s => s.startTime && s.endTime)
            .map(s => ({ slotNumber: s.slotNumber, startTime: s.startTime, endTime: s.endTime }));

        if (validSlots.length === 0) return;

        setSavingTimes(true);
        try {
            await Promise.all(departments.map(dept =>
                fetch('/api/class-schedule/time-slots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ departmentId: dept.id, slots: validSlots }),
                })
            ));
        } catch (err) {
            console.error('Error auto-saving time slots:', err);
        } finally {
            setSavingTimes(false);
        }
    };

    // Handle teacher selection for a cell
    const handleTeacherSelect = async (deptId: string, semester: number, slotNumber: number, teacherId: string) => {
        if (todayHoliday) return; // Block assignments on holidays
        const key = cellKey(deptId, semester, slotNumber);

        if (!teacherId) {
            await deleteAssignment(deptId, semester, slotNumber);
            return;
        }

        const teacherSubjects = getTeacherSubjectsForSemester(teacherId, semester, deptId);
        if (teacherSubjects.length === 0) return;
        const subjectId = teacherSubjects[0].subjectId;

        setAssignments(prev => {
            const newMap = new Map(prev);
            newMap.set(key, { teacherId, subjectId });
            return newMap;
        });

        setSavingCell(key);
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            await fetch('/api/class-schedule/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    departmentId: deptId,
                    date: today,
                    assignments: [{ semester, slotNumber, teacherId, subjectId }],
                }),
            });
        } catch (err) {
            console.error('Error saving assignment:', err);
        } finally {
            setSavingCell(null);
        }
    };

    const deleteAssignment = async (deptId: string, semester: number, slotNumber: number) => {
        const key = cellKey(deptId, semester, slotNumber);
        setAssignments(prev => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });

        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            await fetch(
                `/api/class-schedule/assignments?departmentId=${deptId}&date=${today}&semester=${semester}&slotNumber=${slotNumber}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (err) {
            console.error('Error deleting assignment:', err);
        }
    };

    const formatTime = (time: string) => {
        if (!time) return '--:--';
        const [h, m] = time.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${m} ${ampm}`;
    };

    const exportSchedulePDF = () => {
        const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';
        const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        let colsHtml = `<th style="width: 120px;">Semester</th>`;
        displaySlots.forEach(slot => {
            colsHtml += `<th>Class ${slot.slotNumber}<br><small style="opacity: 0.8; font-weight: normal;">${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}</small></th>`;
        });

        let rowsHtml = '';
        semesterRows.forEach((sem, semIndex) => {
            if (semIndex > 0) {
                // Spacer row for PDF to clearly separate semesters
                rowsHtml += `<tr><td colspan="${displaySlots.length + 1}" style="background: #e2e8f0; height: 12px; padding: 0; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;"></td></tr>`;
            }

            const deptsForSem = getDepartmentsForSemester(sem);
            deptsForSem.forEach((dept, deptIdx) => {
                const isFirstDeptRow = deptIdx === 0;
                rowsHtml += `<tr>`;

                // Semester Col
                rowsHtml += `<td style="background: ${isFirstDeptRow ? '#ffffff' : '#f8fafc'};">
                    ${isFirstDeptRow ? `<strong style="font-size: 13px;">Sem-0${sem}</strong><br><small style="color: #4f46e5; font-weight: bold;">${getBatchLabel(sem, dept.deptType)}</small>` : ''}
                    ${departments.length > 1 ? `<div style="margin-top: 4px;"><span class="dept-badge">${dept.code}</span></div>` : ''}
                </td>`;

                // Slots Col
                displaySlots.forEach(slot => {
                    const key = cellKey(dept.id, sem, slot.slotNumber);
                    const assignment = assignments.get(key);
                    const isSaving = savingCell === key;

                    if (assignment) {
                        const t = allTeachers.find(t => t.id === assignment.teacherId);
                        const autoSubject = getTeacherSubjectsForSemester(assignment.teacherId, sem, dept.id)[0];

                        rowsHtml += `<td style="background: #f1f5f9;">`;
                        if (t) {
                            rowsHtml += `<div style="font-weight: bold; color: #0f172a; font-size: 11px;">${t.first_name} ${t.last_name}</div>`;
                        }
                        if (autoSubject) {
                            rowsHtml += `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dotted #cbd5e1;">
                                <div style="color: #334155; font-weight: 600; font-size: 9px; line-height: 1.2;">${autoSubject.name}</div>
                                <div style="color: #0f172a; font-weight: 900; font-size: 9px;">${autoSubject.paperCode || autoSubject.code}</div>
                            </div>`;
                        }
                        rowsHtml += `</td>`;
                    } else {
                        rowsHtml += `<td><div style="color: #cbd5e1; text-align: center;">—</div></td>`;
                    }
                });
                rowsHtml += `</tr>`;
            });
        });

        const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Class Schedule - ${dateStr}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }
        body { padding: 30px; color: #1f2937; background: #fff; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 60px; width: auto; object-fit: contain; }
        .college-info h1 { font-family: 'Playfair Display', serif; font-size: 20px; color: #1e3a8a; text-transform: uppercase; margin-bottom: 2px; }
        .college-info p { font-size: 10px; color: #64748b; font-weight: 500; text-transform: uppercase; }
        .title-box { text-align: right; }
        .title-box h2 { color: #1e3a8a; font-size: 16px; margin-bottom: 4px; }
        .title-box p { color: #6b7280; font-size: 11px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background: #1e293b; color: white; padding: 12px 10px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; border: 1px solid #0f172a; }
        td { padding: 10px; border: 1px solid #cbd5e1; vertical-align: middle; }
        .dept-badge { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; }
        @media print { 
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; padding: 15px; } 
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-section">
            <img src="${logoUrl}" class="logo-img" alt="Logo">
            <div class="college-info">
                <h1>Yogoda Satsanga Mahavidyalaya</h1>
                <p>Jagannathpur, Dhurwa, Ranchi-834004</p>
            </div>
        </div>
        <div class="title-box">
            <h2>DAILY CLASS SCHEDULE</h2>
            <p>${dateStr}</p>
        </div>
    </div>
    <table>
        <thead><tr>${colsHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
    </table>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b;">
        <div>
            <span style="font-weight: 700; color: #334155;">Generated by:</span>
            <span style="margin-left: 4px; font-weight: 600;">${user?.role === 'super_admin' ? 'Admin' : 'HOD'}${departments.length > 0 ? ` (${departments.map(d => d.code).join(', ')})` : ''} — ${user?.firstName} ${user?.lastName}</span>
        </div>
        <div style="font-style: italic;">Auto-generated on ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
    </div>
</body>
</html>`;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); };
        }
    };

    if (loading || !user) {
        return <PageSkeleton type="classes" />;
    }

    if (user.role !== 'hod') {
        return <AccessDenied />;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                user={user}
                onLogout={handleLogout}
            />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 pt-20 px-3 sm:px-6 lg:px-8 pb-8 max-w-[1400px] mx-auto w-full">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 md:mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-linear-to-br from-indigo-500 to-teal-500 text-white rounded-2xl shadow-sm">
                            <CalendarClock className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Today&apos;s Classes</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-sm text-gray-500 font-medium">
                                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                                {departments.length > 1 && (
                                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100">
                                        {departments.map(d => d.code).join(', ')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0">
                        <button
                            onClick={exportSchedulePDF}
                            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)]"
                        >
                            <Download className="w-4 h-4" />
                            Download PDF
                        </button>
                    </div>
                </div>

                {/* Holiday Banner */}
                {todayHoliday && (
                    <div className="p-4 rounded-xl mb-6 text-sm font-semibold flex items-center gap-3 shadow-sm bg-amber-50 text-amber-800 border border-amber-200/60">
                        <CalendarOff className="w-5 h-5 shrink-0" />
                        <div>
                            <p className="font-bold">Holiday — {todayHoliday}</p>
                            <p className="text-xs font-medium text-amber-600 mt-0.5">Class assignments are disabled for today. Time slots are preserved.</p>
                        </div>
                    </div>
                )}

                {/* Status Message */}
                {message && (
                    <div className={`p-4 rounded-xl mb-6 text-sm font-semibold flex items-center gap-3 shadow-sm ${message.type === 'error'
                            ? 'bg-red-50 text-red-700 border border-red-200/60'
                            : 'bg-teal-50 text-teal-800 border border-teal-200/60'
                        }`}>
                        {message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                        {message.text}
                    </div>
                )}

                {/* ====== TIME SLOTS SECTION ====== */}
                <div className="bg-white rounded-3xl shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-100 p-5 sm:p-6 mb-6 relative overflow-hidden group/times">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50/50 rounded-bl-full -z-10 transition-transform duration-500 group-hover/times:scale-105"></div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-100/50 rounded-xl">
                                <Clock className="w-5 h-5 text-teal-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 leading-tight">Time Slots</h2>
                                <p className="text-xs text-gray-500 mt-0.5 font-medium">Daily schedules map to these slots</p>
                            </div>
                        </div>
                        {savingTimes && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-xs font-bold border border-teal-100 w-fit animate-pulse">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving...
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
                        {timeSlots.map((slot, index) => (
                            <div key={slot.slotNumber} className="bg-white rounded-2xl p-2 sm:p-4 border border-gray-100 shadow-sm hover:border-teal-200/60 hover:shadow-md transition-all group overflow-hidden">
                                <div className="flex items-center justify-between mb-2 sm:mb-3">
                                    <div className="text-xs font-bold text-gray-400 group-hover:text-teal-600 transition-colors">Class {slot.slotNumber}</div>
                                </div>
                                <div className="flex flex-col gap-2 mt-1">
                                    <div className="flex items-center bg-gray-50/50 p-1 sm:p-2 rounded-xl border border-gray-100 gap-1 sm:gap-1.5">
                                        {/* Start Time Trigger */}
                                        <button
                                            onClick={() => setClockPicker({ isOpen: true, index, type: 'startTime', value: slot.startTime || '08:00' })}
                                            className="flex-1 bg-white border border-gray-200 hover:border-teal-400 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-gray-700 font-bold text-xs sm:text-[13px] py-1.5 px-1 sm:px-2 rounded-lg shadow-sm transition-all text-center whitespace-nowrap"
                                        >
                                            {slot.startTime || '--:--'}
                                        </button>

                                        <span className="text-gray-300 font-black uppercase tracking-widest text-[9px] sm:text-[10px] shrink-0">to</span>

                                        {/* End Time Trigger */}
                                        <button
                                            onClick={() => setClockPicker({ isOpen: true, index, type: 'endTime', value: slot.endTime || '09:00' })}
                                            className="flex-1 bg-white border border-gray-200 hover:border-teal-400 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 text-gray-700 font-bold text-xs sm:text-[13px] py-1.5 px-1 sm:px-2 rounded-lg shadow-sm transition-all text-center whitespace-nowrap"
                                        >
                                            {slot.endTime || '--:--'}
                                        </button>
                                    </div>
                                    {slot.startTime && slot.endTime && (
                                        <div className="text-[9px] sm:text-[11px] text-teal-700 font-bold text-center bg-teal-50/80 py-1.5 px-1 sm:px-2 rounded-lg border border-teal-100/50 shadow-sm whitespace-nowrap">
                                            {formatTime(slot.startTime)} — {formatTime(slot.endTime)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ====== SCHEDULE GRID ====== */}
                <div className="bg-white rounded-3xl shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden relative group/grid">
                    <div className="p-5 border-b border-gray-100 bg-white relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-50 rounded-xl mt-0.5 sm:mt-0">
                                <Building2 className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 leading-tight">Teacher Assignments</h2>
                                <p className="text-xs text-gray-500 mt-1 font-medium">
                                    Select teachers for each slot. Subject is assigned automatically.
                                </p>
                            </div>
                        </div>
                    </div>

                    {semesterRows.length === 0 ? (
                        <div className="p-16 text-center text-gray-400 bg-gray-50/50">
                            <div className="w-16 h-16 bg-white border border-gray-100 shadow-sm rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-8 h-8 text-gray-300" />
                            </div>
                            <p className="font-bold text-gray-900">No active semesters</p>
                            <p className="text-sm mt-1 text-gray-500">Please configure batch settings to activate semesters.</p>
                        </div>
                    ) : (
                        <>
                            {/* UNIVERSAL TABULAR VIEW */}
                            <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
                                <table className="w-full min-w-[900px] border-collapse text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/80">
                                            <th className="px-5 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider sticky left-0 z-20 bg-slate-50/90 backdrop-blur border-r border-slate-200 min-w-[160px]">
                                                Semester
                                            </th>
                                            {displaySlots.map(slot => (
                                                <th key={slot.slotNumber} className="text-center px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[160px]">
                                                    {slot.startTime && slot.endTime ? (
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <div className="text-blue-700 font-extrabold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                                                {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-gray-400 font-bold bg-white px-2 py-0.5 rounded-md border border-gray-100 inline-block shadow-sm">
                                                            Class {slot.slotNumber}
                                                        </div>
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    {semesterRows.map((sem, semIndex) => {
                                        const deptsForSem = getDepartmentsForSemester(sem);
                                        const showMultipleDepts = departments.length > 1;

                                        return (
                                            <tbody key={`sem-body-${sem}`} className="bg-white divide-y divide-slate-100">
                                                {semIndex > 0 && (
                                                    <tr>
                                                        <td colSpan={displaySlots.length + 1} className="h-3 bg-slate-200/60 p-0 border-y border-slate-300 shadow-inner"></td>
                                                    </tr>
                                                )}
                                                {deptsForSem.map((dept, deptIdx) => {
                                                    const isFirstDeptRow = deptIdx === 0;
                                                    const isLastDeptRow = deptIdx === deptsForSem.length - 1;

                                                    return (
                                                        <tr
                                                            key={`${sem}-${dept.id}`}
                                                            className={`hover:bg-blue-50/10 transition-colors ${isLastDeptRow ? 'border-b border-transparent' : ''}`}
                                                        >
                                                            <td className={`px-5 py-4 sticky left-0 z-10 border-r border-slate-200 ${isFirstDeptRow ? 'bg-white' : 'bg-slate-50'
                                                                }`}>
                                                                {isFirstDeptRow && (
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <div className="text-lg font-black text-slate-900 tracking-tight">
                                                                            Sem-0{sem}
                                                                        </div>
                                                                        <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                            {getBatchLabel(sem, dept.deptType)}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {showMultipleDepts && (
                                                                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded inline-flex mt-1 ${deptIdx === 0
                                                                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                                                            : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                                                                        }`}>
                                                                        {dept.code}
                                                                    </div>
                                                                )}
                                                            </td>

                                                            {/* Cells */}
                                                            {displaySlots.map(slot => {
                                                                const key = cellKey(dept.id, sem, slot.slotNumber);
                                                                const assignment = assignments.get(key);
                                                                const isSaving = savingCell === key;

                                                                const teachersForCell = getTeachersForCell(dept.id, sem, slot.slotNumber);
                                                                const autoSubject = assignment
                                                                    ? getTeacherSubjectsForSemester(assignment.teacherId, sem, dept.id)[0]
                                                                    : null;

                                                                return (
                                                                    <td key={slot.slotNumber} className="px-2 py-2 align-top group/cell">
                                                                        <div className={`relative rounded-xl border p-2 transition-all min-h-[72px] flex flex-col justify-center ${assignment
                                                                                ? 'border-blue-200 bg-blue-50/40 shadow-sm'
                                                                                : 'border-transparent bg-slate-50/50 hover:bg-white hover:border-blue-200 hover:shadow-sm'
                                                                            } ${isSaving ? 'opacity-60 scale-95' : ''}`}>

                                                                            {assignment ? (
                                                                                <div className="space-y-1">
                                                                                    <select
                                                                                        value={assignment.teacherId || ''}
                                                                                        onChange={(e) => handleTeacherSelect(dept.id, sem, slot.slotNumber, e.target.value)}
                                                                                        disabled={!!todayHoliday}
                                                                                        className={`w-full bg-white border border-blue-200 rounded-md px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm transition-all ${todayHoliday ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                                        style={{
                                                                                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%233b82f6' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                                                                            backgroundPosition: 'right 0.25rem center',
                                                                                            backgroundRepeat: 'no-repeat',
                                                                                            backgroundSize: '1em 1em',
                                                                                            paddingRight: '1.25rem',
                                                                                        }}
                                                                                    >
                                                                                        <option value="">—</option>
                                                                                        {teachersForCell.map(t => (
                                                                                            <option key={t.id} value={t.id}>
                                                                                                {t.first_name} {t.last_name}
                                                                                            </option>
                                                                                        ))}
                                                                                    </select>

                                                                                    <div className="flex items-center justify-between gap-1 mt-1.5 px-0.5">
                                                                                        {autoSubject ? (
                                                                                            <div className="flex flex-col text-[10px] bg-blue-100/80 px-1.5 py-1 rounded truncate leading-tight justify-center flex-1 max-w-[120px]" title={`${autoSubject.name} (${autoSubject.paperCode || autoSubject.code})`}>
                                                                                                <span className="font-semibold text-blue-700 truncate">{autoSubject.name}</span>
                                                                                                <span className="font-black text-blue-900 truncate">{autoSubject.paperCode || autoSubject.code}</span>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <span className="text-[10px] text-amber-600 bg-amber-50 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-amber-100">
                                                                                                <AlertCircle className="w-3 h-3" />
                                                                                                No subject
                                                                                            </span>
                                                                                        )}
                                                                                        <button
                                                                                            onClick={() => deleteAssignment(dept.id, sem, slot.slotNumber)}
                                                                                            className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                                                                            title="Remove assignment"
                                                                                        >
                                                                                            <X className="w-3.5 h-3.5" />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="px-1 py-0.5">
                                                                                    <select
                                                                                        value=""
                                                                                        onChange={(e) => handleTeacherSelect(dept.id, sem, slot.slotNumber, e.target.value)}
                                                                                        disabled={!!todayHoliday}
                                                                                        className={`w-full bg-white/50 hover:bg-white border border-slate-200 border-dashed hover:border-solid hover:border-blue-300 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none transition-all ${todayHoliday ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                                                        style={{
                                                                                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M12 6v6m0 0v6m0-6h6m-6 0H6'/%3e%3c/svg%3e")`,
                                                                                            backgroundPosition: 'right 0.25rem center',
                                                                                            backgroundRepeat: 'no-repeat',
                                                                                            backgroundSize: '1em 1em',
                                                                                            paddingRight: '1.25rem',
                                                                                        }}
                                                                                    >
                                                                                        <option value="" disabled hidden>Assign teacher...</option>
                                                                                        <option value="">— Clear —</option>
                                                                                        {teachersForCell.map(t => (
                                                                                            <option key={t.id} value={t.id}>
                                                                                                {t.first_name} {t.last_name}
                                                                                            </option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            )}

                                                                            {isSaving && (
                                                                                <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px] rounded-xl z-10">
                                                                                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        );
                                    })}
                                </table>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-8 text-xs text-gray-500 font-medium text-center space-y-1.5 flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                        <p>Time slots persist daily</p>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        <p>Assignments reset midnight</p>
                    </div>
                </div>

                {clockPicker && (
                    <CustomClockPicker
                        isOpen={clockPicker.isOpen}
                        initialTime={clockPicker.value}
                        title={`Select ${clockPicker.type === 'startTime' ? 'Start' : 'End'} Time for Class ${timeSlots[clockPicker.index]?.slotNumber}`}
                        onClose={() => setClockPicker({ ...clockPicker, isOpen: false })}
                        onSave={(time) => {
                            handleTimeChange(clockPicker.index, clockPicker.type, time);
                        }}
                    />
                )}
            </main>
        </div>
    );
}
