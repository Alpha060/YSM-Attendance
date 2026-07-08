'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CalendarDays, TrendingUp, TrendingDown, BarChart3, Filter, ChevronDown, AlertCircle, FileText, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { useActiveSemesters } from '@/hooks/useActiveSemesters';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface StudentAttendance {
    id: string;
    studentId: string;
    rollNumber: string;
    name: string;
    totalClasses: number;
    attended: number;
    percentage: number;
    department?: string;
    semester?: number;
    subjectAttendance?: {
        subjectId: string;
        subjectName: string;
        paperCode: string | null;
        totalClasses: number;
        attended: number;
    }[];
}

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

interface MonthlyStats {
    month: string;
    totalDays: number;
    totalSessions: number;
    totalPresent: number;
    totalAbsent: number;
    totalRecords: number;
    averageAttendance: number;
    highestAttendance: number;
    lowestAttendance: number;
}

interface DailyBreakdown {
    date: string;
    percentage: number;
}

function MonthlyReportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const viewParam = searchParams.get('view') || '';
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');

    const [stats, setStats] = useState<MonthlyStats | null>(null);
    const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdown[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { getActiveSemesters, getActiveSemestersByDept, getBatchLabel } = useActiveSemesters();

    const getDeptType = (dept?: Department) => dept?.deptType || dept?.dept_type;

    // Real-time updates
    useRealtimeData({
        tables: ['attendance_records'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token && user) fetchMonthlyReport(token, true);
        }, [user, selectedMonth, selectedDepartmentId, selectedSemester]),
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
            fetchMonthlyReport(token);
        }
    }, [selectedMonth, selectedDepartmentId, selectedSemester, user]);

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

    const fetchMonthlyReport = async (token: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            let url = `/api/reports/monthly?month=${selectedMonth}`;
            if (selectedDepartmentId) url += `&departmentId=${selectedDepartmentId}`;
            if (selectedSemester) url += `&semester=${selectedSemester}`;
            if (viewParam) url += `&view=${viewParam}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.stats) setStats(data.stats);
            if (data.dailyBreakdown) setDailyBreakdown(data.dailyBreakdown);
        } catch (err) {
            console.error('Error fetching monthly report:', err);
        }
        if (!silent) setLoading(false);
    };

    const exportReport = async (format: 'excel' | 'pdf') => {
        const token = localStorage.getItem('token');
        if (!token || !user) return;

        const [year, month] = selectedMonth.split('-');
        const start = `${selectedMonth}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        setLoading(true);
        try {
            let url = `/api/reports/students?startDate=${start}&endDate=${end}`;
            if (selectedDepartmentId) url += `&departmentId=${selectedDepartmentId}`;
            if (selectedSemester) url += `&semester=${selectedSemester}`;
            if (viewParam) url += `&view=${viewParam}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            const monthlyStudents: StudentAttendance[] = data.students || [];

            const getGroupSubjects = (groupStudents: StudentAttendance[]) => {
                const subMap = new Map<string, { id: string; name: string; paperCode: string | null }>();
                groupStudents.forEach(st => {
                    st.subjectAttendance?.forEach(sub => {
                        if (!subMap.has(sub.subjectId)) {
                            subMap.set(sub.subjectId, {
                                id: sub.subjectId,
                                name: sub.subjectName,
                                paperCode: sub.paperCode
                            });
                        }
                    });
                });
                return Array.from(subMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            };

            const isFiltered = !!selectedDepartmentId && !!selectedSemester;

            const uniqueSubjectsMap = new Map<string, { id: string; name: string; paperCode: string | null }>();
            monthlyStudents.forEach(st => {
                st.subjectAttendance?.forEach(sub => {
                    if (!uniqueSubjectsMap.has(sub.subjectId)) {
                        uniqueSubjectsMap.set(sub.subjectId, {
                            id: sub.subjectId,
                            name: sub.subjectName,
                            paperCode: sub.paperCode
                        });
                    }
                });
            });
            const subjects = Array.from(uniqueSubjectsMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            const groups: Record<string, {
                department: string;
                departmentCode: string;
                semester: number;
                students: StudentAttendance[];
            }> = {};

            monthlyStudents.forEach(s => {
                const deptName = s.department || 'N/A';
                const sem = s.semester || 1;
                const key = `${deptName}_Sem_${sem}`;
                if (!groups[key]) {
                    const deptObj = departments.find(d => d.name === deptName);
                    groups[key] = {
                        department: deptName,
                        departmentCode: deptObj?.code || deptName,
                        semester: sem,
                        students: []
                    };
                }
                groups[key].students.push(s);
            });

            const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
                const gA = groups[a];
                const gB = groups[b];
                if (gA.department !== gB.department) {
                    return (gA.department || '').localeCompare(gB.department || '');
                }
                return gA.semester - gB.semester;
            });

            sortedGroupKeys.forEach(key => {
                groups[key].students.sort((a, b) => {
                    const rollA = String(a.rollNumber || '');
                    const rollB = String(b.rollNumber || '');
                    return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
                });
            });

            const filename = `monthly_attendance_report_${selectedMonth}_${new Date().toISOString().split('T')[0]}`;

            if (format === 'excel') {
                const workbook = XLSX.utils.book_new();

                const buildSheetData = (
                    sheetStudents: any[],
                    sheetSubjects: { id: string; name: string; paperCode: string | null }[],
                    meta: string[][]
                ) => {
                    const headers = ['Student ID', 'Roll Number', 'Name', ...sheetSubjects.map(sub => sub.paperCode ? `${sub.name} (${sub.paperCode})` : sub.name), 'Total Classes', 'Attended', 'Percentage', 'Status'];

                    const totalClassesRow: string[] = [
                        'Total Classes Held', '', '',
                        ...sheetSubjects.map(sub => {
                            let maxTotal = 0;
                            sheetStudents.forEach(s => {
                                const subAtt = s.subjectAttendance?.find((sa: any) => sa.subjectId === sub.id);
                                if (subAtt && subAtt.totalClasses > maxTotal) maxTotal = subAtt.totalClasses;
                            });
                            return maxTotal.toString();
                        }),
                        sheetStudents.reduce((max: number, s: any) => Math.max(max, s.totalClasses), 0).toString(),
                        '', '', ''
                    ];

                    const rows = sheetStudents.map((s: any) => {
                        const status = s.percentage >= 75 ? 'Good Standing' : s.percentage >= 60 ? 'Warning' : 'Critical';
                        return [
                            s.studentId || '-',
                            String(s.rollNumber || ''),
                            s.name,
                            ...sheetSubjects.map(sub => {
                                const subAtt = s.subjectAttendance?.find((sa: any) => sa.subjectId === sub.id);
                                return subAtt ? subAtt.attended.toString() : '0';
                            }),
                            s.totalClasses.toString(),
                            s.attended.toString(),
                            `${Math.round(s.percentage)}%`,
                            status
                        ];
                    });

                    return [...meta, headers, totalClassesRow, ...rows];
                };

                if (isFiltered) {
                    const deptName = selectedDepartmentId ? departments.find(d => d.id === selectedDepartmentId)?.name || 'All' : 'All';
                    const meta = [
                        ['Generated on:', new Date().toLocaleDateString()],
                        ['Report Month:', selectedMonth],
                        ['Department:', deptName],
                        ['Semester:', selectedSemester || 'All'],
                        []
                    ];
                    const sheetData = buildSheetData(monthlyStudents, subjects, meta);
                    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
                    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Report");
                } else {
                    if (sortedGroupKeys.length === 0) {
                        const worksheet = XLSX.utils.aoa_to_sheet([['No data available']]);
                        XLSX.utils.book_append_sheet(workbook, worksheet, "No Data");
                    } else {
                        sortedGroupKeys.forEach(key => {
                            const group = groups[key];
                            const groupSubjects = getGroupSubjects(group.students);
                            const meta = [
                                ['Generated on:', new Date().toLocaleDateString()],
                                ['Report Month:', selectedMonth],
                                ['Department:', group.department],
                                ['Semester:', group.semester.toString()],
                                []
                            ];
                            const sheetData = buildSheetData(group.students, groupSubjects, meta);
                            const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
                            let sheetName = `${group.departmentCode} Sem ${group.semester}`
                                .replace(/[:\\\\/?*\[\]]/g, '')
                                .slice(0, 31);
                            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                        });
                    }
                }

                XLSX.writeFile(workbook, `${filename}.xlsx`);
            } else if (format === 'pdf') {
                const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';

                const buildTableHtml = (
                    tableStudents: any[],
                    tableSubjects: { id: string; name: string; paperCode: string | null }[],
                    metaHtml: string
                ) => {
                    const maxOverall = tableStudents.reduce((max: number, s: any) => Math.max(max, s.totalClasses), 0);
                    return `
                        ${metaHtml}
                        <table>
                            <thead>
                                <tr>
                                    <th>Student ID</th>
                                    <th>Roll No</th>
                                    <th>Name</th>
                                    ${tableSubjects.map(sub => `<th>${sub.name}${sub.paperCode ? `<br/><span style="font-size: 8px; font-weight: normal; color: #e0e7ff;">(${sub.paperCode})</span>` : ''}</th>`).join('')}
                                    <th>Total</th>
                                    <th>Attended</th>
                                    <th>%</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="font-weight: bold; background-color: #e2e8f0;">
                                    <td>Total Classes Held</td>
                                    <td></td>
                                    <td></td>
                                    ${tableSubjects.map(sub => {
                                        let maxTotal = 0;
                                        tableStudents.forEach((s: any) => {
                                            const subAtt = s.subjectAttendance?.find((sa: any) => sa.subjectId === sub.id);
                                            if (subAtt && subAtt.totalClasses > maxTotal) maxTotal = subAtt.totalClasses;
                                        });
                                        return `<td>${maxTotal}</td>`;
                                    }).join('')}
                                    <td>${maxOverall}</td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                </tr>
                                ${tableStudents.map((s: any) => {
                                    const status = s.percentage >= 75 ? 'Good Standing' : s.percentage >= 60 ? 'Warning' : 'Critical';
                                    const statusClass = status === 'Good Standing' ? 'good' : status === 'Warning' ? 'warning' : 'critical';
                                    return `
                                        <tr>
                                            <td>${s.studentId || '-'}</td>
                                            <td>${s.rollNumber}</td>
                                            <td>${s.name}</td>
                                            ${tableSubjects.map(sub => {
                                                const subAtt = s.subjectAttendance?.find((sa: any) => sa.subjectId === sub.id);
                                                return `<td>${subAtt ? subAtt.attended : '0'}</td>`;
                                            }).join('')}
                                            <td>${s.totalClasses}</td>
                                            <td>${s.attended}</td>
                                            <td>${Math.round(s.percentage)}%</td>
                                            <td><span class="status-badge ${statusClass}">${status}</span></td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    `;
                };

                let tablesHtml = '';

                if (isFiltered) {
                    tablesHtml = buildTableHtml(monthlyStudents, subjects, `
                        <p class="meta">
                            <strong>Filters Applied:</strong> Generated on: ${new Date().toLocaleDateString()} | Report Month: ${selectedMonth} | Total Students: ${monthlyStudents.length}
                            ${selectedSemester ? ` | Semester: ${selectedSemester}` : ''}
                            ${selectedDepartmentId ? ` | Department: ${departments.find(d => d.id === selectedDepartmentId)?.name || ''}` : ''}
                        </p>
                    `);
                } else {
                    tablesHtml = sortedGroupKeys.map((key, groupIdx) => {
                        const group = groups[key];
                        const groupSubjects = getGroupSubjects(group.students);
                        return `
                            ${groupIdx > 0 ? '<div style="margin-top: 25px; border-top: 1px dashed #cbd5e1; padding-top: 15px; page-break-inside: avoid;"></div>' : ''}
                            <div class="group-section" style="margin-bottom: 25px;">
                                <h3 style="color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 5px; margin-top: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                                    ${group.department} &mdash; Semester ${group.semester}
                                </h3>
                                ${buildTableHtml(group.students, groupSubjects, `
                                    <p class="meta" style="margin-bottom: 6px;">
                                        Generated on: ${new Date().toLocaleDateString()} | Report Month: ${selectedMonth} | Total Students: ${group.students.length}
                                    </p>
                                `)}
                            </div>
                        `;
                    }).join('');
                }

                const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Monthly Attendance Report - ${selectedMonth}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', Arial, sans-serif; padding: 15px; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 15px; }
        .logo-section { display: flex; align-items: center; gap: 15px; }
        .logo-img { height: 50px; width: auto; object-fit: contain; }
        .college-info h1 { font-family: 'Playfair Display', serif; font-size: 16px; color: #1e3a8a; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px; }
        .college-info p { font-size: 9px; color: #64748b; margin-bottom: 1px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
        .report-title-box { text-align: right; }
        .report-title-box h2 { color: #1e3a8a; font-size: 14px; margin: 0 0 4px 0; }
        .report-title-box p { color: #6b7280; font-size: 10px; margin: 0; }
        .meta { color: #666; margin-bottom: 10px; font-size: 9px; line-height: 1.4; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9px; page-break-inside: auto; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th { background-color: #1e3a8a; color: white; padding: 6px 4px; text-align: left; font-weight: 600; border: 1px solid #e2e8f0; }
        td { padding: 4px; border: 1px solid #ddd; text-align: left; }
        tr:nth-child(even) { background-color: #f8f9fa; }
        .good { color: #047857; background-color: #d1fae5; }
        .warning { color: #b45309; background-color: #fef3c7; }
        .critical { color: #b91c1c; background-color: #fee2e2; }
        .status-badge { padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; display: inline-block; }
        @media print { 
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 10mm; } 
            .group-section { page-break-inside: auto; }
        }
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
            <p>Monthly Attendance Overview</p>
        </div>
    </div>
    
    ${tablesHtml}
</body>
</html>`;

                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed';
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';
                document.body.appendChild(iframe);
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                    iframeDoc.open();
                    iframeDoc.write(printContent);
                    iframeDoc.close();
                    setTimeout(() => {
                        iframe.contentWindow?.print();
                        setTimeout(() => document.body.removeChild(iframe), 1000);
                    }, 500);
                }
            }

        } catch (err) {
            console.error('Error exporting monthly report:', err);
        }
        setLoading(false);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const getProgressColor = (percentage: number) => {
        if (percentage >= 75) return 'text-emerald-500';
        if (percentage >= 60) return 'text-amber-500';
        return 'text-red-500';
    };

    const getBarColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-500';
        if (percentage >= 60) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role }}
                    onLogout={handleLogout}
                />
            )}

            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            <main className="flex-1 pt-20 pb-8 px-4 max-w-7xl mx-auto w-full">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-emerald-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Monthly Summary <span className="inline-block animate-wave">📈</span>
                            </h1>
                            <p className="text-emerald-100 text-sm max-w-xl">
                                Analyze attendance trends, identify patterns, and <span className="font-semibold text-white">monitor overall departmental performance</span>.
                            </p>
                        </div>

                        {/* Export Buttons in Hero */}
                        <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/20 self-start sm:self-auto">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('pdf')}
                                disabled={loading}
                            >
                                <FileText className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">PDF</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('excel')}
                                disabled={loading}
                            >
                                <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Excel</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Overlapping Advanced Filters Section */}
                <div className="relative z-20 mb-8">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-emerald-500" />
                            <h3 className="text-sm font-bold text-gray-700">Advanced Filters</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Month</label>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all cursor-pointer font-medium shadow-sm"
                                />
                            </div>

                            {(user?.role === 'super_admin' || departments.length > 1) && (
                                <div className="w-full">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Department</label>
                                    <div className="relative">
                                        <select
                                            value={selectedDepartmentId}
                                            onChange={(e) => { setSelectedDepartmentId(e.target.value); setSelectedSemester(''); }}
                                            className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
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

                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Semester</label>
                                <div className="relative">
                                    <select
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
                                    >
                                        <option value="">All Semesters</option>
                                        {(() => {
                                            const effectiveDept = selectedDepartmentId 
                                                ? departments.find(d => d.id === selectedDepartmentId) 
                                                : (user?.role === 'super_admin' ? undefined : (departments.length > 0 ? departments[0] : undefined));
                                            const effectiveDeptType = getDeptType(effectiveDept) || 'regular';
                                            const effectiveDeptId = effectiveDept?.id;
                                            return getActiveSemestersByDept(effectiveDeptId, effectiveDeptType).map((sem) => {
                                                const label = getBatchLabel(sem, effectiveDeptType, effectiveDeptId);
                                                return (
                                                    <option key={sem} value={sem}>Sem {sem}{label ? ` (${label})` : ''}</option>
                                                );
                                            });
                                        })()}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                </div>
                            </div>

                            <div className="w-full lg:w-auto">
                                <Button
                                    variant="outline"
                                    className="w-full lg:w-auto mt-6 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 border-gray-200 hover:border-red-200 rounded-xl transition-colors h-[42px]"
                                    onClick={() => {
                                        setSelectedSemester('');
                                        setSelectedDepartmentId('');
                                        setSelectedMonth(new Date().toISOString().slice(0, 7));
                                    }}
                                >
                                    Reset Filters
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="w-full">
                    {loading ? (
                        <div className="shadow-sm bg-white rounded-2xl">
                            <div className="p-12 text-center">
                                <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                <p className="text-gray-500">Loading monthly stats...</p>
                            </div>
                        </div>
                    ) : !stats ? (
                        <div className="shadow-sm bg-white rounded-2xl">
                            <div className="p-12 text-center">
                                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900">No data available</h3>
                                <p className="text-gray-500 mt-1">Try selecting a different month or filter to see analytics.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Top Row: Circular Progress + Stats Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Circular Progress */}
                                <div className="shadow-md bg-white overflow-hidden relative rounded-2xl">
                                    <div className="p-8">
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Average Attendance</h2>
                                            <div className="relative w-40 h-40 flex items-center justify-center mb-4">
                                                <svg className="w-full h-full transform -rotate-90">
                                                    <circle cx="80" cy="80" r="72" stroke="#f3f4f6" strokeWidth="10" fill="transparent" />
                                                    <circle
                                                        cx="80" cy="80" r="72"
                                                        stroke="currentColor"
                                                        strokeWidth="10"
                                                        fill="transparent"
                                                        strokeDasharray={452}
                                                        strokeDashoffset={452 - (452 * stats.averageAttendance) / 100}
                                                        className={`${getProgressColor(stats.averageAttendance)} transition-all duration-1000 ease-out`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className={`text-4xl font-bold ${getProgressColor(stats.averageAttendance)}`}>
                                                        {stats.averageAttendance}%
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Overall</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Grid (2x2 for 4 items) */}
                                <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                                    {/* Total Days Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-violet-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total Days</p>
                                            <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                                                <CalendarDays className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900">{stats.totalDays}</h3>
                                    </div>

                                    {/* Total Sessions Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">No. of Lectures</p>
                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                <BarChart3 className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900">{stats.totalSessions}</h3>
                                    </div>

                                    {/* Highest Day Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-emerald-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Highest Day</p>
                                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                <TrendingUp className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-emerald-600">{stats.highestAttendance}%</h3>
                                    </div>

                                    {/* Lowest Day Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-red-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lowest Day</p>
                                            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                                <TrendingDown className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-red-600">{stats.lowestAttendance}%</h3>
                                    </div>
                                </div>
                            </div>

                            {/* Mini Bar Chart (Visual Trend) */}
                            {dailyBreakdown.length > 0 && (
                                <div className="shadow-sm bg-white rounded-2xl">
                                    <div className="p-6">
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Daily Attendance Trend</h3>
                                        <div className="flex gap-1 h-32 mt-6">
                                            {dailyBreakdown.map((day, i) => (
                                                <div
                                                    key={day.date}
                                                    className="flex-1 h-full group relative flex flex-col justify-end"
                                                >
                                                    <div
                                                        className={`w-full rounded-t-md ${getBarColor(day.percentage)} transition-all duration-300 hover:opacity-80 cursor-pointer shadow-sm`}
                                                        style={{ height: `${Math.max(day.percentage, 4)}%` }}
                                                    ></div>

                                                    {/* Custom Tooltip */}
                                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 shadow-xl border border-gray-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 flex flex-col items-center">
                                                        <span>{day.percentage}%</span>
                                                        <span className="text-[10px] font-medium text-gray-400 mt-0.5">{formatDate(day.date)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                                            <span>{dailyBreakdown.length > 0 ? formatDate(dailyBreakdown[0].date) : ''}</span>
                                            <span>{dailyBreakdown.length > 0 ? formatDate(dailyBreakdown[dailyBreakdown.length - 1].date) : ''}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function MonthlyReportPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full"></div></div>}>
            <MonthlyReportContent />
        </Suspense>
    );
}
