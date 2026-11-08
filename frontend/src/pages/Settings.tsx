import React from 'react';
import { Header } from '../components/Layout/Header';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { User, Shield, Key, Database, LogOut, CheckCircle2 } from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, isAdmin, logout } = useAuth();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Settings & System Configuration"
        subtitle="User profile, active credentials session, and PAM environment parameters."
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-4xl">
        {/* Profile Card */}
        <div className="rounded-xl bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
            <div className="h-14 w-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{user?.name}</h3>
              <p className="text-xs text-slate-500">{user?.email}</p>
              <div className="mt-1">
                <Badge variant={isAdmin ? 'purple' : 'info'} size="sm">
                  {user?.role} Role Active
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 text-xs">
            <div>
              <span className="text-slate-400 block">User Identifier</span>
              <span className="font-mono text-slate-800 font-semibold">{user?.id}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Session Security</span>
              <span className="text-emerald-700 font-medium">HTTP-Only Encrypted Cookie (JWT)</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out Session</span>
            </button>
          </div>
        </div>

        {/* PAM Role Permissions Summary */}
        <div className="rounded-xl bg-white p-6 border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-sky-600" />
            <span>Active Role Capabilities ({user?.role})</span>
          </h4>

          {isAdmin ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Register and onboard privileged accounts</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Store & purge secrets in HashiCorp Vault KV v2</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Review, approve, or reject employee access requests</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Revoke active access grants with immediate effect</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Initiate test credential rotation and reconciliation</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Monitor Vault availability, seal status & audit logs</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Investigate security incidents and record remediation</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Export immutable audit log reports to CSV</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>View available privileged account metadata inventory</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Submit access requests with business justification</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Specify temporary access duration (15m - 24h)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Track real-time request review and grant status</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Retrieve credentials securely ONLY after approval</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>View personal privileged access history</span>
              </div>
            </div>
          )}
        </div>

        {/* Technical Architecture Specs */}
        <div className="rounded-xl bg-white p-6 border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-600" />
            <span>Infrastructure Integration Parameters</span>
          </h4>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-700">HashiCorp Vault Engine</span>
              <span className="font-mono text-slate-900">KV Secrets Engine Version 2 (`secret/`)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-700">Vault Endpoint</span>
              <span className="font-mono text-slate-900">http://127.0.0.1:8200</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-700">Database Layer</span>
              <span className="font-mono text-slate-900">MongoDB 8.3 Community (No Cleartext Passwords)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-700">Audit Storage</span>
              <span className="font-mono text-slate-900">Dual: Vault File Audit Device + MongoDB Event Ledger</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

