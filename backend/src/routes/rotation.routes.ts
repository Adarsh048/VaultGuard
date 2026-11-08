import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { rotationService } from '../services/rotation.service';

const router = Router();

// POST /api/rotation/:accountId - Initiate credential rotation (ADMIN only)
router.post(
  '/:accountId',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const accountId = req.params.accountId as string;

      if (typeof accountId !== 'string' || !mongoose.Types.ObjectId.isValid(accountId)) {
        res.status(400).json({ success: false, message: 'Invalid account ID format' });
        return;
      }

      const result = await rotationService.rotate(accountId, {
        _id: req.user!._id,
        name: req.user!.name,
      });

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Credential rotation failed',
      });
    }
  }
);

// GET /api/rotation/history - Get rotation history logs (ADMIN only)
router.get(
  '/history',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const accountId = req.query.accountId as string | undefined;

      if (accountId && !mongoose.Types.ObjectId.isValid(accountId)) {
        res.status(400).json({ success: false, message: 'Invalid account ID format' });
        return;
      }

      const history = await rotationService.getHistory(accountId);

      res.status(200).json({
        success: true,
        count: history.length,
        history,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve rotation history',
      });
    }
  }
);

export default router;
