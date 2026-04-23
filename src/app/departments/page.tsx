'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    Pencil,
    Trash2,
    Search,
    Plus,
    Building2
} from 'lucide-react';
import { AccessDenied } from '@/components/ui/access-denied';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { getInitials } from '@/lib/utils';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface Department {
    id: string;
    name: string;
    code: string;
    dept_type: 'regular' | 'vocational' | 'pg';
    hod_name: string | null;
}

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
}

export default function DepartmentsPage() {
    const router = useRouter();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [formData, setFormData] = useState({ name: '', code: '', deptType: 'regular' as 'regular' | 'vocational' | 'pg' });
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        setUser(JSON.parse(userData));

        // Try loading cached data first for instant display
        try {
            const cached = sessionStorage.getItem('cache_dept_page');
            if (cached) {
                setDepartments(JSON.parse(cached));
                setLoading(false);
            }
        } catch { /* ignore cache errors */ }

        fetchDepartments(token);
    }, [router]);

    // Real-time updates
    useRealtimeData({
        tables: ['departments'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token) fetchDepartments(token);
        }, []),
    });

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const deptsList = data.departments || [];
            setDepartments(deptsList);
            try { sessionStorage.setItem('cache_dept_page', JSON.stringify(deptsList)); } catch { }
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const token = localStorage.getItem('token');

        try {
            const url = editingDept
                ? `/api/departments/${editingDept.id}`
                : '/api/departments';
            const method = editingDept ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to save');
                return;
            }

            setShowModal(false);
            setFormData({ name: '', code: '', deptType: 'regular' });
            setEditingDept(null);
            fetchDepartments(token!);
        } catch (err) {
            setError('Network error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this department?')) return;
        const token = localStorage.getItem('token');

        try {
            await fetch(`/api/departments/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            fetchDepartments(token!);
        } catch (err) {
            console.error('Error deleting:', err);
        }
    };

    const openEditModal = (dept: Department) => {
        setEditingDept(dept);
        setFormData({ name: dept.name, code: dept.code, deptType: dept.dept_type || 'regular' });
        setShowModal(true);
    };

    const openAddModal = () => {
        setEditingDept(null);
        setFormData({ name: '', code: '', deptType: 'regular' });
        setShowModal(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // Filter departments based on search
    const filteredDepartments = departments.filter(dept =>
        dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dept.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (dept.hod_name && dept.hod_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Get initials from HOD name — use shared utility
    const getHodInitials = (name: string | null) => {
        if (!name) return '??';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return getInitials(parts.slice(0, -1).join(' '), parts[parts.length - 1]);
        }
        return getInitials(name, null);
    };

    if (loading) return <PageSkeleton type="departments" />;

    // Only super_admin can access this page
    if (user?.role !== 'super_admin') {
        return <AccessDenied message="You do not have permission to access the Departments page." />;
    }

    const isSuperAdmin = user?.role === 'super_admin';

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

            {/* Navbar (Matches Dashboard) */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            {/* Main Content */}
            <main className="flex-1 pt-24 pb-12 px-4 max-w-7xl mx-auto w-full">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <span className="p-2 rounded-xl bg-amber-100 text-amber-600">
                                <Building2 className="w-8 h-8" />
                            </span>
                            Departments
                        </h1>
                    </div>
                    {isSuperAdmin && (
                        <Button
                            onClick={openAddModal}
                            className="hidden md:flex shrink-0 bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg shadow-gray-900/20"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Department
                        </Button>
                    )}
                </div>

                {/* Search & Statistics Bar */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search departments..."
                            className="pl-10 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-100 shadow-sm text-sm font-medium text-gray-600 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        {filteredDepartments.length} Active Departments
                    </div>
                </div>

                {/* Departments Grid / List */}
                {departments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="bg-amber-50 p-4 rounded-full mb-4">
                            <Building2 className="w-8 h-8 text-amber-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">No departments found</h3>
                        <p className="text-gray-500 max-w-sm text-center mt-1">
                            {isSuperAdmin ? "Get started by adding your first department to the system." : "There are no departments listed yet."}
                        </p>
                        {isSuperAdmin && (
                            <Button onClick={openAddModal} variant="outline" className="mt-4">
                                Add Department
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">S.No.</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department Name</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Head of Dept.</th>
                                        {isSuperAdmin && <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredDepartments.map((dept, index) => (
                                        <tr key={dept.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-4 py-4 text-center text-sm font-medium text-gray-500">{index + 1}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-100">
                                                    {dept.code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900">{dept.name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${dept.dept_type === 'regular' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                    dept.dept_type === 'pg' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                                        'bg-green-50 text-green-700 border border-green-200'
                                                    }`}>
                                                    {dept.dept_type === 'pg' ? 'PG' : dept.dept_type?.charAt(0).toUpperCase() + dept.dept_type?.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="shrink-0 h-8 w-8 rounded-full bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold mr-3">
                                                        {getHodInitials(dept.hod_name)}
                                                    </div>
                                                    <div className="text-sm text-gray-600">{dept.hod_name || <span className="text-gray-400 italic">Unassigned</span>}</div>
                                                </div>
                                            </td>
                                            {isSuperAdmin && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditModal(dept)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(dept.id)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Grid View */}
                        <div className="md:hidden grid grid-cols-1 gap-4">
                            {filteredDepartments.map((dept) => (
                                <div key={dept.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                                                <Building2 className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900">{dept.name}</h3>
                                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block">
                                                    {dept.code}
                                                </span>
                                            </div>
                                        </div>
                                        {isSuperAdmin && (
                                            <div className="flex">
                                                <button
                                                    onClick={() => openEditModal(dept)}
                                                    className="p-2 text-gray-400 hover:text-blue-600"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(dept.id)}
                                                    className="p-2 text-red-500 md:text-gray-400 hover:text-red-600"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 pt-3 border-t border-gray-50">
                                        <div className="h-7 w-7 rounded-full bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                                            {getHodInitials(dept.hod_name)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-500">Head of Department</span>
                                            <span className="text-sm font-medium text-gray-700">
                                                {dept.hod_name || "Unassigned"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>

            {/* Floating Action Button (Mobile) */}
            {isSuperAdmin && (
                <button
                    onClick={openAddModal}
                    className="md:hidden fixed bottom-6 right-6 h-14 w-14 bg-gray-900 text-white rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform z-20"
                >
                    <Plus className="w-6 h-6" />
                </button>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <Card className="w-full max-w-md bg-white rounded-2xl shadow-2xl border-0 overflow-hidden">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                            <CardTitle className="text-xl">{editingDept ? 'Edit Department' : 'New Department'}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-gray-700">Department Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g. Computer Science"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        className="rounded-xl border-gray-200 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="code" className="text-gray-700">Department Code <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="code"
                                        placeholder="e.g. CSE"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                        required
                                        maxLength={10}
                                        className="rounded-xl border-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                    />
                                    <p className="text-xs text-gray-500">Keep it short, e.g., CSE, ME, ECE.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="deptType" className="text-gray-700">Department Type <span className="text-red-500">*</span></Label>
                                    <select
                                        id="deptType"
                                        value={formData.deptType}
                                        onChange={(e) => setFormData({ ...formData, deptType: e.target.value as 'regular' | 'vocational' | 'pg' })}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                        required
                                    >
                                        <option value="regular">Regular (4 Year)</option>
                                        <option value="vocational">Vocational (3 Year)</option>
                                        <option value="pg">PG (Post Graduate)</option>
                                    </select>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                        {error}
                                    </div>
                                )}

                                <div className="flex gap-3 justify-end pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowModal(false)}
                                        className="rounded-xl"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="rounded-xl bg-gray-900 hover:bg-gray-800"
                                    >
                                        {editingDept ? 'Save Changes' : 'Create Department'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
