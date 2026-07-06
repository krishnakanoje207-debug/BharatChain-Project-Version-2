import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Append-only audit trail of sensitive actions (signup, login, enroll, disburse,
 * pay, redeem, admin approvals). Feeds the anomaly-detection pipeline later.
 */
@Entity("audit_logs")
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** User id, or a system actor: 'system' | 'relayer' | 'admin' | 'rbi'. */
  @Index()
  @Column()
  actor!: string;

  @Index()
  @Column()
  action!: string;

  @Column({ nullable: true })
  entityType?: string;

  @Column({ nullable: true })
  entityId?: string;

  @Column({ type: "jsonb", nullable: true })
  detail?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
