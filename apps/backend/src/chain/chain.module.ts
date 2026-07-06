import { Global, Module } from "@nestjs/common";
import { ChainService } from "./chain.service";

/** Global so schemes/applications/disbursal/payment modules share one relayer. */
@Global()
@Module({
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
