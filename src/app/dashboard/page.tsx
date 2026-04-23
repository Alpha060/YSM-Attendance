'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    Building2,
    BookOpen,
    Users,
    GraduationCap,
    CalendarDays,
    BarChart3,
    ClipboardCheck,
    UsersRound,
    Settings,
    ChevronRight,
    BookCheck,
    TrendingUp,
    CalendarClock
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId: string | null;
}

interface DashboardCard {
    id: string;
    title: string;
    description: string;
    href: string;
    iconComponent: React.ReactNode;
    gradient: string;
    textColor: string;
    borderColor: string;
}

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            setUser(JSON.parse(userData));
        } catch {
            router.replace('/login');
        }
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Loading Dashboard...</p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    const getCards = (): DashboardCard[] => {
        if (user.role === 'super_admin') {
            return [
                {
                    id: 'departments',
                    title: 'Departments',
                    description: 'Manage departments structures & HODs',
                    href: '/departments',
                    iconComponent: <Building2 className="w-6 h-6" />,
                    gradient: 'from-amber-100 to-orange-100',
                    textColor: 'text-amber-700',
                    borderColor: 'border-amber-200'
                },
                {
                    id: 'subjects',
                    title: 'Subjects',
                    description: 'Configure course curriculum & syllabus',
                    href: '/subjects',
                    iconComponent: <BookOpen className="w-6 h-6" />,
                    gradient: 'from-blue-100 to-indigo-100',
                    textColor: 'text-blue-700',
                    borderColor: 'border-blue-200'
                },
                {
                    id: 'teachers',
                    title: 'Teachers',
                    description: 'Manage faculty profiles & assignments',
                    href: '/teachers',
                    iconComponent: <Users className="w-6 h-6" />,
                    gradient: 'from-rose-100 to-pink-100',
                    textColor: 'text-rose-700',
                    borderColor: 'border-rose-200'
                },
                {
                    id: 'students',
                    title: 'Students',
                    description: 'Manage student enrollments & records',
                    href: '/students',
                    iconComponent: <GraduationCap className="w-6 h-6" />,
                    gradient: 'from-emerald-100 to-teal-100',
                    textColor: 'text-emerald-700',
                    borderColor: 'border-emerald-200'
                },
                {
                    id: 'holidays',
                    title: 'Holidays',
                    description: 'Configure academic calendar events',
                    href: '/holidays',
                    iconComponent: <CalendarDays className="w-6 h-6" />,
                    gradient: 'from-cyan-100 to-sky-100',
                    textColor: 'text-cyan-700',
                    borderColor: 'border-cyan-200'
                },
                {
                    id: 'reports',
                    title: 'Reports',
                    description: 'Analyze attendance & performance stats',
                    href: '/reports',
                    iconComponent: <BarChart3 className="w-6 h-6" />,
                    gradient: 'from-violet-100 to-purple-100',
                    textColor: 'text-violet-700',
                    borderColor: 'border-violet-200'
                },
                {
                    id: 'settings',
                    title: 'Settings',
                    description: 'Platform configs & Batch manager',
                    href: '/settings',
                    iconComponent: <Settings className="w-6 h-6" />,
                    gradient: 'from-slate-100 to-gray-200',
                    textColor: 'text-slate-700',
                    borderColor: 'border-slate-300'
                }
            ];
        } else if (user.role === 'hod') {
            return [
                {
                    id: 'attendance',
                    title: 'Attendance',
                    description: 'Mark and verify daily attendance',
                    href: '/attendance',
                    iconComponent: <ClipboardCheck className="w-6 h-6" />,
                    gradient: 'from-emerald-100 to-teal-100',
                    textColor: 'text-emerald-700',
                    borderColor: 'border-emerald-200'
                },
                {
                    id: 'class-schedule',
                    title: "Today's Classes",
                    description: 'Assign daily class schedule to teachers',
                    href: '/class-schedule',
                    iconComponent: <CalendarClock className="w-6 h-6" />,
                    gradient: 'from-teal-100 to-cyan-100',
                    textColor: 'text-teal-700',
                    borderColor: 'border-teal-200'
                },
                {
                    id: 'teachers',
                    title: 'My Teachers',
                    description: 'Oversee department faculty members',
                    href: '/teachers',
                    iconComponent: <Users className="w-6 h-6" />,
                    gradient: 'from-rose-100 to-pink-100',
                    textColor: 'text-rose-700',
                    borderColor: 'border-rose-200'
                },
                {
                    id: 'students',
                    title: 'My Students',
                    description: 'Track department student progress',
                    href: '/students',
                    iconComponent: <GraduationCap className="w-6 h-6" />,
                    gradient: 'from-blue-100 to-indigo-100',
                    textColor: 'text-blue-700',
                    borderColor: 'border-blue-200'
                },
                {
                    id: 'subjects',
                    title: 'My Subjects',
                    description: 'Manage department course offerings',
                    href: '/subjects',
                    iconComponent: <BookOpen className="w-6 h-6" />,
                    gradient: 'from-amber-100 to-orange-100',
                    textColor: 'text-amber-700',
                    borderColor: 'border-amber-200'
                },
                {
                    id: 'holidays',
                    title: 'Holidays',
                    description: 'Manage department holidays & calendar',
                    href: '/holidays',
                    iconComponent: <CalendarDays className="w-6 h-6" />,
                    gradient: 'from-cyan-100 to-sky-100',
                    textColor: 'text-cyan-700',
                    borderColor: 'border-cyan-200'
                },
                {
                    id: 'reports',
                    title: 'Department Reports',
                    description: 'View detailed analytical insights',
                    href: '/reports',
                    iconComponent: <BarChart3 className="w-6 h-6" />,
                    gradient: 'from-violet-100 to-purple-100',
                    textColor: 'text-violet-700',
                    borderColor: 'border-violet-200'
                },
                {
                    id: 'my-reports',
                    title: 'My Reports',
                    description: 'Your personal teaching statistics',
                    href: '/my-reports',
                    iconComponent: <TrendingUp className="w-6 h-6" />,
                    gradient: 'from-indigo-100 to-blue-100',
                    textColor: 'text-indigo-700',
                    borderColor: 'border-indigo-200'
                },
            ];
        } else {
            return [
                {
                    id: 'attendance',
                    title: 'Mark Attendance',
                    description: 'Record daily class attendance',
                    href: '/attendance',
                    iconComponent: <ClipboardCheck className="w-6 h-6" />,
                    gradient: 'from-emerald-100 to-teal-100',
                    textColor: 'text-emerald-700',
                    borderColor: 'border-emerald-200'
                },
                {
                    id: 'classes',
                    title: 'My Classes',
                    description: 'View your assigned schedule',
                    href: '/classes',
                    iconComponent: <UsersRound className="w-6 h-6" />,
                    gradient: 'from-blue-100 to-indigo-100',
                    textColor: 'text-blue-700',
                    borderColor: 'border-blue-200'
                },
                {
                    id: 'reports',
                    title: 'Reports',
                    description: 'View student attendance reports',
                    href: '/reports',
                    iconComponent: <BarChart3 className="w-6 h-6" />,
                    gradient: 'from-violet-100 to-purple-100',
                    textColor: 'text-violet-700',
                    borderColor: 'border-violet-200'
                },
            ];
        }
    };

    const cards = getCards();
    const roleLabel = user.role.replace('_', ' ').toUpperCase();

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            <MobileSidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                user={user}
                onLogout={handleLogout}
            />

            {/* Navbar */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">

                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>

                    <div className="relative z-10">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">
                                    Hello, {user.firstName}! <span className="inline-block animate-wave">👋</span>
                                </h1>
                                <p className="text-blue-100 text-sm max-w-xl">
                                    Welcome to your dashboard. You have <span className="font-semibold text-white">full access</span> to manage {user.role === 'super_admin' ? 'the entire institution' : 'your academic duties'}.
                                </p>
                            </div>
                            <BookCheck className="hidden sm:block w-12 h-12 text-blue-200 opacity-80" />
                        </div>

                        <div className="mt-8 flex gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <UsersRound className="w-4 h-4" />
                                {roleLabel}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <CalendarDays className="w-4 h-4" />
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Grid Title */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Quick Access</h2>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                    {cards.map((card) => (
                        <div
                            key={card.id}
                            onClick={() => router.push(card.href)}
                            className={`group relative bg-white p-4 sm:p-6 rounded-2xl shadow-sm border ${card.borderColor} hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden`}
                        >
                            {/* Decorative gradient blob */}
                            <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-linear-to-br ${card.gradient} opacity-20 group-hover:scale-150 transition-transform duration-500`}></div>

                            <div className="relative flex items-start justify-between mb-3 sm:mb-4">
                                <div className={`p-2.5 sm:p-3 rounded-xl bg-linear-to-br ${card.gradient} ${card.textColor}`}>
                                    {card.iconComponent}
                                </div>
                                <div className="p-1.5 sm:p-2 rounded-full bg-gray-50 text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                            </div>

                            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
                                {card.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed line-clamp-2">
                                {card.description}
                            </p>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
