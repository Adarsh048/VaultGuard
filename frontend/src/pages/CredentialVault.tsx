import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { CredentialModal } from '../components/common/CredentialModal';
import { Alert } from '../components/common/Alert';
import {
  KeyRound,
  Plus,
  Search,
  Server,
  Shield,
  Eye,
  FileQuestion,
  Trash2,
  Edit2,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export const CredentialVault: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [userGrants, setUserGrants] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  // Credential retrieval result modal
  const [retrievedCredential, setRetrievedCredential] = useState<any>(null);
  const [isCredentialOpen, setIsCredentialOpen] = useState(false);
  const [retrievalError, setRetrievalError] = useState('');

  // Form states
  const [onboardForm, setOnboardForm] = useState({
    accountName: '',
    username: '',
    accountType: 'Linux Root',
    hostname: '',
    description: '',
    password: '',
  });

  const [editForm, setEditForm] = useState({
    accountName: '',
    username: '',
    accountType: 'Linux Root',
    hostname: '',
    description: '',
    newPassword: '',
  });

  const [requestForm, setRequestForm] = useState({
    justification: '',
    requestedDuration: 60,
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  const loadAccountsAndGrants = async () => {
    try {
      const [accRes, myReqRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/requests/my'),
      ]);

      if (accRes.data?.success) {
        setAccounts(accRes.data.accounts);
      }

      // Map active grants by accountId
      if (myReqRes.data?.success && myReqRes.data.grants) {
        const grantMap: Record<string, any> = {};
        const now = new Date();
        myReqRes.data.grants.forEach((g: any) => {
          const accId = g.accountId?._id || g.accountId;
          if (g.status === 'Active' && new Date(g.expiresAt) > now) {
            grantMap[accId] = g;
          }
        });
        setUserGrants(grantMap);
      }
    } catch (err: any) {
      console.error('Error loading vault data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountsAndGrants();
  }, []);

  // Filter accounts
  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.accountName.toLowerCase().includes(search.toLowerCase()) ||
      acc.username.toLowerCase().includes(search.toLowerCase()) ||
      acc.hostname.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'ALL' || acc.accountType === typeFilter;
    return matchesSearch && matchesType;
  });

  // Onboard new privileged account
  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await api.post('/accounts', onboardForm);
      if (res.data?.success) {
        setActionSuccess('Privileged account successfully onboarded and secured in HashiCorp Vault.');
        setOnboardForm({
          accountName: '',
          username: '',
          accountType: 'Linux Root',
          hostname: '',
          description: '',
          password: '',
        });
        setTimeout(() => {
          setIsOnboardOpen(false);
          setActionSuccess('');
        }, 1200);
        loadAccountsAndGrants();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to onboard privileged account');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (account: any) => {
    setSelectedAccount(account);
    setEditForm({
      accountName: account.accountName,
      username: account.username,
      accountType: account.accountType,
      hostname: account.hostname,
      description: account.description || '',
      newPassword: '',
    });
    setActionError('');
    setActionSuccess('');
    setIsEditOpen(true);
  };

  // Submit Account Metadata & Credential Update
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const payload: Record<string, any> = {
        accountName: editForm.accountName,
        username: editForm.username,
        accountType: editForm.accountType,
        hostname: editForm.hostname,
        description: editForm.description,
      };
      if (editForm.newPassword && editForm.newPassword.trim()) {
        payload.newPassword = editForm.newPassword.trim();
      }

      const res = await api.put(`/accounts/${selectedAccount._id}`, payload);
      if (res.data?.success) {
        setActionSuccess('Account metadata updated successfully.');
        setTimeout(() => {
          setIsEditOpen(false);
          setActionSuccess('');
        }, 1200);
        loadAccountsAndGrants();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to update account metadata');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Access Request
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await api.post('/requests', {
        accountId: selectedAccount._id,
        justification: requestForm.justification,
        requestedDuration: Number(requestForm.requestedDuration),
      });

      if (res.data?.success) {
        setActionSuccess('Access request submitted. Awaiting administrator review.');
        setRequestForm({ justification: '', requestedDuration: 60 });
        setTimeout(() => {
          setIsRequestOpen(false);
          setActionSuccess('');
        }, 1200);
        loadAccountsAndGrants();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to submit access request');
    } finally {
      setActionLoading(false);
    }
  };

  // Retrieve Privileged Credential
  const handleRetrieveCredential = async (account: any) => {
    setRetrievalError('');
    try {
      const res = await api.post(`/accounts/${account._id}/retrieve`);
      if (res.data?.success) {
        setRetrievedCredential(res.data.credential);
        setIsCredentialOpen(true);
      }
    } catch (err: any) {
      setRetrievalError(err.response?.data?.message || 'Access Denied: Unable to retrieve credential');
      alert(`Access Denied:\n${err.response?.data?.message || 'Unauthorized credential retrieval.'}`);
    }
  };

  // Delete account (Admin only)
  const handleDeleteAccount = async (account: any) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete '${account.accountName}'? The secret in Vault will be purged.`
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(`/accounts/${account._id}`);
      if (res.data?.success) {
        loadAccountsAndGrants();
      }
    } catch (err: any) {
      alert(`Delete error: ${err.response?.data?.message || err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Privileged Credential Vault"
        subtitle="Hardware-isolated secret references protected by HashiCorp Vault KV v2."
        actions={
          isAdmin ? (
            <button
              onClick={() => {
                setActionError('');
                setActionSuccess('');
                setIsOnboardOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Onboard Privileged Account</span>
            </button>
          ) : null
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by account, user, host..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">All Account Types</option>
              <option value="Windows Administrator">Windows Administrator</option>
              <option value="Linux Root">Linux Root</option>
              <option value="Database Administrator">Database Administrator</option>
              <option value="Service Account">Service Account</option>
            </select>
          </div>
        </div>

        {/* Account Inventory Table */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Account Identifier</th>
                  <th className="py-3 px-4">Account Type</th>
                  <th className="py-3 px-4">Target Host</th>
                  <th className="py-3 px-4">Account Owner</th>
                  <th className="py-3 px-4">Vault Secret Path</th>
                  <th className="py-3 px-4">Rotation Status</th>
                  <th className="py-3 px-4 text-right">Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map((account) => {
                    const hasActiveGrant = Boolean(userGrants[account._id]);

                    return (
                      <tr key={account._id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{account.accountName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            user: {account.username}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-700">{account.accountType}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {account.hostname}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {account.ownerId?.name || 'Administrator'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-[11px] bg-slate-100 px-2 py-1 rounded text-slate-700 border border-slate-200">
                            {account.vaultSecretPath}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge
                            size="sm"
                            variant={
                              account.rotationStatus === 'synced'
                                ? 'success'
                                : account.rotationStatus === 'pending'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {account.rotationStatus}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Check Out or Request Access */}
                            {isAdmin || hasActiveGrant ? (
                              <button
                                onClick={() => handleRetrieveCredential(account)}
                                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                                title="Check out credential from HashiCorp Vault"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Check Out</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedAccount(account);
                                  setActionError('');
                                  setActionSuccess('');
                                  setIsRequestOpen(true);
                                }}
                                className="flex items-center gap-1.5 rounded-lg bg-sky-50 border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition"
                              >
                                <FileQuestion className="h-3.5 w-3.5" />
                                <span>Request Access</span>
                              </button>
                            )}

                            {/* Admin Management Controls */}
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => openEditModal(account)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition"
                                  title="Edit account metadata or password"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteAccount(account)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                  title="Delete account and purge Vault secret"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No privileged accounts found matching current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL 1: Onboard Privileged Account (Admin Only) */}
      <Modal
        isOpen={isOnboardOpen}
        onClose={() => setIsOnboardOpen(false)}
        title="Onboard Privileged Account"
        maxWidth="lg"
      >
        <form onSubmit={handleOnboardSubmit} className="space-y-4">
          {actionError && <Alert type="error">{actionError}</Alert>}
          {actionSuccess && <Alert type="success">{actionSuccess}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Name / Identifier *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. PROD-DC01-AD"
                value={onboardForm.accountName}
                onChange={(e) => setOnboardForm({ ...onboardForm, accountName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Privileged Username *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Administrator or root"
                value={onboardForm.username}
                onChange={(e) => setOnboardForm({ ...onboardForm, username: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Type *
              </label>
              <select
                value={onboardForm.accountType}
                onChange={(e) => setOnboardForm({ ...onboardForm, accountType: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="Windows Administrator">Windows Administrator</option>
                <option value="Linux Root">Linux Root</option>
                <option value="Database Administrator">Database Administrator</option>
                <option value="Service Account">Service Account</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Hostname / IP *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 10.0.10.15 or srv-core.internal"
                value={onboardForm.hostname}
                onChange={(e) => setOnboardForm({ ...onboardForm, hostname: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Secret Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••••••"
              value={onboardForm.password}
              onChange={(e) => setOnboardForm({ ...onboardForm, password: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Securely dispatched directly to HashiCorp Vault KV v2. Never written to MongoDB in plaintext.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Account Purpose / Description
            </label>
            <textarea
              rows={2}
              placeholder="Enterprise justification and operational scope..."
              value={onboardForm.description}
              onChange={(e) => setOnboardForm({ ...onboardForm, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsOnboardOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {actionLoading ? 'Writing to Vault...' : 'Commit to Vault'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Edit Privileged Account Metadata & Password (Admin Only) */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit Privileged Account: ${selectedAccount?.accountName || ''}`}
        maxWidth="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {actionError && <Alert type="error">{actionError}</Alert>}
          {actionSuccess && <Alert type="success">{actionSuccess}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Name / Identifier *
              </label>
              <input
                type="text"
                required
                value={editForm.accountName}
                onChange={(e) => setEditForm({ ...editForm, accountName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Privileged Username *
              </label>
              <input
                type="text"
                required
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Type *
              </label>
              <select
                value={editForm.accountType}
                onChange={(e) => setEditForm({ ...editForm, accountType: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="Windows Administrator">Windows Administrator</option>
                <option value="Linux Root">Linux Root</option>
                <option value="Database Administrator">Database Administrator</option>
                <option value="Service Account">Service Account</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Hostname / IP *
              </label>
              <input
                type="text"
                required
                value={editForm.hostname}
                onChange={(e) => setEditForm({ ...editForm, hostname: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Update Password in Vault (Optional)
            </label>
            <input
              type="password"
              minLength={8}
              placeholder="Leave empty to retain existing Vault secret"
              value={editForm.newPassword}
              onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              If provided, writes a new version to HashiCorp Vault KV v2 at <span className="font-mono text-slate-600">{selectedAccount?.vaultSecretPath}</span>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {actionLoading ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Request Access (Employee) */}
      <Modal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        title={`Request Temporary Access: ${selectedAccount?.accountName || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleRequestSubmit} className="space-y-4">
          {actionError && <Alert type="error">{actionError}</Alert>}
          {actionSuccess && <Alert type="success">{actionSuccess}</Alert>}

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="text-slate-500">Target System:</div>
            <div className="font-semibold text-slate-800">
              {selectedAccount?.accountName} ({selectedAccount?.accountType})
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              Host: {selectedAccount?.hostname}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Business Justification *
            </label>
            <textarea
              required
              minLength={10}
              rows={3}
              placeholder="Describe the operational task, incident ticket number, or change request ID..."
              value={requestForm.justification}
              onChange={(e) => setRequestForm({ ...requestForm, justification: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Requested Access Window (Minutes) *
            </label>
            <select
              value={requestForm.requestedDuration}
              onChange={(e) =>
                setRequestForm({ ...requestForm, requestedDuration: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            >
              <option value={15}>15 Minutes (Emergency Break-Glass)</option>
              <option value={30}>30 Minutes</option>
              <option value={60}>60 Minutes (Standard Maintenance)</option>
              <option value={120}>120 Minutes (2 Hours)</option>
              <option value={240}>240 Minutes (4 Hours)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRequestOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {actionLoading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Credential Retrieval Display Modal */}
      <CredentialModal
        isOpen={isCredentialOpen}
        onClose={() => setIsCredentialOpen(false)}
        credential={retrievedCredential}
      />
    </div>
  );
};
