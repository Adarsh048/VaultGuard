import { Router, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { AccessRequest } from '../models/AccessRequest';
import { AccessGrant } from '../models/AccessGrant';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { Incident } from '../models/Incident';
import { auditService } from '../services/audit.service';
import {
  createAccessRequestSchema,
  reviewRequestSchema,
} from '../validations/request.validation';

const router = Router();

// POST /api/requests - Submit a new access request
router.post(
  '/',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = createAccessRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid request parameters',
        });
        return;
      }

      const { accountId, justification, requestedDuration } = parseResult.data;

      if (!mongoose.Types.ObjectId.isValid(accountId)) {
        res.status(400).json({ success: false, message: 'Invalid target account ID format' });
        return;
      }

      const account = await PrivilegedAccount.findById(accountId);
      if (!account) {
        res.status(404).json({ success: false, message: 'Privileged account not found' });
        return;
      }

      const accessRequest = await AccessRequest.create({
        requesterId: req.user?._id,
        accountId: account._id,
        justification,
        requestedDuration,
        status: 'Pending',
      });

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'EMPLOYEE',
        action: 'ACCESS_REQUEST_SUBMITTED',
        accountId: account._id,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          requestId: accessRequest._id,
          accountName: account.accountName,
          requestedDurationMinutes: requestedDuration,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Access request submitted successfully for administrative review',
        request: accessRequest,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to submit access request' });
    }
  }
);

// GET /api/requests - List all requests (ADMIN only)
router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const requests = await AccessRequest.find()
        .populate('requesterId', 'name email role')
        .populate('accountId', 'accountName accountType hostname')
        .populate('reviewedBy', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        count: requests.length,
        requests,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve access requests' });
    }
  }
);

// GET /api/requests/my - List current user's requests and active grants
router.get(
  '/my',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const [requests, grants] = await Promise.all([
        AccessRequest.find({ requesterId: req.user?._id })
          .populate('accountId', 'accountName accountType hostname')
          .populate('reviewedBy', 'name')
          .sort({ createdAt: -1 })
          .lean(),
        AccessGrant.find({ userId: req.user?._id })
          .populate('accountId', 'accountName accountType hostname')
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      // Automatically identify expired grants
      const now = new Date();
      const updatedGrants = grants.map((g: any) => {
        if (g.status === 'Active' && new Date(g.expiresAt) <= now) {
          return { ...g, status: 'Expired' };
        }
        return g;
      });

      res.status(200).json({
        success: true,
        requests,
        grants: updatedGrants,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve personal requests' });
    }
  }
);

// PATCH /api/requests/:id/approve - Approve access request (ADMIN only, race-protected)
router.patch(
  '/:id/approve',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (typeof req.params.id !== 'string' || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid request ID format' });
        return;
      }

      const parseResult = reviewRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid review request input parameters',
        });
        return;
      }
      const approvalComment = parseResult.data.approvalComment?.trim() || 'Approved by administrator';

      // Check existing request state
      const existingRequest = await AccessRequest.findById(req.params.id);
      if (!existingRequest) {
        res.status(404).json({ success: false, message: 'Access request not found' });
        return;
      }

      if (existingRequest.status !== 'Pending') {
        res.status(400).json({
          success: false,
          message: `Cannot approve request with current status '${existingRequest.status}'`,
        });
        return;
      }

      // Security requirement: Prevent self-approval
      if (existingRequest.requesterId.toString() === req.user?._id.toString()) {
        res.status(403).json({
          success: false,
          message: 'Self-approval violation: Administrators are strictly forbidden from approving their own access requests.',
        });
        return;
      }

      // Atomic state transition: Ensure only one concurrent admin approval succeeds
      const updatedRequest = await AccessRequest.findOneAndUpdate(
        { _id: req.params.id, status: 'Pending' },
        {
          $set: {
            status: 'Approved',
            reviewedBy: req.user?._id,
            approvalComment,
          },
        },
        { new: true }
      ).populate('accountId');

      if (!updatedRequest) {
        res.status(409).json({
          success: false,
          message: 'Concurrent approval conflict: Request was already processed by another administrator.',
        });
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + updatedRequest.requestedDuration * 60 * 1000);

      // Create AccessGrant linked to approved request with compensation rollback
      let grant: any = null;
      try {
        grant = await AccessGrant.create({
          userId: updatedRequest.requesterId,
          accountId: updatedRequest.accountId,
          requestId: updatedRequest._id,
          approvedBy: req.user?._id,
          expiresAt,
          status: 'Active',
        });
      } catch (grantErr: any) {
        // Rollback request state to Pending so it is not left Approved without an active grant
        try {
          await AccessRequest.updateOne(
            { _id: updatedRequest._id },
            {
              $set: {
                status: 'Pending',
                reviewedBy: null,
                approvalComment: '',
              },
            }
          );
        } catch (rollbackErr: any) {
          // If rollback fails, create a high-severity incident and fail closed
          try {
            const year = new Date().getFullYear();
            await Incident.create({
              incidentId: `INC-${year}-${Date.now().toString().slice(-4)}`,
              title: 'Compensation Rollback Failure: Inconsistent Access Request State',
              description: `Critical: Failed to rollback AccessRequest ${updatedRequest._id} to Pending after grant creation error. System state is inconsistent.`,
              severity: 'Critical',
              status: 'Open',
              investigationNotes: [
                {
                  text: `Grant error: ${grantErr.message} | Rollback error: ${rollbackErr.message}`,
                  author: 'System',
                  timestamp: new Date(),
                },
              ],
            });
          } catch (incErr) {
            console.error('[Requests] Failed to record rollback incident:', incErr);
          }

          res.status(500).json({
            success: false,
            message: 'Critical error: Grant activation and compensation rollback failed. Security incident generated (fail-closed).',
          });
          return;
        }

        res.status(500).json({
          success: false,
          message: `Failed to issue access grant: ${grantErr.message}. Request reverted to Pending.`,
        });
        return;
      }

      // Audit log with fail-closed guarantee: If audit fails, revoke grant and rollback request
      try {
        await auditService.log({
          userId: req.user?._id,
          username: req.user?.name || 'ADMIN',
          action: 'ACCESS_REQUEST_APPROVED',
          accountId: (updatedRequest.accountId as any)?._id || updatedRequest.accountId,
          result: 'SUCCESS',
          ipAddress: req.ip || '127.0.0.1',
          metadata: {
            requestId: updatedRequest._id,
            grantId: grant._id,
            targetUserId: updatedRequest.requesterId,
            expiresAt: expiresAt.toISOString(),
            durationMinutes: updatedRequest.requestedDuration,
          },
        });
      } catch (auditErr: any) {
        try {
          await AccessGrant.deleteOne({ _id: grant._id });
          await AccessRequest.updateOne(
            { _id: updatedRequest._id },
            {
              $set: {
                status: 'Pending',
                reviewedBy: null,
                approvalComment: '',
              },
            }
          );
        } catch (rollbackErr: any) {
          // If rollback fails, create a high-severity incident and fail closed
          try {
            const year = new Date().getFullYear();
            await Incident.create({
              incidentId: `INC-${year}-${Date.now().toString().slice(-4)}`,
              title: 'Compensation Rollback Failure: Orphan Access Grant Detected',
              description: `Critical: Audit logging failed and compensation rollback failed to remove grant ${grant._id} or revert request ${updatedRequest._id}.`,
              severity: 'Critical',
              status: 'Open',
              investigationNotes: [
                {
                  text: `Audit error: ${auditErr.message} | Rollback error: ${rollbackErr.message}`,
                  author: 'System',
                  timestamp: new Date(),
                },
              ],
            });
          } catch (incErr) {
            console.error('[Requests] Failed to record rollback incident:', incErr);
          }

          res.status(500).json({
            success: false,
            message: 'Critical error: Audit logging and compensation rollback failed. Security incident generated (fail-closed).',
          });
          return;
        }

        res.status(500).json({
          success: false,
          message: 'Critical audit logging failure: Access approval cancelled (fail-closed).',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Access request approved. Temporary access grant activated.',
        request: updatedRequest,
        grant,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to approve request' });
    }
  }
);

