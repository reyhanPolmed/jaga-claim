"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Login belum dapat diproses");
      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidak dapat terhubung. Silakan coba kembali.");
      setLoading(false);
    }
  };

  const input = "h-10 w-full rounded-lg border border-primary-200/80 bg-primary-50/30 px-3 text-[11px] text-primary-700 outline-none transition-colors placeholder:text-slate-500 hover:border-primary-300 focus:border-primary-600 focus:bg-white focus:ring-2 focus:ring-primary-600/10 disabled:opacity-60";
  return <main className="flex min-h-dvh items-center justify-center bg-[#E8EDE9] px-4 py-8 sm:px-6">
    <div className="w-full max-w-[360px] rounded-2xl border border-primary-200/70 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(47,59,58,0.25)] sm:p-7">
      <header className="mb-5">
        <div className="mb-6 flex items-center gap-2.5"><BrandLogo className="h-9 w-9 ring-1 ring-primary-100" /><div><p className="text-[10px] font-semibold tracking-[0.14em] text-primary-700">JAGA-CLAIM</p><p className="mt-0.5 text-[9px] text-slate-500">Claim Review Platform</p></div></div>
        <h1 className="text-xl font-semibold tracking-tight text-primary-700">Selamat datang kembali</h1><p className="mt-2 text-[11px] leading-5 text-slate-500">Masuk untuk melanjutkan peninjauan klaim.</p>
      </header>
      <form onSubmit={login} className="space-y-4" aria-busy={loading}>
        {error && <p id="login-error" role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">{error}</p>}
        <div><label htmlFor="login-email" className="mb-2 block text-[11px] font-medium text-primary-700">Email</label><input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} placeholder="nama@jagaclaim.local" aria-describedby={error ? "login-error" : undefined} className={input} /></div>
        <div><label htmlFor="login-password" className="mb-2 block text-[11px] font-medium text-primary-700">Kata sandi</label><div className="relative"><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} placeholder="Masukkan kata sandi" aria-describedby={error ? "login-error" : undefined} className={`${input} pr-11`} /><button type="button" disabled={loading} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">{showPassword ? <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}</button></div></div>
        <button type="submit" disabled={loading} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 text-[11px] font-medium text-white transition-colors hover:bg-primary-800 active:bg-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">{loading && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{loading ? "Memeriksa akun..." : "Masuk"}{!loading && <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />}</button>
      </form>
      <p className="mt-5 border-t border-slate-100 pt-4 text-center text-[9px] leading-5 text-slate-500">Untuk admin dan reviewer JAGA-CLAIM.</p>
    </div>
  </main>;
}
