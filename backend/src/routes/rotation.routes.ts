import { Router, Response } from 'express';
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
      const strictHostVerification = Boolean(
        req.body?.strictHostVerification ||
          req.body?.simulateFailure ||
          req.query?.strictHostVerification === 'true'
      );

      const result = await rotationService.rotate(
        accountId,
        {
          _id: req.user!._id,
          name: req.user!.name,
        },
        strictHostVerification
      );

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
