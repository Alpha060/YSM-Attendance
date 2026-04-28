'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Users, Calendar, TrendingUp, BookOpen, Clock, CalendarDays, FileDown } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { useActiveSemesters } from '@/hooks/useActiveSemesters';

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
    departmentId?: string;
}

interface PerformanceData {
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

export default function MyPerformancePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<PerformanceData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Filters
    const [deptFilter, setDeptFilter] = useState('');
    const [semesterFilter, setSemesterFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const { getBatchLabel, getActiveSemesters, getActiveSemestersByDept } = useActiveSemesters();

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
    }, [router]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchMyPerformance(token, user.id);
        }
    }, [user, deptFilter, semesterFilter, dateFrom, dateTo]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const fetchMyPerformance = async (token: string, userId: string) => {
        setLoading(true);
        try {
            let url = `/api/reports/teachers/${userId}`;
            const params = new URLSearchParams();
            if (deptFilter) params.append('departmentId', deptFilter);
            if (semesterFilter) params.append('semester', semesterFilter);
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
            if (res.ok) {
                const result = await res.json();
                setData(result);
            }
        } catch (err) {
            console.error('Error fetching performance data:', err);
        }
        setLoading(false);
    };

    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 85) return 'text-green-600 bg-green-100';
        if (percentage >= 75) return 'text-lime-600 bg-lime-100';
        if (percentage >= 60) return 'text-yellow-600 bg-yellow-100';
        if (percentage >= 40) return 'text-orange-600 bg-orange-100';
        return 'text-red-600 bg-red-100';
    };

    const getProgressColor = (percentage: number) => {
        if (percentage >= 85) return 'bg-green-500';
        if (percentage >= 75) return 'bg-lime-500';
        if (percentage >= 60) return 'bg-yellow-500';
        if (percentage >= 40) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    const downloadTeacherReportCard = () => {
        if (!data || !user) return;

        const { teacher, summary, subjects, monthlyTrend } = data;
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

        .teacher-name {
            font-family: 'Playfair Display', serif;
            font-size: 18px;
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
            font-size: 11px;
            color: var(--text-sub);
        }
        .meta-values strong { color: var(--text-main); font-weight: 600; margin-right: 4px; }
        .meta-row { margin-bottom: 2px; }

        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(4, 1fr); 
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
                    <div class="meta-row"><strong>Department:</strong> ${deptFilter ? data.filters.departments.find(d => d.id === deptFilter)?.name : 'All Departments'}</div>
                    <div class="meta-row"><strong>Semester:</strong> ${semesterFilter ? (() => { const dept = data.filters.departments.find(d => d.id === deptFilter); const label = getBatchLabel(parseInt(semesterFilter), dept?.deptType, dept?.id); return `Semester ${semesterFilter}${label ? ` (${label})` : ''}`; })() : 'All Semesters'}</div>
                    ${subjects.length === 1 ? `<div class="meta-row"><strong>Subject:</strong> ${subjects[0].name} (${subjects[0].paperCode || subjects[0].code})</div>` : ''}
                    ${dateFrom || dateTo ? `<div class="meta-row"><strong>Period:</strong> ${dateFrom || 'Start'} to ${dateTo || 'Present'}</div>` : ''}
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
                        <th>Code</th>
                        <th style="text-align: center;">No. of Lectures</th>
                        <th style="text-align: center;">Attendance</th>
                        <th style="border-radius: 0 4px 0 0; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${subjects.map(sub => `
                        <tr>
                            <td style="font-weight: 600;">${sub.name}</td>
                            <td style="color: var(--text-sub); font-size: 11px;">${sub.paperCode || sub.code}</td>
                            <td style="text-align: center;">${sub.sessions}</td>
                            <td style="text-align: center; font-weight: 700; color: var(--primary);">${sub.attendance}%</td>
                            <td style="text-align: center;">
                                <span class="badge-status ${sub.attendance >= 75 ? 'bg-green' : sub.attendance >= 60 ? 'bg-amber' : 'bg-red'}">
                                    ${sub.attendance >= 75 ? 'Excellent' : sub.attendance >= 60 ? 'Average' : 'Low'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}

            ${data.dailyBreakdown && data.dailyBreakdown.length > 0 ? `
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
                        ${data.dailyBreakdown.map(d => `
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
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl mt-4">
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                My Performance <span className="inline-block animate-bounce">📈</span>
                            </h1>
                            <p className="text-indigo-100 text-sm max-w-xl">
                                Track your teaching statistics, monitor your <span className="font-semibold text-white">syllabus progression</span>, and export printable reports.
                            </p>
                        </div>

                        {data && (
                            <Button onClick={downloadTeacherReportCard} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg self-start sm:self-auto">
                                <FileDown className="w-5 h-5 mr-2" /> Download Faculty Report
                            </Button>
                        )}
                    </div>
                </div>

                {loading && !data ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mb-4"></div>
                        <div className="text-gray-500 font-medium">Loading your performance data...</div>
                    </div>
                ) : !data ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-gray-500 font-medium">No performance data available yet. Start marking attendance to see your stats!</div>
                    </div>
                ) : (
                    <div className="space-y-6 pb-8">
                        {/* Filters Section */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Filter Your Data</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {data.filters.departments?.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <select
                                            value={deptFilter}
                                            onChange={(e) => { setDeptFilter(e.target.value); setSemesterFilter(''); }}
                                            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        >
                                            <option value="">All My Departments</option>
                                            {data.filters.departments.map((dept) => (
                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {data.filters.semesters?.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <select
                                            value={semesterFilter}
                                            onChange={(e) => setSemesterFilter(e.target.value)}
                                            className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        >
                                            <option value="">All Semesters</option>
                                            {data.filters.semesters
                                                .filter(sem => {
                                                    if (deptFilter) {
                                                        const selectedDept = data.filters.departments.find(d => d.id === deptFilter);
                                                        return getActiveSemestersByDept(selectedDept?.id, selectedDept?.deptType).includes(sem);
                                                    } else {
                                                        return data.filters.departments.some(dept =>
                                                            getActiveSemestersByDept(dept.id, dept.deptType).includes(sem)
                                                        );
                                                    }
                                                })
                                                .map((sem) => {
                                                    let dept: any;
                                                    if (deptFilter) {
                                                        dept = data.filters.departments.find(d => d.id === deptFilter);
                                                    } else {
                                                        dept = data.filters.departments.find(d =>
                                                            getActiveSemestersByDept(d.id, d.deptType).includes(sem)
                                                        );
                                                    }
                                                    const label = getBatchLabel(sem, dept?.deptType, dept?.id);
                                                    return (
                                                        <option key={sem} value={sem}>Semester {sem}{label ? ` (${label})` : ''}</option>
                                                    );
                                                })}
                                        </select>
                                    </div>
                                )}
                                <div className="flex flex-col gap-1">
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 relative">
                            {loading && (
                                <div className="absolute inset-x-0 -top-4 flex justify-center z-10 transition-opacity duration-300">
                                    <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2 text-sm font-bold text-indigo-700">
                                        <div className="animate-spin w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full"></div>
                                        Updating stats...
                                    </div>
                                </div>
                            )}

                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Working Days</p>
                                        <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.workingDays}</p>
                                    </div>
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><CalendarDays className="w-5 h-5" /></div>
                                </div>
                            </div>
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Lectures</p>
                                        <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.totalSessions}</p>
                                    </div>
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Calendar className="w-5 h-5" /></div>
                                </div>
                            </div>
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Students</p>
                                        <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.totalStudents}</p>
                                    </div>
                                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Users className="w-5 h-5" /></div>
                                </div>
                            </div>
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Avg Attendance</p>
                                        <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.averageAttendance}%</p>
                                    </div>
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><TrendingUp className="w-5 h-5" /></div>
                                </div>
                            </div>
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Subjects</p>
                                        <p className="text-gray-900 text-2xl font-bold mt-1">{data.subjects.length}</p>
                                    </div>
                                    <div className="p-2 bg-orange-50 text-orange-600 rounded-xl"><BookOpen className="w-5 h-5" /></div>
                                </div>
                            </div>
                        </div>

                        {/* Subject-wise Performance */}
                        {data.subjects.length > 0 && (
                            <div className="shadow-sm bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <BookOpen className="w-5 h-5 text-indigo-500" />
                                        Subject-wise Performance
                                    </h3>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {data.subjects.map((subject, idx) => (
                                            <div key={`${subject.id}-${idx}`} className="p-5 bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h3 className="font-bold text-gray-900">{subject.paperCode || subject.code} - {subject.name}</h3>
                                                        <p className="text-xs font-medium text-gray-500 mt-0.5">({subject.code}) Sem {subject.semester} • {subject.sessions} lectures</p>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getAttendanceColor(subject.attendance)}`}>
                                                        {subject.attendance}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-50 rounded-full h-2.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(subject.attendance)}`}
                                                        style={{ width: `${subject.attendance}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-3 text-xs font-medium text-gray-500">
                                                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {subject.students} students</span>
                                                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {subject.sessions} lectures</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Day-by-Day Breakdown (Syllabus Progression) */}
                        {data.dailyBreakdown.length > 0 && (
                            <div className="shadow-sm bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <CalendarDays className="w-5 h-5 text-emerald-500" />
                                        Day-by-Day Syllabus Tracker
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white text-gray-500 font-semibold border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-4 text-xs tracking-wider uppercase">Date</th>
                                                <th className="px-6 py-4 text-xs tracking-wider uppercase">Topic Taught</th>
                                                <th className="px-6 py-4 text-xs tracking-wider uppercase text-center">Total</th>
                                                <th className="px-6 py-4 text-xs tracking-wider uppercase text-center">Present</th>
                                                <th className="px-6 py-4 text-xs tracking-wider uppercase text-center">Absent</th>
                                                <th className="px-6 py-4 text-xs tracking-wider uppercase text-center">Attendance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {data.dailyBreakdown.map((day) => (
                                                <tr key={day.date} className="bg-white hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-indigo-700 max-w-[250px] truncate" title={day.topics}>
                                                        {day.topics ? `📖 ${day.topics}` : <span className="text-gray-300">-</span>}
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-sm font-medium text-gray-600">{day.total}</td>
                                                    <td className="px-6 py-4 text-center text-sm font-bold text-emerald-600">{day.present}</td>
                                                    <td className="px-6 py-4 text-center text-sm font-bold text-red-600">{day.absent}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${getAttendanceColor(day.percentage)}`}>
                                                            {day.percentage}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </main>
        </div>
    );
}
