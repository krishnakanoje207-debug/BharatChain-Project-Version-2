import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Off-chain record of one disbursal round (an on-chain "installment"). Each round
 * builds a Merkle root of (citizen, amount) allocations for a scheme's enrolled
 * beneficiaries, draws the scheme fund down by the total, and the relayer claims
 * each allocation into the citizen's entitlement.
 */
@Entity("disbursement_rounds")
export class DisbursementRound {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "int" })
  schemeId!: number;

  /** On-chain installment id (global across schemes). */
  @Column({ type: "int" })
  installmentId!: number;

  /** Scheme-local installment number (1 = first installment, 2 = second, …). */
  @Column({ type: "int", default: 1 })
  installmentNo!: number;

  @Column()
  merkleRoot!: string;

  @Column({ type: "numeric", precision: 40, scale: 0 })
  allocated!: string;

  @Column({ type: "numeric", precision: 40, scale: 0 })
  installmentAmount!: string;

  @Column({ type: "int" })
  beneficiaryCount!: number;

  @Column({ type: "int", default: 0 })
  claimedCount!: number;

  @Column({ nullable: true })
  createTxHash?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
