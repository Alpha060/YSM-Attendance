'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Pencil, Trash2, Search,
    Plus,
    ChevronDown,
    BookOpen,
    FileUp,
    FileSpreadsheet,
    Download,
    AlertTriangle,
    X,
    CheckCircle2
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import { AccessDenied } from '@/components/ui/access-denied';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useActiveSemesters } from '@/hooks/useActiveSemesters';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface Subject {
    id: string;
    code: string;
    paperCode?: string;
    name: string;
    semesters: number[];
    degreeType: string;
    credits: number;
}

interface GroupedSubject {
    code: string;
    paperCode?: string;
    name: string;
    degreeTypes: string[];
    credits: number;
    semesters: number[];
    ids: string[];
}

interface Department {
    id: string;
    name: string;
    code: string;
    dept_type: string;
    degree_type: string;
}

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId?: string;
}

export default function SubjectsPage() {
    const router = useRouter();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Form data - with deptType and degreeType for degree selection
    const [formData, setFormData] = useState({
        code: '', paperCode: '', name: '', credits: '3', deptType: 'regular', degreeType: 'ba'
    });
    const [selectedSemesters, setSelectedSemesters] = useState<number[]>([1]);
    const [selectedDegreeTypes, setSelectedDegreeTypes] = useState<string[]>(['it']); // For multi-select degree types (vocational)
    const [editingGroup, setEditingGroup] = useState<GroupedSubject | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { getActiveSemesters, getBatchLabel } = useActiveSemesters();

    // Search & Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDegreeType, setFilterDegreeType] = useState('');
    const [filterSemester, setFilterSemester] = useState('');

    // Import States
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: any[] } | null>(null);
    const [isImporting, setIsImporting] = useState(false);

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
            const cachedSubjects = sessionStorage.getItem('cache_subjects');
            const cachedDepts = sessionStorage.getItem('cache_departments');
            if (cachedSubjects) {
                setSubjects(JSON.parse(cachedSubjects));
                setLoading(false); // Show cached data immediately, no skeleton
            }
            if (cachedDepts) setDepartments(JSON.parse(cachedDepts));
        } catch { /* ignore cache errors */ }

        fetchSubjects(token);
        fetchDepartments(token);
    }, [router]);

    // Real-time updates
    useRealtimeData({
        tables: ['subjects', 'departments'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token) {
                fetchSubjects(token);
                fetchDepartments(token);
            }
        }, []),
    });

    const fetchSubjects = async (token: string) => {
        try {
            const res = await fetch('/api/subjects', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const subjectsList = data.subjects || [];
            setSubjects(subjectsList);
            try { sessionStorage.setItem('cache_subjects', JSON.stringify(subjectsList)); } catch { }
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
        setLoading(false);
    };

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            const deptsList = data.departments || [];
            setDepartments(deptsList);
            try { sessionStorage.setItem('cache_departments', JSON.stringify(deptsList)); } catch { }
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    // Group subjects by code (subjects are now one-per-degree-type from API)
    const groupedSubjects = useMemo(() => {
        const groups: Map<string, GroupedSubject> = new Map();

        subjects.forEach(subject => {
            const key = subject.code;

            if (groups.has(key)) {
                const group = groups.get(key)!;
                if (!group.degreeTypes.includes(subject.degreeType)) {
                    group.degreeTypes.push(subject.degreeType);
                }
                // Merge semesters (union)
                for (const sem of subject.semesters) {
                    if (!group.semesters.includes(sem)) {
                        group.semesters.push(sem);
                    }
                }
                group.ids.push(subject.id);
            } else {
                groups.set(key, {
                    code: subject.code,
                    paperCode: subject.paperCode,
                    name: subject.name,
                    degreeTypes: [subject.degreeType],
                    credits: subject.credits,
                    semesters: [...subject.semesters],
                    ids: [subject.id]
                });
            }
        });

        // Sort semesters within each group
        groups.forEach(group => group.semesters.sort((a, b) => a - b));

        return Array.from(groups.values());
    }, [subjects]);

    // Filter grouped subjects
    const filteredGroups = useMemo(() => {
        return groupedSubjects.filter(group => {
            const matchesSearch =
                group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                group.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (group.paperCode && group.paperCode.toLowerCase().includes(searchTerm.toLowerCase()));
            // Check if any of the group's degree types match the filter
            const matchesDegreeType = !filterDegreeType || group.degreeTypes.includes(filterDegreeType);
            const matchesSem = !filterSemester || group.semesters.includes(parseInt(filterSemester));
            return matchesSearch && matchesDegreeType && matchesSem;
        });
    }, [groupedSubjects, searchTerm, filterDegreeType, filterSemester]);

    // Determine course type from degree type
    const getDeptTypeFromDegreeType = useCallback((dt: string) => {
        if (['ba', 'bsc', 'bcom'].includes(dt)) return 'regular';
        if (['it', 'bba', 'bca'].includes(dt)) return 'vocational';
        if (dt === 'mcom') return 'pg';
        return 'regular';
    }, []);

    const handleEdit = (group: GroupedSubject) => {

        const primaryDegreeType = group.degreeTypes[0] || 'ba';

        setFormData({
            code: group.code,
            paperCode: group.paperCode || '',
            name: group.name,
            credits: group.credits.toString(),
            deptType: getDeptTypeFromDegreeType(primaryDegreeType),
            degreeType: primaryDegreeType
        });
        setSelectedSemesters([...group.semesters]);
        setSelectedDegreeTypes([...group.degreeTypes]);
        setEditingGroup(group);
        setShowModal(true);
        setError('');
        setSuccess('');
    };

    // Get HOD's department info for auto-detection
    const hodDeptInfo = useMemo(() => {
        if (user?.role !== 'hod' || !user.departmentId) return null;
        const hodDept = departments.find(d => d.id === user.departmentId);
        return hodDept ? { deptType: hodDept.dept_type, degreeType: hodDept.degree_type } : null;
    }, [user, departments]);

    // Get degree type label for display
    const getDegreeTypeLabel = (dt: string) => {
        const labels: Record<string, string> = {
            'ba': 'BA',
            'bsc': 'B.Sc',
            'bcom': 'B.Com',
            'bca': 'BCA',
            'it': 'BSc IT',
            'bba': 'BBA',
            'mcom': 'M.Com'
        };
        return labels[dt] || dt.toUpperCase();
    };

    // Get default degree type based on course type
    const getDefaultDegreeType = (deptType: string) => {
        if (deptType === 'regular') return 'ba';
        if (deptType === 'vocational') return 'bca'; // Default to bca if unspecified vocational
        if (deptType === 'pg') return 'mcom';
        return 'ba';
    };

    const resetForm = () => {
        const defaultDeptType = hodDeptInfo?.deptType || 'regular';
        const defaultDegreeType = hodDeptInfo?.degreeType || getDefaultDegreeType(defaultDeptType);
        setFormData({ code: '', paperCode: '', name: '', credits: '3', deptType: defaultDeptType, degreeType: defaultDegreeType });
        setSelectedSemesters([1]);
        setSelectedDegreeTypes([defaultDegreeType]);
        setEditingGroup(null);
        setError('');
        setSuccess('');
    };

    const toggleSemester = (sem: number) => {
        setSelectedSemesters(prev =>
            prev.includes(sem)
                ? prev.filter((s: number) => s !== sem)
                : [...prev, sem].sort((a, b) => a - b)
        );
    };

    const toggleAllSemesters = () => {
        if (selectedSemesters.length === 8) {
            setSelectedSemesters([]);
        } else {
            setSelectedSemesters([1, 2, 3, 4, 5, 6, 7, 8]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        const token = localStorage.getItem('token');

        if (selectedSemesters.length === 0) {
            setError('Please select at least one semester');
            return;
        }

        // For vocational, require at least one degree type selected
        if (formData.deptType === 'vocational' && selectedDegreeTypes.length === 0) {
            setError('Please select at least one degree type (BCA, BSc IT, or BBA)');
            return;
        }

        try {
            if (editingGroup) {
                // UPDATE
                // We need to handle updates for degree types:
                // 1. Kept types (Intersection): Update Details
                // 2. Removed types (In editingGroup but not in selected): Delete
                // 3. Added types (In selected but not in editingGroup): Create

                const originalTypes = editingGroup.degreeTypes;
                const newTypes = formData.deptType === 'vocational' ? selectedDegreeTypes : [formData.degreeType];

                const keptTypes = originalTypes.filter(dt => newTypes.includes(dt));
                const removedTypes = originalTypes.filter(dt => !newTypes.includes(dt));
                const addedTypes = newTypes.filter(dt => !originalTypes.includes(dt));

                // 1. Update Kept Types
                for (const dt of keptTypes) {
                    await fetch('/api/subjects', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            oldCode: editingGroup.code,
                            oldDegreeType: dt,
                            newDegreeType: dt,
                            code: formData.code,
                            paperCode: formData.paperCode,
                            name: formData.name,
                            credits: formData.credits,
                            semesters: selectedSemesters
                        }),
                    });
                }

                // 2. Delete Removed Types
                for (const dt of removedTypes) {
                    await fetch(`/api/subjects?code=${encodeURIComponent(editingGroup.code)}&degreeType=${dt}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                    });
                }

                // 3. Create Added Types
                if (addedTypes.length > 0) {
                    await fetch('/api/subjects', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            code: formData.code,
                            paperCode: formData.paperCode,
                            name: formData.name,
                            credits: formData.credits,
                            degreeTypes: addedTypes,
                            semesters: selectedSemesters
                        }),
                    });
                }

                setSuccess('Subject updated successfully!');
            } else {
                // CREATE - with degreeTypes array for vocational, single degreeType for others
                const degreeTypesToSend = formData.deptType === 'vocational'
                    ? selectedDegreeTypes
                    : [formData.degreeType];

                const res = await fetch('/api/subjects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        code: formData.code,
                        paperCode: formData.paperCode,
                        name: formData.name,
                        credits: formData.credits,
                        degreeTypes: degreeTypesToSend,
                        semesters: selectedSemesters
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to create subject');
                    return;
                }
                setSuccess(`Subject created for ${data.count} semester/degree-type combination(s)!`);
            }

            fetchSubjects(token!);

            setTimeout(() => {
                setShowModal(false);
                resetForm();
            }, 1500);
        } catch {
            setError('Network error');
        }
    };

    const handleDelete = async (group: GroupedSubject) => {
        if (!confirm(`Are you sure you want to delete "${group.name}" from ALL associated degree types (${group.degreeTypes.join(', ')})?`)) return;
        const token = localStorage.getItem('token');

        try {
            // Delete for each degree type in the group
            let successCount = 0;
            for (const dt of group.degreeTypes) {
                const res = await fetch(`/api/subjects?code=${encodeURIComponent(group.code)}&degreeType=${dt}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) successCount++;
            }

            if (successCount === group.degreeTypes.length) {
                fetchSubjects(token!);
            } else {
                alert('Some subjects could not be deleted (possibly due to existing attendance records).');
                fetchSubjects(token!); // Refresh anyway
            }
        } catch (err) {
            console.error('Error deleting:', err);
            alert('Network error while deleting subject');
        }
    };

    // ========== Import Helper Functions ==========
    const normalizeData = (data: any[]) => {
        const keyMap: { [key: string]: string } = {
            'code': 'code', 'subject code': 'code', 'subject_code': 'code', 'code*': 'code', 'subjectcode': 'code',
            'paper code': 'paper_code', 'paper_code': 'paper_code', 'papercode': 'paper_code',
            'name': 'name', 'subject name': 'name', 'subject_name': 'name', 'name*': 'name', 'subjectname': 'name', 'title': 'name',
            'degree type': 'degree_type', 'degree_type': 'degree_type', 'degreetype': 'degree_type', 'degree_type*': 'degree_type', 'degree': 'degree_type', 'type': 'degree_type',
            'semesters': 'semesters', 'semester': 'semesters', 'sem': 'semesters', 'semesters*': 'semesters',
            'credits': 'credits', 'credit': 'credits', 'cr': 'credits'
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
        const headers = ['code*', 'paper_code', 'name*', 'degree_type*', 'semesters', 'credits'];
        const dummyData = [
            ['ENG101', '', 'English Literature', 'ba', '1,2,3,4,5', '4'],
            ['MATH101', 'PC-MATH-101', 'Mathematics', 'bsc', '1,2,3', '4'],
            ['ACC101', '', 'Accountancy', 'bcom', '1,2,3,4,5,6', '3'],
            ['PROG101', 'BCA-PROG', 'Programming in C', 'bca,it,bba', '1,2', '4'],
            ['EVS101', '', 'Environmental Studies', 'ba,bsc,bcom', '1', '2'],
            ['MGT101', '', 'Management Principles', 'bba', '1,2,3', '3']
        ];

        const csvContent = [
            headers.join(','),
            ...dummyData.map(row => row.map(cell => cell.includes(',') ? `"${cell}"` : cell).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'subject_import_template.csv';
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
                const res = await fetch('/api/subjects/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ subjects: data })
                });

                const result = await res.json();
                if (res.ok) {
                    setImportResults(result);
                    if (result.success > 0) {
                        fetchSubjects(token!);
                        setSuccess(`Successfully imported ${result.success} subject(s)!`);
                    }
                } else {
                    setError(result.error || 'Import failed');
                }
            } catch {
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

    if (loading) return <PageSkeleton type="subjects" />;

    if (user?.role === 'teacher') {
        return <AccessDenied message="Teachers do not have access to the Subjects page." />;
    }

    const canManage = user?.role === 'super_admin' || user?.role === 'hod';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={user}
                    onLogout={() => {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        router.replace('/login');
                    }}
                />
            )}

            {/* Navbar (Unified) */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            {/* Main Content */}
            <main className="flex-1 pt-24 pb-12 px-4 max-w-7xl mx-auto w-full">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <span className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
                                <BookOpen className="w-8 h-8" />
                            </span>
                            Subjects
                        </h1>
                        <p className="text-gray-500 mt-1 ml-1">
                            Manage course curriculum and syllabus.
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
                                Add Subject
                            </Button>
                        </div>
                    )}
                </div>

                {/* Search & Filter Controls */}
                <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex gap-2 w-full md:w-auto">
                        {/* Only show degree filter for Admins or HODs with multiple degree types */}
                        {(user?.role === 'super_admin' || new Set(departments.map(d => getDeptTypeFromDegreeType(d.degree_type))).size > 1) && (
                            <div className="relative w-full md:w-auto">
                                <select
                                    className="w-full md:w-48 bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                                    value={filterDegreeType}
                                    onChange={(e) => setFilterDegreeType(e.target.value)}
                                >
                                    <option value="">All Degrees</option>
                                    <option value="ba">BA (Bachelor of Arts)</option>
                                    <option value="bsc">B.Sc (Bachelor of Science)</option>
                                    <option value="bcom">B.Com (Bachelor of Commerce)</option>
                                    <option value="bca">BCA</option>
                                    <option value="it">BSc IT</option>
                                    <option value="bba">BBA</option>
                                    <option value="mcom">M.Com (Master of Commerce)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            </div>
                        )}
                        <div className="relative w-full md:w-auto">
                            <select
                                className="w-full md:w-40 bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                                value={filterSemester}
                                onChange={(e) => setFilterSemester(e.target.value)}
                            >
                                <option value="">All Semesters</option>
                                {(() => {
                                    const effectiveDeptTypeForFilter = filterDegreeType
                                        ? getDeptTypeFromDegreeType(filterDegreeType)
                                        : (user?.role === 'super_admin' ? 'regular' : (departments.length > 0 ? getDeptTypeFromDegreeType(departments[0].degree_type) : 'regular'));
                                    return getActiveSemesters(effectiveDeptTypeForFilter).map(s => {
                                        const label = getBatchLabel(s, effectiveDeptTypeForFilter);
                                        return (
                                            <option key={s} value={s}>Sem {s}{label ? ` (${label})` : ''}</option>
                                        );
                                    });
                                })()}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <div className="relative w-full md:w-auto">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                placeholder="Search subjects..."
                                className="w-full md:w-80 bg-gray-50 border border-transparent hover:bg-white hover:border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl pl-10 pr-4 py-2 text-sm transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>



                {/* Desktop Content */}
                {/* Desktop Content */}
                <div className="hidden md:block px-4 py-8">
                    {filteredGroups.length === 0 ? (
                        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50 shadow-none">
                            <CardContent className="py-12 text-center">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                                    <BookOpen className="w-8 h-8 text-gray-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">No subjects found</h3>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto mb-4">
                                    {searchTerm ? "We couldn't find any subjects matching your search." : "Get started by adding subjects to the curriculum."}
                                </p>
                                {canManage && !searchTerm && (
                                    <Button onClick={() => setShowModal(true)} variant="outline">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add New Subject
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">S.No.</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject Info</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Paper Code</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Degree</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Semesters</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Credits</th>
                                        {canManage && <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredGroups.map((group, index) => (
                                        <tr key={group.code} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-4 py-4 text-center text-sm font-medium text-gray-500">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-indigo-200">
                                                        {group.code.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-gray-900">{group.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono mt-0.5">{group.code}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                                                {group.paperCode || '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {group.degreeTypes.map(dt => (
                                                        <span key={dt} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                            {getDegreeTypeLabel(dt)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {group.semesters.map(sem => (
                                                        <span key={sem} className="w-6 h-6 rounded-full bg-gray-50 text-gray-600 border border-gray-100 flex items-center justify-center text-[10px] font-bold">
                                                            {sem}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-700">{group.credits} <span className="text-gray-400 font-normal text-xs ml-0.5">Cr</span></div>
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleEdit(group)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(group)}
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
                    )}
                </div>


                {/* Mobile Content */}
                {/* Mobile Content */}
                <div className="md:hidden space-y-4 pt-4">
                    {filteredGroups.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm border border-gray-100">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                <BookOpen className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm">{subjects.length === 0 ? "No subjects yet." : "No matching subjects."}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredGroups.map((group) => (
                                <div
                                    key={group.code}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-blue-200">
                                                {group.code.substring(0, 2)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 leading-tight">{group.name}</h3>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                                        {group.code}
                                                    </span>
                                                    {group.paperCode && (
                                                        <>
                                                            <span className="text-xs text-gray-400">•</span>
                                                            <span className="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded" title="Paper Code">
                                                                {group.paperCode}
                                                            </span>
                                                        </>
                                                    )}
                                                    <span className="text-xs text-gray-400">•</span>
                                                    <span className="text-xs text-gray-500 whitespace-nowrap">{group.credits} Credits</span>
                                                </div>
                                            </div>
                                        </div>
                                        {canManage && (
                                            <div className="flex gap-1 -mr-2 -mt-2">
                                                <button
                                                    onClick={() => handleEdit(group)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(group)}
                                                    className="p-2 text-red-500 md:text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {group.degreeTypes.map(dt => (
                                            <span key={dt} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                {getDegreeTypeLabel(dt)}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 overflow-x-auto pb-1">
                                        <span className="text-xs text-gray-400 whitespace-nowrap">Semesters:</span>
                                        <div className="flex gap-1">
                                            {group.semesters.map(sem => (
                                                <span key={sem} className="w-5 h-5 rounded-full bg-gray-50 text-gray-600 border border-gray-100 flex items-center justify-center text-[10px] font-bold">
                                                    {sem}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Mobile Floating Add Button - Right Bottom */}
            {canManage && (
                <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3 z-40">
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

            {/* Add/Edit Subject Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <CardHeader>
                            <CardTitle>{editingGroup ? 'Edit Subject' : 'Add Subject'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <Label htmlFor="code">Subject Code *</Label>
                                        <Input
                                            id="code"
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                            placeholder="Unique (e.g. CS101)"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="paperCode">Paper Code</Label>
                                        <Input
                                            id="paperCode"
                                            value={formData.paperCode}
                                            onChange={(e) => setFormData({ ...formData, paperCode: e.target.value })}
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="credits">Credits *</Label>
                                        <Input
                                            id="credits"
                                            type="number"
                                            value={formData.credits}
                                            onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="name">Subject Name *</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                {/* Multi-Semester Selection */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label>Semesters *</Label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedSemesters.length === 8}
                                                onChange={toggleAllSemesters}
                                                className="w-4 h-4"
                                            />
                                            Select All
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                                            <label
                                                key={sem}
                                                className={`flex items-center justify-center gap-2 p-2 border rounded cursor-pointer transition-colors ${selectedSemesters.includes(sem)
                                                    ? 'bg-cyan-100 border-cyan-500 text-cyan-800'
                                                    : 'bg-white hover:bg-gray-50'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSemesters.includes(sem)}
                                                    onChange={() => toggleSemester(sem)}
                                                    className="sr-only"
                                                />
                                                <span className="text-sm font-medium">Sem {sem}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Selected: {selectedSemesters.length} semester(s)
                                    </p>
                                </div>

                                {/* Course Type Selection - Only for Super Admin */}
                                {user?.role === 'super_admin' && (
                                    <div>
                                        <Label htmlFor="deptType">Course Type *</Label>
                                        <select
                                            id="deptType"
                                            className="w-full p-2 border rounded bg-linear-to-r from-cyan-50 to-white"
                                            value={formData.deptType}
                                            onChange={(e) => {
                                                const newDeptType = e.target.value;
                                                const newDegreeType = newDeptType === 'regular' ? 'ba' :
                                                    newDeptType === 'vocational' ? 'it' : 'mcom';
                                                setFormData({
                                                    ...formData,
                                                    deptType: newDeptType,
                                                    degreeType: newDegreeType
                                                });
                                                // Reset selectedDegreeTypes based on course type
                                                if (newDeptType === 'vocational') {
                                                    setSelectedDegreeTypes(['bca']); // Default to BCA selected
                                                } else {
                                                    setSelectedDegreeTypes([newDegreeType]);
                                                }
                                            }}
                                        >
                                            <option value="regular">Regular (BA/BSc/BCom)</option>
                                            <option value="vocational">Vocational (BCA, BSc IT, BBA)</option>
                                            <option value="pg">Postgraduate (MCom)</option>
                                        </select>
                                    </div>
                                )}

                                {/* Degree Type Selection - Only for Super Admin */}
                                {user?.role === 'super_admin' && (
                                    <div>
                                        <Label htmlFor="degreeType">Degree Type *</Label>

                                        {/* For Vocational - Multi-select checkboxes */}
                                        {formData.deptType === 'vocational' ? (
                                            <>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { value: 'bca', label: 'BCA' },
                                                        { value: 'it', label: 'BSc IT' },
                                                        { value: 'bba', label: 'BBA' }
                                                    ].map(opt => (
                                                        <label
                                                            key={opt.value}
                                                            className={`flex items-center justify-center gap-2 p-2 border rounded cursor-pointer transition-colors ${selectedDegreeTypes.includes(opt.value)
                                                                ? 'bg-purple-100 border-purple-500 text-purple-800'
                                                                : 'bg-white hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedDegreeTypes.includes(opt.value)}
                                                                onChange={() => {
                                                                    setSelectedDegreeTypes(prev =>
                                                                        prev.includes(opt.value)
                                                                            ? prev.filter(dt => dt !== opt.value)
                                                                            : [...prev, opt.value]
                                                                    );
                                                                }}
                                                                className="sr-only"
                                                            />
                                                            <span className="text-sm font-medium">{opt.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Selected: {selectedDegreeTypes.length === 0 ? 'None' : selectedDegreeTypes.map(dt => dt === 'bca' ? 'BCA' : dt === 'it' ? 'BSc IT' : 'BBA').join(', ')}
                                                </p>
                                            </>
                                        ) : (
                                            /* For Regular/PG - Single select dropdown */
                                            <>
                                                <select
                                                    id="degreeType"
                                                    className="w-full p-2 border rounded"
                                                    value={formData.degreeType}
                                                    onChange={(e) => {
                                                        setFormData({
                                                            ...formData,
                                                            degreeType: e.target.value
                                                        });
                                                    }}
                                                >
                                                    {formData.deptType === 'regular' && (
                                                        <>
                                                            <option value="ba">BA (Bachelor of Arts)</option>
                                                            <option value="bsc">B.Sc (Bachelor of Science)</option>
                                                            <option value="bcom">B.Com (Bachelor of Commerce)</option>
                                                        </>
                                                    )}
                                                    {formData.deptType === 'pg' && (
                                                        <option value="mcom">M.Com (Master of Commerce)</option>
                                                    )}
                                                </select>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Subject will be assigned to: {getDegreeTypeLabel(formData.degreeType)}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* For HOD, show their degree type (read-only) */}
                                {user?.role === 'hod' && hodDeptInfo && (
                                    <div>
                                        <Label>Degree Type</Label>
                                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border">
                                            {getDegreeTypeLabel(hodDeptInfo.degreeType)}
                                        </p>
                                    </div>
                                )}

                                {error && <p className="text-red-500 text-sm">{error}</p>}
                                {success && <p className="text-green-600 text-sm bg-green-50 p-2 rounded">{success}</p>}
                                <div className="flex gap-2 justify-end">
                                    <Button type="button" variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
                                        Cancel
                                    </Button>
                                    <Button type="submit">{editingGroup ? 'Update' : 'Save'} Subject</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <Card className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border-0 max-h-[90vh] flex flex-col">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4 shrink-0">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-xl">Import Subjects</CardTitle>
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
                                    <p className="mt-1 opacity-90">Upload a CSV or Excel file with subject details. Required columns: <code>code</code>, <code>name</code>, <code>degree_type</code>. Optional: <code>semesters</code> (comma-separated, default 1), <code>credits</code> (default 3).</p>
                                    <p className="mt-1 opacity-75 text-xs">Valid degree types: ba, bsc, bcom, it, bba, mcom. For multiple types, use comma-separated values (e.g. &quot;it,bba&quot;).</p>
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
