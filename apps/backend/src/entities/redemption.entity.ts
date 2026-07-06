import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { RedemptionStatus } from "@bharatchain/shared";

/**
 * Off-chain mirror of a vendor's e₹→fiat redemption request
 * (on-chain `RedemptionController`). A vendor may only redeem DELIVERED value.
 * The request captures the off-chain legitimacy/ITR evidence the RBI reviews;
 * on approval the e₹ is burned and a (simulated) bank payout reference is recorded.
 */
@Entity("redemptions")
export class Redemption {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** On-chain request id (index into RedemptionController.requests). */
  @Column({ type: "int" })
  onChainId!: number;

  @Index()
  @Column()
  vendorAddress!: string;

  @Column({ nullable: true })
  vendorName?: string;

  @Column({ type: "numeric", precision: 40, scale: 0 })
  amount!: string;

  @Column({ type: "enum", enum: RedemptionStatus, default: RedemptionStatus.PENDING })
  status!: RedemptionStatus;

  /** Legitimacy / ITR evidence supplied with the request (reviewed by the RBI). */
  @Column({ nullable: true })
  itrNumber?: string;

  @Column({ type: "jsonb", nullable: true })
  legitimacy?: Record<string, unknown>;

  /** Bank account the (simulated) fiat payout is sent to on approval. */
  @Column({ nullable: true })
  bankAccount?: string;

  /** Simulated bank payout reference, set on approval. */
  @Column({ nullable: true })
  payoutReference?: string;

  /** Who decided (RBI admin actor id). */
  @Column({ nullable: true })
  decidedBy?: string;

  @Column({ type: "text", nullable: true })
  decisionReason?: string;

  @Column({ nullable: true })
  requestTxHash?: string;

  @Column({ nullable: true })
  decisionTxHash?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
