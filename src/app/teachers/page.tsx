'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    Pencil,
    Trash2,
    Search,
    Plus,
    Users,
    FileUp,
    FileSpreadsheet,
    Download,
    AlertTriangle,
    X,
    CheckCircle2,
    ChevronDown
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { Navbar } from '@/components/ui/Navbar';
import { AccessDenied } from '@/components/ui/access-denied';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { getInitials } from '@/lib/utils';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface DepartmentInfo {
    id: string;
    name: string;
    code: string;
    is_primary: boolean;
    role?: string;
}

interface Teacher {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    department_id: string | null;
    department_name?: string;
    department_code?: string;
    departments?: DepartmentInfo[];
    subjects?: { assignmentId: string; subjectId: string; code: string; paperCode?: string | null; name: string; semesters: number[]; }[];
}

interface Department {
    id: string;
    name: string;
    code: string;
    degree_type: string;
}

interface Subject {
    id: string;
    code: string;
    paperCode?: string | null;
    name: string;
    degreeType: string;
    semesters: number[];
}

interface GroupedSubject {
    code: string;
    paperCode?: string | null;
    name: string;
    degreeTypes: string[];
    semesters: number[];
}

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId?: string;
}

export default function TeachersPage() {
    const router = useRouter();
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Form States
    const [formData, setFormData] = useState({
        name: '', email: '', role: 'teacher', password: ''
    });
    const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
    const [deptRoles, setDeptRoles] = useState<Record<string, 'hod' | 'teacher'>>({});
    const [selectedSubjectKeys, setSelectedSubjectKeys] = useState<string[]>([]);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const [enablePasswordUpdate, setEnablePasswordUpdate] = useState(false);

    const handleDeptRoleChange = (deptId: string, role: 'hod' | 'teacher') => {
        setDeptRoles(prev => ({
            ...prev,
            [deptId]: role
        }));
        // If it's the primary department, keep formData.role in sync
        if (selectedDepartmentIds[0] === deptId) {
            setFormData(prev => ({ ...prev, role }));
        }
    };

    // Search & Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDepartmentId, setFilterDepartmentId] = useState('');


    // Import States
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: any[] } | null>(null);
    const [isImporting, setIsImporting] = useState(false);

    // Default academic year
    const [academicYear] = useState('2025-2026');

    // Group subjects by code for dropdown
    const groupedSubjects = useMemo(() => {
        const groups: Map<string, GroupedSubject> = new Map();

        subjects.forEach(subject => {
            const key = subject.code; // Group ONLY by code

            if (groups.has(key)) {
                const group = groups.get(key)!;
                if (!group.degreeTypes.includes(subject.degreeType)) {
                    group.degreeTypes.push(subject.degreeType);
                }
                for (const sem of subject.semesters) {
                    if (!group.semesters.includes(sem)) {
                        group.semesters.push(sem);
                    }
                }
            } else {
                groups.set(key, {
                    code: subject.code,
                    paperCode: subject.paperCode || null,
                    name: subject.name,
                    degreeTypes: [subject.degreeType],
                    semesters: [...subject.semesters]
                });
            }
        });

        // Sort semesters within each group
        groups.forEach(group => group.semesters.sort((a, b) => a - b));

        return Array.from(groups.entries());
    }, [subjects]);

    // Filter subjects based on selected departments' degree_types
    const filteredSubjects = useMemo(() => {
        if (selectedDepartmentIds.length === 0) return [];
        // Get the degree_types of selected departments
        const selectedDegreeTypes = departments
            .filter(d => selectedDepartmentIds.includes(d.id))
            .map(d => d.degree_type);

        // Include if the grouped subject contains ANY of the selected degree types
        const filtered = groupedSubjects.filter(([, g]) =>
            g.degreeTypes.some(dt => selectedDegreeTypes.includes(dt))
        );

        // Sort according to paper code
        return filtered.sort(([, a], [, b]) => {
            const paperA = (a.paperCode || a.code || '').toLowerCase();
            const paperB = (b.paperCode || b.code || '').toLowerCase();
            return paperA.localeCompare(paperB, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [groupedSubjects, selectedDepartmentIds, departments]);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        setUser(JSON.parse(userData));

        // Try loading cached data first for instant display
        try {
            const cachedTeachers = sessionStorage.getItem('cache_teachers');
            if (cachedTeachers) {
                setTeachers(JSON.parse(cachedTeachers));
                setLoading(false);
            }
            const cachedDepts = sessionStorage.getItem('cache_departments');
            if (cachedDepts) setDepartments(JSON.parse(cachedDepts));
            const cachedSubjects = sessionStorage.getItem('cache_subjects');
            if (cachedSubjects) setSubjects(JSON.parse(cachedSubjects));
        } catch { /* ignore cache errors */ }

        fetchTeachers(token);
        fetchDepartments(token);
        fetchSubjects(token);
    }, [router]);

    // Real-time updates: silently re-fetch when DB tables change
    useRealtimeData({
        tables: ['users', 'teacher_subjects', 'teacher_departments', 'departments', 'subjects'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token) {
                fetchTeachers(token);
                fetchDepartments(token);
                fetchSubjects(token);
            }
        }, []),
    });

    const fetchTeachers = async (token: string) => {
        try {
            const res = await fetch('/api/teachers', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const teachersList = data.teachers || [];
            setTeachers(teachersList);
            try { sessionStorage.setItem('cache_teachers', JSON.stringify(teachersList)); } catch { }
        } catch (err) {
            console.error('Error fetching teachers:', err);
        }
        setLoading(false);
    };

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const deptsList = data.departments || [];
            setDepartments(deptsList);
            try { sessionStorage.setItem('cache_departments', JSON.stringify(deptsList)); } catch { }
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    const fetchSubjects = async (token: string) => {
        try {
            const res = await fetch('/api/subjects', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const subjectsList = data.subjects || [];
            setSubjects(subjectsList);
            try { sessionStorage.setItem('cache_subjects', JSON.stringify(subjectsList)); } catch { }
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const resetForm = () => {
        // For HOD users, auto-set their departmentId
        const defaultDeptIds = user?.role === 'hod' && user.departmentId ? [user.departmentId] : [];
        const initialRoles: Record<string, 'hod' | 'teacher'> = {};
        if (user?.role === 'hod' && user.departmentId) {
            initialRoles[user.departmentId] = 'teacher';
        }
        setFormData({ name: '', email: '', role: 'teacher', password: '' });
        setSelectedDepartmentIds(defaultDeptIds);
        setDeptRoles(initialRoles);
        setSelectedSubjectKeys([]);
        setSelectedTeacherId(null);
        setEnablePasswordUpdate(false);
        setError('');
        setSuccess('');
    };

    const handleDepartmentToggle = (deptId: string) => {
        setSelectedDepartmentIds(prev => {
            if (prev.includes(deptId)) {
                // Remove department and also remove subjects from that department's degree_type
                const newDepts = prev.filter(id => id !== deptId);
                const dept = departments.find(d => d.id === deptId);
                if (dept) {
                    const deptSubjectKeys = groupedSubjects
                        .filter(([, g]) => g.degreeTypes.includes(dept.degree_type) && g.degreeTypes.length === 1)
                        .map(([key]) => key);
                    setSelectedSubjectKeys(prevSubs => prevSubs.filter(k => !deptSubjectKeys.includes(k)));
                }
                setDeptRoles(prevRoles => {
                    const updated = { ...prevRoles };
                    delete updated[deptId];
                    return updated;
                });
                return newDepts;
            } else {
                setDeptRoles(prevRoles => ({
                    ...prevRoles,
                    [deptId]: 'teacher'
                }));
                return [...prev, deptId];
            }
        });
    };

    const handleSubjectToggle = (subjectKey: string) => {
        setSelectedSubjectKeys(prev => {
            if (prev.includes(subjectKey)) {
                return prev.filter(k => k !== subjectKey);
            } else {
                return [...prev, subjectKey];
            }
        });
    };

    const handleEdit = (teacher: Teacher) => {
        setFormData({
            name: [teacher.first_name, teacher.last_name].filter(Boolean).join(' ').trim(),
            email: teacher.email,
            role: teacher.role,
            password: ''
        });
        setEnablePasswordUpdate(false);

        // Set selected departments and their roles
        const deptIds: string[] = [];
        const roles: Record<string, 'hod' | 'teacher'> = {};
        if (teacher.departments && teacher.departments.length > 0) {
            // Sort to put primary first
            const sorted = [...teacher.departments].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
            deptIds.push(...sorted.map(d => d.id));
            sorted.forEach(d => {
                roles[d.id] = (d.role as 'hod' | 'teacher') || 'teacher';
            });
        } else if (teacher.department_id) {
            deptIds.push(teacher.department_id);
            roles[teacher.department_id] = (teacher.role as 'hod' | 'teacher') || 'teacher';
        }
        setSelectedDepartmentIds(deptIds);
        setDeptRoles(roles);

        // Set selected subjects
        if (teacher.subjects && teacher.subjects.length > 0) {
            const subjectKeys = new Set<string>();
            teacher.subjects.forEach(sub => {
                const matchingSubject = subjects.find(s => s.id === sub.subjectId);
                if (matchingSubject) {
                    subjectKeys.add(matchingSubject.code);
                }
            });
            setSelectedSubjectKeys(Array.from(subjectKeys));
        } else {
            setSelectedSubjectKeys([]);
        }

        setSelectedTeacherId(teacher.id);
        setShowModal(true);
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        const token = localStorage.getItem('token');

        if (selectedDepartmentIds.length === 0) {
            setError('Please select at least one department');
            return;
        }

        try {
            if (selectedTeacherId) {
                // UPDATE Existing Teacher
                const res = await fetch('/api/teachers', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify((() => {
                        const parts = formData.name.trim().split(/\s+/);
                        return {
                            id: selectedTeacherId,
                            firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0],
                            lastName: parts.length > 1 ? parts[parts.length - 1] : '',
                            email: formData.email,
                            role: formData.role,
                            password: formData.password || undefined,
                            departments: selectedDepartmentIds.map(id => ({
                                id,
                                role: deptRoles[id] || 'teacher'
                            }))
                        };
                    })()),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to update teacher');
                    return;
                }
                setSuccess('Teacher updated successfully!');

                // Handle subject assignments
                await updateSubjectAssignments(selectedTeacherId, token!);
            } else {
                // CREATE New Teacher
                const res = await fetch('/api/teachers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify((() => {
                        const parts = formData.name.trim().split(/\s+/);
                        return {
                            firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0],
                            lastName: parts.length > 1 ? parts[parts.length - 1] : '',
                            email: formData.email,
                            role: formData.role,
                            password: formData.password || undefined,
                            departments: selectedDepartmentIds.map(id => ({
                                id,
                                role: deptRoles[id] || 'teacher'
                            }))
                        };
                    })()),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to create teacher');
                    return;
                }

                const newTeacherId = data.teacher.id;
                let successMessage = `Teacher created! Temporary password: ${data.temporaryPassword}`;

                // Assign subjects
                if (selectedSubjectKeys.length > 0) {
                    const assignResult = await updateSubjectAssignments(newTeacherId, token!);
                    if (assignResult) {
                        successMessage += ` & ${selectedSubjectKeys.length} subject(s) assigned!`;
                    }
                }
                setSuccess(successMessage);
            }

            fetchTeachers(token!);

            // Auto-close modal after success
            setTimeout(() => {
                setShowModal(false);
                resetForm();
            }, 1500);

        } catch {
            setError('Network error');
        }
    };

    const updateSubjectAssignments = async (teacherId: string, token: string): Promise<boolean> => {
        try {
            // Get current teacher's assignments
            const currentTeacher = teachers.find(t => t.id === teacherId);
            const currentAssignmentSubjectIds = new Set<string>();

            if (currentTeacher?.subjects) {
                currentTeacher.subjects.forEach(sub => {
                    currentAssignmentSubjectIds.add(sub.subjectId);
                });
            }

            // Determine which exact subject IDs they SHOULD have based on selected codes AND selected departments
            const targetDegreeTypes = departments
                .filter(d => selectedDepartmentIds.includes(d.id))
                .map(d => d.degree_type);

            const targetSubjectIds = new Set<string>();
            const targetSubjects = subjects.filter(s =>
                selectedSubjectKeys.includes(s.code) && targetDegreeTypes.includes(s.degreeType)
            );
            targetSubjects.forEach(s => targetSubjectIds.add(s.id));

            // Find assignments to remove (in current, not in target)
            if (currentTeacher?.subjects) {
                for (const sub of currentTeacher.subjects) {
                    if (!targetSubjectIds.has(sub.subjectId)) {
                        await fetch(`/api/teacher-subjects?id=${sub.assignmentId}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${token}` }
                        });
                    }
                }
            }

            // Find assignments to add (in target, not in current)
            for (const subject of targetSubjects) {
                if (!currentAssignmentSubjectIds.has(subject.id)) {
                    await fetch('/api/teacher-subjects', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            teacherId,
                            subjectCode: subject.code,
                            degreeType: subject.degreeType,
                            academicYear
                        }),
                    });
                }
            }

            return true;
        } catch (err) {
            console.error('Error updating subject assignments:', err);
            return false;
        }
    };

    // Import Helper Functions
    const normalizeData = (data: any[]) => {
        const keyMap: { [key: string]: string } = {
            'email': 'email', 'email address': 'email', 'mail': 'email', 'email*': 'email',
            'first name': 'name', 'firstname': 'name', 'name': 'name', 'first_name': 'name', 'first_name*': 'name',
            'full name': 'name', 'fullname': 'name', 'teacher name': 'name', 'name*': 'name',
            'last name': 'last_name', 'lastname': 'last_name', 'surname': 'last_name', 'last_name': 'last_name', 'last_name*': 'last_name',
            'department': 'department_code', 'dept': 'department_code', 'department code': 'department_code', 'department_code': 'department_code', 'department_code*': 'department_code',
            'role': 'role', 'position': 'role', 'type': 'role', 'role*': 'role',
            'password': 'password', 'pass': 'password',
            'subjects': 'subject_codes', 'subject codes': 'subject_codes', 'subject_codes': 'subject_codes', 'assigned subjects': 'subject_codes'
        };

        return data.map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                const lowerKey = key.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');

                let mappedKey = null;
                for (const [mapK, mapV] of Object.entries(keyMap)) {
                    const cleanMapK = mapK.replace(/[^a-z0-9]/g, '');
                    if (cleanMapK === lowerKey) {
                        mappedKey = mapV;
                        break;
                    }
                }

                if (mappedKey) {
                    newRow[mappedKey] = row[key];
                } else {
                    newRow[key] = row[key];
                }
            });
            return newRow;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportFile(file);
        setPreviewData([]);
        setImportResults(null);
        setError('');

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setPreviewData(results.data.slice(0, 5));
                },
                error: (err) => {
                    setError('Failed to parse CSV file');
                    console.error(err);
                }
            });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                setPreviewData(data.slice(0, 5));
            };
            reader.readAsBinaryString(file);
        } else {
            setError('Please upload a valid CSV or Excel file');
            setImportFile(null);
        }
    };

    const downloadTemplate = () => {
        // Teachers template - all mandatory except password and subjects
        const headers = ['email*', 'name*', 'department_code*', 'role*', 'password', 'subject_codes'];
        const dummyData = [
            ['teacher1@college.edu', 'Amit Sharma', 'IT', 'teacher', '', 'Programming,DBMS'],
            ['teacher2@college.edu', 'Priya Verma', 'HIS', 'teacher', '', 'History,Political Science'],
            ['hod.physics@college.edu', 'Dr. Rajesh Kumar', 'PHY', 'hod', 'custom123', 'Physics,Mathematics'],
            ['hod.bba@college.edu', 'Dr. Neha Singh', 'BBA', 'hod', '', 'Management,Marketing,Accounts']
        ];

        const csvContent = [
            headers.join(','),
            ...dummyData.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'teacher_import_template.csv';
        a.click();
    };

    const handleImport = async () => {
        if (!importFile) return;
        setIsImporting(true);
        setError('');

        const processImport = async (rawData: any[]) => {
            const data = normalizeData(rawData);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/teachers/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ teachers: data })
                });

                const result = await res.json();
                if (res.ok) {
                    setImportResults(result);
                    if (result.success > 0) {
                        fetchTeachers(token!);
                        setSuccess(`Successfully imported ${result.success} teachers!`);
                    }
                } else {
                    setError(result.error || 'Import failed');
                }
            } catch (err) {
                setError('Network error occurred during import');
            }
            setIsImporting(false);
        };

        if (importFile.name.endsWith('.csv')) {
            Papa.parse(importFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => processImport(results.data)
            });
        } else {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                processImport(data);
            };
            reader.readAsBinaryString(importFile);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this teacher?')) return;
        const token = localStorage.getItem('token');

        try {
            const res = await fetch(`/api/teachers?id=${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                fetchTeachers(token!);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete teacher');
            }
        } catch (err) {
            console.error('Error deleting:', err);
        }
    };


    if (loading) return <PageSkeleton type="teachers" />;

    const isSuperAdmin = user?.role === 'super_admin';
    const canManage = user?.role === 'super_admin' || user?.role === 'hod';

    // Teachers cannot access this page
    if (user?.role === 'teacher') {
        return <AccessDenied message="Teachers do not have access to the Teachers page." />;
    }

    const filteredTeachers = teachers.filter(teacher => {
        const matchesSearch =
            (teacher.first_name + ' ' + teacher.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
            teacher.email.toLowerCase().includes(searchTerm.toLowerCase());

        if (!filterDepartmentId) return matchesSearch;

        // Check primary department
        if (teacher.department_id === filterDepartmentId) return matchesSearch;

        // Check additional departments
        if (teacher.departments?.some(d => d.id === filterDepartmentId)) return matchesSearch;

        return false;
    });

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role }}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            {/* Main Content */}
            <main className="flex-1 pt-24 pb-12 px-4 max-w-7xl mx-auto w-full">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <span className="p-2 rounded-xl bg-orange-100 text-orange-600">
                                <Users className="w-8 h-8" />
                            </span>
                            Teachers
                        </h1>
                        <p className="text-gray-500 mt-1 ml-1">
                            Manage faculty members and their assignments.
                        </p>
                    </div>
                    {canManage && (
                        <div className="flex gap-2 shrink-0">
                            <Button variant="outline" onClick={() => setShowImportModal(true)} className="hidden md:flex">
                                <FileUp className="w-4 h-4 mr-2" />
                                Import CSV
                            </Button>
                            <Button
                                onClick={() => {
                                    resetForm();
                                    setShowModal(true);
                                }}
                                className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg hidden md:flex"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                <span className="hidden sm:inline">Add Teacher</span>
                                <span className="sm:hidden">Add</span>
                            </Button>
                        </div>
                    )}
                </div>

                {/* Filter and Search Bar */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
                    {/* Department Filter (Admin only) */}
                    {isSuperAdmin && (
                        <div className="md:col-span-3 relative">
                            <select
                                className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                value={filterDepartmentId}
                                onChange={(e) => setFilterDepartmentId(e.target.value)}
                            >
                                <option value="">All Departments</option>
                                {departments.map((dept) => (
                                    <option key={dept.id} value={dept.id}>
                                        {dept.name} ({dept.code})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                    )}

                    {/* Search Bar */}
                    <div className={`relative ${isSuperAdmin ? 'md:col-span-9' : 'md:col-span-12'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search teachers by name or email..."
                            className="pl-10 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Teachers List */}
                {filteredTeachers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="bg-orange-50 p-4 rounded-full mb-4">
                            <Users className="w-8 h-8 text-orange-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">No teachers found</h3>
                        <p className="text-gray-500 max-w-sm text-center mt-1">
                            {teachers.length === 0 ? "Get started by adding faculty members to the system." : "Try adjusting your search or filters."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop View */}
                        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">S.No.</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Teacher Profile</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subjects</th>
                                        {canManage && <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredTeachers.map((teacher, index) => (
                                        <tr key={teacher.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-4 py-4 text-center text-sm font-medium text-gray-500">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-linear-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                                        {getInitials(teacher.first_name, teacher.last_name)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <div className="font-semibold text-gray-900">{teacher.first_name} {teacher.last_name}</div>
                                                            {teacher.departments && teacher.departments.length > 0 ? (
                                                                teacher.departments.map((dept, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${dept.role === 'hod'
                                                                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                                                                            : 'bg-gray-50 text-gray-600 border-gray-100'
                                                                            }`}
                                                                    >
                                                                        {dept.code} ({dept.role === 'hod' ? 'HOD' : 'Teacher'})
                                                                    </span>
                                                                ))
                                                            ) : teacher.department_code && (
                                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold border border-blue-100">
                                                                    {teacher.department_code} ({teacher.role === 'hod' ? 'HOD' : 'Teacher'})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-0.5">{teacher.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {teacher.subjects && teacher.subjects.length > 0 ? (
                                                        [...new Map(teacher.subjects.map(s => [s.code, s])).values()].map((sub, idx) => (
                                                            <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-xs">
                                                                {sub.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-gray-400 text-xs text-center w-full block">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleEdit(teacher)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(teacher.id)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Grid View */}
                        <div className="md:hidden grid grid-cols-1 gap-4 pb-20">
                            {filteredTeachers.map((teacher) => (
                                <div key={teacher.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-linear-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
                                                {getInitials(teacher.first_name, teacher.last_name)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-semibold text-gray-900">{teacher.first_name} {teacher.last_name}</h3>
                                                    {teacher.departments?.map((dept, idx) => (
                                                        <span
                                                            key={idx}
                                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${dept.role === 'hod' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-600 border-gray-100'}`}
                                                        >
                                                            {dept.code} ({dept.role === 'hod' ? 'HOD' : 'Teacher'})
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-gray-500">{teacher.email}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {canManage && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleEdit(teacher)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(teacher.id)}
                                                    className="p-2 text-red-500 md:text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3 pt-3 border-t border-gray-50">
                                        <div className="flex justify-between">
                                            <span className="text-xs text-gray-500">Subjects</span>
                                            <div className="flex flex-wrap gap-1 justify-end max-w-[70%]">
                                                {teacher.subjects && teacher.subjects.length > 0 ? (
                                                    [...new Map(teacher.subjects.map(s => [s.code, s])).values()].map((sub, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-xs">
                                                            {sub.name}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-gray-400 text-xs">No subjects</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>

            {/* Floating Action Button (Mobile) - Admin/HOD only */}
            {canManage && (
                <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="h-12 w-12 bg-white text-gray-700 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform border border-gray-200"
                    >
                        <FileUp className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            resetForm();
                            setShowModal(true);
                        }}
                        className="h-14 w-14 bg-gray-900 text-white rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-0 my-8 max-h-[90vh] flex flex-col">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4 shrink-0 rounded-t-2xl">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-xl">{selectedTeacherId ? 'Edit Teacher' : 'Add New Teacher'}</CardTitle>
                                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 pb-6 overflow-y-auto custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Basic Info Section */}
                                <div className="space-y-2">
                                    <Label htmlFor="teacherName">Name *</Label>
                                    <Input
                                        id="teacherName"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Full name"
                                        required
                                        className="rounded-xl border-gray-200"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email Address *</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                            className="rounded-xl border-gray-200"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            {selectedTeacherId && (
                                                <input
                                                    type="checkbox"
                                                    id="enablePasswordUpdate"
                                                    checked={enablePasswordUpdate}
                                                    onChange={(e) => {
                                                        setEnablePasswordUpdate(e.target.checked);
                                                        if (!e.target.checked) setFormData({ ...formData, password: '' });
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                />
                                            )}
                                            <Label
                                                htmlFor={selectedTeacherId ? "enablePasswordUpdate" : "password"}
                                                className={selectedTeacherId ? "cursor-pointer" : ""}
                                            >
                                                {selectedTeacherId ? 'Update Password (Optional)' : 'Password'}
                                            </Label>
                                        </div>
                                        <Input
                                            id="password"
                                            type="password"
                                            value={formData.password || ''}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder={selectedTeacherId ? (enablePasswordUpdate ? "Enter new password" : "Check box to edit") : "Leave blank for default"}
                                            className="rounded-xl border-gray-200 disabled:opacity-50 disabled:bg-gray-50"
                                            disabled={selectedTeacherId ? !enablePasswordUpdate : false}
                                        />
                                        <p className="text-xs text-gray-400">
                                            {selectedTeacherId ? "Check the box to enable password update" : "Default: Welcome@123"}
                                        </p>
                                    </div>
                                </div>

                                {isSuperAdmin && (
                                    <div className="space-y-2">
                                        <Label>Role</Label>
                                        <div className="flex gap-6">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="role"
                                                    value="teacher"
                                                    checked={formData.role === 'teacher'}
                                                    onChange={(e) => setFormData({ ...formData, role: 'teacher' })}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                <span className="text-sm font-medium">Teacher</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="role"
                                                    value="hod"
                                                    checked={formData.role === 'hod'}
                                                    onChange={(e) => setFormData({ ...formData, role: 'hod' })}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                <span className="text-sm font-medium">HOD</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* Departments Section */}
                                <div className="space-y-3 pt-2 border-t border-gray-100">
                                    <Label className="text-base font-semibold text-gray-800">Assign Departments</Label>
                                    <p className="text-xs text-gray-500 -mt-1">
                                        {user?.role === 'hod'
                                            ? 'Teacher will be assigned to your department.'
                                            : 'Select departments this teacher belongs to.'}
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                        {departments
                                            // For HOD: filter to only show their department when adding,
                                            // or teacher's departments + their own when editing
                                            .filter(dept => {
                                                if (user?.role !== 'hod') return true; // Admin sees all
                                                // HOD sees: their own department always
                                                if (dept.id === user.departmentId) return true;
                                                // When editing: also show teacher's other assigned departments (read-only)
                                                if (selectedTeacherId && selectedDepartmentIds.includes(dept.id)) return true;
                                                return false;
                                            })
                                            .map(dept => {
                                                const isHodDept = user?.role === 'hod' && dept.id === user.departmentId;
                                                const isOtherDept = user?.role === 'hod' && dept.id !== user.departmentId;
                                                const isSelected = selectedDepartmentIds.includes(dept.id);
                                                const deptRole = deptRoles[dept.id] || 'teacher';

                                                return (
                                                    <div
                                                        key={dept.id}
                                                        className={`
                                                            relative flex flex-col p-3 rounded-xl border border-dashed transition-all gap-2
                                                            ${isOtherDept ? 'opacity-60 bg-gray-50' : 'bg-white'}
                                                            ${isSelected
                                                                ? 'bg-blue-50/40 border-blue-500 text-blue-700 font-medium'
                                                                : 'border-gray-300 text-gray-600 hover:border-gray-400'}
                                                        `}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                                checked={isSelected}
                                                                onChange={() => handleDepartmentToggle(dept.id)}
                                                                disabled={isOtherDept}
                                                            />
                                                            <span className="text-sm font-medium">{dept.name} ({dept.code})</span>
                                                        </div>
                                                        {isSelected && (
                                                            <div className="mt-1">
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Role in Department</label>
                                                                <select
                                                                    value={deptRole}
                                                                    onChange={(e) => handleDeptRoleChange(dept.id, e.target.value as 'hod' | 'teacher')}
                                                                    disabled={isOtherDept || !isSuperAdmin}
                                                                    className="w-full text-xs bg-white border border-gray-200 rounded px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer font-medium"
                                                                >
                                                                    <option value="teacher">Teacher</option>
                                                                    <option value="hod">HOD</option>
                                                                </select>
                                                            </div>
                                                        )}
                                                        {isOtherDept && (
                                                            <div className="absolute top-1 right-2">
                                                                <span className="text-[9px] text-gray-400 font-medium">read-only</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                    </div>
                                    {selectedDepartmentIds.length === 0 && (
                                        <p className="text-red-500 text-xs">Please select at least one department.</p>
                                    )}
                                </div>

                                {/* Subjects Section */}
                                {filteredSubjects.length > 0 && (
                                    <div className="space-y-3 pt-2 border-t border-gray-100">
                                        <Label className="text-base font-semibold text-gray-800">Assign Subjects</Label>
                                        <p className="text-xs text-gray-500 -mt-1">Select subjects this teacher teaches.</p>

                                        <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                                            {filteredSubjects.map(([key, group]) => (
                                                <label
                                                    key={key}
                                                    className={`
                                                        flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors
                                                        ${selectedSubjectKeys.includes(key) ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}
                                                    `}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedSubjectKeys.includes(key)}
                                                            onChange={() => handleSubjectToggle(key)}
                                                            className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                                                        />
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {group.degreeTypes.length > 0 && (
                                                                    <span className="text-amber-600 font-bold mr-1">[{group.degreeTypes.map(d => d.toUpperCase()).join(', ')}]</span>
                                                                )}
                                                                {group.name}
                                                            </div>
                                                            <div className="text-xs text-gray-500">{group.paperCode || group.code} • Sem {group.semesters.join(', ')}</div>
                                                        </div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        {error}
                                    </div>
                                )}
                                {success && (
                                    <div className="p-3 rounded-lg bg-green-50 text-green-600 text-sm border border-green-100 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" />
                                        {success}
                                    </div>
                                )}

                                <div className="flex gap-3 justify-end pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowModal(false)}
                                        className="rounded-xl"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="rounded-xl bg-gray-900 hover:bg-gray-800"
                                    >
                                        {selectedTeacherId ? 'Save Changes' : 'Create Teacher'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border-0 max-h-[90vh] flex flex-col">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4 shrink-0">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-xl">Import Teachers</CardTitle>
                                <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6 overflow-y-auto">
                            <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-sm border border-blue-100 flex items-start gap-3">
                                <div className="mt-0.5"><FileSpreadsheet className="w-5 h-5" /></div>
                                <div>
                                    <p className="font-semibold">Bulk Import Instructions</p>
                                    <p className="mt-1 opacity-90">Upload a CSV or Excel file containing teacher details. Columns required: <code>email</code>, <code>first_name</code>, <code>last_name</code>, <code>department_code</code>, <code>role</code>.</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Upload File</Label>
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                                    <input
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                            <FileUp className="w-6 h-6" />
                                        </div>
                                        {importFile ? (
                                            <p className="text-sm font-medium text-blue-600">{importFile.name}</p>
                                        ) : (
                                            <>
                                                <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
                                                <p className="text-xs text-gray-500">CSV, Excel files only</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={downloadTemplate}
                                className="w-full rounded-xl border-dashed"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Download Template
                            </Button>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div className="p-3 rounded-lg bg-green-50 text-green-600 text-sm border border-green-100">
                                    {success}
                                </div>
                            )}

                            {importResults?.errors && importResults.errors.length > 0 && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                                    <h4 className="text-red-800 font-semibold text-sm mb-2">Import Errors ({importResults.errors.length})</h4>
                                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                        {importResults.errors.map((err: any, idx: number) => (
                                            <div key={idx} className="text-xs text-red-600 bg-white p-2 rounded border border-red-100 shadow-sm">
                                                <span className="font-bold">Row {err.row} ({err.name}):</span> {err.error}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowImportModal(false)}
                                    className="rounded-xl"
                                >
                                    Close
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    disabled={!importFile || isImporting}
                                    className="rounded-xl bg-gray-900 hover:bg-gray-800 w-full sm:w-auto"
                                >
                                    {isImporting ? 'Importing...' : 'Start Import'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
