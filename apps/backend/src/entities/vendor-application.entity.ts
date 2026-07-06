import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { VendorCategory } from "@bharatchain/shared";
import { User } from "./user.entity";

export enum VendorApplicationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

/**
 * A self-registered vendor's request to be onboarded. The applicant declares a
 * business that must exist in the fixed government business registry; an admin
 * reviews and, on approval, registers + ZK-enrols the vendor on-chain.
 */
@Entity("vendor_applications")
export class VendorApplication {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE", eager: true })
  @JoinColumn()
  user!: User;

  @Column()
  businessName!: string;

  @Column()
  declaredBusinessId!: string;

  @Column({ type: "enum", enum: VendorCategory })
  category!: VendorCategory;

  @Column({ nullable: true })
  city?: string;

  @Column({ type: "enum", enum: VendorApplicationStatus, default: VendorApplicationStatus.PENDING })
  status!: VendorApplicationStatus;

  /** The vendor's on-chain address once approved (the user's chain identity). */
  @Column({ nullable: true })
  vendorAddress?: string;

  @Column({ nullable: true })
  rejectionReason?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
