'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CalendarDays, TrendingUp, TrendingDown, BarChart3, Filter, ChevronDown, AlertCircle } from 'lucide-react';
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
    const { getActiveSemesters, getBatchLabel } = useActiveSemesters();

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
                                            onChange={(e) => setSelectedDepartmentId(e.target.value)}
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
