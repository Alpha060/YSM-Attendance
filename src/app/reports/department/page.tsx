'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

import { ArrowLeft, Users, BookOpen, AlertCircle, AlertTriangle, Building2, TrendingUp, GraduationCap, ChevronRight, FileDown, FileSpreadsheet } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import * as XLSX from 'xlsx';

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
}

interface SemesterStat {
    semester: number;
    totalStudents: number;
    avgAttendance: number;
}

interface SubjectStat {
    id: string;
    name: string;
    code: string;
    semester: number;
    totalStudents: number;
    avgAttendance: number;
}

interface StudentAlert {
    id: string;
    studentId?: string;
    rollNumber: string;
    name: string;
    semester: number;
    attendancePercentage: number;
}

interface DepartmentData {
    department: Department & { degreeType: string };
    overallStats: {
        totalStudents: number;
        totalSubjects: number;
        criticalCount: number;
        warningCount: number;
    };
    semesterStats: SemesterStat[];
    subjectStats: SubjectStat[];
    criticalStudents: StudentAlert[];
    warningStudents: StudentAlert[];
}

export default function DepartmentOverviewPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [data, setData] = useState<DepartmentData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'semester' | 'subject' | 'critical' | 'warning'>('semester');

    // Real-time updates
    useRealtimeData({
        tables: ['attendance_records'],
        onTableChange: useCallback(() => {
            if (selectedDepartmentId) fetchDepartmentData(true);
        }, [selectedDepartmentId]),
    });

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        
        if (parsedUser.role === 'teacher') {
            router.push('/reports');
            return;
        }

        setUser({
            ...parsedUser,
            lastName: parsedUser.lastName || '',
            email: parsedUser.email || '',
            firstName: parsedUser.firstName || 'User'
        });

        if (parsedUser.role === 'super_admin') {
            fetchDepartments(token);
        } else if (parsedUser.role === 'hod') {
            fetchTeacherDepartments(token, parsedUser.id, parsedUser.departmentId);
        } else {
            if (parsedUser.departmentId) {
                setSelectedDepartmentId(parsedUser.departmentId);
            } else {
                setLoading(false);
            }
        }
    }, [router]);



    useEffect(() => {
        if (selectedDepartmentId) {
            fetchDepartmentData();
        }
    }, [selectedDepartmentId]);

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await res.json();
            const depts = result.departments || [];
            setDepartments(depts);
            if (depts.length > 0) {
                setSelectedDepartmentId(depts[0].id);
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error('Error fetching departments:', err);
            setLoading(false);
        }
    };

    const fetchTeacherDepartments = async (token: string, teacherId: string, defaultDeptId?: string) => {
        try {
            const res = await fetch('/api/me/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const depts = data.departments || [];
            if (depts.length > 0) {
                setDepartments(depts);
                if (defaultDeptId && depts.find((d: Department) => d.id === defaultDeptId)) {
                    setSelectedDepartmentId(defaultDeptId);
                } else {
                    setSelectedDepartmentId(depts[0].id);
                }
            } else {
                if (defaultDeptId) {
                    setSelectedDepartmentId(defaultDeptId);
                } else {
                    setLoading(false);
                }
            }
        } catch (err) {
            console.error('Error fetching teacher departments:', err);
            setLoading(false);
        }
    };

    const fetchDepartmentData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/reports/department?departmentId=${selectedDepartmentId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            if (res.status === 403) {
                router.push('/reports');
                return;
            }
            const result = await res.json();
            if (result.error) {
                setData(null);
            } else {
                setData(result);
            }
        } catch (err) {
            console.error('Error fetching department data:', err);
            setData(null);
        }
        if (!silent) setLoading(false);
    };

    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 75) return 'text-emerald-600';
        if (percentage >= 60) return 'text-amber-600';
        return 'text-red-600';
    };

    const getProgressGradient = (percentage: number) => {
        if (percentage >= 75) return 'from-emerald-400 to-emerald-600';
        if (percentage >= 60) return 'from-amber-400 to-amber-600';
        return 'from-red-400 to-red-600';
    };

    const getBgColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-50 border-emerald-200';
        if (percentage >= 60) return 'bg-amber-50 border-amber-200';
        return 'bg-red-50 border-red-200';
    };

    // Export department data
    const exportDepartmentData = (format: 'csv' | 'excel') => {
        if (!data) return;
        const headers = ['Category', 'Name', 'Code/Roll', 'Semester', 'Students', 'Attendance %'];
        const rows: string[][] = [];

        // Semester stats
        data.semesterStats.forEach(s => {
            rows.push(['Semester', `Semester ${s.semester}`, '-', s.semester.toString(), s.totalStudents.toString(), `${s.avgAttendance}%`]);
        });
        // Subject stats
        data.subjectStats.forEach(s => {
            rows.push(['Subject', s.name, s.code, s.semester.toString(), s.totalStudents.toString(), `${s.avgAttendance}%`]);
        });
        // Critical students
        data.criticalStudents.forEach(s => {
            const idAndRoll = s.studentId ? `${s.studentId} / ${s.rollNumber}` : s.rollNumber;
            rows.push(['Critical Student', s.name, idAndRoll, s.semester.toString(), '-', `${s.attendancePercentage}%`]);
        });
        // Warning students
        data.warningStudents.forEach(s => {
            const idAndRoll = s.studentId ? `${s.studentId} / ${s.rollNumber}` : s.rollNumber;
            rows.push(['Warning Student', s.name, idAndRoll, s.semester.toString(), '-', `${s.attendancePercentage}%`]);
        });

        const filename = `department_${data.department?.name || 'report'}`;
        if (format === 'csv') {
            const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Department');
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };

    if (!user) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar 
                isOpen={sidebarOpen} 
                onClose={() => setSidebarOpen(false)} 
                user={user}
                onLogout={handleLogout}
            />

            <Navbar 
                user={user} 
                onMenuClick={() => setSidebarOpen(true)}
                onLogout={handleLogout}
            />

            {/* Main Content */}
            <main className="flex-1 pt-20 pb-8 px-4 max-w-7xl mx-auto w-full">
            {/* Hero / Welcome Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl mt-4">


                <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-rose-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                        </div>
                        <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                            Department Overview <span className="inline-block animate-bounce">🏢</span>
                        </h1>
                        <p className="text-rose-100 text-sm max-w-xl">
                            {data?.department ? data.department.name : 'View detailed performance metrics, subject-wise analysis, and student alerts.'}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        {/* Department selector */}
                        <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full font-medium text-sm">
                            <Building2 className="w-4 h-4" />
                            {user?.role === 'super_admin' || departments.length > 1 ? (
                                <select 
                                    className="bg-transparent border-none outline-none cursor-pointer focus:ring-0 text-indigo-700 font-semibold"
                                    value={selectedDepartmentId}
                                    onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                >
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <span>{data?.department?.name || 'Department'}</span>
                            )}
                        </div>

                        {/* Export Buttons in Hero */}
                        <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/20">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportDepartmentData('excel')}
                            >
                                <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Excel</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportDepartmentData('csv')}
                            >
                                <FileDown className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">CSV</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                        <p className="text-gray-500">Loading department data...</p>
                    </div>
                ) : !data || !data.overallStats ? (
                    <div className="p-12 text-center shadow-xl bg-white/80 backdrop-blur-sm rounded-2xl">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Data Available</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            No attendance data found for this department. Make sure attendance has been marked for students.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Stats Cards - Enhanced */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Total Students</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.overallStats.totalStudents}</p>
                                        </div>
                                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                            <Users className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Subjects</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.overallStats.totalSubjects}</p>
                                        </div>
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <BookOpen className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Critical (&lt;60%)</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.overallStats.criticalCount}</p>
                                        </div>
                                        <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                            <AlertCircle className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Warning (60-75%)</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.overallStats.warningCount}</p>
                                        </div>
                                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                            <AlertTriangle className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs - Enhanced */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {[
                                { id: 'semester', label: 'Semester-wise', icon: GraduationCap, count: data.semesterStats.length },
                                { id: 'subject', label: 'Subject-wise', icon: BookOpen, count: data.subjectStats.length },
                                { id: 'critical', label: 'Critical', icon: AlertCircle, count: data.overallStats.criticalCount, color: 'red' },
                                { id: 'warning', label: 'Warning', icon: AlertTriangle, count: data.overallStats.warningCount, color: 'amber' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                    className={`flex items-center gap-2 px-3 py-2 md:px-5 md:py-3 rounded-xl text-xs md:text-sm font-medium whitespace-nowrap transition-all ${
                                        activeTab === tab.id
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                                            : 'bg-white text-gray-600 hover:bg-gray-50 shadow-md'
                                    }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                                        activeTab === tab.id 
                                            ? 'bg-white/20' 
                                            : tab.color === 'red' 
                                                ? 'bg-red-100 text-red-600' 
                                                : tab.color === 'amber' 
                                                    ? 'bg-amber-100 text-amber-600' 
                                                    : 'bg-purple-100 text-purple-600'
                                    }`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden rounded-2xl">
                            <div className="p-5">
                                {/* Semester-wise Tab */}
                                {activeTab === 'semester' && (
                                    <div className="space-y-4">
                                        {data.semesterStats.length === 0 ? (
                                            <div className="text-center py-12">
                                                <GraduationCap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                                <p className="text-gray-500">No semester data available</p>
                                            </div>
                                        ) : (
                                            data.semesterStats.map(sem => (
                                                <div 
                                                    key={sem.semester} 
                                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md ${getBgColor(sem.avgAttendance)}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                                            <span className="text-lg font-bold text-purple-600">{sem.semester}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">Semester {sem.semester}</p>
                                                            <p className="text-sm text-gray-500 flex items-center gap-1">
                                                                <Users className="w-3.5 h-3.5" />
                                                                {sem.totalStudents} students enrolled
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-32 hidden sm:block">
                                                            <div className="h-3 bg-gray-200/80 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full bg-linear-to-r ${getProgressGradient(sem.avgAttendance)} transition-all duration-500`}
                                                                    style={{ width: `${Math.min(sem.avgAttendance, 100)}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xl font-bold ${getAttendanceColor(sem.avgAttendance)}`}>
                                                            {sem.avgAttendance}%
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Subject-wise Tab */}
                                {activeTab === 'subject' && (
                                    <div className="space-y-4">
                                        {data.subjectStats.length === 0 ? (
                                            <div className="text-center py-12">
                                                <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                                <p className="text-gray-500">No subject data available</p>
                                            </div>
                                        ) : (
                                            data.subjectStats.map(sub => (
                                                <div 
                                                    key={sub.id} 
                                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md ${getBgColor(sub.avgAttendance)}`}
                                                >
                                                    <div className="flex items-start gap-4 mb-3 sm:mb-0">
                                                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                                                            <BookOpen className="w-5 h-5 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">{sub.name}</p>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                <span className="px-2 py-0.5 bg-white/80 rounded-full text-xs text-gray-600 font-medium">
                                                                    {sub.code}
                                                                </span>
                                                                <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-600 font-medium">
                                                                    Sem {sub.semester}
                                                                </span>
                                                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                                                    <Users className="w-3 h-3" /> {sub.totalStudents}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 pl-16 sm:pl-0">
                                                        <div className="w-24 hidden md:block">
                                                            <div className="h-2.5 bg-gray-200/80 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full bg-linear-to-r ${getProgressGradient(sub.avgAttendance)} transition-all duration-500`}
                                                                    style={{ width: `${Math.min(sub.avgAttendance, 100)}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xl font-bold ${getAttendanceColor(sub.avgAttendance)}`}>
                                                            {sub.avgAttendance}%
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Critical Students Tab */}
                                {activeTab === 'critical' && (
                                    <div className="space-y-4">
                                        {data.criticalStudents.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                                                    <TrendingUp className="w-10 h-10 text-emerald-500" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-emerald-600 mb-1">Excellent!</h3>
                                                <p className="text-gray-500">No students with critical attendance</p>
                                            </div>
                                        ) : (
                                            data.criticalStudents.map((student, index) => (
                                                <div 
                                                    key={student.id} 
                                                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white rounded-2xl border border-gray-100 hover:border-red-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative group"
                                                    onClick={() => router.push(`/reports/students?status=critical`)}
                                                >
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 rounded-l-2xl"></div>
                                                    <div className="flex items-center gap-4 relative z-10 pl-2">
                                                        <div className="w-12 h-12 rounded-full bg-red-50 flex shrink-0 items-center justify-center border border-red-100">
                                                            <span className="text-lg font-bold text-red-600">{index + 1}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 text-base">{student.name}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-sm text-gray-500">ID: {student.studentId || '-'}</span>
                                                                <span className="text-sm text-gray-500 ml-1">Roll: {student.rollNumber}</span>
                                                                <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 rounded-full text-gray-600 ml-1">
                                                                    Sem {student.semester}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 relative z-10 mt-4 sm:mt-0 self-end sm:self-auto">
                                                        <span className="text-2xl font-bold text-red-600 tracking-tight">{student.attendancePercentage}%</span>
                                                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border border-gray-200 group-hover:bg-red-50 group-hover:border-red-200 transition-colors">
                                                            <ChevronRight className="w-5 h-5 text-red-400 group-hover:text-red-600" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Warning Students Tab */}
                                {activeTab === 'warning' && (
                                    <div className="space-y-4">
                                        {data.warningStudents.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                                                    <TrendingUp className="w-10 h-10 text-emerald-500" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-emerald-600 mb-1">Great News!</h3>
                                                <p className="text-gray-500">No students in warning zone</p>
                                            </div>
                                        ) : (
                                            data.warningStudents.map((student, index) => (
                                                <div 
                                                    key={student.id} 
                                                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-white rounded-2xl border border-gray-100 hover:border-amber-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer relative group"
                                                    onClick={() => router.push(`/reports/students?status=warning`)}
                                                >
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500 rounded-l-2xl"></div>
                                                    <div className="flex items-center gap-4 relative z-10 pl-2">
                                                        <div className="w-12 h-12 rounded-full bg-amber-50 flex shrink-0 items-center justify-center border border-amber-100">
                                                            <span className="text-lg font-bold text-amber-600">{index + 1}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 text-base">{student.name}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-sm text-gray-500">ID: {student.studentId || '-'}</span>
                                                                <span className="text-sm text-gray-500 ml-1">Roll: {student.rollNumber}</span>
                                                                <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 rounded-full text-gray-600 ml-1">
                                                                    Sem {student.semester}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 relative z-10 mt-4 sm:mt-0 self-end sm:self-auto">
                                                        <span className="text-2xl font-bold text-amber-600 tracking-tight">{student.attendancePercentage}%</span>
                                                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border border-gray-200 group-hover:bg-amber-50 group-hover:border-amber-200 transition-colors">
                                                            <ChevronRight className="w-5 h-5 text-amber-400 group-hover:text-amber-600" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
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
