import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { AccessRequest } from '../models/AccessRequest';
import { AccessGrant } from '../models/AccessGrant';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
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

// GET /api/requests/my - List current user's requests and grants
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

      // Automatically flag expired grants
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

// PATCH /api/requests/:id/approve - Approve access request (ADMIN only)
router.patch(
  '/:id/approve',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = reviewRequestSchema.safeParse(req.body);
      const approvalComment = parseResult.success ? parseResult.data.approvalComment : '';

      const request = await AccessRequest.findById(req.params.id).populate('accountId');
      if (!request) {
        res.status(404).json({ success: false, message: 'Access request not found' });
        return;
      }

      if (request.status !== 'Pending') {
        res.status(400).json({
          success: false,
          message: `Cannot approve request with current status '${request.status}'`,
        });
        return;
      }

      // Security requirement: Prevent self-approval
      if (request.requesterId.toString() === req.user?._id.toString()) {
        res.status(403).json({
          success: false,
          message: 'Self-approval violation: Administrators are strictly forbidden from approving their own access requests.',
        });
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + request.requestedDuration * 60 * 1000);

      // Create AccessGrant
      const grant = await AccessGrant.create({
        userId: request.requesterId,
        accountId: request.accountId,
        requestId: request._id,
        approvedBy: req.user?._id,
        expiresAt,
        status: 'Active',
      });

      // Update request status
      request.status = 'Approved';
      request.reviewedBy = (req.user?._id as Types.ObjectId) || null;
      request.approvalComment = approvalComment || 'Approved by administrator';
      await request.save();

      // Audit log
      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCESS_REQUEST_APPROVED',
        accountId: request.accountId._id,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          requestId: request._id,
          grantId: grant._id,
          targetUserId: request.requesterId,
          expiresAt: expiresAt.toISOString(),
          durationMinutes: request.requestedDuration,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Access request approved. Temporary access grant activated.',
        request,
        grant,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to approve request' });
    }
  }
);

// PATCH /api/requests/:id/reject - Reject access request (ADMIN only)
router.patch(
  '/:id/reject',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = reviewRequestSchema.safeParse(req.body);
      const approvalComment = parseResult.success ? parseResult.data.approvalComment : '';

      const request = await AccessRequest.findById(req.params.id);
      if (!request) {
        res.status(404).json({ success: false, message: 'Access request not found' });
        return;
      }

      if (request.status !== 'Pending') {
        res.status(400).json({
          success: false,
          message: `Cannot reject request with current status '${request.status}'`,
        });
        return;
      }

      request.status = 'Rejected';
      request.reviewedBy = (req.user?._id as Types.ObjectId) || null;
      request.approvalComment = approvalComment || 'Rejected by administrator';
      await request.save();

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'ACCESS_REQUEST_REJECTED',
        accountId: request.accountId,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          requestId: request._id,
          reason: request.approvalComment,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Access request rejected',
        request,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to reject request' });
    }
  }
);

// PATCH /api/requests/:id/revoke - Revoke active access (ADMIN only)
router.patch(
  '/:id/revoke',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
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
