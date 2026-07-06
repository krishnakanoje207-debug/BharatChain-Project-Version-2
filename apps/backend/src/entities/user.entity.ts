import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Role } from "@bharatchain/shared";
import { Application } from "./application.entity";

/**
 * A signed-up user. Users hold NO blockchain keys — the server-side relayer is
 * the only signer. Each citizen is assigned a deterministic on-chain identifier
 * (`chainAddress`) used as the `citizen` arg in enrollment/payment calls.
 * Login is phone + password; the phone is OTP-verified at signup (simulated SMS).
 */
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ length: 15 })
  phone!: string;

  @Column()
  passwordHash!: string;

  @Column({ nullable: true })
  fullName?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: "enum", enum: Role, default: Role.CITIZEN })
  role!: Role;

  @Column({ default: false })
  phoneVerified!: boolean;

  /** Deterministic on-chain address representing this citizen (relayer-controlled). */
  @Index({ unique: true })
  @Column({ nullable: true })
  chainAddress?: string;

  @OneToMany(() => Application, (a) => a.user)
  applications!: Application[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
