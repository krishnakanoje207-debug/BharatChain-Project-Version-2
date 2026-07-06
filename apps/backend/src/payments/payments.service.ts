import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { formatEther, getAddress, parseEther } from "ethers";
import { PaymentStatus } from "@bharatchain/shared";
import { Payment, User, Vendor } from "../entities";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notification.service";
import { KafkaService, TOPIC_PAYMENTS } from "../kafka/kafka.service";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly kafka: KafkaService,
  ) {}

  /**
   * Pay an approved, category-allowed vendor from the citizen's scheme entitlement.
   * The relayer signs on the keyless citizen's behalf (PaymentRouter.pay).
   */
  async pay(userId: string, schemeId: number, vendorAddressRaw: string, amountRupees: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found.");
    if (!user.chainAddress) throw new BadRequestException("No on-chain identity — complete signup verification first.");

    let vendorAddress: string;
    try {
      vendorAddress = getAddress(vendorAddressRaw);
    } catch {
      throw new BadRequestException("Invalid vendor address.");
    }
    let amount: bigint;
    try {
      amount = parseEther(amountRupees);
    } catch {
      throw new BadRequestException("Invalid amount.");
    }
    if (amount <= 0n) throw new BadRequestException("Amount must be greater than zero.");

    const scheme = await this.schemes.getOne(schemeId); // 404 if unknown

    // Pre-flight checks for friendlier errors (the contract is the source of truth).
    const available: bigint = await this.chain.paymentRouter.entitlement(schemeId, user.chainAddress);
    if (amount > available) {
      throw new BadRequestException(
        `Insufficient entitlement: tried ₹${amountRupees} but only ₹${formatEther(available)} available in ${scheme.name}.`,
      );
    }
    if (!(await this.chain.vendorRegistry.isApproved(vendorAddress))) {
      throw new BadRequestException("Vendor is not approved.");
    }
    const vcat = Number(await this.chain.vendorRegistry.categoryOf(vendorAddress));
    if (!(await this.chain.schemeRegistry.isVendorCategoryAllowed(schemeId, vcat))) {
      throw new BadRequestException(`This vendor's category is not allowed for ${scheme.name}.`);
    }
    if (!(await this.chain.vendorEnrollmentRegistry.isEnrolled(schemeId, vendorAddress))) {
      throw new BadRequestException(`This vendor is not ZK-enrolled in ${scheme.name} yet.`);
    }

    const vendor = await this.vendors.findOne({ where: { address: vendorAddress } });

    let onChainId: number;
    let receipt: { hash: string };
    try {
      ({ onChainId, receipt } = await this.chain.runExclusive(async (nonce) => {
        const id = Number(await this.chain.paymentRouter.paymentCount());
        const tx = await this.chain.paymentRouter.pay(user.chainAddress, schemeId, vendorAddress, amount, { nonce });
        return { onChainId: id, receipt: await tx.wait() };
      }));
    } catch (err) {
      throw new BadRequestException((err as { shortMessage?: string }).shortMessage ?? "Payment reverted on-chain.");
    }

    const payment = await this.payments.save(
      this.payments.create({
        userId,
        onChainId,
        schemeId,
        vendorAddress,
        vendorName: vendor?.name,
        amount: amount.toString(),
        status: PaymentStatus.PAID,
        payTxHash: receipt.hash,
      }),
    );

    await this.notifications.notify({
      userId,
      type: "payment",
      title: "Payment sent",
      body: `You paid ₹${formatEther(amount)} to ${vendor?.name ?? vendorAddress} from ${scheme.name}. Confirm delivery once you receive the goods/service.`,
      email: user.email,
    });
    await this.audit.log(userId, "payment.pay", {
      entityType: "payment",
      entityId: payment.id,
      detail: { schemeId, vendorAddress, amount: amount.toString(), onChainId },
    });
    this.logger.log(`Payment #${onChainId}: ${user.chainAddress} → ${vendorAddress} ₹${formatEther(amount)}`);

    // Publish to the bus for ETL + anomaly detection (best-effort).
    await this.kafka.emit(TOPIC_PAYMENTS, vendorAddress, {
      type: "payment.paid",
      paymentId: onChainId,
      userId,
      citizen: user.chainAddress,
      vendorAddress,
      vendorName: vendor?.name,
      schemeId,
      amount: amount.toString(),
      ts: Date.now(),
    });

    return this.toView(payment);
  }

  /** Citizen confirms receipt → payment becomes DELIVERED and redeemable by the vendor. */
  async confirmDelivery(userId: string, paymentId: string) {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Payment not found.");
    if (payment.userId !== userId) throw new ForbiddenException("Not your payment.");
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException(`Payment is already ${payment.status.toLowerCase()}.`);
    }

    let receipt: { hash: string };
    try {
      receipt = await this.chain.runExclusive(async (nonce) => {
        const tx = await this.chain.paymentRouter.confirmDelivery(payment.onChainId, { nonce });
        return tx.wait();
      });
    } catch (err) {
      throw new BadRequestException((err as { shortMessage?: string }).shortMessage ?? "Confirmation reverted on-chain.");
    }

    payment.status = PaymentStatus.DELIVERED;
    payment.confirmTxHash = receipt.hash;
    await this.payments.save(payment);

    await this.audit.log(userId, "payment.confirmDelivery", {
      entityType: "payment",
      entityId: payment.id,
      detail: { onChainId: payment.onChainId, vendorAddress: payment.vendorAddress, amount: payment.amount },
    });
    this.logger.log(`Payment #${payment.onChainId} confirmed delivered → redeemable by ${payment.vendorAddress}`);

    return this.toView(payment);
  }

  async listMine(userId: string) {
    const rows = await this.payments.find({ where: { userId }, order: { createdAt: "DESC" } });
    return rows.map((p) => this.toView(p));
  }

  async getOne(userId: string, id: string) {
    const payment = await this.payments.findOne({ where: { id } });
    if (!payment) throw new NotFoundException("Payment not found.");
    if (payment.userId !== userId) throw new ForbiddenException("Not your payment.");
    return this.toView(payment);
  }

  private toView(p: Payment) {
    return {
      id: p.id,
      onChainId: p.onChainId,
      schemeId: p.schemeId,
      vendorAddress: p.vendorAddress,
      vendorName: p.vendorName,
      amount: p.amount,
      amountFormatted: formatEther(p.amount),
      status: p.status,
      payTxHash: p.payTxHash,
      confirmTxHash: p.confirmTxHash,
      createdAt: p.createdAt,
    };
  }
}