// PATCH /api/requests/:id/reject - Reject access request (ADMIN only, race-protected)
router.patch(
  '/:id/reject',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (typeof req.params.id !== 'string' || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid request ID format' });
        return;
      }

      const parseResult = reviewRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid review request input parameters',
        });
        return;
      }
      const approvalComment = parseResult.data.approvalComment?.trim() || 'Rejected by administrator';

      const updatedRequest = await AccessRequest.findOneAndUpdate(
        { _id: req.params.id, status: 'Pending' },
        {
          $set: {
            status: 'Rejected',
            reviewedBy: req.user?._id,
            approvalComment: approvalComment || 'Rejected by administrator',
          },
        },
        { new: true }
      );

      if (!updatedRequest) {
        res.status(400).json({
          success: false,
          message: 'Access request not found or already processed.',
        });
        return;
      }

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCESS_REQUEST_REJECTED',
        accountId: updatedRequest.accountId,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          requestId: updatedRequest._id,
          reason: updatedRequest.approvalComment,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Access request rejected',
        request: updatedRequest,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to reject request' });
    }
  }
);

// PATCH /api/requests/:id/revoke - Revoke active access grant immediately (ADMIN only)
router.patch(
  '/:id/revoke',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (typeof req.params.id !== 'string' || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400).json({ success: false, message: 'Invalid request ID format' });
        return;
      }

      const request = await AccessRequest.findById(req.params.id);
      if (!request) {
        res.status(404).json({ success: false, message: 'Access request not found' });
        return;
      }

      const grant = await AccessGrant.findOne({ requestId: request._id });
      if (grant) {
        grant.status = 'Revoked';
        grant.revokedAt = new Date();
        await grant.save();
      }

      request.status = 'Revoked';
      request.approvalComment = (request.approvalComment || '') + ' [REVOKED BY ADMIN]';
      await request.save();

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCESS_REVOKED',
        accountId: request.accountId,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          requestId: request._id,
          grantId: grant?._id,
          revokedAt: new Date().toISOString(),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Access grant successfully revoked with immediate effect',
        request,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to revoke access' });
    }
  }
);

export default router;
