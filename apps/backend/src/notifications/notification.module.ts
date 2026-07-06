import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "../entities";
import { NotificationService } from "./notification.service";

/** Global: applications (enrol) and disbursement both emit notifications. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
