'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Calendar, FileUp, FileSpreadsheet, Download, AlertTriangle, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { AccessDenied } from '@/components/ui/access-denied';

interface Holiday {
    id: string;
    name: string;
    date: string;
    description: string | null;
    department_id: string | null;
}

interface User {
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId?: string;
}

export default function HolidaysPage() {
    const router = useRouter();
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', date: '', description: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Import States
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [importResults, setImportResults] = useState<{ success: number; failed: number; total: number; errors: any[] } | null>(null);
    const [isImporting, setIsImporting] = useState(false);

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
            const cached = sessionStorage.getItem('cache_holidays');
            if (cached) {
                setHolidays(JSON.parse(cached));
                setLoading(false);
            }
        } catch { /* ignore cache errors */ }

        fetchHolidays(token);
    }, [router]);

    // Real-time updates
    useRealtimeData({
        tables: ['holidays'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token) fetchHolidays(token);
        }, []),
    });

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const fetchHolidays = async (token: string) => {
        try {
            const res = await fetch('/api/holidays', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const holidaysList = data.holidays || [];
            setHolidays(holidaysList);
            try { sessionStorage.setItem('cache_holidays', JSON.stringify(holidaysList)); } catch { }
        } catch (err) {
            console.error('Error fetching holidays:', err);
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const token = localStorage.getItem('token');

        try {
            const res = await fetch('/api/holidays', {
                method: 'POST',
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
            setFormData({ name: '', date: '', description: '' });
            fetchHolidays(token!);
        } catch (err) {
            setError('Network error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this holiday?')) return;
        const token = localStorage.getItem('token');

        try {
            await fetch(`/api/holidays/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            fetchHolidays(token!);
        } catch (err) {
            console.error('Error deleting:', err);
        }
    };

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return {
            day: date.getDate(),
            month: date.toLocaleDateString('en-US', { month: 'short' }),
            weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
            full: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        };
    };

    // ========== Import Functions ==========
    const normalizeData = (data: any[]) => {
        const keyMap: { [key: string]: string } = {
            'name': 'name', 'holiday name': 'name', 'holiday_name': 'name', 'holidayname': 'name',
            'holiday': 'name', 'title': 'name', 'event': 'name', 'name*': 'name',
            'date': 'date', 'holiday date': 'date', 'holiday_date': 'date', 'holidaydate': 'date',
            'date*': 'date', 'day': 'date',
            'description': 'description', 'desc': 'description', 'remarks': 'description',
            'details': 'description', 'note': 'description', 'notes': 'description',
        };

        return data.map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                const lowerKey = key.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                let mappedKey = null;
                for (const [mapK, mapV] of Object.entries(keyMap)) {
                    if (mapK.replace(/[^a-z0-9]/g, '') === lowerKey) {
                        mappedKey = mapV;
                        break;
                    }
                }
                newRow[mappedKey || key] = row[key];
            });
            return newRow;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
        setPreviewData([]);
        setImportResults(null);
        setError('');
        setSuccess('');

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => setPreviewData(results.data.slice(0, 5)),
                error: () => setError('Failed to parse CSV file')
            });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                setPreviewData(data.slice(0, 5));
            };
            reader.readAsBinaryString(file);
        } else {
            setError('Please upload a valid CSV or Excel file');
            setImportFile(null);
        }
    };

    const downloadTemplate = () => {
        const headers = ['name*', 'date*', 'description'];
        const dummyData = [
            ['Republic Day', '26/01/2026', 'National holiday'],
            ['Holi', '17/03/2026', 'Festival of colors'],
            ['Independence Day', '15/08/2026', 'National holiday'],
            ['Gandhi Jayanti', '02/10/2026', ''],
            ['Diwali', '01/11/2026', 'Festival of lights'],
            ['Christmas', '25/12/2026', ''],
        ];
        const csvContent = [headers.join(','), ...dummyData.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'holidays_template.csv';
        a.click();
    };

    const handleImport = async () => {
        if (!importFile) return;
        setIsImporting(true);
        setError('');
        setSuccess('');

        const processImport = async (rawData: any[]) => {
            const data = normalizeData(rawData);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/holidays/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ holidays: data })
                });

                const result = await res.json();
                if (res.ok) {
                    setImportResults(result);
                    if (result.success > 0) {
                        fetchHolidays(token!);
                        setSuccess(`Successfully imported ${result.success} holiday(s)!`);
                    }
                } else {
                    setError(result.error || 'Import failed');
                }
            } catch {
                setError('Network error occurred during import');
            }
            setIsImporting(false);
        };

        if (importFile.name.endsWith('.csv')) {
            Papa.parse(importFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => processImport(results.data)
            });
        } else {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                processImport(data);
            };
            reader.readAsBinaryString(importFile);
        }
    };

    if (loading) return <PageSkeleton type="holidays" />;

    if (user?.role === 'teacher') {
        return <AccessDenied />;
    }

    const isSuperAdmin = user?.role === 'super_admin';
    const isHOD = user?.role === 'hod';
    const canManageHolidays = isSuperAdmin || isHOD;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role, firstName: (user as any).firstName || 'User', lastName: (user as any).lastName || '', email: (user as any).email || '' }}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar user={user as any} onMenuClick={() => setSidebarOpen(true)} />

            {/* Page Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="p-2 bg-cyan-100 text-cyan-700 rounded-lg">
                                <Calendar className="w-6 h-6" />
                            </span>
                            Holidays
                        </h1>
                        <p className="text-gray-500 text-sm mt-1 ml-11">
                            {holidays.length} holidays configured
                        </p>
                    </div>
                    {canManageHolidays && (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setShowImportModal(true)} className="hidden md:flex">
                                <FileUp className="w-4 h-4 mr-2" />
                                Import CSV
                            </Button>
                            <Button onClick={() => setShowModal(true)} className="bg-gray-900 hover:bg-gray-800 hidden md:flex">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Holiday
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 py-8 max-w-7xl mx-auto w-full px-4">

                {/* Desktop Content */}
                <main className="hidden md:block max-w-7xl mx-auto px-4 py-8">
                    {holidays.length === 0 ? (
                        <Card>
                            <CardContent className="py-8 text-center text-gray-500">
                                No holidays found. {canManageHolidays && 'Add your first holiday!'}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-center text-sm font-semibold w-16">S.No.</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Description</th>
                                        {canManageHolidays && <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {holidays.map((holiday, index) => (
                                        <tr key={holiday.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-4 text-center text-sm font-medium text-gray-500">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded font-mono border border-cyan-100">
                                                    {new Date(holiday.date).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium">{holiday.name}</td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {holiday.description || '-'}
                                                {holiday.department_id === null && <span className="ml-2 inline-block px-2 text-xs rounded-full bg-indigo-100 text-indigo-700">Global</span>}
                                                {holiday.department_id && <span className="ml-2 inline-block px-2 text-xs rounded-full bg-orange-100 text-orange-700">Dept</span>}
                                            </td>
                                            {canManageHolidays && (
                                                <td className="px-6 py-4">
                                                    {(isSuperAdmin || (isHOD && holiday.department_id === user?.departmentId)) && (
                                                        <Button variant="outline" size="sm" onClick={() => handleDelete(holiday.id)} className="text-red-500 hover:text-red-700">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </main>

                {/* Mobile Content */}
                <main className="md:hidden px-4 py-2 pb-24">
                    {holidays.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
                            No holidays found. {canManageHolidays && 'Add your first holiday!'}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {holidays.map((holiday) => {
                                const dateInfo = formatDate(holiday.date);
                                return (
                                    <div
                                        key={holiday.id}
                                        className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-cyan-400 flex gap-4"
                                    >
                                        {/* Date Box */}
                                        <div className="shrink-0 w-14 h-14 bg-cyan-50 rounded-xl flex flex-col items-center justify-center">
                                            <span className="text-lg font-bold text-cyan-800">{dateInfo.day}</span>
                                            <span className="text-xs text-cyan-600">{dateInfo.month}</span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                                                {holiday.name}
                                            </h3>
                                            <p className="text-xs text-gray-500 mb-1">{dateInfo.weekday}</p>
                                            {holiday.description && (
                                                <p className="text-sm text-gray-600 truncate">{holiday.description}</p>
                                            )}
                                        </div>

                                        {/* Delete Button */}
                                        {canManageHolidays && (
                                            <div className="shrink-0 self-start">
                                                {(isSuperAdmin || (isHOD && holiday.department_id === user?.departmentId)) && (
                                                    <button
                                                        onClick={() => handleDelete(holiday.id)}
                                                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>

                {/* Mobile Floating Buttons */}
                {canManageHolidays && (
                    <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3">
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="w-12 h-12 bg-white text-gray-700 rounded-full shadow-lg border border-gray-200 flex items-center justify-center"
                        >
                            <FileUp className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center"
                        >
                            <Plus className="w-6 h-6" />
                        </button>
                    </div>
                )}

                {/* Add Holiday Modal */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-md">
                            <CardHeader>
                                <CardTitle>Add Holiday</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <Label htmlFor="name">Holiday Name *</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Independence Day"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="date">Date *</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="description">Description</Label>
                                        <Input
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Optional description"
                                        />
                                    </div>
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                    <div className="flex gap-2 justify-end">
                                        <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                                            Cancel
                                        </Button>
                                        <Button type="submit">Save</Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Import Modal */}
                {showImportModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <Card className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                            <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <FileSpreadsheet className="w-5 h-5 text-cyan-600" />
                                        Import Holidays
                                    </CardTitle>
                                    <button onClick={() => { setShowImportModal(false); setImportFile(null); setPreviewData([]); setImportResults(null); setError(''); setSuccess(''); }}>
                                        <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-6">
                                {/* Step 1: Download Template */}
                                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
                                    <h3 className="font-semibold text-cyan-900 mb-2 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-cyan-600 text-white rounded-full text-xs flex items-center justify-center font-bold">1</span>
                                        Download Template
                                    </h3>
                                    <p className="text-sm text-cyan-700 mb-3">
                                        Download the CSV template, fill in your holidays (name, date in DD/MM/YYYY format, optional description), and upload below.
                                    </p>
                                    <Button variant="outline" onClick={downloadTemplate} className="bg-white">
                                        <Download className="w-4 h-4 mr-2" />
                                        Download Template
                                    </Button>
                                </div>

                                {/* Step 2: Upload File */}
                                <div className="border border-gray-200 rounded-xl p-4">
                                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                                        <span className="w-6 h-6 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center font-bold">2</span>
                                        Upload File
                                    </h3>
                                    <div className="mt-2">
                                        <input
                                            type="file"
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleFileChange}
                                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {/* Preview */}
                                {previewData.length > 0 && (
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                                            <h3 className="font-semibold text-gray-700 text-sm">Preview (first 5 rows)</h3>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50/50">
                                                    <tr>
                                                        {Object.keys(previewData[0]).map(key => (
                                                            <th key={key} className="px-4 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{key}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {previewData.map((row, i) => (
                                                        <tr key={i} className="hover:bg-gray-50/50">
                                                            {Object.values(row).map((val: any, j) => (
                                                                <td key={j} className="px-4 py-2 text-gray-700 whitespace-nowrap">{val?.toString() || ''}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Import Results */}
                                {importResults && (
                                    <div className={`rounded-xl p-4 border ${importResults.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            {importResults.failed > 0 ? (
                                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                                            ) : (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                            )}
                                            <span className="font-semibold text-gray-900">Import Results</span>
                                        </div>
                                        <div className="flex gap-4 text-sm">
                                            <span className="text-emerald-700">✅ {importResults.success} imported</span>
                                            {importResults.failed > 0 && <span className="text-red-600">❌ {importResults.failed} failed</span>}
                                            <span className="text-gray-500">Total: {importResults.total}</span>
                                        </div>
                                        {importResults.errors.length > 0 && (
                                            <div className="mt-3 space-y-1">
                                                {importResults.errors.map((err, i) => (
                                                    <p key={i} className="text-xs text-red-600">
                                                        Row {err.row} ({err.name}): {err.error}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Error */}
                                {error && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                {/* Success */}
                                {success && (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                                        {success}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 justify-end pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => { setShowImportModal(false); setImportFile(null); setPreviewData([]); setImportResults(null); setError(''); setSuccess(''); }}
                                        className="rounded-xl"
                                    >
                                        Close
                                    </Button>
                                    <Button
                                        onClick={handleImport}
                                        disabled={!importFile || isImporting}
                                        className="rounded-xl bg-gray-900 hover:bg-gray-800"
                                    >
                                        {isImporting ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                                        ) : (
                                            <><FileUp className="w-4 h-4 mr-2" /> Import Holidays</>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
