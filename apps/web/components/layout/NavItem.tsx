'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type NavItemProps = {
  label: string;
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
  depth?: number;
};

const NavItem = ({ label, href, icon: Icon, isActive, collapsed, depth = 0 }: NavItemProps) => (
  <Link
    href={href}
    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
      isActive
        ? 'bg-slate-800 text-white'
        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
    }`}
    style={{ marginLeft: depth ? depth * 12 : undefined }}
  >
    <Icon className="h-4 w-4 shrink-0" />
    {!collapsed ? <span className="truncate">{label}</span> : null}
  </Link>
);

export default NavItem;
