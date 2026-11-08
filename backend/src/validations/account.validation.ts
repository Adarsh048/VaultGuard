import { z } from 'zod';

export const createAccountSchema = z.object({
  accountName: z.string().min(2, 'Account name must be at least 2 characters').trim(),
  username: z.string().min(1, 'Username is required').trim(),
  accountType: z.enum([
    'Windows Administrator',
    'Linux Root',
    'Service Account',
    'Database Administrator',
  ]),
  hostname: z.string().min(2, 'Hostname or target IP is required').trim(),
  description: z.string().max(500).default(''),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const updateAccountSchema = z.object({
  accountName: z.string().min(2).trim().optional(),
  username: z.string().min(1).trim().optional(),
  accountType: z
    .enum([
      'Windows Administrator',
      'Linux Root',
      'Service Account',
      'Database Administrator',
    ])
    .optional(),
  hostname: z.string().min(2).trim().optional(),
  description: z.string().max(500).optional(),
  newPassword: z.string().min(8).optional(),
});

