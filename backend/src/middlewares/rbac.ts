import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { UserRole } from '../models/User';
import { auditService } from '../services/audit.service';
import { incidentService } from '../services/incident.service';

export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Record unauthorized access attempt in audit log
      await auditService.log({
        userId: req.user._id,
        username: req.user.name,
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        result: 'DENIED',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          path: req.originalUrl,
          method: req.method,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
        },
      });

      // Trigger rule-based security incident check
      await incidentService.triggerRuleBasedDetection({
        type: 'UNAUTHORIZED_ACCESS',
        userId: req.user._id,
        username: req.user.name,
        details: `Attempted to access ${req.method} ${req.originalUrl} requiring ${allowedRoles.join('/')}`,
      });

      res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user.role}' is not authorized to access this resource. Required: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }

    next();
  };
}

