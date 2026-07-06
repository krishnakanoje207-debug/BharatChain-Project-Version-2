import { Global, Module } from "@nestjs/common";
import { RegistryService } from "./registry.service";
import { VendorRegistryService } from "./vendor-registry.service";

/** Global: scheme eligibility + vendor eligibility + seeding all depend on the registry/ZK bridges. */
@Global()
@Module({
  providers: [RegistryService, VendorRegistryService],
  exports: [RegistryService, VendorRegistryService],
})
export class RegistryModule {}
