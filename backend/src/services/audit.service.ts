import { Types } from 'mongoose';
import { AuditLog, AuditResult } from '../models/AuditLog';

export interface LogAuditParams {
  userId?: Types.ObjectId | string | null;
  username: string;
  action: string;
  accountId?: Types.ObjectId | string | null;
  result: AuditResult;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  /**
   * Record a non-sensitive audit event. Never accepts passwords, tokens, or plaintext secrets.
   */
  async log(params: LogAuditParams): Promise<void> {
    try {
      // Security filter: Redact any accidental sensitive keys in metadata
      const cleanMetadata: Record<string, any> = {};
      if (params.metadata) {
        for (const [key, value] of Object.entries(params.metadata)) {
          const lower = key.toLowerCase();
          if (
            lower.includes('password') ||
            lower.includes('token') ||
            lower.includes('secret') ||
            lower.includes('credential') ||
            lower.includes('hash')
          ) {
            cleanMetadata[key] = '[REDACTED]';
          } else {
            cleanMetadata[key] = value;
          }
        }
      }

      await AuditLog.create({
        userId: params.userId || null,
        username: params.username || 'ANONYMOUS',
        action: params.action,
        accountId: params.accountId || null,
        result: params.result,
        ipAddress: params.ipAddress || '127.0.0.1',
        metadata: cleanMetadata,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
    }
  }

  /**
   * Search and filter audit records
   */
  async queryLogs(filters: {
    action?: string;
    username?: string;
    result?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }) {
    const query: Record<string, any> = {};

    if (filters.action) {
      query.action = { $regex: filters.action, $options: 'i' };
    }
    if (filters.username) {
      query.username = { $regex: filters.username, $options: 'i' };
    }
    if (filters.result) {
      query.result = filters.result;
    }
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.timestamp.$lte = new Date(filters.endDate);
      }
    }

    const limit = Math.min(filters.limit || 50, 200);
    const skip = filters.skip || 0;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('accountId', 'accountName accountType hostname')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return { logs, total, limit, skip };
  }

  /**
   * Generate CSV format for audit export
   */
  async exportCsv(): Promise<string> {
    const logs = await AuditLog.find()
      .populate('accountId', 'accountName accountType')
      .sort({ timestamp: -1 })
      .limit(2000)
      .lean();

    const headers = [
      'Event ID',
      'Timestamp',
      'Username',
      'Action',
      'Result',
      'Account Name',
      'IP Address',
      'Metadata',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = logs.map((log: any) => [
      escapeCsv(log._id),
      escapeCsv(new Date(log.timestamp).toISOString()),
      escapeCsv(log.username),
      escapeCsv(log.action),
      escapeCsv(log.result),
      escapeCsv(log.accountId?.accountName || 'N/A'),
      escapeCsv(log.ipAddress),
      escapeCsv(log.metadata),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

export const auditService = new AuditService();

