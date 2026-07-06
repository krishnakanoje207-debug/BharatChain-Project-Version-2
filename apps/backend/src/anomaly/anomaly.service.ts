import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { formatEther } from "ethers";
import { AnomalyStatus, AnomalyType, Role } from "@bharatchain/shared";
import { Anomaly, Payment, User } from "../entities";
import { KafkaService, TOPIC_PAYMENTS } from "../kafka/kafka.service";
import { NotificationService } from "../notifications/notification.service";
import { AuditService } from "../audit/audit.service";

interface PaymentEvent {
  type: string;
  paymentId: number;
  userId: string;
  citizen: string;
  vendorAddress: string;
  vendorName?: string;
  schemeId: number;
  amount: string;
  ts: number;
}

/**
 * Kafka-fed fraud/anomaly detector. Consumes payment events and flags suspicious
 * vendor patterns — fan-in (one vendor from many distinct citizens), velocity
 * (a burst of payments), and self-dealing — into the `anomalies` table, alerting
 * admins/RBI. Detection reads the durable `payments` table for the rolling window,
 * so it survives restarts and missed messages.
 */
@Injectable()
export class AnomalyService implements OnModuleInit {
  private readonly logger = new Logger(AnomalyService.name);
  private readonly fanInThreshold: number;
  private readonly fanInWindowMin: number;
  private readonly velocityThreshold: number;
  private readonly velocityWindowSec: number;

  constructor(
    @InjectRepository(Anomaly) private readonly anomalies: Repository<Anomaly>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly kafka: KafkaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.fanInThreshold = Number(config.get("ANOMALY_FANIN_THRESHOLD", "3"));
    this.fanInWindowMin = Number(config.get("ANOMALY_FANIN_WINDOW_MIN", "60"));
    this.velocityThreshold = Number(config.get("ANOMALY_VELOCITY_THRESHOLD", "5"));
    this.velocityWindowSec = Number(config.get("ANOMALY_VELOCITY_WINDOW_SEC", "120"));
  }

  async onModuleInit(): Promise<void> {
    await this.kafka.consume(TOPIC_PAYMENTS, "bharatchain-anomaly", (e) =>
      this.onPaymentEvent(e as unknown as PaymentEvent),
    );
  }

  private async onPaymentEvent(evt: PaymentEvent): Promise<void> {
    this.logger.debug(`anomaly check: payment #${evt.paymentId} vendor=${evt.vendorAddress} type=${evt.type}`);
    if (evt.type !== "payment.paid") return;
    await this.detectSelfDeal(evt);
    await this.detectFanIn(evt);
    await this.detectVelocity(evt);
  }

  /** One vendor receiving from an abnormal number of distinct citizens. */
  private async detectFanIn(evt: PaymentEvent): Promise<void> {
    // Window computed DB-side in UTC: createdAt is `timestamp` (naive UTC wall-clock),
    // so a JS Date param (serialized in the server's local tz) would mismatch.
    const rows = await this.payments
      .createQueryBuilder("p")
      .select("COUNT(DISTINCT p.userId)", "distinct")
      .where("p.vendorAddress = :v", { v: evt.vendorAddress })
      .andWhere("p.createdAt >= (now() at time zone 'UTC') - make_interval(mins => :mins)", {
        mins: this.fanInWindowMin,
      })
      .getRawOne<{ distinct: string }>();
    const distinct = Number(rows?.distinct ?? 0);
    this.logger.debug(`fan-in: vendor=${evt.vendorAddress} distinct=${distinct} threshold=${this.fanInThreshold}`);
    if (distinct >= this.fanInThreshold) {
      await this.raise(
        AnomalyType.FAN_IN,
        evt.vendorAddress,
        `Vendor ${evt.vendorName ?? evt.vendorAddress} received payments from ${distinct} distinct citizens in the last ${this.fanInWindowMin} min (threshold ${this.fanInThreshold}).`,
        { distinctCitizens: distinct, windowMin: this.fanInWindowMin, vendorName: evt.vendorName },
        distinct >= this.fanInThreshold * 2 ? "HIGH" : "MEDIUM",
      );
    }
  }

  /** A burst of payments to one vendor in a short window. */
  private async detectVelocity(evt: PaymentEvent): Promise<void> {
    const count = await this.payments
      .createQueryBuilder("p")
      .where("p.vendorAddress = :v", { v: evt.vendorAddress })
      .andWhere("p.createdAt >= (now() at time zone 'UTC') - make_interval(secs => :secs)", {
        secs: this.velocityWindowSec,
      })
      .getCount();
    this.logger.debug(`velocity: vendor=${evt.vendorAddress} count=${count} threshold=${this.velocityThreshold}`);
    if (count >= this.velocityThreshold) {
      await this.raise(
        AnomalyType.VELOCITY,
        evt.vendorAddress,
        `Vendor ${evt.vendorName ?? evt.vendorAddress} received ${count} payments in the last ${this.velocityWindowSec}s (threshold ${this.velocityThreshold}).`,
        { count, windowSec: this.velocityWindowSec, vendorName: evt.vendorName },
        count >= this.velocityThreshold * 2 ? "HIGH" : "MEDIUM",
      );
    }
  }

  /** Citizen's on-chain identity equals the vendor they paid. */
  private async detectSelfDeal(evt: PaymentEvent): Promise<void> {
    if (evt.citizen && evt.citizen.toLowerCase() === evt.vendorAddress.toLowerCase()) {
      await this.raise(
        AnomalyType.SELF_DEAL,
        evt.vendorAddress,
        `Self-dealing: citizen identity ${evt.citizen} paid a vendor at the same address.`,
        { citizen: evt.citizen, amount: formatEther(evt.amount) },
        "HIGH",
      );
    }
  }

  /** Persist a signal (deduped while OPEN by type+subject) and alert admins/RBI. */
  private async raise(
    type: AnomalyType,
    subjectId: string,
    message: string,
    detail: Record<string, unknown>,
    severity: string,
  ): Promise<void> {
    const existing = await this.anomalies.findOne({
      where: { type, subjectId, status: AnomalyStatus.OPEN },
    });
    if (existing) {
      // Refresh the evidence on the open signal rather than spamming new rows.
      existing.message = message;
      existing.detail = detail;
      existing.severity = severity;
      await this.anomalies.save(existing);
      return;
    }

    const anomaly = await this.anomalies.save(
      this.anomalies.create({ type, subjectType: "vendor", subjectId, message, detail, severity }),
    );
    this.logger.warn(`ANOMALY [${type}/${severity}] ${message}`);

    const admins = await this.users.find({ where: [{ role: Role.ADMIN }, { role: Role.RBI_ADMIN }] });
    for (const a of admins) {
      await this.notifications.notify({
        userId: a.id,
        type: "anomaly",
        title: `Fraud alert: ${type}`,
        body: message,
        email: a.email,
      });
    }
    await this.audit.log("system", "anomaly.raised", {
      entityType: "anomaly",
      entityId: anomaly.id,
      detail: { type, subjectId, severity },
    });
  }

  // ----- admin/RBI surface -----

  async list(status?: AnomalyStatus) {
    return this.anomalies.find({
      where: status ? { status } : {},
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  async resolve(id: string, actor: string) {
    const a = await this.anomalies.findOne({ where: { id } });
    if (!a) throw new NotFoundException("Anomaly not found.");
    a.status = AnomalyStatus.RESOLVED;
    a.resolvedBy = actor;
    a.resolvedAt = new Date();
    await this.anomalies.save(a);
    await this.audit.log(actor, "anomaly.resolved", { entityType: "anomaly", entityId: a.id });
    return a;
  }
}
