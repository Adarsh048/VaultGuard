import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { PrivilegedAccount } from '../models/PrivilegedAccount';
import { User } from '../models/User';
import { AccessRequest } from '../models/AccessRequest';
import { AccessGrant } from '../models/AccessGrant';
import { Incident } from '../models/Incident';
import { AuditLog } from '../models/AuditLog';
import { vaultService } from '../services/vault.service';

const router = Router();

// GET /api/dashboard/summary
router.get(
  '/summary',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const [
        totalAccounts,
        totalUsers,
        pendingRequests,
        approvedRequests,
        openIncidents,
        criticalIncidents,
        vaultHealth,
        accountsByCategory,
        rotationStats,
        activeGrants,
      ] = await Promise.all([
        PrivilegedAccount.countDocuments(),
        User.countDocuments(),
        AccessRequest.countDocuments({ status: 'Pending' }),
        AccessRequest.countDocuments({ status: 'Approved' }),
        Incident.countDocuments({ status: { $in: ['Open', 'Investigating'] } }),
        Incident.countDocuments({ severity: 'Critical', status: { $in: ['Open', 'Investigating'] } }),
        vaultService.getHealth(),
        PrivilegedAccount.aggregate([
          { $group: { _id: '$accountType', count: { $sum: 1 } } },
        ]),
        PrivilegedAccount.aggregate([
          { $group: { _id: '$rotationStatus', count: { $sum: 1 } } },
        ]),
        AccessGrant.countDocuments({ status: 'Active', expiresAt: { $gt: new Date() } }),
      ]);

      const categoryMap: Record<string, number> = {
        'Windows Administrator': 0,
        'Linux Root': 0,
        'Service Account': 0,
        'Database Administrator': 0,
      };

      accountsByCategory.forEach((item) => {
        if (item._id && categoryMap[item._id] !== undefined) {
          categoryMap[item._id] = item.count;
        }
      });

      const rotationMap: Record<string, number> = {
        synced: 0,
        pending: 0,
        failed: 0,
      };

      rotationStats.forEach((item) => {
        if (item._id && rotationMap[item._id] !== undefined) {
          rotationMap[item._id] = item.count;
        }
      });

      res.status(200).json({
        success: true,
        summary: {
          totalAccounts,
          totalUsers,
          pendingRequests,
          approvedRequests,
          activeGrants,
          openIncidents,
          criticalIncidents,
          vaultStatus: vaultHealth.statusText,
          vaultSealed: vaultHealth.sealed,
          categories: categoryMap,
          rotation: rotationMap,
        },
      });
    } catch (error: any) {
      console.error('[Dashboard] Summary error:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve dashboard summary' });
    }
  }
);

// GET /api/dashboard/recent-activity
router.get(
  '/recent-activity',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const [recentAudit, recentIncidents] = await Promise.all([
        AuditLog.find()
          .populate('accountId', 'accountName')
          .sort({ timestamp: -1 })
          .limit(10)
          .lean(),
        Incident.find()
          .populate('relatedAccountId', 'accountName')
          .populate('relatedUserId', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ]);

      res.status(200).json({
        success: true,
        recentAudit,
        recentIncidents,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve recent activity' });
    }
  }
);

export default router;

