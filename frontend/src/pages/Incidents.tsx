import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Alert } from '../components/common/Alert';
import {
  AlertTriangle,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  ShieldAlert,
  Send,
  Check,
} from 'lucide-react';

export const Incidents: React.FC = () => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    severity: 'Medium',
    relatedAccountId: '',
    initialNote: '',
  });

  const [newNote, setNewNote] = useState('');
  const [resolutionDetails, setResolutionDetails] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchIncidents = async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;

      const [incRes, accRes] = await Promise.all([
        api.get('/incidents', { params }),
        api.get('/accounts'),
      ]);

      if (incRes.data?.success) setIncidents(incRes.data.incidents);
      if (accRes.data?.success) setAccounts(accRes.data.accounts);
    } catch (err) {
      console.error('Error fetching incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter, severityFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError('');

    try {
      const res = await api.post('/incidents', {
        ...createForm,
        relatedAccountId: createForm.relatedAccountId || undefined,
      });

      if (res.data?.success) {
        setIsCreateOpen(false);
        setCreateForm({
          title: '',
          description: '',
          severity: 'Medium',
          relatedAccountId: '',
          initialNote: '',
        });
        fetchIncidents();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to create incident');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedIncident) return;
    setActionLoading(true);
    try {
      const res = await api.patch(`/incidents/${selectedIncident._id}`, {
        newNote,
        status: selectedIncident.status === 'Open' ? 'Investigating' : selectedIncident.status,
      });

      if (res.data?.success) {
        setSelectedIncident(res.data.incident);
        setNewNote('');
        fetchIncidents();
      }
    } catch (err: any) {
      alert(`Error updating notes: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveIncident = async () => {
    if (!selectedIncident) return;
    setActionLoading(true);
    try {
      const res = await api.patch(`/incidents/${selectedIncident._id}/resolve`, {
        resolutionDetails: resolutionDetails || 'Threat mitigated and incident verified closed by administrator.',
      });

      if (res.data?.success) {
        setSelectedIncident(res.data.incident);
        setResolutionDetails('');
        fetchIncidents();
      }
    } catch (err: any) {
      alert(`Error resolving incident: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'Critical':
        return <Badge variant="danger">Critical</Badge>;
      case 'High':
        return <Badge variant="warning">High</Badge>;
      case 'Medium':
        return <Badge variant="info">Medium</Badge>;
      default:
        return <Badge variant="neutral">Low</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Open':
        return <Badge variant="danger">Open</Badge>;
      case 'Investigating':
        return <Badge variant="warning">Investigating</Badge>;
      case 'Resolved':
        return <Badge variant="success">Resolved</Badge>;
      default:
        return <Badge variant="neutral">Closed</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title="Security Incident Management"
        subtitle="Rule-based anomaly detection and forensic investigation of privileged access violations."
        actions={
          <button
            onClick={() => {
              setActionError('');
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Create Security Incident</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Investigating">Investigating</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>

            <span className="text-xs text-slate-500 font-medium ml-2">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <span className="text-xs text-slate-400">Total: {incidents.length} incidents</span>
        </div>

        {/* Incidents Table */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Incident ID</th>
                  <th className="py-3 px-4">Title & Context</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Related Account / User</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned To</th>
                  <th className="py-3 px-4">Detected At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.length > 0 ? (
                  incidents.map((inc) => (
                    <tr key={inc._id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {inc.incidentId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{inc.title}</div>
                        <div className="text-[11px] text-slate-500 max-w-sm truncate">
                          {inc.description}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{getSeverityBadge(inc.severity)}</td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {inc.relatedAccountId?.accountName ? (
                          <span className="font-medium text-slate-800">
                            {inc.relatedAccountId.accountName}
                          </span>
                        ) : inc.relatedUserId?.name ? (
                          <span>{inc.relatedUserId.name}</span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{getStatusBadge(inc.status)}</td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {inc.assignedTo?.name || 'Alexander Vance'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {new Date(inc.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedIncident(inc);
                            setIsDetailsOpen(true);
                          }}
                          className="rounded-lg bg-sky-50 border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition"
                        >
                          Investigate
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No security incidents matching current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL 1: Create Incident */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register Security Incident"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {actionError && <Alert type="error">{actionError}</Alert>}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Incident Title *
            </label>
            <input
              type="text"
              required
              minLength={5}
              placeholder="e.g. Unauthorized Credential Access on Linux Core Node"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Severity Level *
              </label>
              <select
                value={createForm.severity}
                onChange={(e) => setCreateForm({ ...createForm, severity: e.target.value as any })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Related Privileged Account
              </label>
              <select
                value={createForm.relatedAccountId}
                onChange={(e) => setCreateForm({ ...createForm, relatedAccountId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="">None / General Incident</option>
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.accountName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Detailed Description *
            </label>
            <textarea
              required
              minLength={10}
              rows={3}
              placeholder="Technical summary of the anomalous behavior, logs, or breach indication..."
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Investigation Note
            </label>
            <input
              type="text"
              placeholder="Immediate containment actions taken..."
              value={createForm.initialNote}
              onChange={(e) => setCreateForm({ ...createForm, initialNote: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {actionLoading ? 'Registering...' : 'Register Incident'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Investigate Incident */}
      {selectedIncident && (
        <Modal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          title={`Investigation: ${selectedIncident.incidentId}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{selectedIncident.title}</h4>
                <p className="text-xs text-slate-600 mt-1">{selectedIncident.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {getSeverityBadge(selectedIncident.severity)}
                {getStatusBadge(selectedIncident.status)}
              </div>
            </div>

            {/* Notes Thread */}
            <div>
              <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                Investigation Notes & Remediation History
              </h5>
              <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                {selectedIncident.investigationNotes?.length > 0 ? (
                  selectedIncident.investigationNotes.map((note: any, idx: number) => (
                    <div key={idx} className="p-2.5 rounded bg-white border border-slate-200 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <strong className="text-slate-700 font-semibold">{note.author}</strong>
                        <span>{new Date(note.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-slate-800">{note.text}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-2">
                    No investigation notes recorded yet.
                  </p>
                )}
              </div>
            </div>

            {/* Append Note */}
            {selectedIncident.status !== 'Resolved' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add an investigation note or forensic observation..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || actionLoading}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Add Note</span>
                </button>
              </div>
            )}

            {/* Resolve Form */}
            {selectedIncident.status !== 'Resolved' ? (
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Remediation Details to Resolve Incident:
                </label>
                <textarea
                  rows={2}
                  placeholder="Root cause identified, compromised token revoked, target credentials rotated..."
                  value={resolutionDetails}
                  onChange={(e) => setResolutionDetails(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleResolveIncident}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    <span>Resolve & Close Incident</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800">
                <span className="font-semibold block">Incident Resolved:</span>
                {selectedIncident.resolutionDetails || 'Verified mitigated by administrator.'}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

