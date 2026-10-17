import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { auditEvents } from './audit.schema.js';

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  /** Identifiers and flags only — never secrets, tokens, codes or raw personal data. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly database: DatabaseService) {}

  /** Best effort: an audit failure is logged but never breaks the user's request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.database.db.insert(auditEvents).values({
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        ip: entry.ip ?? null,
        metadata: entry.metadata,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record audit event ${entry.action}: ${(error as Error).message}`,
      );
    }
  }
}
