import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ApplicationStatus } from "@bharatchain/shared";
import { Application, ApplicationDocument, DocumentType, User } from "../entities";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";
import { StorageService } from "../storage/storage.service";
import { IneligibleError, RegistryService } from "../registry/registry.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notification.service";
import { CreateApplicationDto } from "./dto/application.dto";

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @InjectRepository(Application) private readonly apps: Repository<Application>,
    @InjectRepository(ApplicationDocument) private readonly docs: Repository<ApplicationDocument>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
    private readonly storage: StorageService,
    private readonly registry: RegistryService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  /** Step 1: pick a scheme, declare PAN, match against the fixed registry. */
  async create(userId: string, dto: CreateApplicationDto) {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    const scheme = await this.schemes.getOne(dto.schemeId); // 404 if unknown
    if (!scheme.active) throw new BadRequestException("This scheme is not currently active.");

    // Re-apply is blocked only once ACCEPTED (or while one is in progress); a
    // REJECTED applicant may try again — e.g. after correcting a document id.
    const dup = await this.apps.findOne({ where: { user: { id: userId }, schemeId: dto.schemeId } });
    if (dup && dup.status !== ApplicationStatus.REJECTED) {
      throw new ConflictException(
        dup.status === ApplicationStatus.APPROVED
          ? "You are already enrolled in this scheme."
          : "You already have an application in progress for this scheme.",
      );
    }

    const match = await this.registry.findByPan(dto.pan);
    if (!match) throw new NotFoundException("This PAN was not found in the government registry.");
    // Cross-check whichever scheme-specific declarations the citizen supplied against the
    // fixed registry (a friendly pre-check; the zk proof is the authoritative gate at submit).
    this.assertDeclaredMatches("Kissan card number", dto.kissan, match.record.kissan);
    this.assertDeclaredMatches("Land record id", dto.land, match.record.land);
    this.assertDeclaredNumberMatches("Caste category", dto.caste, match.record.caste);
    this.assertDeclaredNumberMatches("Housing status", dto.houseStatus, match.record.houseStatus);
    if (dto.isStudent !== undefined && Number(dto.isStudent) !== match.record.isStudent) {
      throw new BadRequestException("Student status does not match government records.");
    }

    // Clear out the prior rejected attempt (and its documents) before retrying.
    if (dup) {
      await this.docs.createQueryBuilder().delete().where('"applicationId" = :id', { id: dup.id }).execute();
      await this.apps.delete(dup.id);
    }

    const app = await this.apps.save(
      this.apps.create({
        user,
        schemeId: dto.schemeId,
        status: ApplicationStatus.PENDING,
        registryIndex: match.index,
        matchedPan: match.record.pan,
      }),
    );
    await this.audit.log(userId, "application.created", {
      entityType: "application",
      entityId: app.id,
      detail: { schemeId: dto.schemeId },
    });
    return {
      id: app.id,
      schemeId: app.schemeId,
      status: app.status,
      scheme: { name: scheme.name, category: scheme.category },
      applicant: { name: match.record.name, state: match.record.state },
    };
  }

  /** Step 2: attach a supporting document (stored in MinIO). */
  async addDocument(userId: string, appId: string, file: UploadedFile, docType: DocumentType, declaredId: string) {
    if (!file) throw new BadRequestException("A file is required.");
    const app = await this.ownedApp(userId, appId);
    if (app.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException("This application has already been processed.");
    }
    const record = await this.registry.recordAt(app.registryIndex!);
    const expected = { [DocumentType.PAN]: record.pan, [DocumentType.KISSAN]: record.kissan, [DocumentType.LAND]: record.land } as Record<string, string>;
    const verified =
      expected[docType] !== undefined &&
      expected[docType] !== "" &&
      expected[docType].toUpperCase() === declaredId.trim().toUpperCase();

    const objectKey = await this.storage.putDocument(app.id, file.originalname, file.buffer, file.mimetype);
    const doc = await this.docs.save(
      this.docs.create({
        application: app,
        docType,
        declaredId,
        objectKey,
        originalName: file.originalname,
        contentType: file.mimetype,
        verified,
      }),
    );
    return { id: doc.id, docType: doc.docType, originalName: doc.originalName, verified: doc.verified };
  }

  /**
   * Step 3: prove eligibility (zk-SNARK) and enrol on-chain via the relayer.
   * Ineligible records (or on-chain reverts) move the application to REJECTED
   * with a human-readable reason rather than throwing.
   */
  async submit(userId: string, appId: string) {
    const app = await this.ownedApp(userId, appId);
    if (app.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(`Application already ${app.status.toLowerCase()}.`);
    }
    if (!app.user.chainAddress) {
      throw new BadRequestException("Your account is missing a chain identity. Re-verify your phone.");
    }

    // The scheme's sector selects the eligibility predicate the proof must satisfy, and is bound to
    // the scheme on-chain by ZKEnroller (so a proof for one sector can't enrol another's scheme).
    const schemeCategory = Number(await this.chain.schemeRegistry.categoryOf(app.schemeId));

    let proof;
    try {
      proof = await this.registry.proveEligibility(app.registryIndex!, app.schemeId, schemeCategory);
    } catch (e) {
      if (e instanceof IneligibleError) return this.reject(app, e.message, userId);
      throw e;
    }

    try {
      // Route through the relayer serializer so enrolment nonces don't collide
      // with concurrent disbursal/payment/redemption transactions.
      const receipt = await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.zkEnroller.enrollWithProof(
          app.schemeId,
          app.user.chainAddress,
          proof.a,
          proof.b,
          proof.c,
          proof.signals,
          { nonce },
        );
        return tx.wait();
      });
      app.status = ApplicationStatus.APPROVED;
      app.nullifier = proof.nullifier;
      app.enrollTxHash = receipt.hash;
      await this.apps.save(app);
      await this.audit.log(userId, "application.enrolled", {
        entityType: "application",
        entityId: app.id,
        detail: { schemeId: app.schemeId, txHash: receipt.hash },
      });
      await this.notifications.notify({
        userId,
        type: "enrollment",
        title: "Application approved",
        body: `You have been enrolled in scheme #${app.schemeId}. Your installments will be disbursed to your account.`,
        email: app.user.email,
      });
      return { id: app.id, status: app.status, txHash: receipt.hash, nullifier: app.nullifier };
    } catch (err) {
      return this.reject(app, this.revertReason(err), userId);
    }
  }

  /** Admin: every application across all citizens (with applicant + scheme name). */
  async listAll() {
    const apps = await this.apps.find({ relations: ["user"], order: { createdAt: "DESC" } });
    const schemes = await this.schemes.listFromChain();
    const nameOf = (id: number) => schemes.find((s) => s.schemeId === id)?.name ?? `Scheme #${id}`;
    return apps.map((a) => ({
      id: a.id,
      schemeId: a.schemeId,
      schemeName: nameOf(a.schemeId),
      status: a.status,
      applicant: a.user?.fullName ?? a.user?.phone ?? "—",
      phone: a.user?.phone,
      enrollTxHash: a.enrollTxHash,
      rejectionReason: a.rejectionReason,
      createdAt: a.createdAt,
    }));
  }

  async listMine(userId: string) {
    const apps = await this.apps.find({
      where: { user: { id: userId } },
      order: { createdAt: "DESC" },
    });
    return apps.map((a) => ({
      id: a.id,
      schemeId: a.schemeId,
      status: a.status,
      enrollTxHash: a.enrollTxHash,
      rejectionReason: a.rejectionReason,
      createdAt: a.createdAt,
    }));
  }

  async getOne(userId: string, appId: string) {
    const app = await this.ownedApp(userId, appId, true);
    return {
      id: app.id,
      schemeId: app.schemeId,
      status: app.status,
      nullifier: app.nullifier,
      enrollTxHash: app.enrollTxHash,
      rejectionReason: app.rejectionReason,
      documents: (app.documents ?? []).map((d) => ({
        id: d.id,
        docType: d.docType,
        originalName: d.originalName,
        verified: d.verified,
      })),
      createdAt: app.createdAt,
    };
  }

  // ----- helpers -----

  private async reject(app: Application, reason: string, userId: string) {
    app.status = ApplicationStatus.REJECTED;
    app.rejectionReason = reason;
    await this.apps.save(app);
    await this.audit.log(userId, "application.rejected", {
      entityType: "application",
      entityId: app.id,
      detail: { reason },
    });
    return { id: app.id, status: app.status, reason };
  }

  private assertDeclaredMatches(label: string, declared: string | undefined, onRecord: string): void {
    if (declared && onRecord && declared.trim().toUpperCase() !== onRecord.toUpperCase()) {
      throw new BadRequestException(`${label} does not match government records.`);
    }
  }

  private assertDeclaredNumberMatches(label: string, declared: number | undefined, onRecord: number): void {
    if (declared !== undefined && declared !== onRecord) {
      throw new BadRequestException(`${label} does not match government records.`);
    }
  }

  private async ownedApp(userId: string, appId: string, withDocs = false): Promise<Application> {
    const app = await this.apps.findOne({
      where: { id: appId },
      relations: withDocs ? ["user", "documents"] : ["user"],
    });
    if (!app) throw new NotFoundException("Application not found.");
    if (app.user.id !== userId) throw new ForbiddenException("Not your application.");
    return app;
  }

  private revertReason(err: unknown): string {
    const e = err as { revert?: { name?: string }; shortMessage?: string; reason?: string };
    return e?.revert?.name ?? e?.reason ?? e?.shortMessage ?? "Enrollment failed on-chain.";
  }
}
