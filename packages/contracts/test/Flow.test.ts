import { expect } from "chai";
import { ethers } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { deploySystem } from "./helpers/deploy";

// Enum values mirror packages/shared/src/index.ts
const SchemeCategory = { AGRICULTURE: 0 };
const VendorCategory = { AGRI_INPUT: 0, HOUSING_MATERIAL: 3 };

function getProof(tree: StandardMerkleTree<[string, string]>, addr: string): string[] {
  for (const [i, v] of tree.entries()) {
    if (v[0].toLowerCase() === addr.toLowerCase()) return tree.getProof(i);
  }
  throw new Error("address not in tree");
}

describe("BharatChain end-to-end flow", () => {
  it("runs apply → enroll → disburse(claim) → pay → deliver → redeem, enforcing every gate", async () => {
    const sys = await deploySystem();
    const { admin, relayer, rbiAdmin, automation, citizen1, citizen2, vendorA, vendorB } = sys.signers;
    const { token, schemes, vendors, beneficiaries, vendorEnrollment, router, disbursement, redemption } = sys;

    const installmentAmt = ethers.parseEther("10000");
    const fund = ethers.parseEther("30000");

    // --- admin creates an agriculture scheme that may pay only AGRI_INPUT vendors ---
    await schemes
      .connect(admin)
      .createScheme("Kisan Agriculture Welfare", SchemeCategory.AGRICULTURE, fund, installmentAmt, [
        VendorCategory.AGRI_INPUT,
      ]);
    const schemeId = 0n;

    // --- admin approves vendors (vendorA allowed, vendorB wrong category) ---
    await vendors.connect(admin).approveVendor(vendorA.address, VendorCategory.AGRI_INPUT);
    await vendors.connect(admin).approveVendor(vendorB.address, VendorCategory.HOUSING_MATERIAL);
    await expect(
      vendors.connect(relayer).approveVendor(vendorA.address, VendorCategory.AGRI_INPUT),
    ).to.be.revertedWithCustomError(vendors, "Forbidden");

    // --- relayer enrolls two citizens (double-enroll + reused nullifier blocked) ---
    const null1 = ethers.id("nullifier-citizen1-scheme0");
    const null2 = ethers.id("nullifier-citizen2-scheme0");
    await beneficiaries.connect(relayer).enroll(schemeId, citizen1.address, null1);
    await beneficiaries.connect(relayer).enroll(schemeId, citizen2.address, null2);
    await expect(
      beneficiaries.connect(relayer).enroll(schemeId, citizen1.address, ethers.id("other")),
    ).to.be.revertedWithCustomError(beneficiaries, "AlreadyEnrolled");
    await expect(
      beneficiaries.connect(relayer).enroll(schemeId, citizen2.address, null1),
    ).to.be.revertedWithCustomError(beneficiaries, "NullifierAlreadyUsed");

    // --- build the installment Merkle tree off-chain, then open the installment ---
    const tree = StandardMerkleTree.of(
      [
        [citizen1.address, installmentAmt.toString()],
        [citizen2.address, installmentAmt.toString()],
      ],
      ["address", "uint256"],
    );
    const allocated = installmentAmt * 2n;

    await expect(
      disbursement.connect(relayer).createInstallment(schemeId, tree.root, allocated),
    ).to.be.revertedWithCustomError(disbursement, "Forbidden");
    await disbursement.connect(automation).createInstallment(schemeId, tree.root, allocated);
    const installmentId = 0n;
    expect(await schemes.remainingFund(schemeId)).to.equal(fund - allocated);

    // --- claim for citizen1 (double-claim, bad proof, non-enrolled all blocked) ---
    const proof1 = getProof(tree, citizen1.address);
    await disbursement.connect(relayer).claim(installmentId, citizen1.address, installmentAmt, proof1);
    expect(await router.entitlement(schemeId, citizen1.address)).to.equal(installmentAmt);
    expect(await token.balanceOf(await router.getAddress())).to.equal(installmentAmt); // escrow
    expect(await token.totalSupply()).to.equal(installmentAmt);

    await expect(
      disbursement.connect(relayer).claim(installmentId, citizen1.address, installmentAmt, proof1),
    ).to.be.revertedWithCustomError(disbursement, "AlreadyClaimed");
    await expect(
      disbursement.connect(relayer).claim(installmentId, citizen2.address, installmentAmt, proof1),
    ).to.be.revertedWithCustomError(disbursement, "InvalidProof");

    const proof2 = getProof(tree, citizen2.address);
    await disbursement.connect(relayer).claim(installmentId, citizen2.address, installmentAmt, proof2);

    // --- payment is now ALSO gated on per-scheme vendor ZK enrolment ---
    const payAmt = ethers.parseEther("4000");
    // vendorA is approved + correct category but not yet enrolled into the scheme -> blocked
    await expect(
      router.connect(relayer).pay(citizen1.address, schemeId, vendorA.address, payAmt),
    ).to.be.revertedWithCustomError(router, "VendorNotEnrolled");
    // relayer enrolls vendorA (direct VENDOR_ENROLLER path; double-enroll + reused nullifier blocked)
    const vnullA = ethers.id("vnull-vendorA-scheme0");
    await vendorEnrollment.connect(relayer).enroll(schemeId, vendorA.address, vnullA);
    await expect(
      vendorEnrollment.connect(relayer).enroll(schemeId, vendorA.address, ethers.id("other-v")),
    ).to.be.revertedWithCustomError(vendorEnrollment, "AlreadyEnrolled");
    await expect(
      vendorEnrollment.connect(relayer).enroll(schemeId, vendorB.address, vnullA),
    ).to.be.revertedWithCustomError(vendorEnrollment, "NullifierAlreadyUsed");

    // --- citizen1 pays vendorA (allowed); wrong-category / unapproved / over-entitlement revert ---
    await router.connect(relayer).pay(citizen1.address, schemeId, vendorA.address, payAmt);
    expect(await token.balanceOf(vendorA.address)).to.equal(payAmt);
    expect(await router.entitlement(schemeId, citizen1.address)).to.equal(installmentAmt - payAmt);

    await expect(
      router.connect(relayer).pay(citizen1.address, schemeId, vendorB.address, payAmt),
    ).to.be.revertedWithCustomError(router, "VendorCategoryNotAllowed");
    await expect(
      router.connect(relayer).pay(citizen1.address, schemeId, admin.address, payAmt),
    ).to.be.revertedWithCustomError(router, "VendorNotApproved");
    await expect(
      router.connect(relayer).pay(citizen1.address, schemeId, vendorA.address, ethers.parseEther("999999")),
    ).to.be.revertedWithCustomError(router, "InsufficientEntitlement");

    // vendor cannot move its tokens anywhere (transfer-restricted)
    await expect(token.connect(vendorA).transfer(citizen2.address, 1n)).to.be.revertedWithCustomError(
      token,
      "TransferRestricted",
    );

    // --- delivery confirmation, then redemption ---
    const paymentId = 0n;
    await router.connect(relayer).confirmDelivery(paymentId);
    expect(await router.vendorRedeemable(vendorA.address)).to.equal(payAmt);

    await expect(
      redemption.connect(relayer).request(vendorA.address, payAmt + 1n),
    ).to.be.revertedWithCustomError(redemption, "ExceedsRedeemable");
    await redemption.connect(relayer).request(vendorA.address, payAmt);
    const requestId = 0n;

    await expect(redemption.connect(relayer).approve(requestId)).to.be.revertedWithCustomError(
      redemption,
      "Forbidden",
    );

    const supplyBefore = await token.totalSupply();
    await redemption.connect(rbiAdmin).approve(requestId);
    expect(await token.balanceOf(vendorA.address)).to.equal(0n); // burned on redemption
    expect(await router.vendorRedeemable(vendorA.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(supplyBefore - payAmt); // minted/redeemed invariant
  });

  it("stops disbursal when the scheme fund would be exceeded", async () => {
    const sys = await deploySystem();
    const { admin, automation } = sys.signers;
    const { schemes, disbursement } = sys;

    const fund = ethers.parseEther("100");
    await schemes
      .connect(admin)
      .createScheme("Tiny", SchemeCategory.AGRICULTURE, fund, ethers.parseEther("100"), [VendorCategory.AGRI_INPUT]);

    await expect(
      disbursement.connect(automation).createInstallment(0n, ethers.ZeroHash, ethers.parseEther("101")),
    ).to.be.revertedWithCustomError(schemes, "FundExhausted");
  });
});
