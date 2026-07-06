import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThan, Repository } from "typeorm";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { ApplicationStatus } from "@bharatchain/shared";
import { Application, DisbursementRound } from "../entities";
import { formatEther } from "ethers";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notification.service";

export interface RoundResult {
  id: string;
  schemeId: number;
  installmentId: number;
  installmentNo: number;
  beneficiaryCount: number;
  installmentAmount: string;
  allocated: string;
  claimedCount: number;
  failed: number;
  createTxHash?: string;
}

/**
 * "advance" = issue the NEXT installment (manual/admin): pays everyone who hasn't
 * received it yet. "catchup" = top newly-enrolled citizens up to the installment
 * level already issued, without advancing it (cron) — never double-pays.
 */
export type DisburseMode = "advance" | "catchup";

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);
  // Serialize disbursal rounds so two concurrent triggers can't both compute the
  // same installment number and pay it twice (the beneficiary selection is read
  // before any tx). Disbursal is infrequent, so a single global lock is fine.
  private disbursalChain: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectRepository(Application) private readonly apps: Repository<Application>,
    @InjectRepository(DisbursementRound) private readonly rounds: Repository<DisbursementRound>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Run one disbursal round for a scheme: build a Merkle root of (citizen, amount)
   * for every enrolled beneficiary, open an on-chain installment (draws the fund
   * down by the total), then relayer-claim each allocation into entitlement.
   */
  /** Public entry — serialized so rounds never overlap (no double-paid installments). */
  async runRound(schemeId: number, actor = "system", mode: DisburseMode = "advance"): Promise<RoundResult> {
    const run = this.disbursalChain.then(() => this._runRound(schemeId, actor, mode));
    this.disbursalChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async _runRound(schemeId: number, actor: string, mode: DisburseMode): Promise<RoundResult> {
    const scheme = await this.schemes.getOne(schemeId); // 404 if unknown
    if (!scheme.active) throw new BadRequestException("Scheme is not active.");

    // Installment-aware selection: installment N is paid only to beneficiaries who
    // have received fewer than N installments (disbursementCount < N), so no one is
    // ever paid twice for the same installment. The level never exceeds the scheme
    // cap (maxInstallments) — once a scheme has issued all its installments, an
    // "advance" stays at the cap and only catches up beneficiaries still below it,
    // so no beneficiary is ever paid past their total entitlement.
    const cap = scheme.maxInstallments ?? 3;
    const last = await this.rounds.findOne({ where: { schemeId }, order: { installmentNo: "DESC" } });
    const currentLevel = last?.installmentNo ?? 0;
    const installmentNo =
      mode === "advance" ? Math.min(currentLevel + 1, cap) : Math.min(currentLevel, cap);
    if (installmentNo === 0) {
      throw new BadRequestException("No installment has been issued yet — issue the first installment.");
    }

    const beneficiaries = await this.enrolledBeneficiaries(schemeId, installmentNo);
    if (beneficiaries.length === 0) {
      throw new BadRequestException(
        mode === "advance"
          ? currentLevel >= cap
            ? `All beneficiaries have already received the full ${cap} installments for this scheme.`
            : `Everyone enrolled has already received installment ${installmentNo}.`
          : `No newly-enrolled beneficiaries are behind installment ${installmentNo}.`,
      );
    }

    const installmentAmount = BigInt(scheme.installmentAmount);
    if (installmentAmount === 0n) throw new BadRequestException("Scheme installment amount is zero.");

    // Catch every beneficiary up to the current installment level: pay the FULL gap
    // (installmentNo − installments already received) × installmentAmount, not a flat
    // single installment. So a citizen who enrols late still reaches the same cumulative
    // entitlement as everyone else by the time the final installment is issued, and no
    // one is ever paid for an installment twice (the gap is always ≥ 1 here).
    const payouts = beneficiaries.map((b) => ({
      ...b,
      installmentsDue: installmentNo - b.received,
      amount: installmentAmount * BigInt(installmentNo - b.received),
    }));
    const allocated = payouts.reduce((sum, p) => sum + p.amount, 0n);

    const remaining = BigInt(scheme.remaining);
    if (allocated > remaining) {
      throw new BadRequestException(
        `Scheme fund exhausted: need ${allocated} but only ${remaining} remains. Top up the fund or reduce the cohort.`,
      );
    }

    // OZ StandardMerkleTree — leaf encoding matches the on-chain claim verifier.
    // Leaves carry per-citizen amounts (late enrollees get a larger catch-up amount).
    const values: [string, string][] = payouts.map((p) => [p.address, p.amount.toString()]);
    const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
    const root = tree.root;

    // Read the installment id + open it under the relayer tx lock so the id can't
    // race with a concurrent round (e.g. a manual round overlapping the cron).
    const { installmentId, createReceipt } = await this.chain.runExclusive(async (nonce) => {
      const id = Number(await this.chain.disbursementController.installmentCount());
      const tx = await this.chain.disbursementController.createInstallment(schemeId, root, allocated, { nonce });
      return { installmentId: id, createReceipt: await tx.wait() };
    });
    this.logger.log(
      `Installment #${installmentId} opened for scheme ${schemeId}: ${beneficiaries.length} beneficiaries, allocated=${allocated}`,
    );

    const round = await this.rounds.save(
      this.rounds.create({
        schemeId,
        installmentId,
        installmentNo,
        merkleRoot: root,
        allocated: allocated.toString(),
        installmentAmount: installmentAmount.toString(),
        beneficiaryCount: beneficiaries.length,
        claimedCount: 0,
        createTxHash: createReceipt.hash,
      }),
    );

    // Claim each allocation (relayer). Sequential nonces; failures are tolerated per-citizen.
    let claimed = 0;
    let failed = 0;
    const claimedAppIds: string[] = [];
    for (const [i] of values.entries()) {
      const proof = tree.getProof(i);
      const p = payouts[i];
      try {
        await this.chain.runExclusive(async (nonce) => {
          const tx = await this.chain.disbursementController.claim(installmentId, p.address, p.amount, proof, { nonce });
          return tx.wait();
        });
        claimed++;
        claimedAppIds.push(p.appId);
        await this.notifications.notify({
          userId: p.userId,
          type: "disbursement",
          title: "Installment disbursed",
          body: `₹${formatEther(p.amount)} has been credited to your ${scheme.name} entitlement.`,
          email: p.email,
        });
      } catch (err) {
        failed++;
        this.logger.warn(`Claim failed for ${p.address}: ${(err as { shortMessage?: string }).shortMessage ?? err}`);
      }
    }

    round.claimedCount = claimed;
    await this.rounds.save(round);
    // Every claimed beneficiary is now caught up to the current installment level
    // (cron over-disbursal guard relies on this exact level, not a +1 increment).
    if (claimedAppIds.length > 0) {
      await this.apps.update({ id: In(claimedAppIds) }, { disbursementCount: installmentNo });
    }
    await this.audit.log(actor, "disbursement.round", {
      entityType: "scheme",
      entityId: String(schemeId),
      detail: { installmentId, installmentNo, beneficiaryCount: beneficiaries.length, claimed, failed, allocated: allocated.toString() },
    });

    return {
      id: round.id,
      schemeId,
      installmentId,
      installmentNo,
      beneficiaryCount: beneficiaries.length,
      installmentAmount: installmentAmount.toString(),
      allocated: allocated.toString(),
      claimedCount: claimed,
      failed,
      createTxHash: createReceipt.hash,
    };
  }

  async listRounds(schemeId?: number) {
    const where = schemeId === undefined ? {} : { schemeId };
    return this.rounds.find({ where, order: { createdAt: "DESC" } });
  }

  async getRound(id: string): Promise<DisbursementRound> {
    const round = await this.rounds.findOne({ where: { id } });
    if (!round) throw new NotFoundException("Round not found.");
    return round;
  }

  /**
   * APPROVED applicants (with an on-chain identity) for a scheme who have received
   * FEWER than `installmentNo` installments — i.e. those still due installment N.
   */
  private async enrolledBeneficiaries(
    schemeId: number,
    installmentNo: number,
  ): Promise<{ address: string; userId: string; email?: string; appId: string; received: number }[]> {
    const apps = await this.apps.find({
      where: {
        schemeId,
        status: ApplicationStatus.APPROVED,
        disbursementCount: LessThan(installmentNo),
      },
      relations: ["user"],
    });
    return apps
      .filter((a) => a.user.chainAddress)
      .map((a) => ({
        address: a.user.chainAddress as string,
        userId: a.user.id,
        email: a.user.email,
        appId: a.id,
        received: a.disbursementCount ?? 0,
      }));
  }
}
