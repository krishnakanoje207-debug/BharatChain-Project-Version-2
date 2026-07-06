import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ApplicationStatus } from "@bharatchain/shared";
import { User } from "./user.entity";
import { ApplicationDocument } from "./document.entity";

/**
 * A citizen's application to a scheme. Carries the off-chain PII (never on-chain)
 * and the on-chain commitments: the eligibility nullifier and the enrollment tx.
 * `registryIndex`/`matchedPan` record which fixed government record was matched
 * during document verification.
 */
@Entity("applications")
@Index(["user", "schemeId"], { unique: true })
export class Application {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User, (u) => u.applications, { onDelete: "CASCADE" })
  user!: User;

  /** On-chain scheme id. */
  @Column({ type: "int" })
  schemeId!: number;

  @Column({ type: "enum", enum: ApplicationStatus, default: ApplicationStatus.PENDING })
  status!: ApplicationStatus;

  /** Matched government-registry record (fixed fixture). */
  @Column({ type: "int", nullable: true })
  registryIndex?: number;

  @Column({ nullable: true })
  matchedPan?: string;

  /** ZK eligibility nullifier (hex) — consumed on-chain on acceptance. */
  @Column({ nullable: true })
  nullifier?: string;

  /** Enrollment transaction hash (ZKEnroller.enrollWithProof). */
  @Column({ nullable: true })
  enrollTxHash?: string;

  /** How many disbursal installments this beneficiary has received (over-disbursal guard). */
  @Column({ type: "int", default: 0 })
  disbursementCount!: number;

  @Column({ type: "text", nullable: true })
  rejectionReason?: string;

  @OneToMany(() => ApplicationDocument, (d) => d.application)
  documents!: ApplicationDocument[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
