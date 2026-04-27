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
    FileUp,
    Download,
    X,
    FileSpreadsheet,
    AlertTriangle,
    Loader2,
    GraduationCap,
    ChevronDown,
    CheckCircle2,
    Sparkles
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Navbar } from '@/components/ui/Navbar';
import { AccessDenied } from '@/components/ui/access-denied';
import { parseStudentId, findDepartmentByCode, type ParsedStudentId } from '@/lib/parseStudentId';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useActiveSemesters } from '@/hooks/useActiveSemesters';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface Student {
    id: string;
    student_id: string | null;
    roll_number: string;
    first_name: string;
    last_name: string;
    email: string | null;
    department_id: string;
    current_semester: number;
    department_code: string;
    department_name: string;
}

interface Department {
    id: string;
    name: string;
    code: string;
    dept_type: 'regular' | 'vocational' | 'pg';
    deptType?: string;
    degree_type: string;
}

interface Subject {
    id: string;
    code: string;
    name: string;
    degreeType: string;
    semesters: number[];
}

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId?: string;
}

export default function StudentsPage() {
    const router = useRouter();
    const [students, setStudents] = useState<Student[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [batchConfig, setBatchConfig] = useState<Record<string, Record<string, number>>>({});
    const { getActiveSemesters, getBatchLabel } = useActiveSemesters();

    const getDeptType = (dept?: Department) => dept?.deptType || dept?.dept_type;

    // Form States
    const [formData, setFormData] = useState({
        studentId: '',
        rollNumber: '',
        name: '',
        email: '',
        semester: '1',
        departmentId: ''
    });
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [parsedInfo, setParsedInfo] = useState<ParsedStudentId | null>(null);

    // Number of visible subject dropdowns (dynamic "Add Subject" feature)
    const [subjectFieldCount, setSubjectFieldCount] = useState(1);

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDeptType, setFilterDeptType] = useState('');
    const [filterDepartmentId, setFilterDepartmentId] = useState('');
    const [filterSemester, setFilterSemester] = useState('');


    // Import States
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importResults, setImportResults] = useState<{ success: number; updated: number; failed: number; errors: any[] } | null>(null);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Default academic year
    const [academicYear] = useState('2025-2026');

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
            const cachedStudents = sessionStorage.getItem('cache_students');
            if (cachedStudents) {
                setStudents(JSON.parse(cachedStudents));
                setLoading(false);
            }
            const lCache = localStorage.getItem('offline_departments');
            if (lCache) {
                const parsed = JSON.parse(lCache);
                if (parsed.data && Array.isArray(parsed.data)) setDepartments(parsed.data);
            } else {
                const cachedDepts = sessionStorage.getItem('cache_departments');
                if (cachedDepts) setDepartments(JSON.parse(cachedDepts));
            }
            const cachedSubjects = sessionStorage.getItem('cache_subjects');
            if (cachedSubjects) setSubjects(JSON.parse(cachedSubjects));
        } catch { /* ignore cache errors */ }

        fetchStudents(token);
        fetchDepartments(token);
        fetchSubjects(token);
        fetchBatchConfig(token);
    }, [router]);

    // Real-time updates: silently re-fetch when DB tables change
    useRealtimeData({
        tables: ['students', 'student_subjects', 'departments', 'subjects'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token) {
                fetchStudents(token);
                fetchDepartments(token);
                fetchSubjects(token);
            }
        }, []),
    });



    const safeJson = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await res.json();
        }
        return null;
    };

    const fetchStudents = async (token: string) => {
        try {
            const res = await fetch('/api/students', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await safeJson(res);
            const studentsList = data?.students || [];
            setStudents(studentsList);
            try { sessionStorage.setItem('cache_students', JSON.stringify(studentsList)); } catch { }
        } catch (err) {
            console.error('Error fetching students:', err);
        }
        setLoading(false);
    };

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) { router.replace('/login'); return; }
            const data = await safeJson(res);
            const deptsList = data?.departments || [];
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
            if (res.status === 401) { router.replace('/login'); return; }
            const data = await safeJson(res);
            const subjectsList = data?.subjects || [];
            setSubjects(subjectsList);
            try { sessionStorage.setItem('cache_subjects', JSON.stringify(subjectsList)); } catch { }
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
    };

    // Fetch saved batch config from settings
    const fetchBatchConfig = async (token: string) => {
        try {
            const res = await fetch('/api/settings/batch-config', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setBatchConfig(data.mappings || {});
            }
        } catch (err) {
            console.error('Error fetching batch config:', err);
        }
    };

    // Look up semester from saved batch config: given an admission year and dept type,
    // find which semester has that admission year assigned
    const getSemesterFromBatchConfig = (admissionYear: number, deptType: string): number | null => {
        const mappings = batchConfig[deptType];
        if (!mappings) return null;

        // Find the semester where the batch_year matches the admission year
        for (const [semStr, batchYear] of Object.entries(mappings)) {
            if (batchYear === admissionYear) {
                return parseInt(semStr);
            }
        }
        return null;
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const handleEdit = async (student: Student) => {
        setFormData({
            studentId: student.student_id || '',
            rollNumber: student.roll_number,
            name: [student.first_name, student.last_name].filter(Boolean).join(' ').trim(),
            email: student.email || '',
            semester: student.current_semester.toString(),
            departmentId: student.department_id
        });
        setSelectedStudentId(student.id);

        // Fetch existing subject enrollments
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/student-subjects?studentId=${student.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.enrollments && data.enrollments.length > 0) {
                    const enrolledIds = data.enrollments.map((s: any) => s.subjectId);
                    setSelectedSubjects(enrolledIds);
                    setSubjectFieldCount(enrolledIds.length);
                } else {
                    setSelectedSubjects([]);
                    setSubjectFieldCount(1);
                }
            }
        } catch (err) {
            console.error('Error fetching student subjects', err);
        }

        setShowModal(true);
        setError('');
        setSuccess('');
    };

    const resetForm = () => {
        const defaultDeptId = user?.role === 'hod' ? (user.departmentId || '') : '';
        setFormData({
            studentId: '',
            rollNumber: '',
            name: '',
            email: '',
            semester: '1',
            departmentId: defaultDeptId
        });
        setSelectedStudentId(null);
        setSelectedSubjects([]);
        setSubjectFieldCount(1);
        setParsedInfo(null);
        setError('');
        setSuccess('');
    };

    // Handle Student ID input with auto-detection
    const handleStudentIdChange = (studentId: string) => {
        setFormData(prev => ({ ...prev, studentId }));

        // Don't parse if ID is too short
        if (studentId.length < 10) {
            setParsedInfo(null);
            return;
        }

        const parsed = parseStudentId(studentId);
        setParsedInfo(parsed);

        if (parsed.isValid) {
            // Auto-fill roll number
            if (parsed.rollNumber) {
                setFormData(prev => ({ ...prev, rollNumber: parsed.rollNumber!.toString() }));
            }

            // Auto-fill department first (needed to look up batch config)
            let newDeptId = formData.departmentId;
            let detectedDeptType = 'regular';
            if (user?.role === 'super_admin' && parsed.courseType) {
                const foundDept = findDepartmentByCode(departments, parsed);
                if (foundDept) {
                    newDeptId = foundDept.id;
                    setFormData(prev => ({ ...prev, departmentId: foundDept.id }));
                    const dept = departments.find(d => d.id === foundDept.id);
                    if (dept) detectedDeptType = dept.dept_type;
                }
            } else if (formData.departmentId) {
                const dept = departments.find(d => d.id === formData.departmentId);
                if (dept) detectedDeptType = dept.dept_type;
            }

            // Auto-fill semester: use saved batch config first, fall back to parseStudentId calculation
            let newSemester = formData.semester;
            if (parsed.admissionYear) {
                const configSemester = getSemesterFromBatchConfig(parsed.admissionYear, detectedDeptType);
                if (configSemester) {
                    newSemester = configSemester.toString();
                } else if (parsed.semester) {
                    newSemester = parsed.semester.toString();
                }
                setFormData(prev => ({ ...prev, semester: newSemester }));
            }

            // Auto-select subjects based on parsed info
            // autoSelectSubjects(parsed, parseInt(newSemester), newDeptId);
        }
    };

    // Auto-select subjects based on student ID parsing
    /*
    const autoSelectSubjects = (parsed: ParsedStudentId, semester: number, deptId: string) => {
        if (!parsed.isValid) return;

        const selectedDept = departments.find(d => d.id === deptId);
        if (!selectedDept) return;

        // Get subjects that match the department's degree type and semester
        const availableSubjects = subjects.filter(s =>
            s.semesters.includes(semester) && s.degreeType === selectedDept.degree_type
        );

        const subjectsToSelect: string[] = [];


        // Helper function to find subject by name (case-insensitive, with common aliases)
        const findSubjectByName = (name: string) => {
            const nameLower = name.toLowerCase();

            // Define common name aliases/variations
            const nameAliases: Record<string, string[]> = {
                'mathematics': ['mathematics', 'maths', 'math'],
                'physics': ['physics', 'phy'],
                'chemistry': ['chemistry', 'chem'],
                'accounts': ['accounts', 'accountancy', 'accounting'],
                'business studies': ['business studies', 'business study', 'business'],
                'history': ['history', 'his'],
                'political science': ['political science', 'pol science', 'politics'],
                'economics': ['economics', 'eco'],
                'english': ['english', 'eng'],
                'hindi': ['hindi', 'hin'],
                'philosophy': ['philosophy', 'phil'],
                'botany': ['botany', 'bot'],
                'zoology': ['zoology', 'zoo'],
                'commerce': ['commerce', 'com'],
            };

            // Get all possible variations for this search term
            let searchTerms = [nameLower];
            for (const [key, aliases] of Object.entries(nameAliases)) {
                if (aliases.includes(nameLower) || key === nameLower) {
                    searchTerms = aliases;
                    break;
                }
            }

            // Search with all variations
            return availableSubjects.find(s => {
                const subjectNameLower = s.name.toLowerCase();
                return searchTerms.some(term =>
                    subjectNameLower.includes(term) || term.includes(subjectNameLower)
                );
            });
        };

        if (parsed.courseType === 'regular') {
            // For regular students, match subjects by name using the dept code mapping
            // e.g., BA2025HIS001 -> deptCode 'HIS' -> subject name 'History'
            if (parsed.deptCode) {
                const DEPT_CODE_TO_NAME: Record<string, string> = {
                    'HIS': 'History',
                    'POL': 'Political Science',
                    'ECO': 'Economics',
                    'ENG': 'English',
                    'HIN': 'Hindi',
                    'PHI': 'Philosophy',
                    'PHY': 'Physics',
                    'CHE': 'Chemistry',
                    'MAT': 'Mathematics',
                    'BOT': 'Botany',
                    'ZOO': 'Zoology',
                    'COM': 'Commerce',
                };

                const subjectName = DEPT_CODE_TO_NAME[parsed.deptCode.toUpperCase()];
                if (subjectName) {
                    const matchingSubject = findSubjectByName(subjectName);
                    if (matchingSubject) {
                        subjectsToSelect.push(matchingSubject.id);
                    }
                }
            }
        } else if (parsed.courseType === 'vocational') {
            // For vocational students, auto-select core paper + GE subjects
            const coreSubject = availableSubjects.find(s =>
                s.name.toLowerCase().includes('core') &&
                (s.name.includes(semester.toString()) || s.code.includes(semester.toString()))
            );
            if (coreSubject) {
                subjectsToSelect.push(coreSubject.id);
            }

            if (parsed.geSubjects) {
                const ge1Subject = findSubjectByName(parsed.geSubjects.ge1);
                if (ge1Subject) {
                    subjectsToSelect.push(ge1Subject.id);
                }

                const ge2Subject = findSubjectByName(parsed.geSubjects.ge2);
                if (ge2Subject) {
                    subjectsToSelect.push(ge2Subject.id);
                }
            }
        }

        // Set the selected subjects and adjust field count
        if (subjectsToSelect.length > 0) {
            setSelectedSubjects(subjectsToSelect);
            setSubjectFieldCount(Math.max(subjectsToSelect.length, 1));
        }
    };
    */

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        const token = localStorage.getItem('token');

        // HOD validation: prevent adding students from other departments
        if (user?.role === 'hod' && parsedInfo?.isValid && !selectedStudentId) {
            const foundDept = findDepartmentByCode(departments, parsedInfo);
            if (foundDept && foundDept.id !== user.departmentId) {
                const hodDept = departments.find(d => d.id === user.departmentId);
                setError(`This student belongs to ${foundDept.name}. You can only add students to ${hodDept?.name || 'your department'}.`);
                return;
            }
        }

        if (selectedSubjects.length === 0) {
            setError('Please select at least one subject');
            return;
        }

        try {
            if (selectedStudentId) {
                // UPDATE Existing Student
                const res = await fetch('/api/students', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        id: selectedStudentId,
                        ...(() => {
                            const parts = formData.name.trim().split(/\s+/);
                            const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                            const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
                            return { ...formData, firstName, lastName };
                        })(),
                        currentSemester: parseInt(formData.semester)
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to update student');
                    return;
                }
                setSuccess('Student updated successfully!');

                // Sync Subjects
                if (selectedSubjects.length > 0) {
                    try {
                        const enrollRes = await fetch('/api/student-subjects', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                studentId: selectedStudentId,
                                subjectIds: selectedSubjects,
                                academicYear: academicYear,
                                semester: parseInt(formData.semester),
                                sync: true
                            }),
                        });
                        if (enrollRes.ok) {
                            setSuccess(`Student updated & Subjects synced!`);
                        }
                    } catch {
                        // ignore subject sync error for now
                    }
                }

            } else {
                // CREATE New Student
                const res = await fetch('/api/students', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        ...(() => {
                            const parts = formData.name.trim().split(/\s+/);
                            const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                            const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
                            return { ...formData, firstName, lastName };
                        })(),
                        currentSemester: parseInt(formData.semester)
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to create student');
                    return;
                }
                const newStudentId = data.student.id;
                let successMessage = 'Student created successfully!';

                // Enroll in Subjects
                if (selectedSubjects.length > 0) {
                    try {
                        const enrollRes = await fetch('/api/student-subjects', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                studentId: newStudentId,
                                subjectIds: selectedSubjects,
                                academicYear: academicYear,
                                semester: parseInt(formData.semester)
                            }),
                        });
                        if (enrollRes.ok) successMessage += ' & Subjects assigned!';
                    } catch {
                        // ignore
                    }
                }
                setSuccess(successMessage);
            }

            fetchStudents(token!);

            // Auto-close modal after success
            setTimeout(() => {
                setShowModal(false);
                resetForm();
            }, 1500);

        } catch {
            setError('Network error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this student?')) return;
        const token = localStorage.getItem('token');

        try {
            const res = await fetch(`/api/students?id=${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                fetchStudents(token!);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete student');
            }
        } catch (err) {
            console.error('Error deleting:', err);
        }
    };

    // Filter helper - filter subjects by semester and matching degree type of selected department
    const getFilteredSubjects = () => {
        const semester = parseInt(formData.semester);
        const selectedDept = departments.find(d => d.id === formData.departmentId);
        if (!selectedDept) return [];

        return subjects.filter(s =>
            s.semesters.includes(semester) && s.degreeType === selectedDept.degree_type
        );
    };

    // Add a new empty subject field
    const addSubjectField = () => {
        setSubjectFieldCount(c => c + 1);
    };

    // Remove a subject at index
    const removeSubjectAtIndex = (index: number) => {
        setSelectedSubjects(prev => {
            const newArr = [...prev];
            newArr.splice(index, 1);
            return newArr;
        });
        setSubjectFieldCount(c => Math.max(c - 1, 1));
    };

    // Import Logic
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
        setPreviewData([]);
        setImportResults(null);
        setError('');

        if (file.name.endsWith('.csv')) {
            const seenMap = new Map<string, number>();
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => {
                    const h = header.trim();
                    const cleanLower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanLower.startsWith('core') || cleanLower.startsWith('generic') || cleanLower.startsWith('ge')) {
                        if (/\d$/.test(cleanLower)) return h;
                        const key = cleanLower.replace(/\d+/g, '');
                        const count = (seenMap.get(key) || 0) + 1;
                        seenMap.set(key, count);
                        return `${h}${count}`;
                    }
                    return h;
                },
                complete: (results) => setPreviewData(results.data.slice(0, 5)),
                error: () => setError('Failed to parse CSV file')
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

    // Template for Regular students (BA/BSC/BCOM)
    const downloadRegularTemplate = () => {
        const headers = ['student_id*', 'name*', 'email', 'subject_codes'];
        const dummyData = [
            ['BA2025HIS001', 'John Doe', 'john@example.com', '"History,Political Science,Hindi,Environmental Studies,English Communication"'],
            ['BSC2025PHY002', 'Jane Smith', 'jane@example.com', '"Physics,Chemistry,Mathematics"'],
            ['BCOM2025COM003', 'Bob Wilson', 'bob@example.com', '"Commerce,Economics"'],
            ['BA2025ECO004', 'Alice Brown', 'alice@example.com', '"Economics,History,Philosophy"']
        ];
        const csvContent = [headers.join(','), ...dummyData.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'regular_students_template.csv';
        a.click();
    };

    // Template for Vocational students (BCA/BSCIT/BBA)
    const downloadVocationalTemplate = () => {
        const headers = ['student_id*', 'name*', 'email', 'subject_codes'];
        const dummyData = [
            ['BCA2025SC001', 'Rahul Kumar', 'rahul@example.com', '"C1,C2,GE1A,GE1B,AECC1"'],
            ['BSCIT2025IT002', 'Priya Sharma', 'priya@example.com', '"C1,C2,GE1A,GE1B,AECC1"'],
            ['BBA2025BA003', 'Amit Singh', 'amit@example.com', '"C1,C2,GE1A,GE1B,AECC1"'],
            ['BCA2024SC004', 'Neha Gupta', 'neha@example.com', '"C5,C6,C7,GE3A,GE3B,SEC1"'],
            ['BCA2023SC005', 'Deepak Roy', 'deepak@example.com', '"C11,C12,DSE1,DSE2"'],
            ['BCA2022SC006', 'Anita Das', 'anita@example.com', '"C13,C14,DSE3,DSE4"']
        ];
        const csvContent = [headers.join(','), ...dummyData.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vocational_students_template.csv';
        a.click();
    };

    const normalizeData = (data: any[]) => {
        const keyMap: { [key: string]: string } = {
            'student id': 'student_id', 'studentid': 'student_id', 'id': 'student_id',
            'student_id*': 'student_id', 'studentid*': 'student_id',
            'roll number': 'roll_number', 'rollnumber': 'roll_number', 'roll': 'roll_number', 'roll_no': 'roll_number',
            'first name': 'name', 'firstname': 'name', 'name': 'name',
            'first_name*': 'name', 'firstname*': 'name', 'name*': 'name',
            'first_name': 'name', 'full name': 'name', 'fullname': 'name', 'student name': 'name',
            'last name': 'last_name', 'lastname': 'last_name', 'surname': 'last_name',
            'last_name*': 'last_name', 'lastname*': 'last_name',
            'email': 'email', 'email address': 'email', 'email*': 'email',
            'department': 'department_code', 'dept': 'department_code', 'course': 'department_code',
            'semester': 'semester', 'sem': 'semester',
            // Subject columns - Regular
            'major_subject': 'major', 'majorsubject': 'major', 'major subject': 'major', 'major': 'major', 'major*': 'major',
            'minor': 'minor', 'minor subject': 'minor',
            'mdc': 'mdc', 'mdc subject': 'mdc',
            'vac': 'vac', 'vac subject': 'vac',
            'aec': 'aec', 'aec subject': 'aec',
            // Subject columns - Vocational
            'core': 'core1', 'core1': 'core1', 'core 1': 'core1', 'core1*': 'core1',
            'core2': 'core2', 'core 2': 'core2', 'core2*': 'core2',
            'core3': 'core3', 'core 3': 'core3',
            'generic': 'generic1', 'ge1': 'generic1', 'ge 1': 'generic1',
            'ge2': 'generic2', 'ge 2': 'generic2',
            'generic1': 'generic1', 'generic 1': 'generic1', 'generic1*': 'generic1',
            'generic2': 'generic2', 'generic 2': 'generic2', 'generic2*': 'generic2',
            'aecc': 'aecc', 'aecc subject': 'aecc',
            'subject_codes': 'subject_codes', 'subjectcodes': 'subject_codes', 'subjects': 'subject_codes'
        };

        return data.map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                const lowerKey = key.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                let mappedKey = null;
                for (const [mapK, mapV] of Object.entries(keyMap)) {
                    if (mapK.replace(/[^a-z0-9]/g, '') === lowerKey) {
                        mappedKey = mapV;
                        break;
                    }
                }
                newRow[mappedKey || key] = row[key];
            });
            return newRow;
        });
    };

    const handleImport = async () => {
        if (!importFile) return;
        setIsImporting(true);
        setError('');

        const processImport = async (rawData: any[]) => {
            const data = normalizeData(rawData);
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    setError('Not authenticated. Please log in again.');
                    setIsImporting(false);
                    return;
                }
                const res = await fetch('/api/students/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ students: data })
                });

                if (res.status === 401) {
                    setError('Session expired. Please log out and log in again.');
                    setIsImporting(false);
                    return;
                }

                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    setError('Server returned an unexpected response. Please try again.');
                    setIsImporting(false);
                    return;
                }

                const result = await res.json();
                if (res.ok) {
                    setImportResults(result);
                    if (result.success > 0 || result.updated > 0) fetchStudents(token!);
                } else {
                    setError(result.error || 'Import failed');
                }
            } catch {
                setError('Network error occurred during import');
            }
            setIsImporting(false);
        };

        if (importFile.name.endsWith('.csv')) {
            const seenMap = new Map<string, number>();
            Papa.parse(importFile, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => {
                    const h = header.trim();
                    const cleanLower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanLower.startsWith('core') || cleanLower.startsWith('generic') || cleanLower.startsWith('ge')) {
                        if (/\d$/.test(cleanLower)) return h;
                        const key = cleanLower.replace(/\d+/g, '');
                        const count = (seenMap.get(key) || 0) + 1;
                        seenMap.set(key, count);
                        return `${h}${count}`;
                    }
                    return h;
                },
                complete: (results) => processImport(results.data)
            });
        } else {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                processImport(data);
            };
            reader.readAsBinaryString(importFile);
        }
    };

    if (loading) return <PageSkeleton type="students" />;

    if (user?.role === 'teacher') {
        return <AccessDenied message="Teachers do not have access to the Students page." />;
    }

    const filteredStudents = students.filter(student => {
        const matchesSearch =
            (student.first_name + ' ' + student.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(student.roll_number).includes(searchTerm) ||
            (student.student_id?.includes(searchTerm));

        const matchesDept = !filterDepartmentId || student.department_id === filterDepartmentId;
        const matchesSem = !filterSemester || student.current_semester.toString() === filterSemester;

        return matchesSearch && matchesDept && matchesSem;
    }).sort((a, b) =>
        String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true, sensitivity: 'base' })
    );

    const isSuperAdmin = user?.role === 'super_admin';
    const canManage = user?.role === 'super_admin' || user?.role === 'hod';

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

            {/* Page Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                                <GraduationCap className="w-6 h-6" />
                            </span>
                            Students
                        </h1>
                        <p className="text-gray-500 text-sm mt-1 ml-11">
                            Manage student records and enrollments.
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
                                className="bg-gray-900 hover:bg-gray-800 text-white shadow-sm hidden md:flex"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                <span className="hidden sm:inline">Add Student</span>
                                <span className="sm:hidden">Add</span>
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 py-8 px-4 max-w-7xl mx-auto w-full">

                {/* Filter and Search Bar */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
                    {/* Filters */}
                    <div className="md:col-span-4 flex gap-2">
                        {/* Always show department filters for Admins and HODs */}
                        {new Set(departments.map(d => d.dept_type)).size > 1 && (
                            <div className="relative w-full">
                                <select
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer"
                                    value={filterDeptType}
                                    onChange={(e) => {
                                        setFilterDeptType(e.target.value);
                                        setFilterDepartmentId(''); // Reset department when type changes
                                    }}
                                >
                                    <option value="">All Types</option>
                                    <option value="regular">Regular</option>
                                    <option value="vocational">Vocational</option>
                                    <option value="pg">PG</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            </div>
                        )}
                        {departments.length > 1 && (
                            <div className="relative w-full">
                                <select
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer"
                                    value={filterDepartmentId}
                                    onChange={(e) => setFilterDepartmentId(e.target.value)}
                                >
                                    <option value="">All Departments</option>
                                    {departments
                                        .filter(dept => !filterDeptType || dept.dept_type === filterDeptType)
                                        .map((dept) => (
                                            <option key={dept.id} value={dept.id}>{dept.name} ({(dept.degree_type || '').toUpperCase()})</option>
                                        ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            </div>
                        )}
                        <div className="relative w-full">
                            <select
                                className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer"
                                value={filterSemester}
                                onChange={(e) => setFilterSemester(e.target.value)}
                            >
                                <option value="">All Semesters</option>
                                {(() => {
                                    const effectiveDeptType = filterDeptType || (filterDepartmentId ? getDeptType(departments.find(d => d.id === filterDepartmentId)) : (isSuperAdmin ? 'regular' : (departments.length > 0 ? getDeptType(departments[0]) : 'regular')));
                                    return getActiveSemesters(effectiveDeptType).map(s => {
                                        const label = getBatchLabel(s, effectiveDeptType);
                                        return <option key={s} value={s}>Sem {s}{label ? ` (${label})` : ''}</option>;
                                    });
                                })()}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className={`relative md:col-span-8`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search by name, roll no, or ID..."
                            className="pl-10 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Students List */}
                {filteredStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="bg-blue-50 p-4 rounded-full mb-4">
                            <Search className="w-8 h-8 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">No students found</h3>
                        <p className="text-gray-500 max-w-sm text-center mt-1">
                            {students.length === 0 ? "Get started by adding students to the system." : "Try adjusting your search or filters."}
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
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student Details</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                                        {canManage && <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredStudents.map((student, index) => (
                                        <tr key={student.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-4 py-4 text-center text-sm font-medium text-gray-500">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-linear-to-tr from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                                                        {student.first_name[0]}{student.last_name[0]}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <div className="font-semibold text-gray-900">{student.first_name} {student.last_name}</div>
                                                            {student.department_code && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                                    {student.department_code}
                                                                </span>
                                                            )}
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                                Sem {student.current_semester}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                                                            ID: {student.student_id || 'N/A'} • Roll: {student.roll_number}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {student.email || <span className="text-gray-400 italic">No email</span>}
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button onClick={() => handleEdit(student)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDelete(student.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
                        <div className="md:hidden grid grid-cols-1 gap-4">
                            {filteredStudents.map((student) => (
                                <div key={student.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
                                                {student.first_name[0]}{student.last_name[0]}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900">{student.first_name} {student.last_name}</h3>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                        ID: {student.student_id || 'N/A'}
                                                    </span>
                                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                        Roll: {student.roll_number}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {canManage && (
                                            <div className="flex">
                                                <button onClick={() => handleEdit(student)} className="p-2 text-gray-400 hover:text-emerald-600">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(student.id)} className="p-2 text-red-500 md:text-gray-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                                        {student.department_code && (
                                            <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                                {student.department_code}
                                            </span>
                                        )}
                                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                            Sem {student.current_semester}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>

            {/* Floating Action Buttons (Mobile) */}
            {canManage && (
                <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3 z-30">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="h-12 w-12 bg-white text-blue-600 rounded-full shadow-lg border border-blue-50 flex items-center justify-center"
                    >
                        <FileUp className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowModal(true); }}
                        className="h-14 w-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center active:scale-90"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <Card className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border-0">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4 shrink-0 rounded-t-2xl">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-xl">{selectedStudentId ? 'Edit Student' : 'Add New Student'}</CardTitle>
                                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-y-auto pt-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2 sm:col-span-1">
                                        <Label htmlFor="studentId" className="flex items-center gap-2">
                                            Student ID *
                                            {parsedInfo?.isValid && (
                                                <span className="flex items-center gap-1 text-emerald-600 text-xs font-normal">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Auto-detected
                                                </span>
                                            )}
                                        </Label>
                                        <Input
                                            id="studentId"
                                            value={formData.studentId}
                                            onChange={(e) => handleStudentIdChange(e.target.value.toUpperCase())}
                                            placeholder={(() => {
                                                // Dynamic placeholder based on HOD's department
                                                if (user?.role === 'hod' && user.departmentId) {
                                                    const hodDept = departments.find(d => d.id === user.departmentId);
                                                    if (hodDept?.code === 'IT') return 'e.g., BCA2025SC021';
                                                    if (hodDept?.code === 'BBA') return 'e.g., BBA2025BA021';
                                                    if (hodDept?.code === 'MCOM') return 'e.g., MCOM2025COM021';
                                                    // Regular departments
                                                    return `e.g., BA2025${hodDept?.code || 'HIS'}021`;
                                                }
                                                return 'e.g., BA2025HIS069';
                                            })()}
                                            className={`rounded-xl border-gray-200 uppercase ${parsedInfo?.isValid ? 'border-emerald-300 bg-emerald-50/30' : ''} ${parsedInfo && !parsedInfo.isValid && formData.studentId.length >= 10 ? 'border-amber-300' : ''}`}
                                            required
                                        />
                                        {parsedInfo?.error && formData.studentId.length >= 10 && (
                                            <p className="text-amber-600 text-xs mt-1">⚠️ {parsedInfo.error}</p>
                                        )}
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                        <Label htmlFor="rollNumber" className="flex items-center gap-2">
                                            Roll Number *
                                            {parsedInfo?.rollNumber && (
                                                <span className="text-gray-400 text-xs font-normal">(auto-filled)</span>
                                            )}
                                        </Label>
                                        <Input
                                            id="rollNumber"
                                            type="number"
                                            value={formData.rollNumber}
                                            onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                                            placeholder="e.g., 21"
                                            className="rounded-xl border-gray-200"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Parsed Info Display */}
                                {parsedInfo?.isValid && (
                                    <div className="p-3 bg-linear-to-r from-emerald-50 to-cyan-50 border border-emerald-200 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles className="w-4 h-4 text-emerald-600" />
                                            <span className="text-sm font-medium text-emerald-800">Detected Information</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${parsedInfo.courseType === 'regular' ? 'bg-blue-100 text-blue-700' :
                                                parsedInfo.courseType === 'vocational' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                {parsedInfo.courseType?.toUpperCase()}
                                            </span>
                                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                                Batch: {parsedInfo.admissionYear ? `${parsedInfo.admissionYear}-${String((parsedInfo.admissionYear + (parsedInfo.courseType === 'vocational' ? 3 : 4)) % 100).padStart(2, '0')}` : parsedInfo.batch}
                                            </span>
                                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                                Semester: {formData.semester}
                                            </span>
                                            {parsedInfo.programVariant && (
                                                <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-full">
                                                    {parsedInfo.programVariant}
                                                </span>
                                            )}
                                        </div>
                                        {/* HOD Warning - if parsed department doesn't match their department */}
                                        {user?.role === 'hod' && parsedInfo.isValid && (() => {
                                            const foundDept = findDepartmentByCode(departments, parsedInfo);
                                            if (foundDept && foundDept.id !== user.departmentId) {
                                                const hodDept = departments.find(d => d.id === user.departmentId);
                                                return (
                                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                                                        <p className="text-red-700 text-xs font-medium">
                                                            ⚠️ This student belongs to <strong>{foundDept.name}</strong>, but you can only add students to <strong>{hodDept?.name || 'your department'}</strong>.
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                )}
                                <div>
                                    <Label htmlFor="studentName">Name *</Label>
                                    <Input
                                        id="studentName"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Full name"
                                        className="rounded-xl border-gray-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="student@college.edu"
                                        className="rounded-xl border-gray-200"
                                    />
                                </div>

                                {isSuperAdmin ? (
                                    <div>
                                        <Label htmlFor="departmentId">Department *</Label>
                                        <select
                                            id="departmentId"
                                            className="w-full p-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:outline-none bg-white"
                                            value={formData.departmentId}
                                            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Department</option>
                                            {departments.map((dept) => (
                                                <option key={dept.id} value={dept.id}>{dept.code} - {dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <input type="hidden" value={user?.departmentId || ''} />
                                )}

                                <div>
                                    <Label htmlFor="semester">Semester *</Label>
                                    <select
                                        id="semester"
                                        className="w-full p-2 border border-gray-200 rounded-xl bg-white"
                                        value={formData.semester}
                                        onChange={(e) => {
                                            setFormData({ ...formData, semester: e.target.value });
                                            if (!selectedStudentId) setSelectedSubjects([]);
                                        }}
                                    >
                                        {getActiveSemesters(getDeptType(departments.find(d => d.id === formData.departmentId))).map(s => {
                                            const dt = getDeptType(departments.find(d => d.id === formData.departmentId));
                                            const label = getBatchLabel(s, dt);
                                            return (
                                                <option key={s} value={s}>Sem {s}{label ? ` (${label})` : ''}</option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {/* Subject Selection */}
                                {formData.departmentId ? (
                                    <div className="pt-4 border-t">
                                        <div className="flex items-center justify-between mb-2">
                                            <Label className="font-medium">Subjects <span className="text-red-500">*</span></Label>
                                        </div>
                                        {getFilteredSubjects().length === 0 ? (
                                            <p className="text-gray-500 text-sm p-2 mt-2 bg-gray-50 rounded-xl">No subjects available for Semester {formData.semester}.</p>
                                        ) : (
                                            <div className="mt-2 space-y-2">
                                                {/* Dynamic subject fields */}
                                                {Array.from({ length: subjectFieldCount }).map((_, idx) => {
                                                    const currentValue = selectedSubjects[idx] || '';
                                                    // Exclude subjects already selected in OTHER dropdowns
                                                    const otherSelectedIds = selectedSubjects.filter((_, i) => i !== idx);
                                                    const availableOptions = getFilteredSubjects().filter(s => !otherSelectedIds.includes(s.id));

                                                    return (
                                                        <div key={idx} className="flex items-center gap-2">
                                                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold shrink-0">
                                                                {idx + 1}
                                                            </div>
                                                            <select
                                                                className="flex-1 p-2 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                                                value={currentValue}
                                                                onChange={(e) => {
                                                                    const newVal = e.target.value;
                                                                    setSelectedSubjects(prev => {
                                                                        const newArr = [...prev];
                                                                        // Pad with empty strings if needed
                                                                        while (newArr.length <= idx) newArr.push('');
                                                                        newArr[idx] = newVal;
                                                                        return newArr.filter(Boolean);
                                                                    });
                                                                }}
                                                            >
                                                                <option value="">Select Subject</option>
                                                                {availableOptions.map(s => (
                                                                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                                                                ))}
                                                                {/* Keep current value visible even if it's from a different degree type */}
                                                                {currentValue && !availableOptions.find(s => s.id === currentValue) && (() => {
                                                                    const found = subjects.find(s => s.id === currentValue);
                                                                    return found ? <option key={found.id} value={found.id}>{found.code} - {found.name}</option> : null;
                                                                })()}
                                                            </select>
                                                            {/* Remove button — only show if more than 1 field */}
                                                            {subjectFieldCount > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeSubjectAtIndex(idx)}
                                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                                                    title="Remove subject"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {/* Add Subject button */}
                                                <button
                                                    type="button"
                                                    onClick={addSubjectField}
                                                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-xl transition-colors w-full justify-center border border-dashed border-blue-200 mt-1"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    Add Subject
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-xs text-gray-500 mt-2 ml-1">
                                            Selected: {selectedSubjects.filter(Boolean).length} subject(s)
                                        </p>
                                    </div>
                                ) : (
                                    <div className="pt-4 border-t">
                                        <p className="text-amber-600 text-sm bg-amber-50 p-3 rounded-xl border border-amber-100">
                                            Please select a department to view subjects.
                                        </p>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-green-50 text-green-700 rounded-xl text-sm border border-green-100 flex flex-col gap-2">
                                        <div className="font-semibold flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                            Success
                                        </div>
                                        {success}
                                        {!selectedStudentId && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => { setShowModal(false); resetForm(); }}
                                                className="self-end bg-white"
                                            >
                                                Close
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {(!success || selectedStudentId) && (
                                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowModal(false)}
                                            className="rounded-xl border-gray-200"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-lg shadow-gray-900/20"
                                        >
                                            {selectedStudentId ? 'Update Student' : 'Add Student'}
                                        </Button>
                                    </div>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border-0">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-4">
                            <CardTitle>Import Students</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setShowImportModal(false)}>
                                <X className="h-5 w-5 text-gray-400" />
                            </Button>
                        </CardHeader>
                        <CardContent className="overflow-y-auto pt-6 custom-scrollbar">
                            {!importResults ? (
                                <div className="space-y-6">
                                    {/* Upload Section */}
                                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center space-y-4 hover:bg-gray-50 transition-colors relative cursor-pointer group">
                                        <input
                                            type="file"
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600 group-hover:scale-110 transition-transform">
                                            <FileSpreadsheet className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-semibold text-gray-900">
                                                {importFile ? importFile.name : 'Click to Upload CSV or Excel'}
                                            </p>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Drag & drop or browse from computer
                                            </p>
                                        </div>
                                    </div>

                                    {/* Template Download */}
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                        <div className="mb-3">
                                            <h4 className="font-semibold text-emerald-900 text-sm">Download Template</h4>
                                            <p className="text-xs text-emerald-700 mt-0.5">Choose the template matching your student type.</p>
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <Button variant="outline" onClick={downloadRegularTemplate} className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50">
                                                <Download className="w-3.5 h-3.5 mr-2" />
                                                Regular (BA/BSC/BCOM)
                                            </Button>
                                            <Button variant="outline" onClick={downloadVocationalTemplate} className="bg-white text-purple-700 border-purple-200 hover:bg-purple-50">
                                                <Download className="w-3.5 h-3.5 mr-2" />
                                                Vocational (BCA/BBA)
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    {previewData.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm text-gray-700">
                                                <Search className="w-4 h-4" /> Preview (First 5 Rows)
                                            </h4>
                                            <div className="overflow-x-auto border border-gray-200 rounded-xl">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-gray-50 text-gray-600">
                                                        <tr>
                                                            {Object.keys(previewData[0]).map((header) => (
                                                                <th key={header} className="px-3 py-2 text-left font-medium uppercase tracking-wider">{header}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {previewData.map((row, i) => (
                                                            <tr key={i} className="hover:bg-gray-50">
                                                                {Object.values(row).map((val: any, j) => (
                                                                    <td key={j} className="px-3 py-2 whitespace-nowrap text-gray-600">{val}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 justify-end pt-2">
                                        <Button variant="outline" onClick={() => setShowImportModal(false)} className="rounded-xl">
                                            Cancel
                                        </Button>
                                        <Button onClick={handleImport} disabled={!importFile || isImporting} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">
                                            {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</> : 'Start Import'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                // Results View
                                <div className="space-y-6">
                                    <div className={`grid gap-4 ${importResults.updated > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                        <div className="bg-green-50 p-5 rounded-2xl text-center border border-green-100">
                                            <div className="text-3xl font-bold text-green-600">{importResults.success}</div>
                                            <div className="text-sm font-medium text-green-800 mt-1">New Students</div>
                                        </div>
                                        {importResults.updated > 0 && (
                                            <div className="bg-blue-50 p-5 rounded-2xl text-center border border-blue-100">
                                                <div className="text-3xl font-bold text-blue-600">{importResults.updated}</div>
                                                <div className="text-sm font-medium text-blue-800 mt-1">Updated</div>
                                            </div>
                                        )}
                                        <div className="bg-red-50 p-5 rounded-2xl text-center border border-red-100">
                                            <div className="text-3xl font-bold text-red-600">{importResults.failed}</div>
                                            <div className="text-sm font-medium text-red-800 mt-1">Failed</div>
                                        </div>
                                    </div>
                                    {importResults.updated > 0 && (
                                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-sm text-blue-700 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 shrink-0" />
                                            {importResults.updated} existing student(s) were updated with new data (name, semester, department, etc.)
                                        </div>
                                    )}

                                    {importResults.errors.length > 0 && (
                                        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                            <h4 className="font-semibold mb-3 text-red-600 text-sm flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" /> Error Log
                                            </h4>
                                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                {importResults.errors.map((err, i) => (
                                                    <div key={i} className="flex gap-3 text-xs p-2.5 bg-white rounded-lg border border-red-100 shadow-sm">
                                                        <span className="font-mono text-gray-500 w-12 shrink-0">Row {err.row}</span>
                                                        <span className="text-red-600 flex-1">{err.error}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-4">
                                        <Button onClick={() => { setShowImportModal(false); setImportResults(null); }} className="w-full rounded-xl bg-gray-900 hover:bg-gray-800">
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-red-500 text-sm mt-4 text-center bg-red-50 p-2 rounded-lg border border-red-100">{error}</p>}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
