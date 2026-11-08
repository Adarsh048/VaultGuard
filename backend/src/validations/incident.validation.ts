import { z } from 'zod';

export const createIncidentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').trim(),
  description: z.string().min(10, 'Description must be at least 10 characters').trim(),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  relatedUserId: z.string().optional().nullable(),
  relatedAccountId: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  initialNote: z.string().optional(),
});

export const updateIncidentSchema = z.object({
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['Open', 'Investigating', 'Resolved', 'Closed']).optional(),
  assignedTo: z.string().optional().nullable(),
  newNote: z.string().optional(),
  resolutionDetails: z.string().optional(),
});

