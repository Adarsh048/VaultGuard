import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { auditService } from '../services/audit.service';

const router = Router();

// GET /api/audit - Query audit logs with filtering (ADMIN only)
router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { action, username, result, startDate, endDate, limit, skip } = req.query;

      const resultData = await auditService.queryLogs({
        action: action as string,
        username: username as string,
        result: result as string,
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        skip: skip ? parseInt(skip as string, 10) : undefined,
      });

      res.status(200).json({
        success: true,
        ...resultData,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve audit logs' });
    }
  }
);

// GET /api/audit/export - Export audit logs to CSV (ADMIN only)
router.get(
  '/export',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const csv = await auditService.exportCsv();
      const filename = `vaultguard_audit_export_${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to export audit logs' });
    }
  }
);

export default router;

