import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Alert } from '../components/common/Alert';
import {
  FileCheck2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';

export const AccessRequests: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Review modal (Approve/Reject)
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  const fetchRequests = async () => {
    try {
      if (isAdmin) {
        const res = await api.get('/requests');
        if (res.data?.success) setRequests(res.data.requests);
      } else {
        const res = await api.get('/requests/my');
        if (res.data?.success) {
          setRequests(res.data.requests);
          setGrants(res.data.grants);
        }
      }
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [isAdmin]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewLoading(true);
    setReviewError('');

    try {
      const endpoint = `/requests/${selectedReq._id}/${reviewAction}`;
      const res = await api.patch(endpoint, { approvalComment: reviewComment });

      if (res.data?.success) {
        setIsReviewOpen(false);
        setReviewComment('');
        fetchRequests();
      }
    } catch (err: any) {
      setReviewError(err.response?.data?.message || `Failed to ${reviewAction} request`);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleRevoke = async (reqItem: any) => {
    if (!window.confirm(`Revoke active access for request ${reqItem._id}?`)) return;

    try {
      const res = await api.patch(`/requests/${reqItem._id}/revoke`);
      if (res.data?.success) {
        fetchRequests();
      }
    } catch (err: any) {
      alert(`Revocation error: ${err.response?.data?.message || err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return <Badge variant="success">Approved</Badge>;
      case 'Pending':
        return <Badge variant="warning">Pending Review</Badge>;
      case 'Rejected':
        return <Badge variant="danger">Rejected</Badge>;
      case 'Revoked':
        return <Badge variant="purple">Revoked</Badge>;
      case 'Expired':
        return <Badge variant="neutral">Expired</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        title={isAdmin ? 'Access Requests & Governance Review' : 'My Privileged Access History'}
        subtitle={
          isAdmin
            ? 'Review employee justification, enforce dual-custody authorization, and manage leases.'
            : 'Track the authorization lifecycle of your privileged access requests.'
        }
      />

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Table of Requests */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-sky-600" />
              <span>{isAdmin ? 'Privileged Access Requests Ledger' : 'My Requests'}</span>
            </h3>
            <span className="text-xs text-slate-400">Total: {requests.length} records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Request Date</th>
                  {isAdmin && <th className="py-3 px-4">Requester</th>}
                  <th className="py-3 px-4">Target Privileged Account</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Business Justification</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.length > 0 ? (
                  requests.map((reqItem) => {
                    const isSelf = reqItem.requesterId?._id === user?.id;

                    return (
                      <tr key={reqItem._id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {new Date(reqItem.createdAt).toLocaleString()}
                        </td>

                        {isAdmin && (
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800">
                              {reqItem.requesterId?.name || 'Unknown'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {reqItem.requesterId?.email}
                            </div>
                          </td>
                        )}

                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-900">
                            {reqItem.accountId?.accountName || 'N/A'}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {reqItem.accountId?.accountType}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-medium text-slate-700">
                          {reqItem.requestedDuration} mins
                        </td>

                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-600" title={reqItem.justification}>
                          {reqItem.justification}
                        </td>

                        <td className="py-3.5 px-4">{getStatusBadge(reqItem.status)}</td>

                        <td className="py-3.5 px-4 text-right">
                          {isAdmin && reqItem.status === 'Pending' && (
                            <div className="flex items-center justify-end gap-1.5">
                              {isSelf ? (
                                <span
                                  className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200"
                                  title="Self-approval is forbidden by PAM policy"
                                >
                                  Self-Request (Cannot Approve)
                                </span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setSelectedReq(reqItem);
                                      setReviewAction('approve');
                                      setReviewComment('Approved after operational verification.');
                                      setReviewError('');
                                      setIsReviewOpen(true);
                                    }}
                                    className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedReq(reqItem);
                                      setReviewAction('reject');
                                      setReviewComment('Request rejected due to insufficient justification.');
                                      setReviewError('');
                                      setIsReviewOpen(true);
                                    }}
                                    className="flex items-center gap-1 rounded bg-rose-50 border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                                  >
                                    <X className="h-3 w-3" />
                                    <span>Reject</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {isAdmin && reqItem.status === 'Approved' && (
                            <button
                              onClick={() => handleRevoke(reqItem)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                            >
                              Revoke Access
                            </button>
                          )}

                          {reqItem.status !== 'Pending' && reqItem.status !== 'Approved' && (
                            <span className="text-[11px] text-slate-400">
                              {reqItem.approvalComment || 'Archived'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="py-8 text-center text-slate-400">
                      No access requests recorded in the system.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: Review Access Request */}
      <Modal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        title={`${reviewAction === 'approve' ? 'Approve' : 'Reject'} Privileged Access Request`}
        maxWidth="md"
      >
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          {reviewError && <Alert type="error">{reviewError}</Alert>}

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
            <div>
              <span className="text-slate-500">Requester:</span>{' '}
              <strong className="text-slate-800">{selectedReq?.requesterId?.name}</strong>
            </div>
            <div>
              <span className="text-slate-500">Target Account:</span>{' '}
              <strong className="text-slate-800">{selectedReq?.accountId?.accountName}</strong>
            </div>
            <div>
              <span className="text-slate-500">Justification:</span>{' '}
              <span className="text-slate-700 italic">"{selectedReq?.justification}"</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reviewer Notes / Approval Comments *
            </label>
            <textarea
              required
              rows={2}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsReviewOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reviewLoading}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white ${
                reviewAction === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              } disabled:opacity-50`}
            >
              {reviewLoading
                ? 'Processing...'
                : reviewAction === 'approve'
                ? 'Confirm Approval'
                : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

