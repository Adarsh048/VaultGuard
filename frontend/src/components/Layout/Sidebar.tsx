import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  KeyRound,
  FileCheck2,
  RefreshCw,
  Activity,
  AlertTriangle,
  ScrollText,
  Settings,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();

  const navItems = [
    { label: 'Overview', to: '/', icon: LayoutDashboard },
    { label: 'Credential Vault', to: '/vault', icon: KeyRound },
    { label: 'Access Requests', to: '/requests', icon: FileCheck2 },
    ...(isAdmin
      ? [
          { label: 'Credential Rotation', to: '/rotation', icon: RefreshCw },
          { label: 'Monitoring', to: '/monitoring', icon: Activity },
          { label: 'Incidents', to: '/incidents', icon: AlertTriangle },
          { label: 'Audit Logs', to: '/audit', icon: ScrollText },
        ]
      : []),
    { label: 'Settings', to: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0a0f1d] text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-sky-600/30">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">VaultGuard</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              Privileged Access Mgmt
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          PAM Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User Profile Card */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
            Active Role
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              isAdmin
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
            }`}
          >
            {user?.role}
          </span>
        </div>
      </div>
    </aside>
  );
};

