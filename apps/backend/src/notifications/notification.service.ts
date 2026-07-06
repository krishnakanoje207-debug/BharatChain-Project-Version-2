import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as nodemailer from "nodemailer";
import { Notification } from "../entities";

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** If set and SMTP is configured, also send a real email here. */
  email?: string;
}

/**
 * In-app notifications (always persisted) + best-effort real email. Email is
 * only attempted when SMTP credentials are configured; otherwise it is logged
 * (simulated), keeping the $0/no-creds demo fully functional.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transport: nodemailer.Transporter | null = null;

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    private readonly config: ConfigService,
  ) {
    const host = config.get<string>("SMTP_HOST");
    const user = config.get<string>("SMTP_USER");
    const pass = config.get<string>("SMTP_PASS");
    if (host && user && pass) {
      this.transport = nodemailer.createTransport({
        host,
        port: Number(config.get<string>("SMTP_PORT", "587")),
        secure: false,
        auth: { user, pass },
      });
      this.logger.log(`Email enabled via ${host}`);
    } else {
      this.logger.log("Email simulated (no SMTP credentials configured)");
    }
  }

  async notify(input: NotifyInput): Promise<void> {
    await this.repo.save(
      this.repo.create({ userId: input.userId, type: input.type, title: input.title, body: input.body }),
    );
    if (!input.email) return;
    if (!this.transport) {
      this.logger.log(`[SIMULATED EMAIL] to ${input.email}: ${input.title}`);
      return;
    }
    try {
      await this.transport.sendMail({
        from: this.config.get<string>("SMTP_FROM", "BharatChain <no-reply@bharatchain.local>"),
        to: input.email,
        subject: input.title,
        text: input.body,
      });
    } catch (err) {
      this.logger.warn(`Email to ${input.email} failed: ${(err as Error).message}`);
    }
  }

  list(userId: string): Promise<Notification[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: "DESC" }, take: 50 });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.repo.update({ id, userId }, { read: true });
  }
}
