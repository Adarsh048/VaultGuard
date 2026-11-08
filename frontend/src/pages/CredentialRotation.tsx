import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { Badge } from '../components/common/Badge';
import { Alert } from '../components/common/Alert';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Info,
  Server,
} from 'lucide-react';

export const CredentialRotation: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [strictVerification, setStrictVerification] = useState(false);
  const [rotationResult, setRotationResult] = useState<any>(null);
  const [rotationError, setRotationError] = useState('');

  const fetchData = async () => {
    try {
      const [accRes, histRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/rotation/history'),
      ]);

      if (accRes.data?.success) {
        setAccounts(accRes.data.accounts);
        if (accRes.data.accounts.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accRes.data.accounts[0]._id);
        }
      }

      if (histRes.data?.success) {
        setHistory(histRes.data.history);
      }
    } catch (err) {
      console.error('Error fetching rotation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleExecuteRotation = async () => {
    if (!selectedAccountId) return;
    setRotating(true);
    setRotationResult(null);
    setRotationError('');

    try {
      const res = await api.post(`/rotation/${selectedAccountId}`, {
        strictHostVerification: strictVerification,
      });

      if (res.data?.success) {
        setRotationResult(res.data);
        fetchData();
      }
    } catch (err: any) {
      setRotationError(err.response?.data?.message || 'Credential rotation failed');
      fetchData();
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Privileged Credential Rotation & Lifecycle"
        subtitle="Cryptographic password rotation directly integrated with HashiCorp Vault KV v2."
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Architecture Banner */}
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-sky-950 mb-1">
            <Info className="h-4 w-4 text-sky-700" />
            <span>Enterprise PAM Rotation Architecture</span>
          </div>
          VaultGuard enforces explicit separation of duties: (1) <strong>Vault Secret Versioning</strong> (generates a 24-character cryptographic token and commits an immutable new KV v2 secret version), (2) <strong>Target Host Reconciliation</strong> (reconciles state against endpoint), and (3) <strong>Post-Rotation Verification</strong>.
        </div>

        {/* Action Panel */}
        <div className="rounded-xl bg-white p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <RotateCw className="h-4 w-4 text-sky-600" />
            <span>Execute Privileged Credential Rotation</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Privileged Account *
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.accountName} ({acc.accountType} - {acc.hostname})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reconciliation Policy
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                <input
                  type="checkbox"
                  id="strictVerification"
                  checked={strictVerification}
                  onChange={(e) => setStrictVerification(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="strictVerification" className="text-xs text-slate-700 font-medium">
                  Enforce strict host agent verification (Fail closed on timeout)
                </label>
              </div>
            </div>

            <div>
              <button
                onClick={handleExecuteRotation}
                disabled={rotating || !selectedAccountId}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${rotating ? 'animate-spin' : ''}`} />
                <span>{rotating ? 'Writing Secret to Vault...' : 'Execute Rotation'}</span>
              </button>
            </div>
          </div>

          {/* Result Notification */}
          {rotationResult && (
            <div className="mt-4">
              <Alert type="success" title="Credential Rotation Succeeded">
                {rotationResult.message}. New secret version active in HashiCorp Vault. Account status marked Synced.
              </Alert>
            </div>
          )}

          {rotationError && (
            <div className="mt-4">
              <Alert type="error" title="Credential Rotation Failed">
                {rotationError}. Security incident automatically registered in Incident Management.
              </Alert>
            </div>
          )}
        </div>

        {/* Rotation History Ledger */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-600" />
              <span>Rotation Audit & Reconciliation Log</span>
            </h4>
            <span className="text-xs text-slate-400">Total: {history.length} records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Rotated By</th>
                  <th className="py-3 px-4">Vault Updated</th>
                  <th className="py-3 px-4">Target Reconciled</th>
                  <th className="py-3 px-4">Verified</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Reconciliation Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length > 0 ? (
                  history.map((record) => (
                    <tr key={record._id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {new Date(record.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {record.accountName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {record.rotatedBy?.name || 'Administrator'}
                      </td>
                      <td className="py-3.5 px-4">
                        {record.vaultSecretUpdated ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {record.targetPasswordChanged ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="text-rose-600 font-semibold flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {record.passwordVerified ? (
                          <span className="text-emerald-600 font-semibold">Verified</span>
                        ) : (
                          <span className="text-rose-500 font-semibold">Failed</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          size="sm"
                          variant={record.status === 'SUCCESS' ? 'success' : 'danger'}
                        >
                          {record.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-sm truncate" title={record.reconciliationNotes}>
                        {record.failureReason ? (
                          <span className="text-rose-600 font-medium">{record.failureReason}</span>
                        ) : (
                          record.reconciliationNotes
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No credential rotation events recorded yet.
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
