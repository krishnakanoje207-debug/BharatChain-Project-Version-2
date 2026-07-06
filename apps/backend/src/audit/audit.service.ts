import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditLog } from "../entities";

/** Writes append-only audit records. Kept tiny so any module can depend on it. */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async log(
    actor: string,
    action: string,
    opts: { entityType?: string; entityId?: string; detail?: Record<string, unknown> } = {},
  ): Promise<void> {
    await this.repo.save(this.repo.create({ actor, action, ...opts }));
  }
}
