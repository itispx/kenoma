"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMinimumDelay } from "@/lib/use-minimum-delay";
import { ThemeToggle } from "@/components/theme-toggle";
import { BootScreen } from "@/components/boot-screen";
import { Logo } from "@/components/logo";

// The authenticated app's chrome: header, page content, and a status-strip
// footer. Also the auth gate — redirects to /login if there's no session,
// replacing the separate RequireAuth wrapper this used to be split across.
//
// There is no sidebar nav yet: /dashboard is currently the only authenticated
// page, so a nav listing it alone would just point at itself. It comes back
// with the first feature that adds a second destination.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const bootDone = useMinimumDelay(2000, 4000);

  useEffect(() => {
    if (!bootDone) return;
    if (status === "unauthenticated") {
      const next = pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, bootDone, router, pathname]);

  if (!bootDone || status !== "authenticated") {
    return <BootScreen />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-console-950">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-console-600/80 bg-console-950/80 px-4 backdrop-blur-lg">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo variant="simple" className="h-7 w-7 rounded-md" />
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 px-4 py-6 md:px-8">
        <div key={pathname} className="animate-materialize mx-auto max-w-5xl">
          {children}
        </div>
      </main>

      <footer className="flex h-8 items-center gap-3 border-t border-console-600/80 px-4 text-xs text-console-400">
        <span className="flex items-center gap-1.5 text-signal-success">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-success animate-pulse-glow" />
          Connected
        </span>
        <span className="text-console-600">·</span>
        <span className="truncate">{user?.email}</span>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="ml-auto text-console-400 hover:text-signal-error transition-colors"
        >
          Log out
        </button>
      </footer>
    </div>
  );
}
