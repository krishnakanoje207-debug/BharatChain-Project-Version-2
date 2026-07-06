import { Global, Module } from "@nestjs/common";
import { KafkaService } from "./kafka.service";

/** Global so any producer (payments, disbursal, …) can inject the bus. */
@Global()
@Module({
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
