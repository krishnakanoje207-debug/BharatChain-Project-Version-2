import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { formatEther, getAddress, parseEther } from "ethers";
import { RedemptionStatus } from "@bharatchain/shared";
import { Redemption, User, Vendor } from "../entities";
import { ChainService } from "../chain/chain.service";
import { AuditService } from "../audit/audit.service";
import { CreateRedemptionDto, CreateSelfRedemptionDto } from "./dto/redemption.dto";

@Injectable()
export class RedemptionService {
  private readonly logger = new Logger(RedemptionService.name);

  constructor(
    @InjectRepository(Redemption) private readonly redemptions: Repository<Redemption>,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly chain: ChainService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve the approved chain address of a self-service vendor caller. */
  private async vendorAddressOf(userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.chainAddress) {
      throw new BadRequestException("Your account has no chain identity. Please re-verify your phone.");
    }
    return user.chainAddress;
  }

  /** Vendor: file a redemption for their own delivered value. */
  async requestSelf(userId: string, dto: CreateSelfRedemptionDto) {
    const vendorAddress = await this.vendorAddressOf(userId);
    return this.request(userId, { ...dto, vendorAddress });
  }

  /** Vendor: their own redemption history. */
  async listMine(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.chainAddress) return [];
    return this.list({ vendor: user.chainAddress });
  }

  /** Vendor: how much delivered value they may currently redeem. */
  async redeemableFor(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    const approved = Boolean(user?.chainAddress) && (await this.chain.vendorRegistry.isApproved(user!.chainAddress!));
    if (!approved) return { approved: false, redeemable: "0", redeemableFormatted: "0.0" };
    const redeemable: bigint = await this.chain.paymentRouter.vendorRedeemable(user!.chainAddress!);
    return { approved: true, redeemable: redeemable.toString(), redeemableFormatted: formatEther(redeemable) };
  }

  /**
   * File a vendor's redemption request (relayer, on the vendor's behalf), capturing
   * the ITR/legitimacy evidence the RBI will review. Only DELIVERED value is redeemable.
   */
  async request(actor: string, dto: CreateRedemptionDto) {
    let vendorAddress: string;
    try {
      vendorAddress = getAddress(dto.vendorAddress);
    } catch {
      throw new BadRequestException("Invalid vendor address.");
    }
    let amount: bigint;
    try {
      amount = parseEther(dto.amount);
    } catch {
      throw new BadRequestException("Invalid amount.");
    }
    if (amount <= 0n) throw new BadRequestException("Amount must be greater than zero.");

    if (!(await this.chain.vendorRegistry.isApproved(vendorAddress))) {
      throw new BadRequestException("Vendor is not approved.");
    }
    const redeemable: bigint = await this.chain.paymentRouter.vendorRedeemable(vendorAddress);
    if (amount > redeemable) {
      throw new BadRequestException(
        `Exceeds redeemable balance: requested ₹${dto.amount} but only ₹${formatEther(redeemable)} is delivered/redeemable.`,
      );
    }

    const vendor = await this.vendors.findOne({ where: { address: vendorAddress } });

    let onChainId: number;
    let receipt: { hash: string };
    try {
      ({ onChainId, receipt } = await this.chain.runExclusive(async (nonce) => {
        const id = Number(await this.chain.redemptionController.requestCount());
        const tx = await this.chain.redemptionController.request(vendorAddress, amount, { nonce });
        return { onChainId: id, receipt: await tx.wait() };
      }));
    } catch (err) {
      throw new BadRequestException((err as { shortMessage?: string }).shortMessage ?? "Request reverted on-chain.");
    }

    const redemption = await this.redemptions.save(
      this.redemptions.create({
        onChainId,
        vendorAddress,
        vendorName: vendor?.name,
        amount: amount.toString(),
        status: RedemptionStatus.PENDING,
        itrNumber: dto.itrNumber,
        bankAccount: dto.bankAccount,
        legitimacy: dto.legitimacy,
        requestTxHash: receipt.hash,
      }),
    );

    await this.audit.log(actor, "redemption.request", {
      entityType: "redemption",
      entityId: redemption.id,
      detail: { vendorAddress, amount: amount.toString(), onChainId },
    });
    this.logger.log(`Redemption #${onChainId} filed for ${vendorAddress}: ₹${formatEther(amount)}`);

    return this.toView(redemption);
  }

  /** RBI approves after the ITR/legitimacy check → on-chain consume + burn, simulated fiat payout. */
  async approve(actor: string, id: string) {
    const r = await this.getPending(id);

    let receipt: { hash: string };
    try {
      receipt = await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.redemptionController.approve(r.onChainId, { nonce });
        return tx.wait();
      });
    } catch (err) {
      throw new BadRequestException((err as { shortMessage?: string }).shortMessage ?? "Approval reverted on-chain.");
    }

    r.status = RedemptionStatus.APPROVED;
    r.decisionTxHash = receipt.hash;
    r.decidedBy = actor;
    // Simulated bank payout — in production this would be an NEFT/RTGS settlement call.
    r.payoutReference = `NEFT-${Date.now()}-${r.onChainId}`;
    await this.redemptions.save(r);

    await this.audit.log(actor, "redemption.approve", {
      entityType: "redemption",
      entityId: r.id,
      detail: { onChainId: r.onChainId, amount: r.amount, payoutReference: r.payoutReference },
    });
    this.logger.log(
      `Redemption #${r.onChainId} APPROVED: burned ₹${formatEther(r.amount)}, payout ${r.payoutReference}`,
    );

    return this.toView(r);
  }

  async reject(actor: string, id: string, reason?: string) {
    const r = await this.getPending(id);

    let receipt: { hash: string };
    try {
      receipt = await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.redemptionController.reject(r.onChainId, { nonce });
        return tx.wait();
      });
    } catch (err) {
      throw new BadRequestException((err as { shortMessage?: string }).shortMessage ?? "Rejection reverted on-chain.");
    }

    r.status = RedemptionStatus.REJECTED;
    r.decisionTxHash = receipt.hash;
    r.decidedBy = actor;
    r.decisionReason = reason;
    await this.redemptions.save(r);

    await this.audit.log(actor, "redemption.reject", {
      entityType: "redemption",
      entityId: r.id,
      detail: { onChainId: r.onChainId, amount: r.amount, reason },
    });
    this.logger.log(`Redemption #${r.onChainId} REJECTED`);

    return this.toView(r);
  }

  async list(opts: { status?: RedemptionStatus; vendor?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;
    if (opts.vendor) where.vendorAddress = getAddress(opts.vendor);
    const rows = await this.redemptions.find({ where, order: { createdAt: "DESC" } });
    return rows.map((r) => this.toView(r));
  }

  async getOne(id: string) {
    const r = await this.redemptions.findOne({ where: { id } });
    if (!r) throw new NotFoundException("Redemption not found.");
    return this.toView(r);
  }

  private async getPending(id: string): Promise<Redemption> {
    const r = await this.redemptions.findOne({ where: { id } });
    if (!r) throw new NotFoundException("Redemption not found.");
    if (r.status !== RedemptionStatus.PENDING) {
      throw new BadRequestException(`Redemption is already ${r.status.toLowerCase()}.`);
    }
    return r;
  }

  private toView(r: Redemption) {
    return {
      id: r.id,
      onChainId: r.onChainId,
      vendorAddress: r.vendorAddress,
      vendorName: r.vendorName,
      amount: r.amount,
      amountFormatted: formatEther(r.amount),
      status: r.status,
      itrNumber: r.itrNumber,
      bankAccount: r.bankAccount,
      legitimacy: r.legitimacy,
      payoutReference: r.payoutReference,
      decidedBy: r.decidedBy,
      decisionReason: r.decisionReason,
      requestTxHash: r.requestTxHash,
      decisionTxHash: r.decisionTxHash,
      createdAt: r.createdAt,
    };
  }
}
