'use client';

import { useState, useEffect } from 'react';
import { X, User, Mail, Shield, Lock, LogOut, BookOpen, Clock } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import { ChangePasswordModal } from './ChangePasswordModal';

interface ProfileUser {
    id?: string;
    firstName: string;
    lastName: string;
    email?: string;
    role: string;
}

interface AssignedSubject {
    id: string;
    subjectName?: string;
    subject_name?: string; // fallback
    subjectCode?: string;
    subject_code?: string; // fallback
    subjectPaperCode?: string | null;
    subject_paper_code?: string | null; // fallback
    subjectSemesters?: number[];
    subject_semesters?: number[]; // fallback
    degreeType?: string;
    degree_type?: string;
    degreeTypes?: string[];
}

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: ProfileUser;
    onLogout?: () => void;
}

export function ProfileModal({ isOpen, onClose, user, onLogout }: ProfileModalProps) {
    const [assignedSubjects, setAssignedSubjects] = useState<AssignedSubject[]>([]);
    const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const isTeacherOrHod = user.role === 'teacher' || user.role === 'hod';
        if (!isTeacherOrHod || !user.id) return;

        // 1. Try to load instantly from cache
        try {
            const cached = localStorage.getItem('offline_subjects');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.data && Array.isArray(parsed.data)) {
                    // Deduplicate by subjectId
                    const uniqueCached = Array.from(
                        new Map(parsed.data.map((a: any) => [a.subjectId || a.subject_id, a])).values()
                    ) as AssignedSubject[];
                    setAssignedSubjects(uniqueCached);
                }
            }
        } catch { /* ignore */ }

        // 2. Fetch from network silently to get real-time updates
        const fetchRealTimeSubjects = async () => {
            setIsLoadingSubjects(true);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/teacher-subjects?teacherId=${user.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const assignments = data.assignments || [];

                    // Deduplicate by Subject Code (Paper Code preferred)
                    const uniqueMap = new Map<string, AssignedSubject>();
                    assignments.forEach((a: any) => {
                        const code = a.subjectPaperCode || a.subject_paper_code || a.subjectCode || a.subject_code || 'N/A';
                        const dt = a.degreeType || a.degree_type;
                        if (!uniqueMap.has(code)) {
                            uniqueMap.set(code, { ...a, degreeTypes: dt ? [dt.toUpperCase()] : [] });
                        } else {
                            const existing = uniqueMap.get(code)!;
                            if (dt && existing.degreeTypes && !existing.degreeTypes.includes(dt.toUpperCase())) {
                                existing.degreeTypes.push(dt.toUpperCase());
                            }
                            // ensure semesters are merged properly
                            const sems = a.subjectSemesters || a.subject_semesters || [];
                            const existingSems = existing.subjectSemesters || existing.subject_semesters || [];
                            sems.forEach((sem: number) => {
                                if (!existingSems.includes(sem)) {
                                    existingSems.push(sem);
                                }
                            });
                            existingSems.sort((x: number, y: number) => x - y);
                            if (existing.subjectSemesters !== undefined) existing.subjectSemesters = existingSems;
                            else if (existing.subject_semesters !== undefined) existing.subject_semesters = existingSems;
                        }
                    });
                    const uniqueAssignments = Array.from(uniqueMap.values());

                    setAssignedSubjects(uniqueAssignments);
                    try {
                        localStorage.setItem('offline_subjects', JSON.stringify({
                            timestamp: Date.now(),
                            data: uniqueAssignments
                        }));
                    } catch { /* ignore */ }
                }
            } catch (error) {
                console.error('Failed to fetch realtime assigned subjects', error);
            } finally {
                setIsLoadingSubjects(false);
            }
        };

        fetchRealTimeSubjects();

    }, [isOpen, user]);

    if (!isVisible) return null;

    const roleLabel = user.role.replace('_', ' ').toUpperCase();

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 ${isOpen ? 'animate-fade-in' : 'animate-fade-out'}`}
                onClick={onClose}
            >
                {/* Modal Container */}
                <div
                    className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="bg-linear-to-br from-blue-600 to-purple-700 p-6 text-white relative shrink-0">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-md"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>

                        <div className="flex flex-col items-center">
                            <div className="w-20 h-20 mb-3 rounded-full bg-white flex items-center justify-center shadow-lg border-4 border-white/20">
                                <span className="text-2xl font-bold bg-clip-text text-transparent bg-linear-to-br from-blue-600 to-purple-700">
                                    {getInitials(user.firstName, user.lastName)}
                                </span>
                            </div>
                            <h2 className="text-xl font-bold mb-1">
                                {user.firstName} {user.lastName}
                            </h2>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full backdrop-blur-md border border-white/10">
                                <Shield className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold tracking-wide">{roleLabel}</span>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">

                        {/* Contact Info */}
                        {user.email && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100 w-full">
                                    <div className="p-1.5 bg-linear-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-lg shadow-inner border border-blue-100/50">
                                        <User className="w-3.5 h-3.5" />
                                    </div>
                                    <h3 className="text-[11px] sm:text-xs font-black text-slate-800 uppercase tracking-widest">
                                        Account Details
                                    </h3>
                                </div>
                                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-lg shadow-sm">
                                        <Mail className="w-4 h-4 text-gray-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-500 mb-0.5">Email Address</p>
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {user.email}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Assigned Subjects (Teachers / HODs only) */}
                        {(user.role === 'teacher' || user.role === 'hod') && (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between pb-3 border-b border-gray-100 w-full">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-linear-to-br from-indigo-50 to-purple-50 text-indigo-600 rounded-lg shadow-inner border border-indigo-100/50">
                                            <BookOpen className="w-3.5 h-3.5" />
                                        </div>
                                        <h3 className="text-[11px] sm:text-xs font-black text-slate-800 uppercase tracking-widest">
                                            Assigned Subjects
                                        </h3>
                                    </div>
                                    {isLoadingSubjects && (
                                        <span className="flex items-center gap-1.5 text-xs text-blue-500 font-medium animate-pulse">
                                            <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                            Refreshing...
                                        </span>
                                    )}
                                </div>

                                {assignedSubjects.length === 0 ? (
                                    <div className="p-4 bg-gray-50 border border-gray-100 border-dashed rounded-xl text-center">
                                        <p className="text-sm text-gray-500 font-medium">No subjects assigned yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {[...assignedSubjects]
                                            .sort((a, b) => {
                                                const aCode = a.subjectPaperCode || a.subject_paper_code || a.subjectCode || a.subject_code || '';
                                                const bCode = b.subjectPaperCode || b.subject_paper_code || b.subjectCode || b.subject_code || '';
                                                return aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' });
                                            })
                                            .map((sub, index) => {
                                                const subName = sub.subjectName || sub.subject_name || 'Unknown Subject';
                                                const subCode = sub.subjectPaperCode || sub.subject_paper_code || sub.subjectCode || sub.subject_code || 'N/A';
                                                const subSems = sub.subjectSemesters || sub.subject_semesters || [];

                                                return (
                                                    <div key={sub.id} className="p-3 bg-white border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] rounded-2xl flex items-center justify-between gap-3 group hover:border-blue-200 hover:shadow-md transition-all">
                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                            <div className="shrink-0 w-10 h-10 rounded-xl bg-linear-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-sm font-black text-blue-700 shadow-inner border border-blue-100/50">
                                                                {index + 1}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="font-bold text-gray-900 text-sm mb-1 truncate group-hover:text-blue-700 transition-colors" title={subName}>
                                                                    {subName}
                                                                </h4>
                                                                <div className="flex items-center flex-wrap gap-2 text-[11px] font-medium text-gray-500">
                                                                    <span className="bg-gray-100/80 px-2 py-0.5 rounded text-gray-600 border border-gray-200/50 font-semibold tracking-wide shadow-sm">
                                                                        {subCode}
                                                                    </span>
                                                                    {(sub.degreeTypes && sub.degreeTypes.length > 0) && (
                                                                        <>
                                                                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                                            <span className="text-indigo-600 font-bold uppercase tracking-wider truncate">{sub.degreeTypes.join(', ')}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {subSems.length > 0 && (
                                                            <div className="flex items-center justify-end shrink-0 max-w-[50%]">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-700 shadow-sm flex-wrap justify-end">
                                                                    <BookOpen className="w-3.5 h-3.5 opacity-60 shrink-0" />
                                                                    <span className="text-right">Sem: {subSems.sort().join(', ')}</span>
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-3 shrink-0">
                        <button
                            onClick={() => setShowPasswordModal(true)}
                            className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-50 border border-blue-100 hover:border-blue-300 hover:bg-blue-100 text-blue-700 transition-all group shadow-sm"
                        >
                            <Lock className="w-5 h-5 mb-1.5 text-blue-500 group-hover:text-blue-600 transition-colors" />
                            <span className="text-xs font-bold">Change Password</span>
                        </button>

                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-50 border border-red-100 hover:border-red-300 hover:bg-red-100 text-red-600 transition-all group shadow-sm"
                            >
                                <LogOut className="w-5 h-5 mb-1.5 text-red-500 group-hover:text-red-600 transition-colors" />
                                <span className="text-xs font-bold">Log Out</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Render Change Password modal stacked above */}
            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />
        </>
    );
}
