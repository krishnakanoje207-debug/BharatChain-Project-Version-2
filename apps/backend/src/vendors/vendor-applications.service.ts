import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, Repository } from "typeorm";
import { VendorCategory, vendorCategoryIndex } from "@bharatchain/shared";
import { User, Vendor, VendorApplication, VendorApplicationStatus } from "../entities";
import { ChainService } from "../chain/chain.service";
import { VendorRegistryService } from "../registry/vendor-registry.service";
import { VendorEnrollmentService } from "./vendor-enrollment.service";
import { NotificationService } from "../notifications/notification.service";
import { AuditService } from "../audit/audit.service";
import { CreateVendorApplicationDto } from "./dto/vendor-application.dto";

@Injectable()
export class VendorApplicationsService {
  private readonly logger = new Logger(VendorApplicationsService.name);

  constructor(
    @InjectRepository(VendorApplication) private readonly apps: Repository<VendorApplication>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    private readonly chain: ChainService,
    private readonly registry: VendorRegistryService,
    private readonly enrollment: VendorEnrollmentService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /** Vendor: submit an onboarding request for a registered business. */
  async create(userId: string, dto: CreateVendorApplicationDto) {
    const user = await this.users.findOneOrFail({ where: { id: userId } });

    const dup = await this.apps.findOne({ where: { user: { id: userId } }, order: { createdAt: "DESC" } });
    if (dup && dup.status !== VendorApplicationStatus.REJECTED) {
      throw new ConflictException(
        dup.status === VendorApplicationStatus.APPROVED
          ? "Your business is already approved."
          : "You already have a vendor application under review.",
      );
    }

    const match = await this.registry.findByName(dto.businessName);
    if (!match) throw new NotFoundException("This business was not found in the government business registry.");
    if (match.record.businessId.toUpperCase() !== dto.businessId.trim().toUpperCase()) {
      throw new BadRequestException("The business id does not match the registry record for this business.");
    }

    // A business can be claimed by only ONE account — block a second user from
    // applying with an id that already has a live (pending/approved) claim.
    const claimed = await this.apps.findOne({
      where: {
        declaredBusinessId: match.record.businessId,
        status: Not(VendorApplicationStatus.REJECTED),
        user: { id: Not(userId) },
      },
    });
    if (claimed) {
      throw new ConflictException("This business is already claimed by another account. Contact support if you believe this is an error.");
    }

    const category = VendorCategory[match.record.categoryLabel as keyof typeof VendorCategory];
    const app = await this.apps.save(
      this.apps.create({
        user,
        businessName: match.record.name,
        declaredBusinessId: match.record.businessId,
        category,
        city: match.record.city,
        status: VendorApplicationStatus.PENDING,
      }),
    );
    await this.audit.log(userId, "vendor_application.created", {
      entityType: "vendor_application",
      entityId: app.id,
      detail: { businessName: app.businessName },
    });
    return this.toMineView(app);
  }

  async listMine(userId: string) {
    const apps = await this.apps.find({ where: { user: { id: userId } }, order: { createdAt: "DESC" } });
    return apps.map((a) => this.toMineView(a));
  }

  /** Admin: every vendor application (optionally only those awaiting review). */
  async listAll(status?: VendorApplicationStatus) {
    const apps = await this.apps.find({
      where: status ? { status } : {},
      order: { createdAt: "DESC" },
    });
    return apps.map((a) => ({
      id: a.id,
      businessName: a.businessName,
      businessId: a.declaredBusinessId,
      category: a.category,
      city: a.city,
      status: a.status,
      applicant: a.user?.fullName ?? a.user?.phone ?? "—",
      phone: a.user?.phone,
      vendorAddress: a.vendorAddress,
      rejectionReason: a.rejectionReason,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Admin: approve a pending application — register the vendor on-chain
   * (VendorRegistry) and ZK-enrol it into every scheme its category serves.
   * The business must hold a valid licence in the registry (the same gate the
   * ZK circuit enforces); lapsed-licence businesses are rejected.
   */
  async approve(appId: string, adminId: string) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException("Vendor application not found.");
    if (app.status !== VendorApplicationStatus.PENDING) {
      throw new BadRequestException(`Application already ${app.status.toLowerCase()}.`);
    }
    const user = await this.users.findOneOrFail({ where: { id: app.user.id } });
    if (!user.chainAddress) throw new BadRequestException("Vendor account has no chain identity. They must re-verify their phone.");

    const match = await this.registry.findByName(app.businessName);
    if (!match) return this.reject(app, "Business no longer in the registry.", adminId);
    if (match.record.licenseValid !== 1) {
      return this.reject(app, "Business licence has lapsed in the registry — cannot be approved.", adminId);
    }

    // One live claim per business: if another application already got this
    // business approved, this one is a duplicate claim (the ZK nullifier would
    // revert on-chain anyway — reject it cleanly here instead).
    const otherApproved = await this.apps.findOne({
      where: {
        declaredBusinessId: app.declaredBusinessId,
        status: VendorApplicationStatus.APPROVED,
        id: Not(app.id),
      },
    });
    if (otherApproved) {
      return this.reject(app, "This business is already registered to another approved vendor account.", adminId);
    }

    const vendorAddress = user.chainAddress;
    const catIdx = vendorCategoryIndex(app.category);

    // 1) Register on-chain (idempotent) via the relayer mutex.
    if (!(await this.chain.vendorRegistry.isApproved(vendorAddress))) {
      await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.vendorRegistry.approveVendor(vendorAddress, catIdx, { nonce });
        return tx.wait();
      });
    }

    // 2) Persist the off-chain vendor row (so ZK-enrol can resolve it).
    await this.vendors.save({
      address: vendorAddress,
      name: app.businessName,
      category: app.category,
      city: app.city,
      approved: true,
    });

    // 3) ZK-enrol into every scheme the category may serve. A failure here means
    //    the vendor is NOT payable — keep the application PENDING (approve is
    //    idempotent, the admin can retry) instead of marking it approved.
    let enrolled: unknown[];
    try {
      enrolled = await this.enrollment.enrollVendorIntoMatchingSchemes(vendorAddress);
    } catch (e) {
      this.logger.warn(`Vendor ${app.businessName} ZK-enrol failed; approval NOT finalized: ${(e as Error).message}`);
      throw new BadRequestException(
        `Vendor registered on-chain but scheme enrolment failed (${(e as Error).message}). The application remains pending — retry approval.`,
      );
    }

    app.status = VendorApplicationStatus.APPROVED;
    app.vendorAddress = vendorAddress;
    await this.apps.save(app);
    await this.audit.log(adminId, "vendor_application.approved", {
      entityType: "vendor_application",
      entityId: app.id,
      detail: { vendorAddress, schemes: enrolled.length },
    });
    await this.notifications.notify({
      userId: user.id,
      type: "vendor",
      title: "Vendor application approved",
      body: `${app.businessName} is now an approved vendor and can accept e-Rupee for ${enrolled.length} scheme(s).`,
      email: user.email,
    });
    return { id: app.id, status: app.status, vendorAddress, schemesEnrolled: enrolled.length };
  }

  /** Admin: reject a pending application with an optional reason. */
  async rejectById(appId: string, adminId: string, reason?: string) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException("Vendor application not found.");
    if (app.status !== VendorApplicationStatus.PENDING) {
      throw new BadRequestException(`Application already ${app.status.toLowerCase()}.`);
    }
    return this.reject(app, reason ?? "Rejected after review.", adminId);
  }

  private async reject(app: VendorApplication, reason: string, adminId: string) {
    app.status = VendorApplicationStatus.REJECTED;
    app.rejectionReason = reason;
    await this.apps.save(app);
    await this.audit.log(adminId, "vendor_application.rejected", {
      entityType: "vendor_application",
      entityId: app.id,
      detail: { reason },
    });
    await this.notifications.notify({
      userId: app.user.id,
      type: "vendor",
      title: "Vendor application rejected",
      body: reason,
      email: app.user.email,
    }).catch(() => undefined);
    return { id: app.id, status: app.status, reason };
  }

  private toMineView(a: VendorApplication) {
    return {
      id: a.id,
      businessName: a.businessName,
      businessId: a.declaredBusinessId,
      category: a.category,
      city: a.city,
      status: a.status,
      vendorAddress: a.vendorAddress,
      rejectionReason: a.rejectionReason,
      createdAt: a.createdAt,
    };
  }
}
