import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller";
import { DatabaseModule } from "./database/database.module";
import { RedisModule } from "./redis/redis.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ChainModule } from "./chain/chain.module";
import { SchemesModule } from "./schemes/schemes.module";
import { StorageModule } from "./storage/storage.module";
import { RegistryModule } from "./registry/registry.module";
import { ApplicationsModule } from "./applications/applications.module";
import { DisbursementModule } from "./disbursement/disbursement.module";
import { NotificationModule } from "./notifications/notification.module";
import { MeModule } from "./me/me.module";
import { VendorsModule } from "./vendors/vendors.module";
import { PaymentsModule } from "./payments/payments.module";
import { RedemptionModule } from "./redemption/redemption.module";
import { KafkaModule } from "./kafka/kafka.module";
import { AnomalyModule } from "./anomaly/anomaly.module";
import { AssistantModule } from "./assistant/assistant.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Share the monorepo-root .env; fall back to a local one.
      envFilePath: ["../../.env", ".env"],
    }),
    DatabaseModule,
    RedisModule,
    AuditModule,
    ChainModule,
    AuthModule,
    SchemesModule,
    StorageModule,
    RegistryModule,
    ApplicationsModule,
    DisbursementModule,
    NotificationModule,
    MeModule,
    VendorsModule,
    PaymentsModule,
    RedemptionModule,
    KafkaModule,
    AnomalyModule,
    AssistantModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
