import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/rbac';
import { Incident } from '../models/Incident';
import { incidentService } from '../services/incident.service';
import { auditService } from '../services/audit.service';
import {
  createIncidentSchema,
  updateIncidentSchema,
} from '../validations/incident.validation';

const router = Router();

// GET /api/incidents - List all security incidents (ADMIN only)
router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { status, severity } = req.query;
      const query: Record<string, any> = {};

      if (status) query.status = status;
      if (severity) query.severity = severity;

      const incidents = await Incident.find(query)
        .populate('relatedUserId', 'name email role')
        .populate('relatedAccountId', 'accountName accountType')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        count: incidents.length,
        incidents,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to retrieve incidents' });
    }
  }
);

// POST /api/incidents - Create a new incident manually (ADMIN only)
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = createIncidentSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid incident parameters',
        });
        return;
      }

      const { title, description, severity, relatedUserId, relatedAccountId, assignedTo, initialNote } =
        parseResult.data;

      const incident = await incidentService.createIncident({
        title,
        description,
        severity,
        relatedUserId: relatedUserId || null,
        relatedAccountId: relatedAccountId || null,
        assignedTo: assignedTo || null,
        initialNote,
        authorName: req.user?.name || 'Administrator',
      });

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'INCIDENT_CREATED',
        accountId: relatedAccountId || null,
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          incidentId: incident.incidentId,
          title: incident.title,
          severity: incident.severity,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Security incident registered',
        incident,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to create incident' });
    }
  }
);

// PATCH /api/incidents/:id - Update incident status, severity, assign, add notes (ADMIN only)
router.patch(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = updateIncidentSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          message: parseResult.error.errors[0]?.message || 'Invalid update data',
        });
        return;
      }

      const incident = await Incident.findById(req.params.id);
      if (!incident) {
        res.status(404).json({ success: false, message: 'Incident not found' });
        return;
      }

      const { severity, status, assignedTo, newNote, resolutionDetails } = parseResult.data;

      if (severity) incident.severity = severity;
      if (status) incident.status = status;
      if (assignedTo !== undefined) incident.assignedTo = assignedTo ? (assignedTo as any) : null;
      if (resolutionDetails !== undefined) incident.resolutionDetails = resolutionDetails;

      if (newNote && newNote.trim()) {
        incident.investigationNotes.push({
          text: newNote.trim(),
          author: req.user?.name || 'Administrator',
          timestamp: new Date(),
        });
      }

      await incident.save();

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'INCIDENT_UPDATED',
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          incidentId: incident.incidentId,
          status: incident.status,
          severity: incident.severity,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Incident updated successfully',
        incident,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to update incident' });
    }
  }
);

// PATCH /api/incidents/:id/resolve - Resolve incident (ADMIN only)
router.patch(
  '/:id/resolve',
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const incident = await Incident.findById(req.params.id);
      if (!incident) {
        res.status(404).json({ success: false, message: 'Incident not found' });
        return;
      }

      const resolutionDetails = req.body?.resolutionDetails || 'Resolved by administrator';

      incident.status = 'Resolved';
      incident.resolutionDetails = resolutionDetails;
      incident.investigationNotes.push({
        text: `Incident resolved: ${resolutionDetails}`,
        author: req.user?.name || 'Administrator',
        timestamp: new Date(),
      });

      await incident.save();

      await auditService.log({
        userId: req.user?._id,
        username: req.user?.name || 'ADMIN',
        action: 'INCIDENT_RESOLVED',
        result: 'SUCCESS',
        ipAddress: req.ip || '127.0.0.1',
        metadata: {
          incidentId: incident.incidentId,
          resolutionDetails,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Incident successfully resolved',
        incident,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: 'Failed to resolve incident' });
    }
  }
);

export default router;

