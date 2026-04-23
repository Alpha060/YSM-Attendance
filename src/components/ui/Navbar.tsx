import { useState } from 'react';
import { Menu, GraduationCap, ArrowLeft, LogOut, Lock } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { ProfileModal } from './ProfileModal';
import { getInitials } from '@/lib/utils';

interface User {
    firstName: string;
    lastName: string;
    role: string;
}

interface NavbarProps {
    user: User | null;
    onMenuClick: () => void;
    onLogout?: () => void;
    backUrl?: string;
    backLabel?: string;
}

export function Navbar({ user, onMenuClick, onLogout, backUrl, backLabel }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [showProfileModal, setShowProfileModal] = useState(false);

    const handleLogout = () => {
        if (onLogout) {
            onLogout();
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            router.replace('/login');
        }
    };

    return (
        <>
            <header className="fixed top-0 w-full z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onMenuClick}
                            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg"
                        >
                            <Menu className="w-6 h-6 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/dashboard')}>
                            <div className="bg-white p-1 rounded-full h-9 w-9 flex items-center justify-center overflow-hidden border border-blue-100 shadow-sm">
                                <img src="/college-logo.png" alt="YSM Logo" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-lg font-bold bg-clip-text text-transparent bg-linear-to-r from-orange-600 to-blue-700 hidden sm:block">
                                YSM Ranchi
                            </span>
                        </div>
                        {!pathname.includes('/dashboard') && (
                            <div className="hidden md:flex items-center ml-2 pl-4 border-l border-gray-200 h-6">
                                <button
                                    onClick={() => router.back()}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {user && (
                            <div
                                className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1.5 pr-2 rounded-full transition-colors"
                                onClick={() => setShowProfileModal(true)}
                            >
                                <div className="hidden sm:flex flex-col items-end mr-1">
                                    <span className="text-sm font-bold text-gray-900 leading-none">
                                        {user.firstName} {user.lastName}
                                    </span>
                                    <span className="text-[10px] font-medium text-gray-500 capitalize leading-tight mt-0.5">
                                        {user.role.replace('_', ' ')}
                                    </span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-linear-to-tr from-blue-500 to-purple-500 p-0.5 shadow-sm">
                                    <div className="h-full w-full rounded-full bg-white flex items-center justify-center text-xs font-bold text-blue-700">
                                        {getInitials(user.firstName, user.lastName)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </header>

            {user && (
                <ProfileModal
                    isOpen={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    user={user as any}
                    onLogout={handleLogout}
                />
            )}
        </>
    );
}
