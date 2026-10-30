"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Files, ListFilter, ClipboardCheck, UserRound, Menu, X, ChevronRight, LogOut } from "lucide-react";
import { DemoBanner } from "./DemoBanner";
import { BrandLogo } from "@/components/brand/BrandLogo";

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "reviewer";
}

const navigationGroups = [
  { label: "Ringkasan", items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  { label: "Peninjauan", items: [
    { label: "Data Klaim", href: "/claims", icon: Files },
    { label: "Risk Queue", href: "/risk-queue", icon: ListFilter },
    { label: "Reviewer Workspace", href: "/reviews", icon: ClipboardCheck },
  ] },
];
const sidebarFocus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700";

function Brand() {
  return <Link href="/dashboard" aria-label="JAGA-CLAIM, buka Dashboard" className={`inline-flex items-center gap-3 rounded-lg ${sidebarFocus}`}>
    <BrandLogo className="h-10 w-10 ring-1 ring-white/15" />
    <span><span className="block text-[13px] font-semibold tracking-[0.08em] text-white">JAGA-CLAIM</span><span className="mt-1 block text-[10px] tracking-wide text-primary-200">Claim Review Platform</span></span>
  </Link>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (pathname === "/login") return;
    const controller = new AbortController();
    setSessionError(null);
    fetch("/api/auth/me", { signal: controller.signal, cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error("Sesi belum dapat dimuat");
      return res.json();
    }).then((data) => {
      if (controller.signal.aborted) return;
      if (data.user) setCurrentUser(data.user);
      else window.location.replace("/login");
    }).catch(() => { if (!controller.signal.aborted) setSessionError("Sesi belum dapat dimuat. Silakan muat ulang halaman."); });
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout gagal");
      window.location.replace("/login");
    } catch {
      setSessionError("Belum dapat keluar. Silakan coba lagi.");
      setLoggingOut(false);
    }
  };

  const renderNavigation = (mobile = false) => (
    <nav aria-label={mobile ? "Navigasi mobile" : "Navigasi utama"} className="space-y-5">
      {navigationGroups.map((group) => <div key={group.label}>
        <p className="mb-2 px-3 text-[9px] font-medium uppercase tracking-[0.18em] text-primary-200">{group.label}</p>
        <div className="space-y-1">{group.items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors ${sidebarFocus} ${isActive ? "bg-primary-50 text-primary-700 shadow-sm" : "text-primary-100 hover:bg-white/[0.07] hover:text-white"}`}>
            <Icon aria-hidden="true" className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-primary-700" : "text-primary-300 group-hover:text-primary-50"}`} strokeWidth={1.75} />
            <span className="flex-1 leading-5">{item.label}</span>
            {isActive && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={1.75} />}
          </Link>;
        })}</div>
      </div>)}
    </nav>
  );

  const renderAccount = () => (
    <div className="rounded-xl border border-white/10 bg-primary-800/60 p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]"><UserRound aria-hidden="true" className="h-3.5 w-3.5 text-primary-100" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-white">{currentUser?.displayName || "Memuat akun..."}</p><p className="mt-1 text-[10px] text-primary-200">{currentUser?.role === "admin" ? "Administrator" : currentUser?.role === "reviewer" ? "Reviewer klaim" : "Menyiapkan sesi"}</p></div>
        {currentUser && <button type="button" aria-label="Keluar dari akun" title="Keluar dari akun" disabled={loggingOut} onClick={() => void logout()} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary-200 transition-colors hover:bg-white/5 hover:text-white ${sidebarFocus}`}><LogOut aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} /></button>}
      </div>

      {sessionError && <p role="alert" className="mt-2 text-[10px] leading-5 text-primary-100">{sessionError}</p>}
    </div>
  );

  const breadcrumb = pathname.split("/").filter(Boolean).map((segment) => {
    const labels: Record<string, string> = { dashboard: "Dashboard", claims: "Data Klaim", analysis: "AI Analysis", "risk-queue": "Risk Queue", reviews: "Reviewer Workspace" };
    return labels[segment] || (segment.length > 18 ? "Detail" : segment);
  });

  if (pathname === "/login") return <>{children}</>;
  if (!currentUser) return <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-center"><div><p role={sessionError ? "alert" : "status"} className="text-xs text-primary-700">{sessionError || "Memuat sesi..."}</p>{sessionError && <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-primary-700 px-4 py-2 text-xs text-white">Muat ulang</button>}</div></main>;

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <div className="flex min-h-screen items-start">
        <aside aria-label="Sidebar JAGA-CLAIM" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-primary-900/20 bg-primary-700 text-white md:flex lg:w-64">
          <div className="shrink-0 px-6 py-5"><Brand /></div>
          <div className="mx-6 h-px shrink-0 bg-white/10" />
          <div className="flex-1 shrink-0 px-4 py-4">{renderNavigation()}</div>
          <div className="shrink-0 px-4 pb-4 pt-2">{renderAccount()}</div>
        </aside>
        <main className="flex min-h-screen min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-40">
            <div className="flex h-[72px] items-center justify-between border-b border-white/10 bg-primary-700 px-4 text-white md:hidden">
              <Brand />
              <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"} aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" className={`flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-primary-50 ${sidebarFocus}`}>
                {mobileMenuOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <Menu aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
            {mobileMenuOpen && <div id="mobile-navigation" className="absolute inset-x-0 top-[72px] z-50 max-h-[calc(100dvh-72px)] overflow-y-auto border-b border-white/10 bg-primary-700 px-4 pb-5 pt-6 shadow-xl md:hidden">{renderNavigation(true)}<div className="mt-6 border-t border-white/10 pt-5">{renderAccount()}</div></div>}
            <DemoBanner />
          </div>
          <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
            {pathname !== "/dashboard" && pathname !== "/claims" && !pathname.startsWith("/claims/") && pathname !== "/risk-queue" && pathname !== "/reviews" && !pathname.startsWith("/reviews/") && <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-[11px] text-slate-500">{breadcrumb.map((item, index) => <React.Fragment key={`${item}-${index}`}><span className={index === breadcrumb.length - 1 ? "font-semibold text-slate-600" : ""}>{item}</span>{index < breadcrumb.length - 1 && <ChevronRight aria-hidden="true" className="h-3 w-3" />}</React.Fragment>)}</nav>}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
