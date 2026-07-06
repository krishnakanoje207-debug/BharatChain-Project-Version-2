import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PaymentStatus } from "@bharatchain/shared";

/**
 * Off-chain mirror of a citizen→vendor payment (on-chain `PaymentRouter.pay`).
 * The citizen spends from a scheme entitlement; the e₹ moves to an approved,
 * category-allowed vendor. Redemption may only draw from DELIVERED payments
 * (citizen-confirmed proof-of-delivery).
 */
@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Paying citizen (users.id). */
  @Index()
  @Column()
  userId!: string;

  /** On-chain payment id (index into PaymentRouter.payments). */
  @Column({ type: "int" })
  onChainId!: number;

  @Column({ type: "int" })
  schemeId!: number;

  @Index()
  @Column()
  vendorAddress!: string;

  @Column({ nullable: true })
  vendorName?: string;

  @Column({ type: "numeric", precision: 40, scale: 0 })
  amount!: string;

  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.PAID })
  status!: PaymentStatus;

  @Column({ nullable: true })
  payTxHash?: string;

  @Column({ nullable: true })
  confirmTxHash?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
