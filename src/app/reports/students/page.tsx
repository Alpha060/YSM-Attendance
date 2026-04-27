'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

import { Search, X, BookOpen, CheckCircle, TrendingUp, GraduationCap, ChevronRight, FileText, FileSpreadsheet, FileDown, Calendar, Filter, ChevronDown, User, AlertCircle, Eye, CalendarDays, ArrowUpRight, ArrowDownRight, ChevronLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { useActiveSemesters } from '@/hooks/useActiveSemesters';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
    departmentId?: string;
}

interface Department {
    id: string;
    name: string;
    code: string;
    dept_type?: 'regular' | 'vocational' | 'pg';
    deptType?: string;
}

interface SubjectOption {
    id: string;
    code: string;
    name: string;
}

interface StudentAttendance {
    id: string;
    studentId: string;
    rollNumber: string;
    name: string;
    totalClasses: number;
    attended: number;
    percentage: number;
}

interface StudentDetail {
    student: {
        id: string;
        studentId: string;
        rollNumber: string;
        name: string;
        email: string;
        department: string;
        semester: number;
    };
    summary: {
        totalClasses: number;
        attended: number;
        attendancePercentage: number;
    };
    subjects: {
        id: string;
        name: string;
        code: string;
        paperCode?: string | null;
        totalClasses: number;
        attended: number;
        attendance: number;
    }[];
    monthlyTrend: {
        month: string;
        totalClasses: number;
        attended: number;
        attendance: number;
    }[];
    dailyBreakdown?: {
        date: string;
        subjectCode: string;
        subjectName: string;
        lectureNumber: number;
        status: string;
    }[];
    dateRange?: {
        startDate: string;
        endDate: string;
    } | null;
    reportSemester?: number;
    availableSemesters?: number[];
}

function StudentReportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const statusParam = searchParams.get('status');
    const viewParam = searchParams.get('view') || '';
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [deptCurrentSemesters, setDeptCurrentSemesters] = useState<number[]>([]);
    const [deptHistoricalSemesters, setDeptHistoricalSemesters] = useState<number[]>([]);
    const [isHistoricalView, setIsHistoricalView] = useState(false);
    const [selectedHistorySem, setSelectedHistorySem] = useState<string>('');

    const [showSearch, setShowSearch] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Page-level subject filter
    const [availableSubjects, setAvailableSubjects] = useState<SubjectOption[]>([]);
    const [pageSelectedSubjectIds, setPageSelectedSubjectIds] = useState<Set<string>>(new Set());
    const [showSubjectFilter, setShowSubjectFilter] = useState(false);

    // Sorting state
    const [sortField, setSortField] = useState<'name' | 'rollNumber' | 'totalClasses' | 'attended' | 'percentage'>('rollNumber');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    // Detail popup state
    const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Date range filter states for report
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [detailReportSemester, setDetailReportSemester] = useState<string>('');
    const { getActiveSemesters, getBatchLabel } = useActiveSemesters();

    const getDeptType = (dept?: Department) => dept?.deptType || dept?.dept_type;

    const selectedSubjectsStr = Array.from(pageSelectedSubjectIds).sort().join(',');

    // Real-time updates
    useRealtimeData({
        tables: ['attendance_records'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token && user) fetchStudentReport(token, true);
            // Also refresh open student detail popup
            if (selectedStudentId) fetchStudentDetail(selectedStudentId, startDate, endDate, true, detailReportSemester || undefined);
        }, [user, selectedDepartmentId, selectedSemester, selectedHistorySem, selectedSubjectsStr, startDate, endDate, selectedStudentId, detailReportSemester]),
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);

        if (parsedUser.role === 'super_admin') {
            fetchDepartments(token);
        } else if (parsedUser.role === 'teacher' || parsedUser.role === 'hod') {
            fetchTeacherDepartments(token, parsedUser.id);
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    useEffect(() => {
        if (departments.length === 1 && !selectedDepartmentId) {
            setSelectedDepartmentId(departments[0].id);
        }
    }, [departments, selectedDepartmentId]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchStudentReport(token);
        }
    }, [selectedDepartmentId, selectedSemester, selectedHistorySem, selectedSubjectsStr, user, startDate, endDate]);

    // Fetch subjects when department/semester changes
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchSubjects(token);
        }
    }, [selectedDepartmentId, selectedSemester, selectedHistorySem, user]);

    const fetchSubjects = async (token: string) => {
        try {
            const params = new URLSearchParams();
            if (selectedSemester) params.append('semester', selectedSemester);
            if (selectedDepartmentId) params.append('departmentId', selectedDepartmentId);
            let url = '/api/subjects';
            if (params.toString()) url += '?' + params.toString();

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const subjects: SubjectOption[] = (data.subjects || []).map((s: { id: string; code: string; name: string }) => ({
                id: s.id,
                code: s.code,
                name: s.name,
            }));
            setAvailableSubjects(subjects);
            // Select all by default
            setPageSelectedSubjectIds(new Set(subjects.map(s => s.id)));
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
    };

    const getCachedDepartments = () => {
        try {
            const lCache = localStorage.getItem('offline_departments');
            if (lCache) {
                const parsed = JSON.parse(lCache);
                if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
            }
            const sCache = sessionStorage.getItem('cache_departments');
            if (sCache) {
                const parsed = JSON.parse(sCache);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch { /* ignore */ }
        return null;
    };

    const fetchDepartments = async (token: string) => {
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) setDepartments(cached);

        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const depts = data.departments || [];
            setDepartments(depts);
            try { sessionStorage.setItem('cache_departments', JSON.stringify(depts)); } catch { }
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };


    // Fetch departments for teachers (from their profile + multi-department assignments)
    const fetchTeacherDepartments = async (token: string, teacherId: string) => {
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) setDepartments(cached);

        try {
            const res = await fetch('/api/me/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const depts = data.departments || [];
            if (depts.length > 0) {
                setDepartments(depts);
                try {
                    localStorage.setItem('offline_departments', JSON.stringify({
                        timestamp: Date.now(),
                        data: depts
                    }));
                } catch { /* ignore */ }
            }
        } catch (err) {
            console.error('Error fetching teacher departments:', err);
        }
    };

    const fetchStudentReport = async (token: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            let url = '/api/reports/students';
            const params = new URLSearchParams();
            if (selectedDepartmentId) params.append('departmentId', selectedDepartmentId);
            const activeSem = selectedHistorySem || selectedSemester;
            if (activeSem) params.append('semester', activeSem);
            // When viewing history, tell API which current semester batch to scope to
            if (selectedHistorySem && selectedSemester) params.append('originSemester', selectedSemester);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (viewParam) params.append('view', viewParam);

            if (pageSelectedSubjectIds.size > 0 && availableSubjects.length > 0 && pageSelectedSubjectIds.size < availableSubjects.length) {
                params.append('subjectIds', Array.from(pageSelectedSubjectIds).join(','));
            }

            if (params.toString()) url += '?' + params.toString();

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.students) {
                setStudents(data.students);
            }
            if (data.currentSemesters) setDeptCurrentSemesters(data.currentSemesters);
            if (data.historicalSemesters) setDeptHistoricalSemesters(data.historicalSemesters);
            setIsHistoricalView(data.isHistorical || false);
        } catch (err) {
            console.error('Error fetching student report:', err);
        }
        if (!silent) setLoading(false);
    };

    const fetchStudentDetail = async (studentId: string, startDate?: string, endDate?: string, silent = false, reportSemester?: string) => {
        if (!silent) setLoadingDetail(true);
        if (!silent) setSelectedStudentId(studentId);
        try {
            const token = localStorage.getItem('token');
            let url = `/api/reports/students/${studentId}`;
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (viewParam) params.append('view', viewParam);
            if (reportSemester) params.append('reportSemester', reportSemester);
            if (params.toString()) url += '?' + params.toString();

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            setSelectedStudent(data);
            // Set the detail semester: use the explicitly passed semester, or fall back to response
            if (reportSemester) {
                setDetailReportSemester(reportSemester);
            } else if (data.reportSemester) {
                setDetailReportSemester(String(data.reportSemester));
            }
        } catch (err) {
            console.error('Error fetching student detail:', err);
        }
        if (!silent) setLoadingDetail(false);
    };

    // Clear date filter
    const clearDateFilter = () => {
        setStartDate('');
        setEndDate('');
    };

    // Close popup and reset states
    const closePopup = () => {
        setSelectedStudent(null);
        setSelectedStudentId(null);
        setDetailReportSemester('');
    };

    // Toggle a subject in the page-level selection
    const toggleSubjectSelection = (subjectId: string) => {
        setPageSelectedSubjectIds(prev => {
            const next = new Set(prev);
            if (next.has(subjectId)) {
                next.delete(subjectId);
            } else {
                next.add(subjectId);
            }
            return next;
        });
    };

    // Select all / deselect all subjects at page level
    const toggleAllSubjects = () => {
        if (pageSelectedSubjectIds.size === availableSubjects.length) {
            setPageSelectedSubjectIds(new Set());
        } else {
            setPageSelectedSubjectIds(new Set(availableSubjects.map(s => s.id)));
        }
    };

    // Get filtered subjects based on page-level selection
    const getFilteredSubjects = () => {
        if (!selectedStudent) return [];
        if (pageSelectedSubjectIds.size === 0 || pageSelectedSubjectIds.size === availableSubjects.length) return selectedStudent.subjects;
        return selectedStudent.subjects.filter(s => pageSelectedSubjectIds.has(s.id));
    };

    // Recalculate summary based on page-level selected subjects
    const getFilteredSummary = () => {
        if (!selectedStudent) return { totalClasses: 0, attended: 0, attendancePercentage: 0 };
        const filtered = getFilteredSubjects();
        const totalClasses = filtered.reduce((sum, s) => sum + s.totalClasses, 0);
        const attended = filtered.reduce((sum, s) => sum + s.attended, 0);
        const attendancePercentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;
        return { totalClasses, attended, attendancePercentage };
    };

    // Download Report Card as PDF
    const downloadReportCard = () => {
        if (!selectedStudent || !user) return;

        const student = selectedStudent.student;
        const subjects = getFilteredSubjects();
        const summary = getFilteredSummary();
        const dateRange = selectedStudent.dateRange;
        const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';

        // Determine if subject filter is applied
        const allSubjectsSelected = pageSelectedSubjectIds.size === 0 || pageSelectedSubjectIds.size === availableSubjects.length;
        const subjectFilterText = allSubjectsSelected
            ? 'All Subjects'
            : subjects.map(s => s.name).join(', ');

        // Determine date range text
        const dateFilterText = dateRange
            ? `${new Date(dateRange.startDate).toLocaleDateString()} – ${new Date(dateRange.endDate).toLocaleDateString()}`
            : (startDate && endDate)
                ? `${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`
                : (startDate)
                    ? `From ${new Date(startDate).toLocaleDateString()}`
                    : (endDate)
                        ? `Until ${new Date(endDate).toLocaleDateString()}`
                        : 'All Time';

        const getStatus = (pct: number) => {
            if (pct >= 75) return { text: 'GOOD STANDING', color: '#16a34a' };
            if (pct >= 60) return { text: 'WARNING', color: '#ca8a04' };
            return { text: 'CRITICAL', color: '#dc2626' };
        };
        const status = getStatus(summary.attendancePercentage);

        const reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Report Card - ${student.name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
        
        :root {
            --primary: #1e3a8a;
            --accent: #b45309;
            --light: #f8fafc;
            --border: #e2e8f0;
            --text-main: #1e293b;
            --text-sub: #64748b;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', sans-serif; 
            background: #fff; 
            color: var(--text-main); 
            padding: 20px;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
        }

        @page { size: A4; margin: 0; }
        @media print { body { padding: 15mm; } }

        .container { 
            max-width: 100%; 
            margin: 0 auto; 
            border: 1px solid var(--border); 
            min-height: 900px; 
            position: relative; 
            background: white;
            box-shadow: none;
        }

        .top-bar {
            height: 6px;
            background: linear-gradient(90deg, var(--primary) 0%, var(--primary) 85%, var(--accent) 85%, var(--accent) 100%);
            width: 100%;
        }
        
        .content-padding { padding: 30px; }

        .header { 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            border-bottom: 2px solid var(--border); 
            padding-bottom: 20px; 
            margin-bottom: 25px; 
            position: relative;
        }

        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 60px; width: auto; object-fit: contain; }
        
        .college-info h1 { 
            font-family: 'Playfair Display', serif; 
            font-size: 20px; 
            color: var(--primary); 
            text-transform: uppercase; 
            margin-bottom: 2px; 
            letter-spacing: 0.5px;
        }
        
        .college-info p { 
            font-size: 10px; 
            color: var(--text-sub); 
            margin-bottom: 1px; 
            font-weight: 500; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-container {
            position: absolute;
            top: -30px;
            right: 0;
        }
        .ribbon {
            background: var(--accent);
            color: white;
            padding: 8px 16px; 
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
        }
        
        .watermark { 
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            width: 300px; 
            opacity: 0.04; 
            pointer-events: none; 
            z-index: 0; 
            filter: grayscale(100%);
        }
        
        .info-card { 
            background: #eff6ff;
            border-left: 4px solid var(--primary);
            padding: 16px; 
            border-radius: 4px;
            margin-bottom: 20px; 
            position: relative; 
            z-index: 1; 
            display: flex;
            justify-content: space-between;
        }

        .student-name {
            font-family: 'Playfair Display', serif;
            font-size: 18px; 
            color: var(--primary);
            margin-bottom: 2px;
        }
        
        .student-roll {
            color: var(--text-sub);
            font-size: 11px;
            font-weight: 500;
        }

        .meta-values {
            text-align: right;
            font-size: 11px; 
            color: var(--text-sub);
        }
        .meta-values strong { color: var(--text-main); font-weight: 600; margin-right: 4px; }
        .meta-row { margin-bottom: 2px; }

        /* Filters Applied Banner */
        .filters-banner {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 4px;
            padding: 10px 16px;
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
        }
        .filter-item {
            font-size: 10px;
            color: var(--text-sub);
        }
        .filter-item strong {
            color: #0369a1;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-right: 6px;
        }

        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 12px; 
            margin-bottom: 25px; 
            position: relative; 
            z-index: 1; 
        }
        
        .stat-item { 
            border: 1px solid var(--border); 
            padding: 10px; 
            text-align: center; 
            border-radius: 4px;
        }
        
        .stat-val { 
            font-family: 'Playfair Display', serif;
            font-size: 22px; 
            color: var(--primary); 
            font-weight: 700;
            line-height: 1.2;
        }
        
        .stat-lbl { 
            font-size: 9px; 
            text-transform: uppercase; 
            color: var(--accent); 
            font-weight: 700; 
            letter-spacing: 0.5px;
            margin-top: 4px;
        }
        
        .section-header { 
            display: flex; 
            align-items: center; 
            margin-bottom: 12px; 
            color: var(--primary);
            font-weight: 700;
            font-size: 11px; 
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 6px;
        }
        
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 25px; 
            font-size: 11px; 
            position: relative; 
            z-index: 1; 
        }
        
        th { 
            text-align: left; 
            padding: 8px 10px; 
            background: var(--primary); 
            color: white; 
            font-weight: 600; 
            text-transform: uppercase; 
            font-size: 10px; 
            letter-spacing: 0.5px; 
        }
        
        td { 
            padding: 8px 10px; 
            border-bottom: 1px solid var(--border); 
            color: var(--text-main); 
        }
        
        tr:nth-child(even) { background-color: #f8fafc; }
        
        .badge-status {
            display: inline-block;
            padding: 2px 8px; 
            border-radius: 50px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .bg-green { background: #dcfce7; color: #166534; }
        .bg-amber { background: #fef3c7; color: #b45309; }
        .bg-red { background: #fee2e2; color: #991b1b; }

        .conclusion {
            background: #fff;
            border: 1px solid var(--border);
            border-top: 3px solid var(--accent);
            padding: 15px; 
            border-radius: 4px;
            margin-top: auto;
        }
        .conclusion h3 { font-size: 11px; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; }
        .conclusion p { font-size: 11px; line-height: 1.5; color: var(--text-sub); }

        .footer { 
            margin-top: 25px; 
            padding-top: 15px; 
            border-top: 1px solid var(--border); 
            display: flex; 
            justify-content: space-between; 
            font-size: 9px; 
            color: var(--text-sub);
            text-transform: uppercase;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="top-bar"></div>
        <div class="content-padding">
            <img src="${logoUrl}" class="watermark" />
            
            <div class="badge-container">
                <div class="ribbon">Student Report</div>
            </div>

            <header class="header">
                <div class="logo-section">
                    <img src="${logoUrl}" class="logo-img" alt="YSM Logo">
                    <div class="college-info">
                        <h1>Yogoda Satsanga Mahavidyalaya</h1>
                        <p>Established 1967 | NAAC Accredited Grade 'B'</p>
                        <p>Jagannathpur, Dhurwa, Ranchi-834004</p>
                    </div>
                </div>
            </header>

            <div class="info-card">
                <div>
                    <h2 class="student-name">${student.name}</h2>
                    <div class="student-roll">Student ID: ${student.studentId || '-'} | Roll No: ${student.rollNumber}</div>
                </div>
                <div class="meta-values">
                    <div class="meta-row"><strong>Department:</strong> ${student.department}</div>
                    <div class="meta-row"><strong>Semester:</strong> ${student.semester}</div>
                    <div class="meta-row"><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
                </div>
            </div>

            <div class="filters-banner">
                <div class="filter-item"><strong>Period:</strong> ${dateFilterText}</div>
                <div class="filter-item"><strong>Subjects:</strong> ${subjectFilterText}</div>
            </div>

            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-val">${summary.totalClasses}</div>
                    <div class="stat-lbl">Total Classes</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" style="color: #059669">${summary.attended}</div>
                    <div class="stat-lbl">Attended</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" style="color: ${status.color}">${summary.attendancePercentage}%</div>
                    <div class="stat-lbl">Attendance Rate</div>
                </div>
            </div>

            <div class="section-title">Subject-wise Breakdown</div>
            <table>
                <thead>
                    <tr>
                        <th style="border-radius: 4px 0 0 0;">Subject</th>
                        <th>Code</th>
                        <th class="cell-center">Total</th>
                        <th class="cell-center">Attended</th>
                        <th style="border-radius: 0 4px 0 0; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${subjects.map(sub => `
                        <tr>
                            <td style="font-weight: 600;">${sub.name}</td>
                            <td style="color: var(--text-sub); font-size: 11px;">${sub.paperCode || sub.code}</td>
                            <td class="cell-center">${sub.totalClasses}</td>
                            <td class="cell-center">${sub.attended}</td>
                            <td class="cell-center">
                                <span class="badge-status ${sub.attendance >= 75 ? 'bg-green' : sub.attendance >= 60 ? 'bg-amber' : 'bg-red'}">
                                    ${sub.attendance >= 75 ? 'Good' : sub.attendance >= 60 ? 'Avg' : 'Low'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="conclusion">
                <h3>${status.text}</h3>
                <p>
                    ${summary.attendancePercentage >= 75
                ? `Student maintains good attendance record. Keep up the consistent engagement in classes.`
                : summary.attendancePercentage >= 60
                    ? `Attendance is within acceptable limits but implies scope for improvement. Regularity is advised.`
                    : `Critical attendance shortage detected. Immediate improvement is required to meet college standards.`}
                </p>
            </div>

            <footer class="footer">
                <div>Report Generated by: ${user.firstName} ${user.lastName}</div>
                <div>Authorized Signature: _______________________</div>
            </footer>
        </div>
    </div>
    
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 500);
        }
    </script>
</body>
</html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(reportHTML);
            printWindow.document.close();
        }
    };

    const filteredStudents = students.filter(student => {
        const cleanSearchTerm = searchTerm.toLowerCase().replace(/\s+/g, '');
        const matchesSearch = student.name.toLowerCase().replace(/\s+/g, '').includes(cleanSearchTerm) ||
            (student.rollNumber && String(student.rollNumber).toLowerCase().replace(/\s+/g, '').includes(cleanSearchTerm));

        if (!matchesSearch) return false;



        if (statusParam === 'critical') {
            return student.percentage < 60;
        }
        if (statusParam === 'warning') {
            return student.percentage >= 60 && student.percentage < 75;
        }

        return true;
    });

    // Sorting logic
    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'name' || field === 'rollNumber' ? 'asc' : 'desc');
        }
        setCurrentPage(1);
    };

    const sortedStudents = [...filteredStudents].sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
        return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    // Pagination logic
    const totalPages = Math.ceil(sortedStudents.length / perPage);
    const paginatedStudents = sortedStudents.slice((currentPage - 1) * perPage, currentPage * perPage);

    const SortIcon = ({ field }: { field: typeof sortField }) => {
        if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
        return sortOrder === 'asc'
            ? <ArrowUpRight className="w-3 h-3 text-purple-600" />
            : <ArrowDownRight className="w-3 h-3 text-purple-600" />;
    };

    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 85) return 'bg-emerald-500';
        if (percentage >= 75) return 'bg-emerald-400';
        if (percentage >= 60) return 'bg-amber-500';
        if (percentage >= 40) return 'bg-amber-600';
        return 'bg-red-500';
    };

    const getAttendanceBadgeColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-100 text-emerald-800';
        if (percentage >= 60) return 'bg-amber-100 text-amber-800';
        return 'bg-red-100 text-red-800';
    };

    const getStatusText = (percentage: number) => {
        if (percentage >= 75) return 'Good Standing';
        if (percentage >= 60) return 'Warning';
        return 'Critical';
    };

    const exportReport = (format: 'csv' | 'excel' | 'pdf') => {
        const allSubjectsSelected = pageSelectedSubjectIds.size === 0 || pageSelectedSubjectIds.size === availableSubjects.length;
        const subjectFilterText = allSubjectsSelected
            ? 'All Subjects'
            : availableSubjects.filter(s => pageSelectedSubjectIds.has(s.id)).map(s => s.code + ' - ' + s.name).join(', ');

        const headers = ['Student ID', 'Roll Number', 'Name', 'Total Classes', 'Attended', 'Percentage', 'Status'];
        const rows = filteredStudents.map(s => {
            const status = s.percentage >= 75 ? 'Good Standing' : s.percentage >= 60 ? 'Warning' : 'Critical';
            return [
                s.studentId || '-',
                s.rollNumber,
                s.name,
                s.totalClasses.toString(),
                s.attended.toString(),
                `${Math.round(s.percentage)}%`,
                status
            ];
        });

        const filename = `student_attendance_report_${new Date().toISOString().split('T')[0]}`;
        const deptName = selectedDepartmentId ? departments.find(d => d.id === selectedDepartmentId)?.name || 'All' : 'All';

        const metadataRows = [
            ['Generated on:', new Date().toLocaleDateString()],
            ['Department:', deptName],
            ['Semester:', selectedSemester || 'All'],
            ['Subjects:', subjectFilterText],
            [] // Empty row spacer
        ];

        if (format === 'csv') {
            const csvContent = [
                ...metadataRows.map(row => row.map(cell => `"${cell || ''}"`).join(',')),
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (format === 'excel') {
            const worksheet = XLSX.utils.aoa_to_sheet([...metadataRows, headers, ...rows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Student Report");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
            const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';
            // Simple table print for export
            const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Student Attendance Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', Arial, sans-serif; padding: 15px; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 15px; }
        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 50px; width: auto; object-fit: contain; }
        .college-info h1 { font-family: 'Playfair Display', serif; font-size: 16px; color: #1e3a8a; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px; }
        .college-info p { font-size: 9px; color: #64748b; margin-bottom: 1px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
        .report-title-box { text-align: right; }
        .report-title-box h2 { color: #1e3a8a; font-size: 14px; margin: 0 0 4px 0; }
        .report-title-box p { color: #6b7280; font-size: 10px; margin: 0; }
        .meta { color: #666; margin-bottom: 15px; font-size: 10px; line-height: 1.4; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
        th { background-color: #4f46e5; color: white; padding: 6px 4px; text-align: left; font-weight: 600; }
        td { padding: 4px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background-color: #f8f9fa; }
        .good { color: #047857; background-color: #d1fae5; }
        .warning { color: #b45309; background-color: #fef3c7; }
        .critical { color: #b91c1c; background-color: #fee2e2; }
        .status-badge { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; display: inline-block; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-section">
            <img src="${logoUrl}" class="logo-img" alt="YSM Logo">
            <div class="college-info">
                <h1>Yogoda Satsanga Mahavidyalaya</h1>
                <p>Established 1967 | NAAC Accredited Grade 'B'</p>
                <p>Jagannathpur, Dhurwa, Ranchi-834004</p>
            </div>
        </div>
        <div class="report-title-box">
            <h2>STUDENT REPORT</h2>
            <p>Attendance Overview</p>
        </div>
    </div>
    <p class="meta"><strong>Filters Applied:</strong> Generated on: ${new Date().toLocaleDateString()} | Total Students: ${filteredStudents.length}${selectedSemester ? (() => { const now = new Date(); const acYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; const admYear = acYear - (parseInt(selectedSemester) - 1); const dept = departments.find(d => d.id === selectedDepartmentId); const duration = dept?.dept_type === 'vocational' ? 3 : dept?.dept_type === 'pg' ? 2 : 4; const gradYear = admYear + duration; return ` | Semester: ${selectedSemester} | Batch: ${admYear}-${String(gradYear).slice(2)}`; })() : ''}${selectedDepartmentId ? ` | Department: ${departments.find(d => d.id === selectedDepartmentId)?.name || ''}` : ''}<br/><strong>Subjects:</strong> ${subjectFilterText}</p>
    <table>
        <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${rows.map(row => {
                const status = row[6];
                const statusClass = status === 'Good Standing' ? 'good' : status === 'Warning' ? 'warning' : 'critical';
                return `<tr>${row.map((cell, i) => i === 6 ? `<td><span class="status-badge ${statusClass}">${cell}</span></td>` : `<td>${cell}</td>`).join('')}</tr>`;
            }).join('')}
        </tbody>
    </table>
</body>
</html>`;
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(printContent);
                printWindow.document.close();
                printWindow.onload = () => { printWindow.print(); };
            }
        }
    };

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

            <main className="flex-1 pt-20 pb-8 px-4 max-w-7xl mx-auto w-full">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">


                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-purple-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Student Reports <span className="inline-block animate-bounce">🎓</span>
                            </h1>
                            <p className="text-purple-100 text-sm max-w-xl">
                                View individual attendance records, track performance, and <span className="font-semibold text-white">identify at-risk students</span>.
                            </p>
                        </div>

                        {/* Export Buttons in Hero */}
                        <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/20 self-start sm:self-auto">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('pdf')}
                            >
                                <FileText className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">PDF</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('excel')}
                            >
                                <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Excel</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('csv')}
                            >
                                <FileDown className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">CSV</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Overlapping Advanced Filters Section */}
                <div className="relative z-20 mb-8">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-purple-500" />
                            <h3 className="text-sm font-bold text-gray-700">Search & Filters</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
                            {/* Search */}
                            <div className="w-full col-span-2 lg:col-span-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Search Student</label>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        placeholder="Name or Roll No."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-purple-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            {/* Date Filter */}
                            <div className="w-full col-span-2 lg:col-span-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Date Range</label>
                                <div className="flex items-center justify-between w-full px-3 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-purple-300 rounded-xl focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-all shadow-sm">
                                    <div className="flex items-center flex-1">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            placeholder="dd/mm/yyyy"
                                            className="bg-transparent border-none p-0 text-sm outline-none w-full text-gray-700"
                                            title="Start Date"
                                        />
                                    </div>
                                    <div className="h-4 w-px bg-gray-300 mx-2 shrink-0"></div>
                                    <div className="flex items-center flex-1">
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            placeholder="dd/mm/yyyy"
                                            className="bg-transparent border-none p-0 text-sm outline-none w-full text-gray-700"
                                            title="End Date"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Department Filter */}
                            {(user?.role === 'super_admin' || departments.length > 1) && (
                                <div className="w-full">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Department</label>
                                    <div className="relative">
                                        <select
                                            value={selectedDepartmentId}
                                            onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-purple-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map((dept) => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                    </div>
                                </div>
                            )}



                            {/* Semester Filter */}
                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Semester</label>
                                <div className="relative">
                                    <select
                                        value={selectedSemester}
                                        onChange={(e) => {
                                            setSelectedSemester(e.target.value);
                                            setSelectedHistorySem('');
                                        }}
                                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-purple-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
                                        style={selectedHistorySem ? { opacity: 0.6 } : undefined}
                                    >
                                        <option value="">All Semesters</option>
                                        {(() => {
                                            const effectiveDeptType = selectedDepartmentId
                                                ? getDeptType(departments.find(d => d.id === selectedDepartmentId))
                                                : (user?.role === 'super_admin' ? 'regular' : (departments.length > 0 ? getDeptType(departments[0]) : 'regular'));
                                            const sems = deptCurrentSemesters.length > 0 ? deptCurrentSemesters : getActiveSemesters(effectiveDeptType);
                                            return sems.map((sem) => {
                                                const label = getBatchLabel(sem, effectiveDeptType);
                                                return (
                                                    <option key={sem} value={sem}>Sem {sem}{label ? ` (${label})` : ''}</option>
                                                );
                                            });
                                        })()}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                </div>

                                {/* History button + pills — only when a current semester is selected and history exists for that batch */}
                                {(() => {
                                    const previousSems = deptHistoricalSemesters.filter(s => s < parseInt(selectedSemester || '0'));
                                    if (!selectedSemester || previousSems.length === 0) return null;
                                    return (
                                        <div className="mt-2">
                                            {!selectedHistorySem ? (
                                                <button
                                                    onClick={() => setSelectedHistorySem(String(previousSems[previousSems.length - 1]))}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    View Previous Records
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {previousSems.map(sem => (
                                                        <button
                                                            key={sem}
                                                            onClick={() => setSelectedHistorySem(String(sem))}
                                                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                                selectedHistorySem === String(sem)
                                                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                            }`}
                                                        >
                                                            Sem {sem}
                                                        </button>
                                                    ))}
                                                    <button
                                                        onClick={() => setSelectedHistorySem('')}
                                                        className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500 transition-colors"
                                                        title="Exit history view"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Subject Filter Toggle */}
                            {availableSubjects.length > 0 && (
                                <div className="w-full">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Subjects</label>
                                    <button
                                        onClick={() => setShowSubjectFilter(!showSubjectFilter)}
                                        className={`w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border rounded-xl text-sm text-left font-medium shadow-sm transition-all cursor-pointer relative ${pageSelectedSubjectIds.size < availableSubjects.length && pageSelectedSubjectIds.size > 0
                                            ? 'border-purple-300 text-purple-700 bg-purple-50/30'
                                            : 'border-gray-200 hover:border-purple-300 text-gray-700'
                                            }`}
                                    >
                                        {pageSelectedSubjectIds.size === 0 || pageSelectedSubjectIds.size === availableSubjects.length
                                            ? `All Subjects (${availableSubjects.length})`
                                            : `${pageSelectedSubjectIds.size} of ${availableSubjects.length} Selected`}
                                        <ChevronDown className={`w-4 h-4 text-gray-400 absolute right-3 top-3 transition-transform ${showSubjectFilter ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                            )}

                            {/* Reset Button */}
                            <div className="w-full lg:w-auto">
                                <Button
                                    variant="outline"
                                    className="w-full lg:w-auto mt-6 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 border-gray-200 hover:border-red-200 rounded-xl transition-colors h-[42px]"
                                    onClick={() => {
                                        setStartDate('');
                                        setEndDate('');
                                        setSelectedSemester('');
                                        setSelectedHistorySem('');
                                        setSelectedDepartmentId('');
                                        setSearchTerm('');
                                        setPageSelectedSubjectIds(new Set(availableSubjects.map(s => s.id)));
                                        setShowSubjectFilter(false);
                                        router.push('/reports/students');
                                    }}
                                >
                                    Reset Filters
                                </Button>
                            </div>
                        </div>

                        {/* Subject Multi-Select Chips (Expandable) */}
                        {showSubjectFilter && availableSubjects.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Select Subjects</span>
                                    <button
                                        onClick={toggleAllSubjects}
                                        className="text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
                                    >
                                        {pageSelectedSubjectIds.size === availableSubjects.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {availableSubjects.map((sub) => {
                                        const isSelected = pageSelectedSubjectIds.has(sub.id);
                                        return (
                                            <button
                                                key={sub.id}
                                                onClick={() => toggleSubjectSelection(sub.id)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${isSelected
                                                    ? 'bg-purple-100 border-purple-300 text-purple-800 shadow-sm'
                                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                    }`}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected
                                                    ? 'bg-purple-600 border-purple-600'
                                                    : 'border-gray-300 bg-white'
                                                    }`}>
                                                    {isSelected && (
                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span>{sub.code} - {sub.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {pageSelectedSubjectIds.size > 0 && pageSelectedSubjectIds.size < availableSubjects.length && (
                                    <p className="text-xs text-purple-600 mt-2 font-medium">
                                        {pageSelectedSubjectIds.size} of {availableSubjects.length} subjects selected — student reports will only show these subjects
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full">
                    {/* Report Data */}
                    <div className="lg:col-span-3">
                        <div className="shadow-sm border border-gray-100 bg-white overflow-hidden rounded-2xl">
                            {/* Historical data banner */}
                            {isHistoricalView && selectedHistorySem && (
                                <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-xs font-semibold text-amber-800">
                                        Viewing historical records — Sem {selectedHistorySem} (students have since moved to a newer semester)
                                    </span>
                                </div>
                            )}
                            <div className="p-0">
                                {loading ? (
                                    <div className="p-12 text-center">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                        <p className="text-gray-500">Loading student records...</p>
                                    </div>
                                ) : filteredStudents.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No students found</h3>
                                        <p className="text-gray-500 mt-1">Try adjusting your filters or search terms.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full table-auto">
                                                <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
                                                    <tr>
                                                        {[
                                                            { key: 'name' as const, label: 'Student', align: 'text-left' },
                                                            { key: 'totalClasses' as const, label: 'Classes', align: 'text-center' },
                                                            { key: 'attended' as const, label: 'Attended', align: 'text-center' },
                                                            { key: 'percentage' as const, label: 'Attendance Rate', align: 'text-left' },
                                                        ].map(col => (
                                                            <th
                                                                key={col.key}
                                                                onClick={() => handleSort(col.key)}
                                                                className={`px-6 py-4 ${col.align} text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-600 transition-colors select-none`}
                                                            >
                                                                <div className={`flex items-center gap-1 ${col.align === 'text-center' ? 'justify-center' : ''}`}>
                                                                    {col.label}
                                                                    <SortIcon field={col.key} />
                                                                </div>
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {paginatedStudents.map((student) => (
                                                        <tr key={student.id} className="hover:bg-blue-50/50 transition-colors group">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    <div className="shrink-0 h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                        {student.name.charAt(0)}
                                                                    </div>
                                                                    <div className="ml-4">
                                                                        <div className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors cursor-pointer" onClick={() => fetchStudentDetail(student.id, startDate, endDate, false, selectedHistorySem || undefined)}>
                                                                            {student.name}
                                                                        </div>
                                                                        <div className="flex gap-2 mt-0.5">
                                                                            <div className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block">
                                                                                ID: {student.studentId || '-'}
                                                                            </div>
                                                                            <div className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block">
                                                                                Roll: {student.rollNumber}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                                                                {student.totalClasses}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                                                                {student.attended}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${getAttendanceColor(student.percentage)}`}
                                                                            style={{ width: `${Math.min(student.percentage, 100)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${getAttendanceBadgeColor(student.percentage)}`}>
                                                                        {student.percentage}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => fetchStudentDetail(student.id, startDate, endDate, false, selectedHistorySem || undefined)}
                                                                    className="text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile View */}
                                        <div className="md:hidden p-4 space-y-4">
                                            {paginatedStudents.map((student) => (
                                                <div
                                                    key={student.id}
                                                    onClick={() => fetchStudentDetail(student.id, startDate, endDate, false, selectedHistorySem || undefined)}
                                                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:scale-[0.99] transition-transform"
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                {student.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-semibold text-gray-900 text-sm">{student.name}</div>
                                                                <div className="flex gap-2 mt-0.5">
                                                                    <div className="text-xs text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded inline-block">
                                                                        ID: {student.studentId || '-'}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded inline-block">
                                                                        Roll: {student.rollNumber}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded ${getAttendanceBadgeColor(student.percentage)}`}>
                                                            {student.percentage}%
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                                        <span className="flex items-center gap-1">
                                                            <BookOpen className="w-3 h-3" /> {student.totalClasses} Classes
                                                        </span>
                                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                                            <CheckCircle className="w-3 h-3" /> {student.attended} Present
                                                        </span>
                                                    </div>

                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${getAttendanceColor(student.percentage)}`}
                                                            style={{ width: `${Math.min(student.percentage, 100)}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Pagination Controls */}
                                {sortedStudents.length > 0 && (
                                    <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50">
                                        <div className="flex items-center gap-3 text-sm text-gray-500">
                                            <span>Showing {((currentPage - 1) * perPage) + 1}–{Math.min(currentPage * perPage, sortedStudents.length)} of {sortedStudents.length}</span>
                                            <select
                                                value={perPage}
                                                onChange={(e) => { setPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                                                className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                                            >
                                                <option value={25}>25 / page</option>
                                                <option value={50}>50 / page</option>
                                                <option value={100}>100 / page</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                                disabled={currentPage === 1}
                                                className="h-8 w-8 p-0"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                                let page: number;
                                                if (totalPages <= 5) {
                                                    page = i + 1;
                                                } else if (currentPage <= 3) {
                                                    page = i + 1;
                                                } else if (currentPage >= totalPages - 2) {
                                                    page = totalPages - 4 + i;
                                                } else {
                                                    page = currentPage - 2 + i;
                                                }
                                                return (
                                                    <Button
                                                        key={page}
                                                        variant={currentPage === page ? 'default' : 'ghost'}
                                                        size="sm"
                                                        onClick={() => setCurrentPage(page)}
                                                        className={`h-8 w-8 p-0 text-xs ${currentPage === page ? 'bg-purple-600 text-white' : ''}`}
                                                    >
                                                        {page}
                                                    </Button>
                                                );
                                            })}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                                disabled={currentPage === totalPages}
                                                className="h-8 w-8 p-0"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Detail Popup Modal */}
                {/* Note: In a real app, use a proper Dialog component. Using fixed overlay for valid single-file requirement. */}
                {(selectedStudent || loadingDetail) && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <User className="w-5 h-5 text-purple-600" />
                                    Student Details
                                </h3>
                                <Button variant="ghost" size="icon" onClick={closePopup} className="h-8 w-8 rounded-full">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                                {loadingDetail ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mb-4"></div>
                                        <p className="text-sm text-gray-500">Loading details...</p>
                                    </div>
                                ) : selectedStudent && (
                                    <div className="space-y-8">
                                        {/* Profile Card */}
                                        <div className="bg-linear-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-2xl font-bold text-purple-600 border border-purple-100">
                                                        {selectedStudent.student.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xl font-bold text-gray-900">{selectedStudent.student.name}</h2>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs font-mono rounded border border-gray-200">
                                                                ID: {selectedStudent.student.studentId || '-'}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs font-mono rounded border border-gray-200">
                                                                Roll: {selectedStudent.student.rollNumber}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200">
                                                                {selectedStudent.student.department}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200">
                                                                Sem {selectedStudent.student.semester}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={downloadReportCard} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                                        <FileText className="w-4 h-4 mr-2" /> Download Report
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Semester History Selector */}
                                            {selectedStudent.availableSemesters && selectedStudent.availableSemesters.length > 1 && (
                                                <div className="mt-4 pt-4 border-t border-purple-100">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">View Semester:</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {selectedStudent.availableSemesters.map((sem) => {
                                                                const isActive = String(sem) === detailReportSemester;
                                                                const isCurrent = sem === selectedStudent.student.semester;
                                                                return (
                                                                    <button
                                                                        key={sem}
                                                                        onClick={() => {
                                                                            setDetailReportSemester(String(sem));
                                                                            if (selectedStudentId) {
                                                                                fetchStudentDetail(selectedStudentId, startDate, endDate, false, String(sem));
                                                                            }
                                                                        }}
                                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${
                                                                            isActive
                                                                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                                                : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-700'
                                                                        }`}
                                                                    >
                                                                        Sem {sem}
                                                                        {isCurrent && (
                                                                            <span className={`ml-1 text-[10px] ${isActive ? 'text-purple-200' : 'text-gray-400'}`}>
                                                                                (current)
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    {detailReportSemester && Number(detailReportSemester) !== selectedStudent.student.semester && (
                                                        <p className="text-xs text-amber-600 mt-2 font-medium flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            Viewing historical data for Semester {detailReportSemester} (Student is currently in Sem {selectedStudent.student.semester})
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Subject Filter Info */}
                                            {pageSelectedSubjectIds.size > 0 && pageSelectedSubjectIds.size < availableSubjects.length && getFilteredSubjects().length < selectedStudent.subjects.length && (
                                                <div className="mt-3 pt-3 border-t border-purple-100">
                                                    <p className="text-xs text-purple-600 font-medium">
                                                        📋 Showing {getFilteredSubjects().length} of {selectedStudent.subjects.length} subjects (filtered from page)
                                                    </p>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-6">
                                                {(() => {
                                                    const filteredSummary = getFilteredSummary();
                                                    return (
                                                        <>
                                                            <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 text-center">
                                                                <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Total Classes</div>
                                                                <div className="text-2xl font-bold text-gray-900">{filteredSummary.totalClasses}</div>
                                                            </div>
                                                            <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 text-center">
                                                                <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Attended</div>
                                                                <div className="text-2xl font-bold text-emerald-600">{filteredSummary.attended}</div>
                                                            </div>
                                                            <div className={`bg-white p-4 rounded-xl shadow-sm border text-center ${filteredSummary.attendancePercentage >= 75 ? 'border-emerald-100' : 'border-amber-100'}`}>
                                                                <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Attendance</div>
                                                                <div className={`text-2xl font-bold ${filteredSummary.attendancePercentage >= 75 ? 'text-emerald-600' :
                                                                    filteredSummary.attendancePercentage >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                                                    {filteredSummary.attendancePercentage}%
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Subject Wise List */}
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                <BookOpen className="w-4 h-4 text-purple-600" />
                                                Subject Performance
                                            </h4>
                                            <div className="border rounded-xl overflow-hidden shadow-sm">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b">
                                                        <tr>
                                                            <th className="px-4 py-3">Subject</th>
                                                            <th className="px-4 py-3 text-center">Total</th>
                                                            <th className="px-4 py-3 text-center">Attended</th>
                                                            <th className="px-4 py-3 text-center">Percentage</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {getFilteredSubjects().map((sub) => (
                                                            <tr key={sub.id} className="bg-white hover:bg-gray-50/50">
                                                                <td className="px-4 py-3">
                                                                    <div className="font-medium text-gray-900">{sub.name}</div>
                                                                    <div className="text-xs text-gray-500 font-mono">{sub.paperCode || sub.code}</div>
                                                                </td>
                                                                <td className="px-4 py-3 text-center text-gray-600">{sub.totalClasses}</td>
                                                                <td className="px-4 py-3 text-center text-gray-600">{sub.attended}</td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${getAttendanceBadgeColor(sub.attendance)}`}>
                                                                        {sub.attendance}%
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Daily Breakdown */}
                                        {selectedStudent.dailyBreakdown && selectedStudent.dailyBreakdown.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <CalendarDays className="w-4 h-4 text-purple-600" />
                                                    Recent Attendance History
                                                </h4>
                                                <div className="border rounded-xl overflow-hidden shadow-sm max-h-60 overflow-y-auto custom-scrollbar">
                                                    <table className="w-full text-sm text-left relative">
                                                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b sticky top-0 z-10">
                                                            <tr>
                                                                <th className="px-4 py-3">Date</th>
                                                                <th className="px-4 py-3">Subject</th>
                                                                <th className="px-4 py-3">Lecture</th>
                                                                <th className="px-4 py-3 text-center">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {selectedStudent.dailyBreakdown.map((record, idx) => (
                                                                <tr key={idx} className="bg-white hover:bg-gray-50/50">
                                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                                        {new Date(record.date).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-gray-600">
                                                                        {record.subjectCode}
                                                                        <div className="text-xs text-gray-400">{record.subjectName}</div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-gray-600">Lecture {record.lectureNumber}</td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${record.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                                                            record.status === 'absent' ? 'bg-red-100 text-red-700' :
                                                                                'bg-amber-100 text-amber-700'
                                                                            }`}>
                                                                            {record.status}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Monthly Trend (Simplified Bar) */}
                                        {selectedStudent.monthlyTrend.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-purple-600" />
                                                    Monthly Trend
                                                </h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                                    {selectedStudent.monthlyTrend.map((trend) => (
                                                        <div key={trend.month} className="bg-white border rounded-lg p-3 text-center shadow-sm">
                                                            <div className="text-xs text-gray-500 mb-1">{trend.month}</div>
                                                            <div className={`text-lg font-bold ${trend.attendance >= 75 ? 'text-emerald-600' : 'text-red-500'
                                                                }`}>
                                                                {trend.attendance}%
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-1">
                                                                {trend.attended}/{trend.totalClasses}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}


                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default function StudentReportPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full"></div></div>}>
            <StudentReportContent />
        </Suspense>
    );
}
