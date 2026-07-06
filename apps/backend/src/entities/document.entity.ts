import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Application } from "./application.entity";

/** Document types whose unique IDs are matched against the government registry. */
export enum DocumentType {
  PAN = "PAN",
  KISSAN = "KISSAN",
  LAND = "LAND",
  INCOME = "INCOME",
  OTHER = "OTHER",
}

/**
 * An uploaded supporting document. The file bytes live in MinIO (`objectKey`);
 * only the metadata + the citizen-declared unique id (matched against the fixed
 * registry) are stored here. No PII leaves this table for the chain.
 */
@Entity("application_documents")
export class ApplicationDocument {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Application, (a) => a.documents, { onDelete: "CASCADE" })
  application!: Application;

  @Column({ type: "enum", enum: DocumentType })
  docType!: DocumentType;

  /** The unique id the citizen declares (e.g. PAN no.) — matched to the registry. */
  @Column()
  declaredId!: string;

  /** MinIO object key. */
  @Column()
  objectKey!: string;

  @Column()
  originalName!: string;

  @Column({ nullable: true })
  contentType?: string;

  @Column({ default: false })
  verified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
