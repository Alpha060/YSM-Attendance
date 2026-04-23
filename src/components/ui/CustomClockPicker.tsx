'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock as ClockIcon, Check } from 'lucide-react';

interface CustomClockPickerProps {
    isOpen: boolean;
    onClose: () => void;
    initialTime?: string; // Format "HH:mm" (24h)
    onSave: (time: string) => void;
    title?: string;
}

export function CustomClockPicker({ isOpen, onClose, initialTime = '08:00', onSave, title = 'Select Time' }: CustomClockPickerProps) {
    const [mode, setMode] = useState<'h' | 'm'>('h');
    const [h, setH] = useState('08');
    const [m, setM] = useState('00');
    const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const rawH = parseInt(initialTime.split(':')[0] || '8');
            setPeriod(rawH >= 12 ? 'PM' : 'AM');
            const modH = rawH % 12 || 12;
            setH(modH.toString().padStart(2, '0'));
            setM(initialTime.split(':')[1] || '00');
            setMode('h');
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, initialTime]);

    if (!isVisible) return null;

    // Clock properties
    const radius = 100;
    const center = 120;

    const generateCircleItems = () => {
        if (mode === 'h') {
            const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            return hours.map((hour, i) => {
                const angle = ((i - 2) * 30) * (Math.PI / 180);
                const x = center + radius * Math.cos(angle);
                const y = center + radius * Math.sin(angle);
                const val = hour.toString().padStart(2, '0');
                const isSelected = parseInt(h) === hour;
                return (
                    <button
                        key={val}
                        onClick={() => { setH(val); setMode('m'); }}
                        className={`absolute w-10 h-10 -ml-5 -mt-5 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-sm ${isSelected ? 'bg-teal-500 text-white shadow-teal-500/40 scale-110' : 'bg-white text-gray-700 hover:bg-teal-50 border border-gray-100/50'}`}
                        style={{ left: `${x}px`, top: `${y}px` }}
                    >
                        {hour}
                    </button>
                );
            });
        } else {
            // Minutes: 00, 05, 10 ... 55
            return Array.from({ length: 12 }).map((_, i) => {
                const angle = ((i - 3) * 30) * (Math.PI / 180);
                const x = center + radius * Math.cos(angle);
                const y = center + radius * Math.sin(angle);
                const val = (i * 5).toString().padStart(2, '0');
                const isSelected = parseInt(m) === i * 5;
                return (
                    <button
                        key={val}
                        onClick={() => setM(val)}
                        className={`absolute w-10 h-10 -ml-5 -mt-5 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-sm ${isSelected ? 'bg-teal-500 text-white shadow-teal-500/40 scale-110' : 'bg-white text-gray-700 hover:bg-teal-50 border border-gray-100/50'}`}
                        style={{ left: `${x}px`, top: `${y}px` }}
                    >
                        {val}
                    </button>
                );
            });
        }
    };

    const handleSave = () => {
        let finalH = parseInt(h);
        if (period === 'PM' && finalH !== 12) finalH += 12;
        if (period === 'AM' && finalH === 12) finalH = 0;
        onSave(`${finalH.toString().padStart(2, '0')}:${m}`);
        onClose();
    };

    // Fine tune minute buttons
    const handleAddMin = (val: number) => {
        let newM = parseInt(m) + val;
        if (newM >= 60) newM = 0;
        if (newM < 0) newM = 59;
        setM(newM.toString().padStart(2, '0'));
    };

    return (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 sm:p-6 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
            <div
                className={`bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl transition-all duration-300 transform ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Displays */}
                <div className="bg-linear-to-br from-teal-500 to-emerald-600 p-6 text-white flex flex-col items-center relative">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md">
                        <X className="w-4 h-4 text-white" />
                    </button>
                    <div className="flex items-center gap-2 mb-4 bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                        <ClockIcon className="w-3.5 h-3.5" />
                        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
                    </div>

                    <div className="flex items-center justify-center gap-2 relative w-full">
                        <button
                            onClick={() => setMode('h')}
                            className={`text-5xl font-black rounded-xl px-4 py-2 transition-all ${mode === 'h' ? 'bg-white text-teal-600 shadow-xl scale-105' : 'text-white/80 hover:bg-white/10'}`}
                        >
                            {h}
                        </button>
                        <div className="text-4xl font-black text-white/50 mb-1">:</div>
                        <button
                            onClick={() => setMode('m')}
                            className={`text-5xl font-black rounded-xl px-4 py-2 transition-all ${mode === 'm' ? 'bg-white text-teal-600 shadow-xl scale-105' : 'text-white/80 hover:bg-white/10'}`}
                        >
                            {m}
                        </button>

                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                            <button
                                onClick={() => setPeriod('AM')}
                                className={`text-xs font-black px-2 py-1 rounded-md transition-all ${period === 'AM' ? 'bg-white text-teal-600 shadow-sm scale-110' : 'text-white/70 hover:bg-white/20'}`}
                            >
                                AM
                            </button>
                            <button
                                onClick={() => setPeriod('PM')}
                                className={`text-xs font-black px-2 py-1 rounded-md transition-all ${period === 'PM' ? 'bg-white text-teal-600 shadow-sm scale-110' : 'text-white/70 hover:bg-white/20'}`}
                            >
                                PM
                            </button>
                        </div>
                    </div>
                </div>

                {/* Clock Face Body */}
                <div className="p-6 bg-slate-50 flex flex-col items-center">
                    <div className="relative w-[240px] h-[240px] rounded-full bg-slate-200/50 shadow-inner flex items-center justify-center mb-6">
                        {/* Center Dot */}
                        <div className="w-2 h-2 rounded-full bg-teal-500 absolute z-10"></div>

                        {/* Hand/Line connecting to selected */}
                        <div className="absolute w-1 h-[80px] bg-teal-500/30 origin-bottom rounded-full"
                            style={{
                                bottom: '120px',
                                transform: `rotate(${mode === 'h' ? (parseInt(h) * 30) : (parseInt(m) / 5) * 30}deg)`,
                                transformOrigin: 'bottom center',
                                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                        ></div>

                        {/* Rendering Hours or Minutes */}
                        {generateCircleItems()}
                    </div>

                    {mode === 'm' && (
                        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                            <button onClick={() => handleAddMin(-1)} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-600 font-black rounded-lg hover:bg-gray-100 transition-colors">-1</button>
                            <span className="text-xs font-bold text-gray-400 tracking-wider">FINE TUNE</span>
                            <button onClick={() => handleAddMin(+1)} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-600 font-black rounded-lg hover:bg-gray-100 transition-colors">+1</button>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-between">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-xl shadow-md shadow-teal-500/20 transition-all active:scale-95"
                    >
                        <Check className="w-4 h-4" />
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

