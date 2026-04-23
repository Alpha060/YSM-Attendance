'use client';

import React from 'react';

// Shimmer animation block
const Shimmer = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

// Skeleton for navbar (always shown at top)
const NavbarSkeleton = () => (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 shadow-sm h-16 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
            <Shimmer className="w-8 h-8 rounded-lg" />
            <Shimmer className="w-32 h-5" />
        </div>
        <div className="flex items-center gap-3">
            <Shimmer className="w-8 h-8 rounded-full" />
        </div>
    </div>
);

// Page header skeleton
const PageHeaderSkeleton = ({ iconColor = 'bg-gray-200' }: { iconColor?: string }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${iconColor} animate-pulse w-12 h-12`} />
                <Shimmer className="w-40 h-8" />
            </div>
            <Shimmer className="w-64 h-4 mt-2 ml-1" />
        </div>
        <div className="flex gap-2">
            <Shimmer className="w-28 h-10 rounded-xl hidden md:block" />
            <Shimmer className="w-32 h-10 rounded-xl hidden md:block" />
        </div>
    </div>
);

// Search/Filter bar skeleton
const FilterBarSkeleton = ({ filters = 2 }: { filters?: number }) => (
    <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex gap-2 w-full md:w-auto">
            {Array.from({ length: filters }).map((_, i) => (
                <Shimmer key={i} className="w-full md:w-40 h-10 rounded-xl" />
            ))}
        </div>
        <Shimmer className="w-full md:w-80 h-10 rounded-xl" />
    </div>
);

// Table row skeleton
const TableRowSkeleton = ({ columns = 5 }: { columns?: number }) => (
    <tr>
        {Array.from({ length: columns }).map((_, i) => (
            <td key={i} className="px-6 py-4">
                <div className="flex items-center gap-3">
                    {i === 0 && <Shimmer className="w-6 h-4" />}
                    {i === 1 && (
                        <>
                            <Shimmer className="w-10 h-10 rounded-xl shrink-0" />
                            <div>
                                <Shimmer className="w-32 h-4 mb-1.5" />
                                <Shimmer className="w-20 h-3" />
                            </div>
                        </>
                    )}
                    {i > 1 && i < columns - 1 && (
                        <div className="flex gap-1">
                            <Shimmer className="w-14 h-6 rounded-full" />
                            {i === 2 && <Shimmer className="w-14 h-6 rounded-full" />}
                        </div>
                    )}
                    {i === columns - 1 && (
                        <div className="flex gap-2 justify-end w-full">
                            <Shimmer className="w-8 h-8 rounded-lg" />
                            <Shimmer className="w-8 h-8 rounded-lg" />
                        </div>
                    )}
                </div>
            </td>
        ))}
    </tr>
);

// Desktop Table skeleton
const TableSkeleton = ({ rows = 6, columns = 5, headers }: { rows?: number; columns?: number; headers?: string[] }) => (
    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
            <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                    {(headers || Array.from({ length: columns })).map((h, i) => (
                        <th key={i} className="px-6 py-4">
                            <Shimmer className="w-20 h-3" />
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {Array.from({ length: rows }).map((_, i) => (
                    <TableRowSkeleton key={i} columns={columns} />
                ))}
            </tbody>
        </table>
    </div>
);

// Mobile card skeleton
const MobileCardSkeleton = ({ count = 4 }: { count?: number }) => (
    <div className="md:hidden space-y-3 pt-4">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                        <Shimmer className="w-10 h-10 rounded-xl shrink-0" />
                        <div>
                            <Shimmer className="w-32 h-5 mb-1.5" />
                            <Shimmer className="w-20 h-3" />
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <Shimmer className="w-8 h-8 rounded-lg" />
                        <Shimmer className="w-8 h-8 rounded-lg" />
                    </div>
                </div>
                <div className="pt-3 border-t border-gray-50 flex gap-2">
                    <Shimmer className="w-16 h-6 rounded-full" />
                    <Shimmer className="w-16 h-6 rounded-full" />
                    <Shimmer className="w-10 h-6 rounded-full" />
                </div>
            </div>
        ))}
    </div>
);

// Reports page skeleton (card grid)
const ReportCardsSkeleton = () => (
    <>
        {/* Hero Section Skeleton */}
        <div className="rounded-3xl bg-gray-200 animate-pulse p-6 sm:p-8 mb-6 h-40" />

        {/* Quick Stats Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <Shimmer className="w-20 h-3 mb-2" />
                            <Shimmer className="w-14 h-7" />
                        </div>
                        <Shimmer className="w-9 h-9 rounded-lg" />
                    </div>
                </div>
            ))}
        </div>

        {/* Report Cards Title */}
        <Shimmer className="w-48 h-6 mb-4" />

        {/* Report Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
                    <Shimmer className="w-12 h-12 rounded-xl shrink-0" />
                    <div className="flex-1">
                        <Shimmer className="w-32 h-5 mb-2" />
                        <Shimmer className="w-48 h-3" />
                    </div>
                </div>
            ))}
        </div>
    </>
);

// Holidays page has unique mobile layout with date boxes
const HolidaysMobileSkeleton = () => (
    <div className="md:hidden space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-gray-200 flex gap-4">
                <Shimmer className="w-14 h-14 rounded-xl shrink-0" />
                <div className="flex-1">
                    <Shimmer className="w-36 h-5 mb-2" />
                    <Shimmer className="w-16 h-3 mb-1" />
                    <Shimmer className="w-48 h-3" />
                </div>
            </div>
        ))}
    </div>
);

// Page type configurations
type PageType = 'subjects' | 'teachers' | 'students' | 'departments' | 'holidays' | 'reports' | 'classes';

const pageConfigs: Record<PageType, {
    iconColor: string;
    tableColumns: number;
    filterCount: number;
    showSubHeader?: boolean;
}> = {
    subjects: { iconColor: 'bg-indigo-100', tableColumns: 6, filterCount: 2 },
    teachers: { iconColor: 'bg-orange-100', tableColumns: 4, filterCount: 1 },
    students: { iconColor: 'bg-emerald-100', tableColumns: 4, filterCount: 3, showSubHeader: true },
    departments: { iconColor: 'bg-amber-100', tableColumns: 6, filterCount: 0 },
    holidays: { iconColor: 'bg-cyan-100', tableColumns: 5, filterCount: 0, showSubHeader: true },
    reports: { iconColor: 'bg-gray-200', tableColumns: 0, filterCount: 0 },
    classes: { iconColor: 'bg-blue-100', tableColumns: 0, filterCount: 0 },
};

interface PageSkeletonProps {
    type: PageType;
}

export function PageSkeleton({ type }: PageSkeletonProps) {
    const config = pageConfigs[type];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <NavbarSkeleton />

            {config.showSubHeader ? (
                // Students/Holidays style with sub-header bar
                <>
                    <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${config.iconColor} animate-pulse w-10 h-10`} />
                                    <Shimmer className="w-32 h-7" />
                                </div>
                                <Shimmer className="w-56 h-3.5 mt-1 ml-12" />
                            </div>
                            <div className="flex gap-2">
                                <Shimmer className="w-28 h-10 rounded-xl hidden md:block" />
                                <Shimmer className="w-32 h-10 rounded-xl hidden md:block" />
                            </div>
                        </div>
                    </div>

                    <main className="flex-1 py-8 px-4 max-w-7xl mx-auto w-full">
                        {config.filterCount > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
                                <div className="md:col-span-4 flex gap-2">
                                    {Array.from({ length: config.filterCount }).map((_, i) => (
                                        <Shimmer key={i} className="w-full h-10 rounded-xl" />
                                    ))}
                                </div>
                                <div className="relative md:col-span-8">
                                    <Shimmer className="w-full h-10 rounded-xl" />
                                </div>
                            </div>
                        )}
                        <TableSkeleton rows={6} columns={config.tableColumns} />
                        <MobileCardSkeleton />
                    </main>
                </>
            ) : type === 'reports' ? (
                <main className="flex-1 pt-20 pb-8 px-4 max-w-7xl mx-auto w-full">
                    <ReportCardsSkeleton />
                </main>
            ) : (
                // Standard layout (subjects, teachers, departments)
                <main className="flex-1 pt-24 pb-12 px-4 max-w-7xl mx-auto w-full">
                    <PageHeaderSkeleton iconColor={config.iconColor} />
                    {config.filterCount > 0 ? (
                        type === 'teachers' ? (
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
                                <div className="md:col-span-3">
                                    <Shimmer className="w-full h-10 rounded-xl" />
                                </div>
                                <div className="md:col-span-9">
                                    <Shimmer className="w-full h-10 rounded-xl" />
                                </div>
                            </div>
                        ) : (
                            <FilterBarSkeleton filters={config.filterCount} />
                        )
                    ) : type === 'departments' ? (
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <Shimmer className="flex-1 h-10 rounded-xl" />
                            <Shimmer className="w-52 h-10 rounded-xl" />
                        </div>
                    ) : null}
                    <TableSkeleton rows={6} columns={config.tableColumns} />
                    <MobileCardSkeleton />
                </main>
            )}
        </div>
    );
}
