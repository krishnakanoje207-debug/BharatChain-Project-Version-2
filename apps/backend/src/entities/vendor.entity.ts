import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { VendorCategory } from "@bharatchain/shared";

/**
 * Off-chain mirror of an admin-approved vendor/institution. Vendors self-register
 * and are approved by an admin on-chain (no dummy/pre-seeded vendors beyond the
 * demo institutions). `approved` reflects the on-chain VendorRegistry state.
 */
@Entity("vendors")
export class Vendor {
  /** On-chain vendor address. */
  @PrimaryColumn()
  address!: string;

  @Column()
  name!: string;

  @Column({ type: "enum", enum: VendorCategory })
  category!: VendorCategory;

  @Column({ nullable: true })
  city?: string;

  @Column({ default: false })
  approved!: boolean;

  @UpdateDateColumn()
  syncedAt!: Date;
}
