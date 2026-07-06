import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AnomalyStatus, AnomalyType } from "@bharatchain/shared";

/**
 * A fraud/anomaly signal raised by the Kafka-fed detector (fan-in, velocity,
 * self-dealing). Surfaced to admin/RBI dashboards. Deduplicated while OPEN by
 * (type, subjectId) so a sustained pattern doesn't spam new rows.
 */
@Entity("anomalies")
@Index(["type", "subjectId", "status"])
export class Anomaly {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "enum", enum: AnomalyType })
  type!: AnomalyType;

  /** LOW | MEDIUM | HIGH */
  @Column({ default: "MEDIUM" })
  severity!: string;

  /** What the signal is about, e.g. "vendor". */
  @Column()
  subjectType!: string;

  /** Identifier of the subject (e.g. vendor address). */
  @Index()
  @Column()
  subjectId!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "jsonb", nullable: true })
  detail?: Record<string, unknown>;

  @Column({ type: "enum", enum: AnomalyStatus, default: AnomalyStatus.OPEN })
  status!: AnomalyStatus;

  @Column({ nullable: true })
  resolvedBy?: string;

  @Column({ type: "timestamptz", nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
