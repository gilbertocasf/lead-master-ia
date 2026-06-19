"use client";

import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { UserProfile } from "@/lib/auth";

export function AppShell({
  children,
  profile,
}: {
  children: ReactNode;
  profile: UserProfile | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-base">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} profile={profile} />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
