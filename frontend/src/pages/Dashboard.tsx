import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import {
  KeyRound,
  Users,
  FileCheck2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [activities, setActivities] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [sumRes, actRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/recent-activity'),
      ]);
      if (sumRes.data?.success) setSummary(sumRes.data.summary);
      if (actRes.data?.success) setActivities(actRes.data);
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="PAM System Overview"
        subtitle={`Welcome back, ${user?.name}. Enterprise Privileged Access Console.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/vault"
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Browse Vault</span>
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Accounts */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Privileged Accounts
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {summary ? summary.totalAccounts : '--'}
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>Vault KV v2 Protected</span>
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <KeyRound className="h-5 w-5" />
            </div>
          </div>

          {/* Pending Requests */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Pending Approvals
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {summary ? summary.pendingRequests : '--'}
              </h3>
              <p className="text-[11px] text-amber-600 font-medium mt-1">
                Awaiting Administrator Review
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          {/* Active Grants */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Active Temporary Grants
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {summary ? summary.activeGrants : '--'}
              </h3>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">
                Live Credential Leases
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileCheck2 className="h-5 w-5" />
            </div>
          </div>

          {/* Open Incidents */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Security Incidents
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {summary ? summary.openIncidents : '--'}
              </h3>
              <p className="text-[11px] text-rose-600 font-medium mt-1">
                {summary?.criticalIncidents || 0} Critical
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Breakdown Row: Categories & Rotation Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category Distribution */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-sky-600" />
                <span>Account Types Distribution</span>
              </h4>
            </div>

            <div className="space-y-3">
              {summary?.categories &&
                Object.entries(summary.categories).map(([category, count]) => (
                  <div key={category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 font-medium">{category}</span>
                      <span className="font-semibold text-slate-800">{count as number}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-sky-600 h-2 rounded-full"
                        style={{
                          width: `${
                            summary.totalAccounts > 0
                              ? ((count as number) / summary.totalAccounts) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Credential Rotation Health */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-emerald-600" />
                <span>Credential Rotation Health</span>
              </h4>
              <Badge variant="success" size="sm">
                KV v2 Managed
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-700">Synchronized & Verified</span>
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {summary?.rotation?.synced || 0}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-medium text-slate-700">Pending Initial Rotation</span>
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {summary?.rotation?.pending || 0}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <XCircle className="h-4 w-4 text-rose-500" />
                  <span className="text-xs font-medium text-slate-700">Rotation Failed / Alert</span>
                </div>
                <span className="text-xs font-bold text-slate-900">
                  {summary?.rotation?.failed || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action & Security Posture */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-600" />
                <span>Security Governance Posture</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                VaultGuard enforces zero permanent credential exposure. All secrets are stored in HashiCorp Vault KV v2 and checked out via just-in-time access grants.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <Link
                to="/requests"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <span>Review Access Workflow</span>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </Link>

              {isAdmin && (
                <Link
                  to="/monitoring"
                  className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  <span>Vault Health & Audit Status</span>
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Split: Recent Audit Events & Security Incidents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Audit Log */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-sky-600" />
                <span>Recent Audit Activity</span>
              </h4>
              {isAdmin && (
                <Link to="/audit" className="text-xs text-sky-600 font-semibold hover:underline">
                  View All Logs
                </Link>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">User</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activities?.recentAudit?.length > 0 ? (
                    activities.recentAudit.map((log: any) => (
                      <tr key={log._id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 font-medium text-slate-800">{log.username}</td>
                        <td className="py-2.5 font-mono text-slate-600 text-[11px]">{log.action}</td>
                        <td className="py-2.5">
                          <Badge
                            size="sm"
                            variant={
                              log.result === 'SUCCESS'
                                ? 'success'
                                : log.result === 'DENIED'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {log.result}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        No recent activity recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Security Incidents */}
          <div className="rounded-xl bg-white p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Active Security Incidents</span>
              </h4>
              {isAdmin && (
                <Link to="/incidents" className="text-xs text-sky-600 font-semibold hover:underline">
                  Investigate
                </Link>
              )}
            </div>

            <div className="space-y-3">
              {activities?.recentIncidents?.length > 0 ? (
                activities.recentIncidents.map((inc: any) => (
                  <div
                    key={inc._id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {inc.incidentId}
                        </span>
                        <Badge
                          size="sm"
                          variant={
                            inc.severity === 'Critical'
                              ? 'danger'
                              : inc.severity === 'High'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {inc.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-700 font-medium mt-1">{inc.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{inc.description}</p>
                    </div>
                    <Badge variant={inc.status === 'Resolved' ? 'success' : 'neutral'} size="sm">
                      {inc.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No active incidents detected. All PAM controls healthy.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

