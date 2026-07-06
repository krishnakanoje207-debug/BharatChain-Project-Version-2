import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/** Global so signup/login/enroll/disburse/pay/redeem can all log uniformly. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
