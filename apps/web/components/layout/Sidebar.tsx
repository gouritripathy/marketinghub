'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  UsersRound,
  Crosshair,
  PlusCircle,
  Activity,
  List,
  Search,
} from 'lucide-react';
import NavItem from './NavItem';
import { useAuth } from '../../lib/auth/AuthProvider';
import type { UserRole } from '../../lib/auth/authClient';

type NavItemConfig = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  children?: NavItemConfig[];
};

type NavSection = {
  label: string;
  items: NavItemConfig[];
};

const sections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: ['MEMBER', 'REVIEWER', 'ADMIN'],
      },
    ],
  },
  {
    label: 'ContextLead AI',
    items: [
      {
        label: 'New Campaign',
        href: '/lead-gen/new',
        icon: PlusCircle,
        roles: ['MEMBER', 'REVIEWER', 'ADMIN'],
      },
      {
        label: 'Pipeline Runs',
        href: '/lead-gen/runs',
        icon: Activity,
        roles: ['MEMBER', 'REVIEWER', 'ADMIN'],
      },
      {
        label: 'Lead Results',
        href: '/lead-gen/results',
        icon: Crosshair,
        roles: ['MEMBER', 'REVIEWER', 'ADMIN'],
      },
      {
        label: 'Evidence Explorer',
        href: '/lead-gen/evidence',
        icon: Search,
        roles: ['MEMBER', 'REVIEWER', 'ADMIN'],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'User Management',
        href: '/user-management',
        icon: UsersRound,
        roles: ['ADMIN'],
      },
    ],
  },
];

const hasRoleAccess = (role: UserRole | undefined, allowed: UserRole[]) =>
  role ? allowed.includes(role) : false;

const filterItemsByRole = (items: NavItemConfig[], role: UserRole | undefined): NavItemConfig[] =>
  items
    .filter((item) => hasRoleAccess(role, item.roles))
    .map((item) => ({
      ...item,
      children: item.children ? filterItemsByRole(item.children, role) : undefined,
    }));

const Sidebar = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        items: filterItemsByRole(section.items, user?.role),
      }))
      .filter((section) => section.items.length > 0);
  }, [user?.role]);

  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItemConfig, depth = 0) => {
    const childActive = item.children?.some((child) => isItemActive(child.href)) ?? false;
    const active = isItemActive(item.href) || childActive;

    return (
      <div key={item.href} className="space-y-1">
        <NavItem
          label={item.label}
          href={item.href}
          icon={item.icon}
          collapsed={collapsed}
          isActive={active}
          depth={depth}
        />
        {item.children?.map((child) => renderItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside
      className={`flex min-h-screen flex-col border-r border-slate-900 bg-slate-950/80 transition-all ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-200">
            MH
          </span>
          {!collapsed ? <span>MarketingHub</span> : null}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded-md p-1 text-slate-400 transition hover:text-slate-200"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {visibleSections.map((section) => (
          <div key={section.label} className="space-y-2">
            {!collapsed ? (
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                {section.label}
              </p>
            ) : (
              <div className="mx-2 h-px bg-slate-800" />
            )}
            <div className="space-y-1">{section.items.map((item) => renderItem(item))}</div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
