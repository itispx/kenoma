"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { FolderKanban } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { useActiveOrg } from "@/lib/org-store";
import { useMinimumDelay } from "@/lib/use-minimum-delay";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { BootScreen } from "@/components/boot-screen";
import { Logo } from "@/components/logo";

const NAV = [{ href: "/dashboard", label: "Projects", icon: FolderKanban }];

// The authenticated app's chrome: header (logo, org switcher, theme toggle),
// a thin sidebar, the page content, and a status-strip footer. Also the
// auth gate — redirects to /login if there's no session, replacing the
// separate RequireAuth wrapper this used to be split across.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, status, logout } = useAuth();
  const { activeOrg } = useActiveOrg();
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
        <span className="h-5 w-px bg-console-600" />
        <OrgSwitcher />
        <div className="ml-auto flex items-center gap-3">
          {activeOrg && (
            <Link
              href={`/orgs/${activeOrg.id}`}
              className="text-xs text-console-300 hover:text-signal-info transition-colors"
            >
              Organization settings
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-48 shrink-0 flex-col justify-between border-r border-console-600/80 py-4 md:flex">
          <nav className="flex flex-col gap-1 px-2">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-transform duration-150 hover:translate-x-0.5 ${active ? "nav-active" : "nav-inactive"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 text-xs text-console-400">
            <div className="text-console-500">Currently working in</div>
            <div className="mt-0.5 truncate font-medium text-console-200">
              {activeOrg ? activeOrg.name : "your personal space"}
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 md:px-8">
          <div key={pathname} className="animate-materialize mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>

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
