import crypto from 'crypto';
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

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Deterministic canonical JSON serialization (alphabetically sorted keys)
 */
function canonicalStringify(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Recursively redacts sensitive fields at any nesting depth
 */
function recursiveRedact(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(recursiveRedact);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('credential') ||
      lower.includes('hash') ||
      lower.includes('cookie') ||
      lower.includes('auth') ||
      lower.includes('private')
    ) {
      clean[key] = '[REDACTED]';
    } else {
      clean[key] = recursiveRedact(val);
    }
  }
  return clean;
}

export class AuditService {
  private writeMutex: Promise<void> = Promise.resolve();

  /**
   * Calculate SHA-256 hash for an audit record payload
   */
  calculateHash(payload: {
    sequenceNumber: number;
    timestampIso: string;
    username: string;
    action: string;
    result: string;
    accountIdStr: string;
    metadata: Record<string, any>;
    previousHash: string;
  }): string {
    const canonical = canonicalStringify(payload);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Record a non-sensitive audit event with cryptographic hash chaining
   */
  async log(params: LogAuditParams): Promise<void> {
    // Queue writes to ensure sequential sequenceNumber and previousHash consistency
    return new Promise<void>((resolve) => {
      this.writeMutex = this.writeMutex.then(async () => {
        try {
          const cleanMetadata = recursiveRedact(params.metadata || {});

          // Fetch the latest audit log entry to establish the cryptographic chain link
          const latestLog = await AuditLog.findOne({ sequenceNumber: { $exists: true, $ne: null } })
            .sort({ sequenceNumber: -1 })
            .lean();
          const sequenceNumber =
            latestLog && typeof latestLog.sequenceNumber === 'number' && !isNaN(latestLog.sequenceNumber)
              ? latestLog.sequenceNumber + 1
              : 1;
          const previousHash = latestLog?.hash || GENESIS_HASH;
          const timestamp = new Date();

          const accountIdStr = params.accountId ? params.accountId.toString() : '';

          const hash = this.calculateHash({
            sequenceNumber,
            timestampIso: timestamp.toISOString(),
            username: params.username || 'ANONYMOUS',
            action: params.action,
            result: params.result,
            accountIdStr,
            metadata: cleanMetadata,
            previousHash,
          });

          await AuditLog.create({
            sequenceNumber,
            userId: params.userId || null,
            username: params.username || 'ANONYMOUS',
            action: params.action,
            accountId: params.accountId || null,
            result: params.result,
            ipAddress: params.ipAddress || '127.0.0.1',
            metadata: cleanMetadata,
            timestamp,
            previousHash,
            hash,
          });
        } catch (err) {
          console.error('[AuditService] Critical failure recording audit log:', err);
        } finally {
          resolve();
        }
      });
    });
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
        .sort({ sequenceNumber: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return { logs, total, limit, skip };
  }

  /**
   * Verify cryptographic hash chain integrity across all audit records
   * Detects record modification, insertion, deletion, or reordering.
   */
  async verifyIntegrity(): Promise<{
    valid: boolean;
    totalChecked: number;
    brokenSequence?: number;
    details: string;
  }> {
    const logs = await AuditLog.find().sort({ sequenceNumber: 1 }).lean();

    if (logs.length === 0) {
      return { valid: true, totalChecked: 0, details: 'Audit ledger is empty.' };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < logs.length; i++) {
      const record = logs[i];
      const expectedSeq = i + 1;

      // Verify sequence sequence continuity
      if (record.sequenceNumber !== expectedSeq) {
        return {
          valid: false,
          totalChecked: i,
          brokenSequence: record.sequenceNumber,
          details: `Sequence gap detected: expected ${expectedSeq}, found ${record.sequenceNumber}. Possible record deletion.`,
        };
      }

      // Verify previous hash link
      if (record.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          totalChecked: i,
          brokenSequence: record.sequenceNumber,
          details: `Hash link broken at sequence ${record.sequenceNumber}: previousHash does not match prior record hash.`,
        };
      }

      // Recompute and verify current record hash
      const accountIdStr = record.accountId ? record.accountId.toString() : '';
      const computedHash = this.calculateHash({
        sequenceNumber: record.sequenceNumber,
        timestampIso: new Date(record.timestamp).toISOString(),
        username: record.username,
        action: record.action,
        result: record.result,
        accountIdStr,
        metadata: record.metadata || {},
        previousHash: record.previousHash,
      });

      if (computedHash !== record.hash) {
        return {
          valid: false,
          totalChecked: i,
          brokenSequence: record.sequenceNumber,
          details: `Payload integrity violation at sequence ${record.sequenceNumber}: content was altered post-creation.`,
        };
      }

      expectedPrevHash = record.hash;
    }

    return {
      valid: true,
      totalChecked: logs.length,
      details: `All ${logs.length} audit records verified against cryptographic SHA-256 hash chain. No tampering detected.`,
    };
  }

  /**
   * Export audit log ledger to CSV format
   */
  async exportCsv(): Promise<string> {
    const logs = await AuditLog.find()
      .populate('accountId', 'accountName accountType')
      .sort({ sequenceNumber: -1 })
      .limit(5000)
      .lean();

    const headers = [
      'Seq',
      'Timestamp',
      'Actor',
      'Action',
      'Result',
      'Target Asset',
      'IP Address',
      'SHA256 Hash',
      'Previous Hash',
      'Metadata',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = logs.map((log: any) => [
      escapeCsv(log.sequenceNumber),
      escapeCsv(new Date(log.timestamp).toISOString()),
      escapeCsv(log.username),
      escapeCsv(log.action),
      escapeCsv(log.result),
      escapeCsv(log.accountId?.accountName || 'N/A'),
      escapeCsv(log.ipAddress),
      escapeCsv(log.hash),
      escapeCsv(log.previousHash),
      escapeCsv(log.metadata),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

export const auditService = new AuditService();
