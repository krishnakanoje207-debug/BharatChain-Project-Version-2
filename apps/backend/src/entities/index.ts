import { User } from "./user.entity";
import { Application } from "./application.entity";
import { ApplicationDocument } from "./document.entity";
import { SchemeCache } from "./scheme-cache.entity";
import { Vendor } from "./vendor.entity";
import { VendorApplication } from "./vendor-application.entity";
import { AuditLog } from "./audit-log.entity";
import { DisbursementRound } from "./disbursement-round.entity";
import { Notification } from "./notification.entity";
import { Payment } from "./payment.entity";
import { Redemption } from "./redemption.entity";
import { Anomaly } from "./anomaly.entity";

export * from "./user.entity";
export * from "./application.entity";
export * from "./document.entity";
export * from "./scheme-cache.entity";
export * from "./vendor.entity";
export * from "./vendor-application.entity";
export * from "./audit-log.entity";
export * from "./disbursement-round.entity";
export * from "./notification.entity";
export * from "./payment.entity";
export * from "./redemption.entity";
export * from "./anomaly.entity";

/** All persistent entities — registered once so `synchronize` builds every table. */
export const ENTITIES = [
  User,
  Application,
  ApplicationDocument,
  SchemeCache,
  Vendor,
  VendorApplication,
  AuditLog,
  DisbursementRound,
  Notification,
  Payment,
  Redemption,
  Anomaly,
];
