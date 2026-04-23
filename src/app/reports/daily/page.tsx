'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

import { Calendar, Users, UserCheck, UserX, ArrowLeft, Filter, Search, ChevronDown, CheckCircle, XCircle, AlertCircle, FileText, FileSpreadsheet, FileDown, ChevronRight, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';
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
    deptType?: string;
    dept_type?: string;
}

interface Subject {
    id: string;
    code: string;
    name: string;
    semester: number;
}

interface AttendanceRecord {
    date: string;
    totalStudents: number;
    present: number;
    absent: number;
    attendancePercentage: number;
}

interface LectureSummary {
    subjectCode: string;
    subjectName: string;
    subjectPaperCode: string | null;
    lectureNumber: number;
    semester: string;
    departmentNames: string;
    teacherName: string;
    totalStudents: number;
    present: number;
    absent: number;
}

function DailyReportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const viewParam = searchParams.get('view') || '';
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');

    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [lecturesSummary, setLecturesSummary] = useState<LectureSummary[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { getActiveSemesters, getBatchLabel } = useActiveSemesters();

    // Real-time updates
    useRealtimeData({
        tables: ['attendance_records'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token && user) fetchDailyReport(token, true);
        }, [user, selectedDate, selectedDepartmentId, selectedSemester, selectedSubjectId]),
    });

    // Helper to get dept type from either field name convention
    const getDeptType = (dept?: Department) => dept?.deptType || dept?.dept_type;

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);

        // Fetch departments for super_admin or teacher with multiple depts
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
            fetchDailyReport(token);
        }
    }, [selectedDate, selectedDepartmentId, selectedSemester, selectedSubjectId, user]);

    // Fetch subjects when semester changes
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            fetchSubjects(token);
        }
    }, [selectedSemester, selectedDepartmentId]);

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

    // Fetch departments for teachers (based on their assignments)
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

    // Fetch subjects based on selected semester
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
            setSubjects(data.subjects || []);
            // Reset subject selection when semester changes
            setSelectedSubjectId('');
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
    };

    const fetchDailyReport = async (token: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            let url = `/api/reports/daily?date=${selectedDate}`;
            if (selectedDepartmentId) {
                url += `&departmentId=${selectedDepartmentId}`;
            }
            if (selectedSemester) {
                url += `&semester=${selectedSemester}`;
            }
            if (selectedSubjectId) {
                url += `&subjectId=${selectedSubjectId}`;
            }
            if (viewParam) {
                url += `&view=${viewParam}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.records) {
                setRecords(data.records);
            }
            if (data.lecturesSummary) {
                setLecturesSummary(data.lecturesSummary);
            } else {
                setLecturesSummary([]);
            }
        } catch (err) {
            console.error('Error fetching daily report:', err);
        }
        if (!silent) setLoading(false);
    };

    // Format date for display
    const formatDateDisplay = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    // Calculate totals
    const totals = records.reduce((acc, r) => ({
        students: acc.students + r.totalStudents,
        present: acc.present + r.present,
        absent: acc.absent + r.absent
    }), { students: 0, present: 0, absent: 0 });

    const avgPercentage = totals.students > 0 ? Math.round((totals.present / totals.students) * 100) : 0;

    // Get selected subject name for export
    const getSelectedSubjectName = () => {
        if (!selectedSubjectId) return 'All Subjects';
        const subject = subjects.find(s => s.id === selectedSubjectId);
        return subject ? `${subject.code} - ${subject.name}` : 'All Subjects';
    };

    // Export Daily Report with detailed student records
    const exportReport = async (format: 'csv' | 'excel' | 'pdf') => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            // Fetch detailed data with student names and roll numbers
            let url = `/api/reports/daily?date=${selectedDate}&detailed=true`;
            if (selectedDepartmentId) {
                url += `&departmentId=${selectedDepartmentId}`;
            }
            if (selectedSemester) {
                url += `&semester=${selectedSemester}`;
            }
            if (selectedSubjectId) {
                url += `&subjectId=${selectedSubjectId}`;
            }
            if (viewParam) {
                url += `&view=${viewParam}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.status === 401) {
                router.replace('/login');
                return;
            }

            const data = await res.json();
            const detailedRecords = data.detailedRecords || [];

            let filteredRecords = detailedRecords;

            if (filteredRecords.length === 0) {
                alert('No attendance records found for the selected date and filters.');
                return;
            }

            const headers = ['S.No', 'Student ID', 'Roll Number', 'Student Name', 'Department', 'Paper/Subject Code', 'Subject Name', 'Lecture', 'Status'];
            const rows = filteredRecords.map((r: any, index: number) => [
                (index + 1).toString(),
                r.studentCustomId || r.rollNumber,
                r.rollNumber,
                r.studentName,
                r.departmentCode || '',
                r.subjectPaperCode || r.subjectCode,
                r.subjectName,
                `Lecture ${r.lectureNumber}`,
                r.status.charAt(0).toUpperCase() + r.status.slice(1)
            ]);

            const filename = `daily_attendance_detailed_${selectedDate}`;

            if (format === 'csv') {
                const csvContent = [
                    headers.join(','),
                    ...rows.map((row: string[]) => row.map(cell => `"${cell}"`).join(','))
                ].join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${filename}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else if (format === 'excel') {
                const headers = ['S.No', 'Student ID', 'Roll Number', 'Student Name', 'Department', 'Paper/Subject Code', 'Subject Name', 'Lecture', 'Status'];
                const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                // Set column widths
                worksheet['!cols'] = [
                    { wch: 5 },  // S.No
                    { wch: 18 }, // Student ID (custom)
                    { wch: 12 }, // Roll Number
                    { wch: 25 }, // Student Name
                    { wch: 10 }, // Department
                    { wch: 12 }, // Subject Code
                    { wch: 30 }, // Subject Name
                    { wch: 10 }, // Lecture
                    { wch: 10 }  // Status
                ];
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Attendance');
                XLSX.writeFile(workbook, `${filename}.xlsx`);
            } else if (format === 'pdf') {
                // Group students by status for summary
                const presentCount = filteredRecords.filter((r: any) => r.status === 'present').length;
                const absentCount = filteredRecords.filter((r: any) => r.status === 'absent').length;
                const lateCount = filteredRecords.filter((r: any) => r.status === 'late').length;
                const totalEntries = filteredRecords.length;
                const attendancePercentage = totalEntries > 0 ? Math.round((presentCount / totalEntries) * 100) : 0;
                const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';

                const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Daily Attendance Report - ${formatDateDisplay(selectedDate)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', Arial, sans-serif; padding: 30px; background: #fff; color: #1f2937; font-size: 12px; }
        .container { max-width: 100%; margin: 0 auto; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 60px; width: auto; object-fit: contain; }
        .college-info h1 { font-family: 'Playfair Display', serif; font-size: 20px; color: #1e3a8a; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px; }
        .college-info p { font-size: 10px; color: #64748b; margin-bottom: 1px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
        .report-title-box { text-align: right; }
        .report-title-box h2 { color: #1e3a8a; font-size: 16px; margin: 0 0 4px 0; }
        .report-title-box p { color: #6b7280; font-size: 11px; margin: 0; }
        .report-title-box strong { display: inline-block; background: #4f46e5; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; margin-top: 8px; }
        .summary-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
        .summary-card { background: #f9fafb; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
        .summary-value { font-size: 22px; font-weight: bold; }
        .summary-label { font-size: 10px; color: #6b7280; margin-top: 4px; text-transform: uppercase; }
        .blue { color: #2563eb; }
        .green { color: #16a34a; }
        .red { color: #dc2626; }
        .orange { color: #ea580c; }
        .purple { color: #7c3aed; }
        .section-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
        .filters-info { background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 11px; color: #4b5563; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background: #4f46e5; color: white; padding: 8px 6px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; }
        td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .status-present { color: #16a34a; background: #dcfce7; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .status-absent { color: #dc2626; background: #fee2e2; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .status-late { color: #ea580c; background: #fff7ed; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
        .role-badge { display: inline-block; background: #4f46e5; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; margin-top: 8px; }
        @media print { 
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; padding: 20px; } 
            .container { max-width: 100%; }
        }
    </style>
</head>
<body>
    <div class="container">
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
                <h2>DAILY ATTENDANCE REPORT</h2>
                <p>📅 ${formatDateDisplay(selectedDate)}</p>
                <strong>${user?.role?.replace('_', ' ').toUpperCase() || 'USER'}</strong>
            </div>
        </div>
        <div class="filters-info">
            <strong>Filters Applied:</strong> 
            Subject: ${getSelectedSubjectName()} | 
            Semester: ${selectedSemester || 'All'} | 
            Department: ${selectedDepartmentId ? departments.find(d => d.id === selectedDepartmentId)?.name || 'Selected' : 'All'}
        </div>
        <div class="summary-cards">
            <div class="summary-card">
                <div class="summary-value blue">${totalEntries}</div>
                <div class="summary-label">Total Entries</div>
            </div>
            <div class="summary-card">
                <div class="summary-value green">${presentCount}</div>
                <div class="summary-label">Present</div>
            </div>
            <div class="summary-card">
                <div class="summary-value red">${absentCount}</div>
                <div class="summary-label">Absent</div>
            </div>
            <div class="summary-card">
                <div class="summary-value orange">${lateCount}</div>
                <div class="summary-label">Late</div>
            </div>
            <div class="summary-card">
                <div class="summary-value purple">${attendancePercentage}%</div>
                <div class="summary-label">Attendance</div>
            </div>
        </div>
        <div class="section-title">Student-wise Attendance Details (${filteredRecords.length} records)</div>
        <table>
            <thead>
                <tr>${headers.map((h: string) => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map((row: string[]) => {
                    const status = row[8].toLowerCase();
                    const statusClass = status === 'present' ? 'status-present' : status === 'absent' ? 'status-absent' : 'status-late';
                    return `<tr>${row.map((cell: string, i: number) => i === 8 ? `<td><span class="${statusClass}">${cell}</span></td>` : `<td>${cell}</td>`).join('')}</tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="footer">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()} | YSM Attendance System<br>
            <strong>Generated by:</strong> ${user?.firstName} ${user?.lastName} (${user?.role?.replace('_', ' ').toUpperCase()})
        </div>
    </div>
</body>
</html>`;
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(printContent);
                    printWindow.document.close();
                    printWindow.onload = () => { printWindow.print(); };
                }
            }
        } catch (err) {
            console.error('Error exporting report:', err);
            alert('Failed to export report. Please try again.');
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
                                <span className="text-blue-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Daily Report <span className="inline-block animate-wave">📊</span>
                            </h1>
                            <p className="text-blue-100 text-sm max-w-xl">
                                View attendance records by date, analyze daily trends, and <span className="font-semibold text-white">generate insights</span>.
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

                {/* Overlapping Date Picker & Quick Stats Grid */}
                <div className="relative z-20 mb-8">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                <CalendarDays className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Selected Date</h3>
                                <p className="text-xs text-gray-500">Pick a day to analyze</p>
                            </div>
                        </div>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full sm:w-auto bg-gray-50 border border-gray-200 text-gray-700 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all cursor-pointer shadow-sm hover:bg-gray-100"
                        />
                    </div>

                    {/* Gradient Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Total Card */}
                        <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total Entries</p>
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <Users className="w-4 h-4" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">{totals.students}</h3>
                        </div>

                        {/* Present Card */}
                        <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-emerald-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Present</p>
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <UserCheck className="w-4 h-4" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-emerald-600">{totals.present}</h3>
                        </div>

                        {/* Absent Card */}
                        <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-red-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Absent</p>
                                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                    <UserX className="w-4 h-4" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-rose-600">{totals.absent}</h3>
                        </div>

                        {/* Average Card */}
                        <div className={`group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300`}>
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Average</p>
                                <div className={`p-2 rounded-lg ${avgPercentage >= 75 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                    <CheckCircle className="w-4 h-4" />
                                </div>
                            </div>
                            <h3 className={`text-2xl font-bold ${avgPercentage >= 75 ? 'text-emerald-600' : 'text-orange-600'}`}>{avgPercentage}%</h3>
                        </div>
                    </div>
                </div>

                {/* Advanced Filters Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <h3 className="text-sm font-bold text-gray-700">Advanced Filters</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 items-end">
                        {/* Department Filter */}
                        {(user?.role === 'super_admin' || departments.length > 1) && (
                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Department</label>
                                <div className="relative">
                                    <select
                                        value={selectedDepartmentId}
                                        onChange={(e) => { setSelectedDepartmentId(e.target.value); }}
                                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-blue-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium"
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
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                    className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-blue-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium"
                                >
                                    <option value="">All Semesters</option>
                                    {(() => {
                                        const effectiveDeptType = selectedDepartmentId
                                            ? getDeptType(departments.find(d => d.id === selectedDepartmentId))
                                            : (user?.role === 'super_admin' ? 'regular' : (departments.length > 0 ? getDeptType(departments[0]) : 'regular'));
                                        return getActiveSemesters(effectiveDeptType).map((sem) => {
                                            const label = getBatchLabel(sem, effectiveDeptType);
                                            return (
                                                <option key={sem} value={sem}>Sem {sem}{label ? ` (${label})` : ''}</option>
                                            );
                                        });
                                    })()}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                            </div>
                        </div>



                        {/* Subject Filter */}
                        <div className="w-full">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Subject</label>
                            <div className="relative">
                                <select
                                    value={selectedSubjectId}
                                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                                    className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-blue-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium"
                                >
                                    <option value="">All Subjects</option>
                                    {subjects.map((subject) => (
                                        <option key={subject.id} value={subject.id}>
                                            {subject.code} - {subject.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                            </div>
                        </div>

                        {/* Reset Button */}
                        <div className="w-full lg:w-auto">
                            <Button
                                variant="outline"
                                className="w-full lg:w-auto mt-6 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 border-gray-200 hover:border-red-200 rounded-xl transition-colors h-[42px]"
                                onClick={() => {
                                    setSelectedSemester('');
                                    setSelectedDepartmentId('');
                                    setSelectedSubjectId('');
                                }}
                            >
                                Reset Filters
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="w-full">
                    {/* Report Data */}
                    <div className="lg:col-span-3">
                        <div className="shadow-sm border border-gray-100 bg-white overflow-hidden rounded-2xl">
                            <div className="p-0">
                                {loading ? (
                                    <div className="p-12 text-center">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                        <p className="text-gray-500">Loading daily records...</p>
                                    </div>
                                ) : records.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No records found</h3>
                                        <p className="text-gray-500 mt-1">Try adjusting the date or filters to see attendance data.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop Table View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full table-auto">
                                                <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Lecture</th>
                                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Present</th>
                                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Absent</th>
                                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {records.map((record, index) => (
                                                        <tr key={index} className="hover:bg-blue-50/50 transition-colors group">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-sm font-medium text-gray-900">{formatDateDisplay(record.date)}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                                                {record.totalStudents}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className="text-emerald-600 font-medium">{record.present}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className="text-red-500 font-medium">{record.absent}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${record.attendancePercentage >= 75 ? 'bg-emerald-500' : 'bg-red-500'
                                                                                }`}
                                                                            style={{ width: `${Math.min(record.attendancePercentage, 100)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold ${record.attendancePercentage >= 75 ? 'text-emerald-600' : 'text-red-600'
                                                                        }`}>
                                                                        {record.attendancePercentage}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile Card View */}
                                        <div className="md:hidden p-4 space-y-4">
                                            {records.map((record, index) => (
                                                <div key={index} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <span className="font-semibold text-gray-900">{formatDateDisplay(record.date)}</span>
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${record.attendancePercentage >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                                            }`}>
                                                            {record.attendancePercentage}%
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                                        <div className="p-2 bg-gray-50 rounded-lg">
                                                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Total</p>
                                                            <p className="font-bold">{record.totalStudents}</p>
                                                        </div>
                                                        <div className="p-2 bg-emerald-50/50 rounded-lg">
                                                            <p className="text-emerald-600 text-xs uppercase tracking-wide mb-1">Present</p>
                                                            <p className="font-bold text-emerald-700">{record.present}</p>
                                                        </div>
                                                        <div className="p-2 bg-red-50/50 rounded-lg">
                                                            <p className="text-red-600 text-xs uppercase tracking-wide mb-1">Absent</p>
                                                            <p className="font-bold text-red-700">{record.absent}</p>
                                                        </div>
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

                {/* Subjects Taught Today */}
                {!loading && lecturesSummary.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8 mt-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                <FileText className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-700">Subjects Taught Today</h3>
                                <p className="text-xs text-gray-400">{lecturesSummary.length} lecture session{lecturesSummary.length !== 1 ? 's' : ''} recorded</p>
                            </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full table-auto">
                                <thead className="bg-linear-to-r from-indigo-50 to-blue-50 border-b border-indigo-100">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-indigo-600 uppercase tracking-wider">Lec #</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-indigo-600 uppercase tracking-wider">Subject</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-indigo-600 uppercase tracking-wider">Teacher</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-indigo-600 uppercase tracking-wider">Department</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-indigo-600 uppercase tracking-wider">Semester</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-indigo-600 uppercase tracking-wider">Total</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-indigo-600 uppercase tracking-wider">Present</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-indigo-600 uppercase tracking-wider">Absent</th>
                                        <th className="px-4 py-3 text-center text-xs font-bold text-indigo-600 uppercase tracking-wider">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {lecturesSummary.map((lec, index) => {
                                        const pct = lec.totalStudents > 0 ? Math.round((lec.present / lec.totalStudents) * 100) : 0;
                                        return (
                                            <tr key={index} className="hover:bg-indigo-50/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
                                                        {lec.lectureNumber}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm font-semibold text-gray-900">{lec.subjectPaperCode || lec.subjectCode}</div>
                                                    <div className="text-xs text-gray-500">{lec.subjectName}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-gray-700">{lec.teacherName || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-gray-700">{lec.departmentNames || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-bold">
                                                        Sem {lec.semester}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">{lec.totalStudents}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-semibold text-emerald-600">{lec.present}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-semibold text-red-500">{lec.absent}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${pct >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                        {pct}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {lecturesSummary.map((lec, index) => {
                                const pct = lec.totalStudents > 0 ? Math.round((lec.present / lec.totalStudents) * 100) : 0;
                                return (
                                    <div key={index} className="border border-gray-100 rounded-xl p-4 bg-gray-50/30">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
                                                    {lec.lectureNumber}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{lec.subjectPaperCode || lec.subjectCode}</p>
                                                    <p className="text-xs text-gray-500">{lec.subjectName}</p>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${pct >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                {pct}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-3 text-xs">
                                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold">Sem {lec.semester}</span>
                                            <span className="text-gray-400">•</span>
                                            <span className="text-gray-600">{lec.departmentNames || '—'}</span>
                                        </div>
                                        {lec.teacherName && (
                                            <div className="flex items-center gap-1.5 mb-3 text-sm font-bold text-gray-800">
                                                <Users className="w-4 h-4 text-indigo-500" />
                                                <span>{lec.teacherName}</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-3 gap-1.5 text-center mt-1">
                                            <div className="py-1 bg-white rounded-md border border-gray-100">
                                                <p className="text-gray-400 text-[9px] uppercase font-bold tracking-wider leading-none mb-1">Total</p>
                                                <p className="font-bold text-gray-800 text-xs leading-none">{lec.totalStudents}</p>
                                            </div>
                                            <div className="py-1 bg-emerald-50/80 rounded-md border border-emerald-100/50">
                                                <p className="text-emerald-500 text-[9px] uppercase font-bold tracking-wider leading-none mb-1">Present</p>
                                                <p className="font-bold text-emerald-700 text-xs leading-none">{lec.present}</p>
                                            </div>
                                            <div className="py-1 bg-red-50/80 rounded-md border border-red-100/50">
                                                <p className="text-red-500 text-[9px] uppercase font-bold tracking-wider leading-none mb-1">Absent</p>
                                                <p className="font-bold text-red-700 text-xs leading-none">{lec.absent}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default function DailyReportPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full"></div></div>}>
            <DailyReportContent />
        </Suspense>
    );
}
