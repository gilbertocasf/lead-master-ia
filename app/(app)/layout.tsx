import { AppShell } from "@/components/AppShell";
import { hasSupabaseEnv } from "@/lib/supabase";
import { getCurrentProfile, type UserProfile } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: UserProfile | null = null;
  if (hasSupabaseEnv) {
    profile = await getCurrentProfile();
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
