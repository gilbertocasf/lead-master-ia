"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import type { UserProfile } from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  corretor: "Corretor",
};

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const NAV_TODOS = [
  { href: "/", label: "Dashboard", icon: GridIcon },
  { href: "/leads", label: "Leads", icon: InboxIcon },
  { href: "/pipeline", label: "Pipeline", icon: ColumnsIcon },
  { href: "/corretores", label: "Corretores", icon: UsersIcon },
  { href: "/equipes", label: "Equipes", icon: ShieldIcon },
  { href: "/ranking", label: "Ranking VGV", icon: TrophyIcon },
];

const HREFS_CORRETOR = new Set(["/", "/leads", "/pipeline"]);

export function Sidebar({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
}) {
  const pathname = usePathname();

  const nav =
    profile?.role === "corretor"
      ? NAV_TODOS.filter((item) => HREFS_CORRETOR.has(item.href))
      : NAV_TODOS;

  return (
    <>
      {/* Backdrop mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-base-border bg-base-surface transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/40">
            <TrophyIcon className="h-5 w-5 text-gold" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold tracking-tight text-ink">
              Lead Master <span className="text-gold">IA</span>
            </div>
            <div className="text-[11px] text-ink-faint">Gestão imobiliária</div>
          </div>
        </div>

        {/* Navegação filtrada por role */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-action/15 text-ink ring-1 ring-action/30"
                    : "text-ink-muted hover:bg-base-raised hover:text-ink"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] ${
                    active ? "text-action" : "text-ink-faint"
                  }`}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Rodapé — perfil autenticado */}
        <div className="border-t border-base-border px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xs font-semibold text-gold ring-1 ring-gold/40">
              {profile ? iniciais(profile.nome) : "—"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-ink">
                {profile ? profile.nome : "Modo Dev"}
              </div>
              <div className="text-[11px] text-ink-faint">
                {profile ? ROLE_LABEL[profile.role] ?? profile.role : "sem autenticação"}
              </div>
            </div>
            {profile && (
              <form action={logout}>
                <button
                  type="submit"
                  title="Sair"
                  className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-base-raised hover:text-ink"
                >
                  <LogoutIcon className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Ícones (SVG inline, sem dependências) ──
type IconProps = { className?: string };

function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function InboxIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function ColumnsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="14" rx="1.5" />
    </svg>
  );
}
function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function TrophyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
function LogoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
