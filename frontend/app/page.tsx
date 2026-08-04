"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { useMinimumDelay } from "@/lib/use-minimum-delay";
import { BootScreen } from "@/components/boot-screen";

export default function RootPage() {
  const { status } = useAuth();
  const router = useRouter();
  const bootDone = useMinimumDelay(1500, 3000);

  useEffect(() => {
    if (!bootDone) return;
    if (status === "authenticated") router.replace("/dashboard");
    if (status === "unauthenticated") router.replace("/login");
  }, [status, bootDone, router]);

  return <BootScreen />;
}
