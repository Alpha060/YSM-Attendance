'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

import { Search, X, Users, BookOpen, TrendingUp, Filter, ChevronRight, FileDown, ArrowLeft, ChevronDown, CheckCircle, AlertCircle, Eye, GraduationCap, FileText, FileSpreadsheet, ArrowUpRight, ArrowDownRight, CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { useActiveSemesters } from '@/hooks/useActiveSemesters';
import * as XLSX from 'xlsx';

interface User {
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
}

interface TeacherAttendance {
    id: string;
    name: string;
    email: string;
    department: string;
    subjects: string;
    totalSessions: number;
    workingDays: number;
    averageAttendance: number;
}

interface TeacherDetail {
    teacher: {
        id: string;
        name: string;
        email: string;
        department: string;
    };
    filters: {
        departments: { id: string; name: string; code: string; deptType?: string }[];
        semesters: number[];
    };
    summary: {
        totalSessions: number;
        workingDays: number;
        totalStudents: number;
        presentCount: number;
        absentCount: number;
        averageAttendance: number;
    };
    subjects: {
        id: string;
        name: string;
        code: string;
        paperCode?: string;
        semester: number;
        department: string;
        sessions: number;
        workingDays: number;
        students: number;
        attendance: number;
    }[];
    monthlyTrend: {
        month: string;
        sessions: number;
        attendance: number;
    }[];
    dailyBreakdown: {
        date: string;
        total: number;
        present: number;
        absent: number;
        topics: string;
        percentage: number;
    }[];
}

export default function TeacherReportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [teachers, setTeachers] = useState<TeacherAttendance[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const { getBatchLabel, getActiveSemesters } = useActiveSemesters();

    // Detail popup state
    const [selectedTeacher, setSelectedTeacher] = useState<TeacherDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    // Popup filters
    const [popupDeptFilter, setPopupDeptFilter] = useState('');
    const [popupSemesterFilter, setPopupSemesterFilter] = useState('');
    const [popupDateFrom, setPopupDateFrom] = useState('');
    const [popupDateTo, setPopupDateTo] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser({
            ...parsedUser,
            lastName: parsedUser.lastName || '',
            email: parsedUser.email || '',
            firstName: parsedUser.firstName || 'User'
        });

        if (parsedUser.role !== 'teacher') {
            fetchDepartments(token);
        }
    }, [router]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchTeacherReport(token);
        }
    }, [selectedDepartmentId, user]);

    // Re-fetch teacher detail when popup filters change
    useEffect(() => {
        if (selectedTeacherId) {
            fetchTeacherDetail(selectedTeacherId, popupDeptFilter, popupSemesterFilter, popupDateFrom, popupDateTo);
        }
    }, [popupDeptFilter, popupSemesterFilter, popupDateFrom, popupDateTo]);

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setDepartments(data.departments || []);
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    const fetchTeacherReport = async (token: string) => {
        setLoading(true);
        try {
            let url = '/api/reports/teachers';
            if (selectedDepartmentId) {
                url += `?departmentId=${selectedDepartmentId}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.teachers) {
                setTeachers(data.teachers);
            }
        } catch (err) {
            console.error('Error fetching teacher report:', err);
        }
        setLoading(false);
    };

    const fetchTeacherDetail = async (teacherId: string, deptId?: string, semester?: string, dateFrom?: string, dateTo?: string) => {
        setLoadingDetail(true);
        try {
            const token = localStorage.getItem('token');
            let url = `/api/reports/teachers/${teacherId}`;
            const params = new URLSearchParams();
            if (deptId) params.append('departmentId', deptId);
            if (semester) params.append('semester', semester);
            if (dateFrom) params.append('dateFrom', dateFrom);
            if (dateTo) params.append('dateTo', dateTo);
            if (params.toString()) url += '?' + params.toString();

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            setSelectedTeacher(data);
        } catch (err) {
            console.error('Error fetching teacher detail:', err);
        }
        setLoadingDetail(false);
    };

    const openTeacherDetail = (teacherId: string) => {
        setSelectedTeacherId(teacherId);
        setPopupDeptFilter('');
        setPopupSemesterFilter('');
        setPopupDateFrom('');
        setPopupDateTo('');
        fetchTeacherDetail(teacherId);
    };

    const closePopup = () => {
        setSelectedTeacher(null);
        setSelectedTeacherId(null);
        setPopupDeptFilter('');
        setPopupSemesterFilter('');
        setPopupDateFrom('');
        setPopupDateTo('');
    };

    // Download Teacher Report Card as PDF
    const downloadTeacherReportCard = () => {
        if (!selectedTeacher || !user) return;

        const teacher = selectedTeacher.teacher;
        const summary = selectedTeacher.summary;
        const subjects = selectedTeacher.subjects;
        const monthlyTrend = selectedTeacher.monthlyTrend;
        const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';

        const getStatus = (pct: number) => {
            if (pct >= 75) return { text: 'EXCELLENT PERFORMANCE', color: '#16a34a' };
            if (pct >= 60) return { text: 'GOOD PERFORMANCE', color: '#ca8a04' };
            return { text: 'NEEDS IMPROVEMENT', color: '#dc2626' };
        };
        const status = getStatus(summary.averageAttendance);

        const reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Teacher Report - ${teacher.name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
        
        :root {
            --primary: #1e3a8a; /* Royal Navy */
            --accent: #b45309;  /* Gold/Amber */
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
            padding: 20px; /* Reduced from 40px */
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
        }

        @page { size: A4; margin: 0; }
        @media print { body { padding: 15mm; } }

        .container { 
            max-width: 100%; 
            margin: 0 auto; 
            border: 1px solid var(--border); 
            min-height: 900px; /* Reduced min-height */
            position: relative; 
            background: white;
            box-shadow: none; /* Removed shadow for print */
        }

        /* Decorative Top Bar */
        .top-bar {
            height: 6px; /* Reduced height */
            background: linear-gradient(90deg, var(--primary) 0%, var(--primary) 85%, var(--accent) 85%, var(--accent) 100%);
            width: 100%;
        }
        
        .content-padding { padding: 30px; } /* Reduced from 40px */

        /* Header */
        .header { 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            border-bottom: 2px solid var(--border); 
            padding-bottom: 20px; /* Reduced from 30px */
            margin-bottom: 25px; /* Reduced from 30px */
            position: relative;
        }

        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 60px; width: auto; object-fit: contain; } /* Reduced height */
        
        .college-info h1 { 
            font-family: 'Playfair Display', serif; 
            font-size: 20px; /* Reduced from 24px */
            color: var(--primary); 
            text-transform: uppercase; 
            margin-bottom: 2px; 
            letter-spacing: 0.5px;
        }
        
        .college-info p { 
            font-size: 10px; /* Reduced from 11px */
            color: var(--text-sub); 
            margin-bottom: 1px; 
            font-weight: 500; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Ribbon Badge */
        .badge-container {
            position: absolute;
            top: -30px; /* Adjusted */
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
        
        /* Watermark */
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
        
        /* Teacher Details Card */
        .info-card { 
            background: #eff6ff;
            border-left: 4px solid var(--primary);
            padding: 16px; /* Reduced from 24px */
            border-radius: 4px;
            margin-bottom: 20px; /* Reduced from 30px */
            position: relative; 
            z-index: 1; 
            display: flex;
            justify-content: space-between;
        }

        .teacher-name {
            font-family: 'Playfair Display', serif;
            font-size: 18px; /* Reduced from 22px */
            color: var(--primary);
            margin-bottom: 2px;
        }
        
        .teacher-email {
            color: var(--text-sub);
            font-size: 11px;
            font-weight: 500;
        }

        .meta-values {
            text-align: right;
            font-size: 11px; /* Reduced from 12px */
            color: var(--text-sub);
        }
        .meta-values strong { color: var(--text-main); font-weight: 600; margin-right: 4px; }
        .meta-row { margin-bottom: 2px; }

        /* Stats Grid */
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(4, 1fr); 
            gap: 12px; /* Reduced gap */
            margin-bottom: 25px; /* Reduced from 35px */
            position: relative; 
            z-index: 1; 
        }
        
        .stat-item { 
            border: 1px solid var(--border); 
            padding: 10px; /* Reduced padding */
            text-align: center; 
            border-radius: 4px;
        }
        
        .stat-val { 
            font-family: 'Playfair Display', serif;
            font-size: 22px; /* Reduced from 28px */
            color: var(--primary); 
            font-weight: 700;
            line-height: 1.2;
        }
        
        .stat-lbl { 
            font-size: 9px; /* Reduced from 10px */
            text-transform: uppercase; 
            color: var(--accent); 
            font-weight: 700; 
            letter-spacing: 0.5px;
            margin-top: 4px;
        }
        
        /* Section Header */
        .section-header { 
            display: flex; 
            align-items: center; 
            margin-bottom: 12px; /* Reduced from 15px */
            color: var(--primary);
            font-weight: 700;
            font-size: 11px; /* Reduced from 13px */
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 6px;
        }
        
        /* Table */
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 25px; /* Reduced from 35px */
            font-size: 11px; /* Reduced from 13px */
            position: relative; 
            z-index: 1; 
        }
        
        th { 
            text-align: left; 
            padding: 8px 10px; /* Reduced padding */
            background: var(--primary); 
            color: white; 
            font-weight: 600; 
            text-transform: uppercase; 
            font-size: 10px; 
            letter-spacing: 0.5px; 
        }
        
        td { 
            padding: 8px 10px; /* Reduced padding */
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

        /* Monthly Trend */
        .month-grid { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
        .month-box { 
            border: 1px solid var(--border); 
            padding: 6px 10px; 
            border-radius: 4px; 
            text-align: center;
            min-width: 60px;
        }
        .month-name { font-size: 9px; color: var(--text-sub); text-transform: uppercase; margin-bottom: 2px; }
        .month-val { font-weight: 700; font-size: 11px; color: var(--primary); }

        /* Status Box */
        .conclusion {
            background: #fff;
            border: 1px solid var(--border);
            border-top: 3px solid var(--accent);
            padding: 15px; /* Reduced padding */
            border-radius: 4px;
            margin-top: auto;
        }
        .conclusion h3 { font-size: 11px; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; }
        .conclusion p { font-size: 11px; line-height: 1.5; color: var(--text-sub); }

        /* Footer */
        .footer { 
            margin-top: 25px; /* Reduced from 40px */
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
                <div class="ribbon">Faculty Report</div>
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
                    <h2 class="teacher-name">${teacher.name}</h2>
                    <div class="teacher-email">${teacher.email}</div>
                </div>
                <div class="meta-values">
                    <div class="meta-row"><strong>Department:</strong> ${popupDeptFilter ? selectedTeacher.filters.departments.find(d => d.id === popupDeptFilter)?.name : 'All Departments'}</div>
                    <div class="meta-row"><strong>Semester:</strong> ${popupSemesterFilter ? (() => { const dept = selectedTeacher.filters.departments.find(d => d.id === popupDeptFilter); const label = getBatchLabel(parseInt(popupSemesterFilter), dept?.deptType); return `Semester ${popupSemesterFilter}${label ? ` (${label})` : ''}`; })() : 'All Semesters'}</div>
                    ${subjects.length === 1 ? `<div class="meta-row"><strong>Subject:</strong> ${subjects[0].name} (${subjects[0].paperCode || subjects[0].code})</div>` : ''}
                    ${popupDateFrom || popupDateTo ? `<div class="meta-row"><strong>Period:</strong> ${popupDateFrom || 'Start'} to ${popupDateTo || 'Present'}</div>` : ''}
                    <div class="meta-row"><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-val">${summary.totalSessions}</div>
                    <div class="stat-lbl">No. of Lectures</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val">${summary.totalStudents}</div>
                    <div class="stat-lbl">Students</div>
                </div>
            </div>

            ${subjects.length > 1 ? `
            <div class="section-header">Subject Performance Analysis</div>
            <table>
                <thead>
                    <tr>
                        <th style="border-radius: 4px 0 0 0;">Subject</th>
                        <th>Semester & Batch</th>
                        <th>Code</th>
                        <th style="text-align: center;">No. of Lectures</th>
                        <th style="text-align: center;">Attendance</th>
                        <th style="border-radius: 0 4px 0 0; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${subjects.map(sub => {
            const firstSem = parseInt(sub.semester.toString().split(',')[0]) || 1;
            const deptInfo = selectedTeacher.filters.departments.find(d => d.name === sub.department);
            const batchLabel = getBatchLabel(firstSem, deptInfo?.deptType);

            return `
                        <tr>
                            <td>
                                <div style="font-weight: 600; font-size: 11px;">${sub.name} <span style="font-weight: 500; color: var(--text-sub);">(${sub.department})</span></div>
                            </td>
                            <td>
                                <div style="font-size: 11px; font-weight: 600;">Sem ${sub.semester}</div>
                                ${batchLabel ? `<div style="font-size: 10px; color: var(--text-sub); margin-top: 2px;">${batchLabel}</div>` : ''}
                            </td>
                            <td style="color: var(--text-sub); font-size: 11px;">${sub.paperCode || sub.code}</td>
                            <td style="text-align: center;">${sub.sessions}</td>
                            <td style="text-align: center; font-weight: 700; color: var(--primary);">${sub.attendance}%</td>
                            <td style="text-align: center;">
                                <span class="badge-status ${sub.attendance >= 75 ? 'bg-green' : sub.attendance >= 60 ? 'bg-amber' : 'bg-red'}">
                                    ${sub.attendance >= 75 ? 'Excellent' : sub.attendance >= 60 ? 'Average' : 'Low'}
                                </span>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
            ` : ''}

            ${selectedTeacher.dailyBreakdown && selectedTeacher.dailyBreakdown.length > 0 ? `
                <div class="section-header">Day-by-Day Breakdown</div>
                <table>
                    <thead>
                        <tr>
                            <th style="border-radius: 4px 0 0 0;">Date</th>
                            <th>Topic</th>
                            <th style="text-align: center;">Total</th>
                            <th style="text-align: center;">Present</th>
                            <th style="text-align: center;">Absent</th>
                            <th style="border-radius: 0 4px 0 0; text-align: center;">Attendance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${selectedTeacher.dailyBreakdown.map(d => `
                            <tr>
                                <td style="white-space: nowrap;">${new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                <td style="color: #4338ca; font-size: 11px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.topics || '-'}</td>
                                <td style="text-align: center;">${d.total}</td>
                                <td style="text-align: center; color: #166534;">${d.present}</td>
                                <td style="text-align: center; color: #991b1b;">${d.absent}</td>
                                <td style="text-align: center;">
                                    <span class="badge-status ${d.percentage >= 75 ? 'bg-green' : d.percentage >= 60 ? 'bg-amber' : 'bg-red'}">
                                        ${d.percentage}%
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}

             ${monthlyTrend && monthlyTrend.length > 0 ? `
                <div class="section-header">Monthly Trend</div>
                <div class="month-grid">
                    ${monthlyTrend.map(m => `
                        <div class="month-box">
                            <div class="month-name">${m.month}</div>
                            <div class="month-val">${m.attendance}%</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <div class="conclusion">
                <h3>${status.text}</h3>
                <p>
                    ${summary.averageAttendance >= 75
                ? `Dr. ${teacher.name} maintains excellent attendance records across their classes. The average attendance of ${summary.averageAttendance}% indicates strong student engagement.`
                : summary.averageAttendance >= 60
                    ? `Performance is within acceptable limits (${summary.averageAttendance}%). Focus on improving student attendance in lower-performing subjects is recommended.`
                    : `Average attendance of ${summary.averageAttendance}% falls below standards. A review of engagement strategies is advised.`}
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

    const filteredTeachers = teachers.filter(teacher =>
        teacher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.department.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sorting state
    const [sortField, setSortField] = useState<'name' | 'department' | 'totalSessions' | 'averageAttendance'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleListSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'name' || field === 'department' ? 'asc' : 'desc');
        }
    };

    const sortedTeachers = [...filteredTeachers].sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
        return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    const ListSortIcon = ({ field }: { field: typeof sortField }) => {
        if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
        return sortOrder === 'asc'
            ? <ArrowUpRight className="w-3 h-3 text-purple-600" />
            : <ArrowDownRight className="w-3 h-3 text-purple-600" />;
    };

    // Export functions
    const exportTeacherList = (format: 'csv' | 'excel') => {
        const headers = ['Name', 'Email', 'Department', 'Subjects', 'No. of Lectures', 'Avg. Attendance %'];
        const rows = sortedTeachers.map(t => [
            t.name, t.email, t.department, t.subjects, t.totalSessions.toString(), `${t.averageAttendance}%`
        ]);

        if (format === 'csv') {
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'teacher_attendance_report.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Teachers');
            XLSX.writeFile(workbook, 'teacher_attendance_report.xlsx');
        }
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
                                <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Teacher Reports <span className="inline-block animate-bounce">👨‍🏫</span>
                            </h1>
                            <p className="text-indigo-100 text-sm max-w-xl">
                                Analyze teacher attendance, track variations, and view <span className="font-semibold text-white">individual performance details</span>.
                            </p>
                        </div>

                        {/* Export Buttons in Hero */}
                        <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/20 self-start sm:self-auto">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportTeacherList('excel')}
                            >
                                <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Excel</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportTeacherList('csv')}
                            >
                                <FileDown className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">CSV</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Advanced Filters Section */}
                <div className="relative z-20 mb-8">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-sm font-bold text-gray-700">Search & Filters</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            {/* Search */}
                            <div className="w-full lg:col-span-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Search Teacher</label>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        placeholder="Name, Email or Dept..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-indigo-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            {/* Department Filter */}
                            {user?.role !== 'teacher' ? (
                                <div className="w-full">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Department</label>
                                    <div className="relative">
                                        <select
                                            value={selectedDepartmentId}
                                            onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-indigo-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map((dept) => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                    </div>
                                </div>
                            ) : (
                                <div className="hidden lg:block w-full"></div>
                            )}

                            {/* Reset Button */}
                            <div className="w-full lg:w-auto">
                                <Button
                                    variant="outline"
                                    className="w-full lg:w-auto mt-6 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 border-gray-200 hover:border-red-200 rounded-xl transition-colors h-[42px]"
                                    onClick={() => {
                                        setSelectedDepartmentId('');
                                        setSearchTerm('');
                                    }}
                                >
                                    Reset Filters
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full">
                    {/* Report Data */}
                    <div className="lg:col-span-3">
                        <div className="shadow-sm border-gray-100 bg-white overflow-hidden rounded-2xl">
                            <div className="p-0">
                                {loading ? (
                                    <div className="p-12 text-center">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                        <p className="text-gray-500">Loading teacher reports...</p>
                                    </div>
                                ) : filteredTeachers.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No teachers found</h3>
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
                                                            { key: 'name' as const, label: 'Teacher', align: 'text-left' },
                                                            { key: 'department' as const, label: 'Department', align: 'text-left' },
                                                            { key: 'totalSessions' as const, label: 'No. of Lectures', align: 'text-center' },
                                                            { key: 'averageAttendance' as const, label: 'Avg. Attendance', align: 'text-left' },
                                                        ].map(col => (
                                                            <th
                                                                key={col.key}
                                                                onClick={() => handleListSort(col.key)}
                                                                className={`px-6 py-4 ${col.align} text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors select-none`}
                                                            >
                                                                <div className={`flex items-center gap-1 ${col.align === 'text-center' ? 'justify-center' : ''}`}>
                                                                    {col.label}
                                                                    <ListSortIcon field={col.key} />
                                                                </div>
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {sortedTeachers.map((teacher) => (
                                                        <tr key={teacher.id} className="hover:bg-indigo-50/50 transition-colors group">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    <div className="shrink-0 h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                        {teacher.name.charAt(0)}
                                                                    </div>
                                                                    <div className="ml-4">
                                                                        <div className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors cursor-pointer" onClick={() => openTeacherDetail(teacher.id)}>
                                                                            {teacher.name}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">{teacher.email}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                                {teacher.department}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                                                                {teacher.totalSessions}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${getAttendanceColor(teacher.averageAttendance)}`}
                                                                            style={{ width: `${Math.min(teacher.averageAttendance, 100)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${getAttendanceBadgeColor(teacher.averageAttendance)}`}>
                                                                        {teacher.averageAttendance}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => openTeacherDetail(teacher.id)}
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
                                            {filteredTeachers.map((teacher) => (
                                                <div
                                                    key={teacher.id}
                                                    onClick={() => openTeacherDetail(teacher.id)}
                                                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:scale-[0.99] transition-transform"
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                {teacher.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-semibold text-gray-900 text-sm">{teacher.name}</div>
                                                                <div className="text-xs text-gray-500">{teacher.department}</div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded ${getAttendanceBadgeColor(teacher.averageAttendance)}`}>
                                                            {teacher.averageAttendance}%
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                                        <span className="flex items-center gap-1">
                                                            <CalendarDays className="w-3 h-3" /> {teacher.workingDays} Days
                                                        </span>
                                                        <span className="text-gray-300">|</span>
                                                        <span className="flex items-center gap-1">
                                                            <BookOpen className="w-3 h-3" /> {teacher.totalSessions} Lectures
                                                        </span>
                                                    </div>

                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${getAttendanceColor(teacher.averageAttendance)}`}
                                                            style={{ width: `${Math.min(teacher.averageAttendance, 100)}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Teacher Detail Popup */}
                {(selectedTeacher || loadingDetail) && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-purple-600" />
                                    Teacher Details
                                </h3>
                                <Button variant="ghost" size="icon" onClick={closePopup} className="h-8 w-8 rounded-full">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative">
                                {!selectedTeacher && loadingDetail ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mb-4"></div>
                                        <p className="text-sm text-gray-500">Loading details...</p>
                                    </div>
                                ) : selectedTeacher && (
                                    <div className={`space-y-8 relative transition-opacity duration-300 ${loadingDetail ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                                        {loadingDetail && (
                                            <div className="absolute inset-x-0 top-1/3 flex justify-center z-50">
                                                <div className="bg-white/90 p-3 rounded-full shadow-lg border border-purple-100 flex items-center gap-3 animate-in fade-in zoom-in duration-200">
                                                    <div className="animate-spin w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full"></div>
                                                    <span className="text-sm font-semibold text-purple-700 pr-2">Updating...</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Profile Card */}
                                        <div className="bg-linear-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-2xl font-bold text-purple-600 border border-purple-100">
                                                        {selectedTeacher.teacher.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xl font-bold text-gray-900">{selectedTeacher.teacher.name}</h2>
                                                        <p className="text-sm text-gray-500">{selectedTeacher.teacher.email}</p>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200">
                                                                {selectedTeacher.teacher.department}
                                                            </span>
                                                            {selectedTeacher.subjects.length === 1 && (
                                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded border border-indigo-200 font-medium">
                                                                    📖 {selectedTeacher.subjects[0].name} ({selectedTeacher.subjects[0].paperCode || selectedTeacher.subjects[0].code})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={downloadTeacherReportCard} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                                        <FileDown className="w-4 h-4 mr-2" /> Download Report
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mt-6">
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">No. of Lectures</div>
                                                    <div className="text-2xl font-bold text-gray-900">{selectedTeacher.summary.totalSessions}</div>
                                                </div>
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Total Students</div>
                                                    <div className="text-2xl font-bold text-purple-600">{selectedTeacher.summary.totalStudents}</div>
                                                </div>
                                            </div>

                                            <div className="mt-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                                                <span className="font-semibold text-gray-700 text-sm">Overall Attendance Rate</span>
                                                <span className={`text-xl font-bold ${getAttendanceBadgeColor(selectedTeacher.summary.averageAttendance).split(' ')[1]}`}>
                                                    {selectedTeacher.summary.averageAttendance}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Filters for Detail (Department/Semester/Date) */}
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                            <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Filter Details</div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                {selectedTeacher.filters.departments?.length > 0 && (
                                                    <select
                                                        value={popupDeptFilter}
                                                        onChange={(e) => setPopupDeptFilter(e.target.value)}
                                                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                    >
                                                        <option value="">All Departments</option>
                                                        {selectedTeacher.filters.departments.map((dept) => (
                                                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                {selectedTeacher.filters.semesters?.length > 0 && (
                                                    <select
                                                        value={popupSemesterFilter}
                                                        onChange={(e) => setPopupSemesterFilter(e.target.value)}
                                                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                    >
                                                        <option value="">All Semesters</option>
                                                        {selectedTeacher.filters.semesters
                                                            .filter(sem => {
                                                                if (popupDeptFilter) {
                                                                    const selectedDept = selectedTeacher.filters.departments.find(d => d.id === popupDeptFilter);
                                                                    const activeSemesters = getActiveSemesters(selectedDept?.deptType);
                                                                    return activeSemesters.includes(sem);
                                                                } else {
                                                                    return selectedTeacher.filters.departments.some(dept => {
                                                                        const activeSemesters = getActiveSemesters(dept.deptType);
                                                                        return activeSemesters.includes(sem);
                                                                    });
                                                                }
                                                            })
                                                            .map((sem) => {
                                                                let dt: string | undefined;
                                                                if (popupDeptFilter) {
                                                                    const selectedDept = selectedTeacher.filters.departments.find(d => d.id === popupDeptFilter);
                                                                    dt = selectedDept?.deptType;
                                                                } else {
                                                                    const validDept = selectedTeacher.filters.departments.find(dept =>
                                                                        getActiveSemesters(dept.deptType).includes(sem)
                                                                    );
                                                                    dt = validDept?.deptType;
                                                                }
                                                                const label = getBatchLabel(sem, dt);
                                                                return (
                                                                    <option key={sem} value={sem}>Sem {sem}{label ? ` (${label})` : ''}</option>
                                                                );
                                                            })}
                                                    </select>
                                                )}
                                                <div>
                                                    <input
                                                        type="date"
                                                        value={popupDateFrom}
                                                        onChange={(e) => setPopupDateFrom(e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                        placeholder="From Date"
                                                    />
                                                </div>
                                                <div>
                                                    <input
                                                        type="date"
                                                        value={popupDateTo}
                                                        onChange={(e) => setPopupDateTo(e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                        placeholder="To Date"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Subject Breakdown - only show when multiple subjects */}
                                        {selectedTeacher.subjects.length > 1 && (
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
                                                                <th className="px-4 py-3 text-center">No. of Lectures</th>
                                                                <th className="px-4 py-3 text-center">Attendance</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {selectedTeacher.subjects.map((subj, idx) => (
                                                                <tr key={`${subj.id}-${idx}`} className="bg-white hover:bg-gray-50/50">
                                                                    <td className="px-4 py-3">
                                                                        <div className="font-medium text-gray-900">{subj.name}</div>
                                                                        <div className="text-xs text-gray-500">Sem {subj.semester} • {subj.paperCode || subj.code}</div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center text-gray-600">{subj.sessions}</td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${getAttendanceBadgeColor(subj.attendance)}`}>
                                                                            {subj.attendance}%
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Day-by-Day Breakdown with Topics */}
                                        {selectedTeacher.dailyBreakdown && selectedTeacher.dailyBreakdown.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <CalendarDays className="w-4 h-4 text-purple-600" />
                                                    Day-by-Day Breakdown
                                                </h4>
                                                <div className="border rounded-xl overflow-hidden shadow-sm">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-gray-50 text-gray-500 font-semibold border-b">
                                                                <tr>
                                                                    <th className="px-4 py-3">Date</th>
                                                                    <th className="px-4 py-3">Topic</th>
                                                                    <th className="px-4 py-3 text-center">Total</th>
                                                                    <th className="px-4 py-3 text-center">Present</th>
                                                                    <th className="px-4 py-3 text-center">Absent</th>
                                                                    <th className="px-4 py-3 text-center">Attendance</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y">
                                                                {selectedTeacher.dailyBreakdown.map((day) => (
                                                                    <tr key={day.date} className={`bg-white hover:bg-gray-50/50 ${day.percentage < 60 ? 'bg-red-50/30' : day.percentage < 75 ? 'bg-amber-50/20' : ''}`}>
                                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                                            <div className="text-sm font-medium text-gray-900">
                                                                                {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-sm text-indigo-600 max-w-[200px] truncate" title={day.topics}>
                                                                            {day.topics ? `📖 ${day.topics}` : <span className="text-gray-300">-</span>}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center text-sm text-gray-600">{day.total}</td>
                                                                        <td className="px-4 py-3 text-center text-sm font-medium text-emerald-600">{day.present}</td>
                                                                        <td className="px-4 py-3 text-center text-sm font-medium text-red-600">{day.absent}</td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${day.percentage >= 75 ? 'bg-emerald-100 text-emerald-800' : day.percentage >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                                                                {day.percentage}%
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Monthly Trend */}
                                        {selectedTeacher.monthlyTrend.length > 0 && (
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-purple-600" />
                                                    Monthly Trend
                                                </h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                                    {selectedTeacher.monthlyTrend.map((trend) => (
                                                        <div key={trend.month} className="bg-white border rounded-lg p-3 text-center shadow-sm">
                                                            <div className="text-xs text-gray-500 mb-1">{trend.month}</div>
                                                            <div className={`text-lg font-bold ${trend.attendance >= 75 ? 'text-emerald-600' : 'text-red-500'
                                                                }`}>
                                                                {trend.attendance}%
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
