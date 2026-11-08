import { z } from 'zod';

export const createAccessRequestSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  justification: z
    .string()
    .min(10, 'Business justification must be at least 10 characters')
    .max(1000)
    .trim(),
  requestedDuration: z
    .number()
    .min(5, 'Minimum duration is 5 minutes')
    .max(1440, 'Maximum duration is 24 hours (1440 minutes)'),
});

export const reviewRequestSchema = z.object({
  approvalComment: z.string().max(500).optional().default(''),
});

