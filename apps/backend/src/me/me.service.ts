import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { formatEther } from "ethers";
import { ApplicationStatus } from "@bharatchain/shared";
import { Application, User } from "../entities";
import { ChainService } from "../chain/chain.service";
import { SchemesService } from "../schemes/schemes.service";

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Application) private readonly apps: Repository<Application>,
    private readonly chain: ChainService,
    private readonly schemes: SchemesService,
  ) {}

  /** Spendable entitlement (from PaymentRouter) per scheme the citizen is enrolled in. */
  async entitlements(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found.");
    if (!user.chainAddress) return [];

    const approved = await this.apps.find({
      where: { user: { id: userId }, status: ApplicationStatus.APPROVED },
    });
    const out = [];
    for (const a of approved) {
      const wei: bigint = await this.chain.paymentRouter.entitlement(a.schemeId, user.chainAddress);
      let name = `Scheme #${a.schemeId}`;
      try {
        name = (await this.schemes.getOne(a.schemeId)).name;
      } catch {
        /* scheme metadata optional */
      }
      out.push({
        schemeId: a.schemeId,
        schemeName: name,
        entitlement: wei.toString(),
        entitlementFormatted: formatEther(wei),
      });
    }
    return out;
  }
}
