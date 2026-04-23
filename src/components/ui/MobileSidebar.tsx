'use client';

import { useEffect, useState } from 'react';
import {
    X,
    Settings,
    LayoutDashboard,
    Building2,
    BookOpen,
    Users,
    GraduationCap,
    CalendarDays,
    BarChart3,
    ClipboardCheck,
    UsersRound,
    User,
    TrendingUp
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { getInitials } from '@/lib/utils';
import { ProfileModal } from './ProfileModal';

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: {
        role: string;
        [key: string]: any;
    };
    onLogout?: () => void;
}

export function MobileSidebar({ isOpen, onClose, user, onLogout }: MobileSidebarProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            // Allow DOM to mount before triggering transition
            const timer = setTimeout(() => setIsMounted(true), 10);
            return () => clearTimeout(timer);
        } else {
            setIsMounted(false);
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible) return null;

    const navigateTo = (href: string) => {
        onClose();
        router.push(href);
    };

    const getNavLinks = () => {
        const commonLinks = [
            { id: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
        ];

        if (user.role === 'super_admin') {
            return [
                ...commonLinks,
                { id: 'departments', title: 'Departments', href: '/departments', icon: <Building2 className="w-5 h-5" /> },
                { id: 'subjects', title: 'Subjects', href: '/subjects', icon: <BookOpen className="w-5 h-5" /> },
                { id: 'teachers', title: 'Teachers', href: '/teachers', icon: <Users className="w-5 h-5" /> },
                { id: 'students', title: 'Students', href: '/students', icon: <GraduationCap className="w-5 h-5" /> },
                { id: 'holidays', title: 'Holidays', href: '/holidays', icon: <CalendarDays className="w-5 h-5" /> },
                { id: 'reports', title: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
            ];
        } else if (user.role === 'hod') {
            return [
                ...commonLinks,
                { id: 'attendance', title: 'Attendance', href: '/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
                { id: 'classes', title: "My Classes", href: '/classes', icon: <UsersRound className="w-5 h-5" /> },
                { id: 'teachers', title: 'My Teachers', href: '/teachers', icon: <Users className="w-5 h-5" /> },
                { id: 'students', title: 'My Students', href: '/students', icon: <GraduationCap className="w-5 h-5" /> },
                { id: 'subjects', title: 'My Subjects', href: '/subjects', icon: <BookOpen className="w-5 h-5" /> },
                { id: 'reports', title: 'Department Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
                { id: 'my-reports', title: 'My Reports', href: '/my-reports', icon: <TrendingUp className="w-5 h-5" /> },
            ];
        } else {
            return [
                ...commonLinks,
                { id: 'attendance', title: 'Mark Attendance', href: '/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
                { id: 'classes', title: 'My Classes', href: '/classes', icon: <UsersRound className="w-5 h-5" /> },
                { id: 'reports', title: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
            ];
        }
    };

    const navLinks = getNavLinks();

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-slate-900/40 z-40 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div
                className={`fixed left-0 top-0 h-full w-72 bg-white/80 backdrop-blur-md border-r border-gray-100 shadow-xl z-50 flex flex-col transition-transform duration-300 ease-out ${isMounted ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header App Branding */}
                <div className="flex flex-col border-b border-gray-100">
                    <div className="flex items-start justify-between p-4">
                        <div className="flex flex-col gap-3 w-full">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center p-0.5 shadow-sm">
                                    <div className="w-full h-full rounded-full border-2 border-white bg-white flex items-center justify-center">
                                        <span className="text-base font-bold bg-clip-text text-transparent bg-linear-to-br from-blue-600 to-purple-600">
                                            {getInitials(user.firstName || '', user.lastName || '')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-bold text-gray-900 leading-tight">
                                        {user.firstName || 'User'} {user.lastName || ''}
                                    </h2>
                                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{user.role?.replace('_', ' ')}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 -mt-3 -mr-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <button
                                onClick={() => setShowProfileModal(true)}
                                className="w-fit inline-flex flex-row items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-blue-300 text-xs font-semibold text-gray-700 hover:text-blue-600 rounded-full shadow-sm hover:shadow transition-all"
                            >
                                <User className="w-3.5 h-3.5" />
                                View Profile Details
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation Links */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-gray-200">
                    <p className="px-3 text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 mt-2">Main Menu</p>

                    {navLinks.map((link) => {
                        const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
                        return (
                            <button
                                key={link.id}
                                onClick={() => navigateTo(link.href)}
                                className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all duration-200 ${isActive
                                        ? 'bg-blue-50/80 text-blue-700 shadow-sm border border-blue-100/50'
                                        : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900 border border-transparent'
                                    }`}
                            >
                                <div className="flex items-center gap-3.5">
                                    <div className={`transition-transform duration-300 ${isActive ? 'text-blue-600 scale-110' : 'text-gray-400 group-hover:text-gray-600 group-hover:scale-110'}`}>
                                        {link.icon}
                                    </div>
                                    <span className={`text-sm tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>
                                        {link.title}
                                    </span>
                                </div>

                                {isActive && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
                    {user.role === 'super_admin' && (
                        <button
                            onClick={() => navigateTo('/settings')}
                            className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all duration-200 ${pathname.startsWith('/settings')
                                    ? 'bg-blue-50/80 text-blue-700 shadow-sm border border-blue-100/50'
                                    : 'bg-white text-gray-700 hover:text-blue-700 border border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-md'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`transition-transform duration-300 ${pathname.startsWith('/settings') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`}>
                                    <Settings className="w-5 h-5" />
                                </div>
                                <span className={`text-sm tracking-wide ${pathname.startsWith('/settings') ? 'font-bold' : 'font-medium'}`}>
                                    Settings & Config
                                </span>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            <ProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                user={user as any}
                onLogout={onLogout}
            />
        </>
    );
}
