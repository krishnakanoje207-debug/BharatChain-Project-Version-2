import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as cron from "node-cron";
import { ChainService } from "../chain/chain.service";
import { DisbursementService } from "./disbursement.service";

/**
 * Local disbursal automation (node-cron). On each tick it tops newly-enrolled
 * citizens up to the installment level already issued ("catchup" mode) — it does
 * NOT advance the installment number (issuing the next installment is a deliberate
 * admin/RBI action), so repeated ticks never double-disburse. On a testnet,
 * Chainlink Automation drives `createInstallment` instead — when
 * USE_CHAINLINK_AUTOMATION=true the local cron stands down.
 */
@Injectable()
export class DisbursementCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisbursementCron.name);
  private task?: cron.ScheduledTask;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly chain: ChainService,
    private readonly disbursement: DisbursementService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>("CRON_DISBURSAL_ENABLED") !== "true") {
      this.logger.log("Disbursal cron disabled (CRON_DISBURSAL_ENABLED!=true)");
      return;
    }
    if (this.config.get<string>("USE_CHAINLINK_AUTOMATION") === "true") {
      this.logger.log("Chainlink Automation drives disbursal (testnet) — local cron stands down");
      return;
    }
    const schedule = this.config.get<string>("CRON_DISBURSAL_SCHEDULE", "*/2 * * * *");
    if (!cron.validate(schedule)) {
      this.logger.warn(`Invalid CRON_DISBURSAL_SCHEDULE '${schedule}' — cron not started`);
      return;
    }
    this.task = cron.schedule(schedule, () => void this.tick());
    this.logger.log(`Disbursal cron started (schedule '${schedule}')`);
  }

  onModuleDestroy(): void {
    this.task?.stop();
  }

  private async tick(): Promise<void> {
    if (this.running) return; // never overlap rounds
    this.running = true;
    try {
      const count = Number(await this.chain.schemeRegistry.schemeCount());
      for (let id = 0; id < count; id++) {
        const scheme = await this.chain.schemeRegistry.getScheme(id);
        if (!scheme.active) continue;
        try {
          const r = await this.disbursement.runRound(id, "cron", "catchup");
          this.logger.log(`Auto-disbursed scheme ${id}: claimed=${r.claimedCount}/${r.beneficiaryCount}`);
        } catch {
          // Most ticks: no new beneficiaries / fund exhausted — skip quietly.
        }
      }
    } catch (err) {
      this.logger.warn(`Disbursal tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
