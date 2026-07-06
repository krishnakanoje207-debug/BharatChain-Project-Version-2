import { ethers } from "hardhat";

/** Role identifiers — keccak256 of the role string, matching contracts/access/Roles.sol. */
export const ROLE = {
  ADMIN: ethers.id("ADMIN_ROLE"),
  RBI_ADMIN: ethers.id("RBI_ADMIN_ROLE"),
  RELAYER: ethers.id("RELAYER_ROLE"),
  AUTOMATION: ethers.id("AUTOMATION_ROLE"),
  MINTER: ethers.id("MINTER_ROLE"),
  BURNER: ethers.id("BURNER_ROLE"),
  TOKEN_MOVER: ethers.id("TOKEN_MOVER_ROLE"),
  DISBURSER: ethers.id("DISBURSER_ROLE"),
  ENROLLER: ethers.id("ENROLLER_ROLE"),
  VENDOR_ENROLLER: ethers.id("VENDOR_ENROLLER_ROLE"),
  SCHEME_DRAWER: ethers.id("SCHEME_DRAWER_ROLE"),
  REDEEMER: ethers.id("REDEEMER_ROLE"),
};

/** Deploy the full BharatChain contract system and wire all roles. Used by tests and deploy script. */
export async function deploySystem() {
  const [admin, relayer, rbiAdmin, automation, citizen1, citizen2, vendorA, vendorB] = await ethers.getSigners();

  const roles = await (await ethers.getContractFactory("RoleRegistry")).deploy(admin.address);
  const rolesAddr = await roles.getAddress();

  const token = await (await ethers.getContractFactory("DigitalRupee")).deploy(rolesAddr);
  const schemes = await (await ethers.getContractFactory("SchemeRegistry")).deploy(rolesAddr);
  const vendors = await (await ethers.getContractFactory("VendorRegistry")).deploy(rolesAddr);
  const beneficiaries = await (await ethers.getContractFactory("BeneficiaryRegistry")).deploy(rolesAddr);
  const vendorEnrollment = await (await ethers.getContractFactory("VendorEnrollmentRegistry")).deploy(rolesAddr);

  const router = await (await ethers.getContractFactory("PaymentRouter")).deploy(
    rolesAddr,
    await token.getAddress(),
    await schemes.getAddress(),
    await vendors.getAddress(),
    await vendorEnrollment.getAddress(),
  );
  const disbursement = await (await ethers.getContractFactory("DisbursementController")).deploy(
    rolesAddr,
    await token.getAddress(),
    await schemes.getAddress(),
    await beneficiaries.getAddress(),
    await router.getAddress(),
  );
  const redemption = await (await ethers.getContractFactory("RedemptionController")).deploy(
    rolesAddr,
    await token.getAddress(),
    await router.getAddress(),
  );

  const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
  const zkEnroller = await (await ethers.getContractFactory("ZKEnroller")).deploy(
    rolesAddr,
    await verifier.getAddress(),
    await beneficiaries.getAddress(),
    await schemes.getAddress(),
  );
  const vendorVerifier = await (await ethers.getContractFactory("VendorGroth16Verifier")).deploy();
  const vendorZkEnroller = await (await ethers.getContractFactory("VendorZKEnroller")).deploy(
    rolesAddr,
    await vendorVerifier.getAddress(),
    await schemes.getAddress(),
    await vendorEnrollment.getAddress(),
  );

  // ----- wire roles (admin is DEFAULT_ADMIN and may grant) -----
  await roles.grantRole(ROLE.RELAYER, relayer.address);
  await roles.grantRole(ROLE.RBI_ADMIN, rbiAdmin.address);
  await roles.grantRole(ROLE.AUTOMATION, automation.address);
  await roles.grantRole(ROLE.ENROLLER, relayer.address); // Phase 1 direct-enroll path (kept for tests)
  await roles.grantRole(ROLE.ENROLLER, await zkEnroller.getAddress()); // Phase 2 verifier-gated enroll
  await roles.grantRole(ROLE.VENDOR_ENROLLER, relayer.address); // direct vendor-enroll path (tests)
  await roles.grantRole(ROLE.VENDOR_ENROLLER, await vendorZkEnroller.getAddress()); // verifier-gated vendor enroll

  await roles.grantRole(ROLE.MINTER, await disbursement.getAddress());
  await roles.grantRole(ROLE.DISBURSER, await disbursement.getAddress());
  await roles.grantRole(ROLE.SCHEME_DRAWER, await disbursement.getAddress());
  await roles.grantRole(ROLE.TOKEN_MOVER, await router.getAddress());
  await roles.grantRole(ROLE.BURNER, await redemption.getAddress());
  await roles.grantRole(ROLE.REDEEMER, await redemption.getAddress());

  return {
    signers: { admin, relayer, rbiAdmin, automation, citizen1, citizen2, vendorA, vendorB },
    roles,
    token,
    schemes,
    vendors,
    beneficiaries,
    vendorEnrollment,
    router,
    disbursement,
    redemption,
    verifier,
    zkEnroller,
    vendorVerifier,
    vendorZkEnroller,
  };
}
