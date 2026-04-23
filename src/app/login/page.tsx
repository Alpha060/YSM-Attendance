'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, GraduationCap, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, rememberMe }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Invalid credentials. Please try again.');
                setLoading(false);
                return;
            }

            // Store token and user in localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redirect to dashboard (replace so back button doesn't return to login)
            router.replace('/dashboard');
        } catch (err) {
            setError('Unable to connect to the server. Please check your internet.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-gray-50">
            {/* Left Side - Brand/Hero Section (Hidden on mobile) */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col justify-between p-12 overflow-hidden">
                {/* Background Image with animated entry */}
                <div className="absolute inset-0 z-0 animate-fade-in duration-1000">
                    <img
                        src="/paramahansa.jpg"
                        alt="Paramahansa Yogananda"
                        className="w-full h-full object-cover opacity-30 mix-blend-luminosity hover:mix-blend-normal transition-all duration-1000 ease-in-out scale-105 hover:scale-100"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/90 to-blue-900/40"></div>
                </div>

                {/* Content */}
                <div className="relative z-10 animate-slide-in-top duration-700">
                    <div className="flex items-center gap-4 text-white mb-12">
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-2 rounded-2xl h-16 w-16 flex items-center justify-center shadow-2xl">
                            <img src="/college-logo.png" alt="YSM Logo" className="w-full h-full object-contain drop-shadow-md" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-orange-200 to-white">
                                Yogoda Satsanga
                            </span>
                            <span className="text-sm font-semibold text-blue-200 tracking-[0.2em] uppercase">
                                Mahavidyalaya
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 space-y-8 max-w-lg mb-8 animate-fade-in-up duration-1000 delay-200">
                    <h1 className="text-5xl font-extrabold text-white leading-tight tracking-tight">
                        <span className="text-orange-400">Harmonious</span> Development of <br />
                        <span className="text-blue-300">Body, Mind, & Soul.</span>
                    </h1>
                    <p className="text-lg text-gray-300 leading-relaxed font-light">
                        Welcome to the official attendance management system of YSM Ranchi. <br />
                        <span className="text-white/80 font-medium">Digital • Transparent • Efficient</span>
                    </p>

                    <div className="flex flex-wrap gap-4 pt-2">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm hover:bg-white/10 transition-colors cursor-default">
                            <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                            <span className="text-sm text-gray-200 font-medium">Real-time attendance</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm hover:bg-white/10 transition-colors cursor-default">
                            <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]"></div>
                            <span className="text-sm text-gray-200 font-medium">Secure Records</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-xs text-gray-500 border-t border-white/10 pt-6 flex justify-between items-center animate-fade-in duration-1000 delay-500">
                    <span>© {new Date().getFullYear()} Yogoda Satsanga Mahavidyalaya.</span>
                    <span className="text-gray-600">Established 1967</span>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-12 lg:p-24 bg-gray-50 lg:bg-white transition-colors duration-500">
                {/* Mobile Background Decoration (Only visible on small screens to add depth) */}
                <div className="absolute inset-0 lg:hidden overflow-hidden pointer-events-none z-0">
                    <div className="absolute top-0 left-0 right-0 h-64 bg-linear-to-b from-blue-600 to-indigo-800 rounded-b-[3rem]"></div>
                    <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="absolute top-20 right-10 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl"></div>
                </div>

                <div className="w-full max-w-[420px] space-y-8 relative z-10">

                    {/* Card Container for Mobile (White box on colored bg) / Plain for Desktop */}
                    <div className="bg-white lg:bg-transparent p-6 sm:p-8 rounded-3xl shadow-xl lg:shadow-none border border-gray-100 lg:border-none animate-scale-in duration-500">

                        {/* Mobile Header Logo */}
                        <div className="lg:hidden flex flex-col items-center gap-4 mb-8">
                            <div className="bg-white p-3 rounded-2xl shadow-lg border border-gray-100 h-24 w-24 flex items-center justify-center relative -mt-16 sm:mt-0">
                                <img src="/college-logo.png" alt="YSM Logo" className="w-11/12 h-11/12 object-contain" />
                            </div>
                            <div className="text-center space-y-1">
                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">YSM Ranchi</h1>
                                <p className="text-xs text-gray-500 font-semibold tracking-[0.15em] uppercase text-blue-600">Attendance Portal</p>
                            </div>
                        </div>

                        {/* Desktop Header Text (Hidden on Mobile) */}
                        <div className="hidden lg:block text-left space-y-2 mb-8 animate-fade-in-up delay-100">
                            <h2 className="text-4xl font-bold tracking-tight text-gray-900">Welcome back</h2>
                            <p className="text-gray-500 text-base">Please enter your credentials to access the dashboard.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in-up delay-200">
                            <div className="space-y-2 group">
                                <Label htmlFor="email" className="text-sm font-semibold text-gray-700 ml-1 group-focus-within:text-blue-600 transition-colors">Email Address</Label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="admin@college.edu"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-11 h-12 bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all rounded-xl text-base shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-sm font-semibold text-gray-700 ml-1 group-focus-within:text-blue-600 transition-colors">Password</Label>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-11 pr-11 h-12 bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all rounded-xl text-base shadow-sm"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <span className="text-xs text-gray-600 font-medium">Remember me for 30 days</span>
                                    </label>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-sm text-red-600 animate-shake">
                                    <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 shrink-0" />
                                    <p className="leading-snug font-medium">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full h-12 text-base font-semibold bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] mt-2 relative overflow-hidden group"
                                disabled={loading}
                            >
                                <span className={`absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out rounded-xl`}></span>
                                {loading ? (
                                    <div className="flex items-center justify-center gap-2 relative z-10">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>Verifying Credentials...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 relative z-10">
                                        <span>Sign In to Dashboard</span>
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                )}
                            </Button>
                        </form>

                        {/* <div className="pt-8 text-center animate-fade-in-up delay-300">
                             <div className="relative mb-6">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-gray-100" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-3 text-gray-400 font-semibold tracking-wider">
                                        Demo Access
                                    </span>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-sm text-blue-800 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 hover:bg-blue-50 transition-colors">
                                <span className="font-medium text-blue-900">Admin:</span>
                                <span className="font-mono bg-white px-2 py-0.5 rounded text-xs border border-blue-100 shadow-sm">admin@college.edu</span>
                                <span className="text-blue-300 hidden sm:inline">|</span>
                                <span className="font-mono bg-white px-2 py-0.5 rounded text-xs border border-blue-100 shadow-sm">admin123</span>
                            </div>
                        </div> */}
                    </div>

                    {/* Mobile Footer */}
                    <div className="lg:hidden text-center mt-6 text-xs text-gray-400 font-medium pb-4">
                        © {new Date().getFullYear()} YSM Ranchi
                    </div>
                </div>
            </div>
        </div>
    );
}
