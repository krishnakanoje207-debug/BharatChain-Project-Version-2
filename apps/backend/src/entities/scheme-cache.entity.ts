import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { SchemeCategory } from "@bharatchain/shared";

/**
 * Off-chain mirror of an on-chain scheme, for fast reads and the public
 * "Government Schemes" browse-by-category page. Authoritative funds/disbursed
 * values live on-chain; this is a synced cache. Wei amounts are stored as
 * numeric strings to avoid precision loss.
 */
@Entity("scheme_cache")
export class SchemeCache {
  /** On-chain scheme id. */
  @PrimaryColumn({ type: "int" })
  schemeId!: number;

  @Column()
  name!: string;

  @Column({ type: "enum", enum: SchemeCategory })
  category!: SchemeCategory;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ nullable: true })
  ministry?: string;

  @Column({ type: "numeric", precision: 40, scale: 0, default: 0 })
  fund!: string;

  @Column({ type: "numeric", precision: 40, scale: 0, default: 0 })
  installmentAmount!: string;

  /**
   * Maximum number of installments a single beneficiary may receive for this
   * scheme. Total per-beneficiary entitlement = maxInstallments × installmentAmount.
   * Disbursal never pays past this cap (off-chain policy; the on-chain fund is the
   * other guard). Defaults to 3.
   */
  @Column({ type: "int", default: 3 })
  maxInstallments!: number;

  @Column({ type: "numeric", precision: 40, scale: 0, default: 0 })
  disbursed!: string;

  @Column({ default: true })
  active!: boolean;

  @UpdateDateColumn()
  syncedAt!: Date;
}
