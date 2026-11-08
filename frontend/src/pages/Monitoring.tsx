import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { Badge } from '../components/common/Badge';
import { Alert } from '../components/common/Alert';
import {
  Activity,
  HardDrive,
  FileText,
  Key,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export const Monitoring: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMonitoring = async () => {
    setRefreshing(true);
    try {
      const [monRes, evtRes] = await Promise.all([
        api.get('/monitoring/vault-health'),
        api.get('/monitoring/events'),
      ]);

      if (monRes.data?.success) setData(monRes.data.monitoring);
      if (evtRes.data?.success) setEvents(evtRes.data.events);
    } catch (err) {
      console.error('Error fetching monitoring info:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMonitoring();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Healthy':
        return (
          <Badge variant="success" size="md">
            Healthy / Unsealed
          </Badge>
        );
      case 'Warning':
        return (
          <Badge variant="warning" size="md">
            Warning / Standby
          </Badge>
        );
      case 'Not Configured':
        return (
          <Badge variant="neutral" size="md">
            Not Configured
          </Badge>
        );
      default:
        return (
          <Badge variant="danger" size="md">
            Unavailable / Offline
          </Badge>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Vault Health & Infrastructure Telemetry"
        subtitle="Real-time telemetry and operational status of HashiCorp Vault Community Edition."
        actions={
          <button
            onClick={fetchMonitoring}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Poll Health Now</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Top Status Card */}
        <div className="rounded-xl bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">HashiCorp Vault Core Engine</h3>
                {data ? getStatusBadge(data.vault.status) : <Badge>Checking...</Badge>}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Version: {data?.vault?.version || '1.15.6 Community Edition'} • Cluster:{' '}
                {data?.vault?.clusterName || 'vault-cluster-d30c0321'}
              </p>
            </div>

            <div className="text-right text-xs">
              <span className="text-slate-400 block">Last Verified</span>
              <span className="font-mono text-slate-700 font-medium">
                {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '--'}
              </span>
            </div>
          </div>

          {/* Subsystem Component Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            {/* Shamir Seal Status */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-500 font-medium">Shamir Seal Status</span>
                <HardDrive className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {data?.vault?.sealed ? (
                  <span className="text-rose-600 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> Sealed (Locked)
                  </span>
                ) : (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Unsealed (Active)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {data?.vault?.initialized ? 'Engine Initialized' : 'Uninitialized'}
              </p>
            </div>

            {/* App Token & Policy */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-500 font-medium">Restricted App Token</span>
                <Key className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {data?.authentication?.valid ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Token Valid
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> Invalid Token
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate" title={data?.authentication?.policies?.join(', ')}>
                Policy: {data?.authentication?.policies?.join(', ') || 'vaultguard-app'}
              </p>
            </div>

            {/* Audit Device Logging */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-500 font-medium">Vault File Audit Device</span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {data?.auditLogging?.status === 'Healthy' ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Healthy (file/)
                  </span>
                ) : data?.auditLogging?.status === 'Warning' ? (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> Empty File
                  </span>
                ) : data?.auditLogging?.status === 'Not Configured' ? (
                  <span className="text-slate-500 flex items-center gap-1">
                    Not Configured
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> File Unavailable
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono truncate" title={data?.auditLogging?.configuredPath}>
                Size: {data?.auditLogging?.logSizeBytes ? `${(data.auditLogging.logSizeBytes / 1024).toFixed(1)} KB` : '0 KB'}
              </p>
            </div>

            {/* 24h Telemetry */}
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-500 font-medium">24h Access Attempts</span>
                <Activity className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {data?.telemetry24h?.totalRetrievalAttempts || 0} Attempts
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Denied: {data?.telemetry24h?.failedRetrievals || 0} ({data?.telemetry24h?.failureRatePercent || '0.0%'})
              </p>
            </div>
          </div>
        </div>

        {/* Security Events Stream */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>Security Denial & Access Failure Events</span>
            </h4>
            <span className="text-xs text-slate-400">Streamed from live audit ledger</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4"># Seq</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Subject User</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Security Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.length > 0 ? (
                  events.map((evt) => (
                    <tr key={evt._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-600">
                        #{evt.sequenceNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {new Date(evt.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-800 font-semibold">
                        {evt.action}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">{evt.username}</td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {evt.accountId?.accountName || 'N/A'}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="danger" size="sm">
                          {evt.result}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {evt.metadata?.reason || evt.metadata?.failureReason || 'Access rejected by PAM rules'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No security exceptions or denial events detected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
