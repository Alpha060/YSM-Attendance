import { useEffect, useState } from 'react';

const BATCH_CONFIG_CACHE_KEY = 'cache_batch_config';
const DEPT_MAPPINGS_CACHE_KEY = 'cache_dept_batch_mappings';

/**
 * Hook that fetches batch config from settings and returns
 * only the active semesters (ones the admin hasn't cleared).
 * Also provides getBatchLabel() for displaying batch year ranges.
 *
 * Supports BOTH per-department (by dept ID) and per-deptType lookups:
 *   - getActiveSemesters(deptType)     → legacy, keyed by 'regular'/'vocational'/'pg'
 *   - getActiveSemestersByDept(deptId, deptType) → preferred, uses per-dept config first
 *
 * Uses SWR (stale-while-revalidate) caching via sessionStorage
 * so semester lists appear instantly without server round-trips.
 *
 * If no config exists yet, all 8 semesters are shown (default).
 * If config exists but a semester has `null` value, it's hidden.
 */
export function useActiveSemesters() {
    const [batchConfig, setBatchConfig] = useState<Record<string, Record<string, number | null>>>(() => {
        try {
            const cached = sessionStorage.getItem(BATCH_CONFIG_CACHE_KEY);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }
        return {};
    });
    // Per-department mappings (keyed by department ID)
    const [deptMappings, setDeptMappings] = useState<Record<string, Record<string, number | null>>>(() => {
        try {
            const cached = sessionStorage.getItem(DEPT_MAPPINGS_CACHE_KEY);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }
        return {};
    });
    const [loading, setLoading] = useState(() => {
        try {
            return !sessionStorage.getItem(BATCH_CONFIG_CACHE_KEY);
        } catch { return true; }
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/settings/batch-config', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    const mappings = data.mappings || {};
                    const departmentMappings = data.departmentMappings || {};
                    setBatchConfig(mappings);
                    setDeptMappings(departmentMappings);
                    try {
                        sessionStorage.setItem(BATCH_CONFIG_CACHE_KEY, JSON.stringify(mappings));
                        sessionStorage.setItem(DEPT_MAPPINGS_CACHE_KEY, JSON.stringify(departmentMappings));
                    } catch { /* ignore */ }
                }
            } catch (err) {
                console.error('Error fetching batch config:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    /**
     * Get the effective mappings for a department.
     * Priority: per-department config (by ID) → per-deptType config → empty
     */
    const getMappings = (deptId?: string, deptType?: string): Record<string, number | null> | undefined => {
        if (deptId && deptMappings[deptId] && Object.keys(deptMappings[deptId]).length > 0) {
            return deptMappings[deptId];
        }
        if (deptType && batchConfig[deptType] && Object.keys(batchConfig[deptType]).length > 0) {
            return batchConfig[deptType];
        }
        return undefined;
    };

    /**
     * Get active semesters for a given dept type (legacy — uses deptType key only).
     * If no config saved for this type, return all 8.
     * If config exists, return only semesters with non-null values.
     */
    const getActiveSemesters = (type?: string): number[] => {
        const allSemesters = [1, 2, 3, 4, 5, 6, 7, 8];

        if (!type) {
            const configKeys = Object.keys(batchConfig);
            if (configKeys.length === 0) return allSemesters;

            return allSemesters.filter(sem => {
                return configKeys.some(key => {
                    const mappings = batchConfig[key];
                    if (!mappings || Object.keys(mappings).length === 0) return true;
                    const val = mappings[sem.toString()];
                    return val !== null && val !== undefined;
                });
            });
        }

        const mappings = batchConfig[type];
        if (!mappings || Object.keys(mappings).length === 0) return allSemesters;
        return allSemesters.filter(sem => {
            const val = mappings[sem.toString()];
            return val !== null && val !== undefined;
        });
    };

    /**
     * Get active semesters for a specific department (by ID), falling back to deptType.
     * This is the PREFERRED method — uses per-department configs (e.g., BBA vs BCA).
     */
    const getActiveSemestersByDept = (deptId?: string, deptType?: string): number[] => {
        const allSemesters = [1, 2, 3, 4, 5, 6, 7, 8];
        const mappings = getMappings(deptId, deptType);
        if (!mappings || Object.keys(mappings).length === 0) return allSemesters;
        return allSemesters.filter(sem => {
            const val = mappings[sem.toString()];
            return val !== null && val !== undefined;
        });
    };

    /**
     * Get a batch label like "2025-29" for a given semester.
     * Checks per-department config first, then per-deptType, then fallback calc.
     */
    const getBatchLabel = (sem: number, deptType?: string, deptId?: string): string | null => {
        const mappings = getMappings(deptId, deptType);
        if (mappings && mappings[sem.toString()]) {
            const batchStart = mappings[sem.toString()] as number;
            const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
            const batchEnd = (batchStart + duration) % 100;
            return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
        }

        // Fallback: calculate from current date
        const now = new Date();
        const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        const yearOffset = Math.floor((sem - 1) / 2);
        const batchStart = academicStartYear - yearOffset;
        const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
        const batchEnd = (batchStart + duration) % 100;
        return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
    };

    return {
        getActiveSemesters,
        getActiveSemestersByDept,
        getBatchLabel,
        batchConfig,
        deptMappings,
        loading,
    };
}
