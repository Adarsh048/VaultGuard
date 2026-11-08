import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { Badge } from '../components/common/Badge';
import {
  ScrollText,
  Download,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (actionFilter) params.action = actionFilter;
      if (usernameFilter) params.username = usernameFilter;
      if (resultFilter) params.result = resultFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/audit', { params });
      if (res.data?.success) {
        setLogs(res.data.logs);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error('Error fetching audit records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, resultFilter]);

  const handleExportCsv = () => {
    window.open('/api/audit/export', '_blank');
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'SUCCESS':
        return <Badge variant="success">SUCCESS</Badge>;
      case 'DENIED':
        return <Badge variant="warning">DENIED</Badge>;
      default:
        return <Badge variant="danger">FAILURE</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Immutable Audit & Compliance Ledger"
        subtitle="Forensic audit logging for access governance, compliance oversight, and threat auditing."
        actions={
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV Report</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Filtering Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Filter by User
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Username..."
                  value={usernameFilter}
                  onChange={(e) => setUsernameFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
                  className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Event Action
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="">All Actions</option>
                <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
                <option value="ACCOUNT_ONBOARDED">ACCOUNT_ONBOARDED</option>
                <option value="CREDENTIAL_RETRIEVED">CREDENTIAL_RETRIEVED</option>
                <option value="CREDENTIAL_RETRIEVAL_DENIED">CREDENTIAL_RETRIEVAL_DENIED</option>
                <option value="ACCESS_REQUEST_SUBMITTED">ACCESS_REQUEST_SUBMITTED</option>
                <option value="ACCESS_REQUEST_APPROVED">ACCESS_REQUEST_APPROVED</option>
                <option value="ACCESS_REQUEST_REJECTED">ACCESS_REQUEST_REJECTED</option>
                <option value="ACCESS_REVOKED">ACCESS_REVOKED</option>
                <option value="CREDENTIAL_ROTATED">CREDENTIAL_ROTATED</option>
                <option value="CREDENTIAL_ROTATION_FAILED">CREDENTIAL_ROTATION_FAILED</option>
                <option value="INCIDENT_CREATED">INCIDENT_CREATED</option>
                <option value="INCIDENT_RESOLVED">INCIDENT_RESOLVED</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Result Status
              </label>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="">All Results</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="DENIED">DENIED</option>
                <option value="FAILURE">FAILURE</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={fetchLogs}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Filter</span>
              </button>
            </div>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-sky-600" />
              <span>Audit Records</span>
            </h4>
            <span className="text-xs text-slate-400">Total: {total} events</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Event ID</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">PAM Action</th>
                  <th className="py-3 px-4">Related Account</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                        {log._id.slice(-6)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{log.username}</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-semibold text-slate-800">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {log.accountId?.accountName || 'N/A'}
                      </td>
                      <td className="py-3 px-4">{getResultBadge(log.result)}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{log.ipAddress}</td>
                      <td className="py-3 px-4 max-w-xs truncate font-mono text-[10px] text-slate-500" title={JSON.stringify(log.metadata)}>
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No audit records found matching query filters.
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

