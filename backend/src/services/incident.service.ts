import { Types } from 'mongoose';
import { Incident, IncidentSeverity, IncidentStatus } from '../models/Incident';
import { AuditLog } from '../models/AuditLog';

export class IncidentService {
  /**
   * Helper to generate human-readable sequential Incident ID like INC-2026-0001
   */
  private async getNextIncidentId(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await Incident.countDocuments();
    const padded = String(count + 1).padStart(4, '0');
    return `INC-${year}-${padded}`;
  }

  /**
   * Manually create an incident
   */
  async createIncident(params: {
    title: string;
    description: string;
    severity: IncidentSeverity;
    relatedUserId?: Types.ObjectId | string | null;
    relatedAccountId?: Types.ObjectId | string | null;
    assignedTo?: Types.ObjectId | string | null;
    initialNote?: string;
    authorName?: string;
  }) {
    const incidentId = await this.getNextIncidentId();
    const notes = params.initialNote
      ? [
          {
            text: params.initialNote,
            author: params.authorName || 'System',
            timestamp: new Date(),
          },
        ]
      : [];

    const incident = await Incident.create({
      incidentId,
      title: params.title,
      description: params.description,
      severity: params.severity,
      relatedUserId: params.relatedUserId || null,
      relatedAccountId: params.relatedAccountId || null,
      assignedTo: params.assignedTo || null,
      status: 'Open',
      investigationNotes: notes,
      resolutionDetails: '',
    });

    return incident;
  }

  /**
   * Configurable rule-based detection engine
   * Checks for anomalous patterns and automatically generates incidents
   */
  async triggerRuleBasedDetection(event: {
    type:
      | 'FAILED_RETRIEVAL'
      | 'UNAUTHORIZED_ACCESS'
      | 'EXPIRED_ACCESS_ATTEMPT'
      | 'VAULT_FAILURE'
      | 'ROTATION_FAILURE';
    userId?: Types.ObjectId | string | null;
    username?: string;
    accountId?: Types.ObjectId | string | null;
    accountName?: string;
    details?: string;
  }) {
    try {
      if (event.type === 'FAILED_RETRIEVAL' || event.type === 'UNAUTHORIZED_ACCESS') {
        // Check if there are >= 3 denied access attempts in the last 15 minutes for this user
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const recentFailures = await AuditLog.countDocuments({
          userId: event.userId || null,
          action: { $in: ['CREDENTIAL_RETRIEVAL_DENIED', 'UNAUTHORIZED_ACCESS_ATTEMPT'] },
          timestamp: { $gte: fifteenMinutesAgo },
        });

        if (recentFailures >= 3) {
          // Check if an open incident already exists for this user in the last 30 minutes
          const existing = await Incident.findOne({
            relatedUserId: event.userId,
            status: { $in: ['Open', 'Investigating'] },
            title: { $regex: 'Repeated Unauthorized Access Attempts', $options: 'i' },
          });

          if (!existing) {
            await this.createIncident({
              title: `Repeated Unauthorized Access Attempts - User: ${event.username || 'Unknown'}`,
              description: `User ${event.username || 'Unknown'} made ${recentFailures} denied access attempts in the last 15 minutes. Potential brute-force or privilege escalation attempt.`,
              severity: 'High',
              relatedUserId: event.userId,
              relatedAccountId: event.accountId,
              initialNote: 'Automated alert triggered by rule: >= 3 denied credential retrievals within 15 minutes.',
              authorName: 'Security Automation Engine',
            });
          }
        }
      } else if (event.type === 'EXPIRED_ACCESS_ATTEMPT') {
        await this.createIncident({
          title: `Credential Retrieval with Expired Grant - Account: ${event.accountName || 'Unknown'}`,
          description: `User ${event.username || 'Unknown'} attempted to retrieve credentials for account ${event.accountName || 'Unknown'} using an expired or revoked access grant.`,
          severity: 'Medium',
          relatedUserId: event.userId,
          relatedAccountId: event.accountId,
          initialNote: 'Automated alert triggered by rule: Attempted access using expired grant.',
          authorName: 'Security Automation Engine',
        });
      } else if (event.type === 'ROTATION_FAILURE') {
        await this.createIncident({
          title: `Privileged Credential Rotation Failure - Account: ${event.accountName || 'Unknown'}`,
          description: `Automated or manual credential rotation failed for privileged account ${event.accountName || 'Unknown'}. Details: ${event.details || 'Vault update or target reconciliation failed.'}`,
          severity: 'High',
          relatedUserId: event.userId,
          relatedAccountId: event.accountId,
          initialNote: `Rotation process encountered an error: ${event.details || 'Unknown error'}. Immediate administrative investigation required.`,
          authorName: 'Rotation Supervisor',
        });
      } else if (event.type === 'VAULT_FAILURE') {
        // High severity Vault availability issue
        const existing = await Incident.findOne({
          status: { $in: ['Open', 'Investigating'] },
          title: { $regex: 'HashiCorp Vault Service Disruption', $options: 'i' },
        });

        if (!existing) {
          await this.createIncident({
            title: 'HashiCorp Vault Service Disruption Detected',
            description: `Backend health check failed to reach HashiCorp Vault. Reason: ${event.details || 'Vault unreachable or sealed'}. Privileged credential retrievals will fail closed.`,
            severity: 'Critical',
            initialNote: 'Rule triggered: Vault health check returned unavailable or connection error.',
            authorName: 'Health Monitor Agent',
          });
        }
      }
    } catch (err) {
      console.error('[IncidentService] Error in rule-based detection:', err);
    }
  }
}

export const incidentService = new IncidentService();

