import { BigInt, Address } from "@graphprotocol/graph-ts";
import { Scheme, Vendor, Enrollment, Installment, Claim, Payment, Redemption, Stat } from "../generated/schema";
import {
  SchemeCreated,
  SchemeStatusChanged,
  FundDrawnDown,
} from "../generated/SchemeRegistry/SchemeRegistry";
import { EnrolledWithProof } from "../generated/ZKEnroller/ZKEnroller";
import {
  InstallmentCreated,
  Claimed,
} from "../generated/DisbursementController/DisbursementController";
import { Paid, Delivered } from "../generated/PaymentRouter/PaymentRouter";
import { VendorApproved, VendorRevoked } from "../generated/VendorRegistry/VendorRegistry";
import {
  RedemptionRequested,
  RedemptionApproved,
  RedemptionRejected,
} from "../generated/RedemptionController/RedemptionController";

// --------------------------------------------------------------------- helpers

function getStat(): Stat {
  let s = Stat.load("global");
  if (s == null) {
    s = new Stat("global");
    s.schemeCount = 0;
    s.enrollmentCount = 0;
    s.installmentCount = 0;
    s.claimCount = 0;
    s.paymentCount = 0;
    s.redemptionCount = 0;
    s.totalAllocated = BigInt.zero();
    s.totalClaimed = BigInt.zero();
    s.totalPaid = BigInt.zero();
    s.totalDelivered = BigInt.zero();
    s.totalRedeemed = BigInt.zero();
  }
  return s as Stat;
}

function getVendor(addr: Address, ts: BigInt): Vendor {
  const id = addr.toHexString();
  let v = Vendor.load(id);
  if (v == null) {
    v = new Vendor(id);
    v.category = 0;
    v.approved = false;
    v.updatedAt = ts;
  }
  return v as Vendor;
}

// --------------------------------------------------------------------- schemes

export function handleSchemeCreated(e: SchemeCreated): void {
  const s = new Scheme(e.params.schemeId.toString());
  s.name = e.params.name;
  s.category = e.params.category;
  s.fund = e.params.fund;
  s.installmentAmount = e.params.installmentAmount;
  s.disbursed = BigInt.zero();
  s.active = true;
  s.createdAt = e.block.timestamp;
  s.save();

  const stat = getStat();
  stat.schemeCount += 1;
  stat.save();
}

export function handleSchemeStatusChanged(e: SchemeStatusChanged): void {
  const s = Scheme.load(e.params.schemeId.toString());
  if (s == null) return;
  s.active = e.params.active;
  s.save();
}

export function handleFundDrawnDown(e: FundDrawnDown): void {
  const s = Scheme.load(e.params.schemeId.toString());
  if (s == null) return;
  s.disbursed = e.params.disbursed;
  s.fund = e.params.fund;
  s.save();
}

// ----------------------------------------------------------------- enrollments

export function handleEnrolledWithProof(e: EnrolledWithProof): void {
  const id = e.transaction.hash.toHexString() + "-" + e.logIndex.toString();
  const en = new Enrollment(id);
  en.scheme = e.params.schemeId.toString();
  en.citizen = e.params.citizen;
  en.nullifier = e.params.nullifier;
  en.timestamp = e.block.timestamp;
  en.txHash = e.transaction.hash;
  en.save();

  const stat = getStat();
  stat.enrollmentCount += 1;
  stat.save();
}

// ------------------------------------------------------------------ disbursals

export function handleInstallmentCreated(e: InstallmentCreated): void {
  const inst = new Installment(e.params.installmentId.toString());
  inst.scheme = e.params.schemeId.toString();
  inst.merkleRoot = e.params.merkleRoot;
  inst.allocated = e.params.allocated;
  inst.claimedCount = 0;
  inst.claimedTotal = BigInt.zero();
  inst.timestamp = e.block.timestamp;
  inst.save();

  const stat = getStat();
  stat.installmentCount += 1;
  stat.totalAllocated = stat.totalAllocated.plus(e.params.allocated);
  stat.save();
}

export function handleClaimed(e: Claimed): void {
  const id = e.params.installmentId.toString() + "-" + e.params.citizen.toHexString();
  const c = new Claim(id);
  c.installment = e.params.installmentId.toString();
  c.scheme = e.params.schemeId.toString();
  c.citizen = e.params.citizen;
  c.amount = e.params.amount;
  c.timestamp = e.block.timestamp;
  c.txHash = e.transaction.hash;
  c.save();

  const inst = Installment.load(e.params.installmentId.toString());
  if (inst != null) {
    inst.claimedCount += 1;
    inst.claimedTotal = inst.claimedTotal.plus(e.params.amount);
    inst.save();
  }

  const stat = getStat();
  stat.claimCount += 1;
  stat.totalClaimed = stat.totalClaimed.plus(e.params.amount);
  stat.save();
}

// -------------------------------------------------------------------- payments

export function handlePaid(e: Paid): void {
  const v = getVendor(e.params.vendor, e.block.timestamp);
  v.save();

  const p = new Payment(e.params.paymentId.toString());
  p.citizen = e.params.citizen;
  p.vendor = v.id;
  p.scheme = e.params.schemeId.toString();
  p.amount = e.params.amount;
  p.delivered = false;
  p.paidAt = e.block.timestamp;
  p.txHash = e.transaction.hash;
  p.save();

  const stat = getStat();
  stat.paymentCount += 1;
  stat.totalPaid = stat.totalPaid.plus(e.params.amount);
  stat.save();
}

export function handleDelivered(e: Delivered): void {
  const p = Payment.load(e.params.paymentId.toString());
  if (p == null) return;
  p.delivered = true;
  p.deliveredAt = e.block.timestamp;
  p.save();

  const stat = getStat();
  stat.totalDelivered = stat.totalDelivered.plus(e.params.amount);
  stat.save();
}

// --------------------------------------------------------------------- vendors

export function handleVendorApproved(e: VendorApproved): void {
  const v = getVendor(e.params.vendor, e.block.timestamp);
  v.category = e.params.category;
  v.approved = true;
  v.updatedAt = e.block.timestamp;
  v.save();
}

export function handleVendorRevoked(e: VendorRevoked): void {
  const v = getVendor(e.params.vendor, e.block.timestamp);
  v.approved = false;
  v.updatedAt = e.block.timestamp;
  v.save();
}

// ----------------------------------------------------------------- redemptions

export function handleRedemptionRequested(e: RedemptionRequested): void {
  const v = getVendor(e.params.vendor, e.block.timestamp);
  v.save();

  const r = new Redemption(e.params.requestId.toString());
  r.vendor = v.id;
  r.amount = e.params.amount;
  r.status = "REQUESTED";
  r.requestedAt = e.block.timestamp;
  r.save();

  const stat = getStat();
  stat.redemptionCount += 1;
  stat.save();
}

export function handleRedemptionApproved(e: RedemptionApproved): void {
  const r = Redemption.load(e.params.requestId.toString());
  if (r == null) return;
  r.status = "APPROVED";
  r.decidedAt = e.block.timestamp;
  r.save();

  const stat = getStat();
  stat.totalRedeemed = stat.totalRedeemed.plus(e.params.amount);
  stat.save();
}

export function handleRedemptionRejected(e: RedemptionRejected): void {
  const r = Redemption.load(e.params.requestId.toString());
  if (r == null) return;
  r.status = "REJECTED";
  r.decidedAt = e.block.timestamp;
  r.save();
}
