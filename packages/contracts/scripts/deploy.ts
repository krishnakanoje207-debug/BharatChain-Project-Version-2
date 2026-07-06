import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ROLE = {
  RELAYER: ethers.id("RELAYER_ROLE"),
  RBI_ADMIN: ethers.id("RBI_ADMIN_ROLE"),
  AUTOMATION: ethers.id("AUTOMATION_ROLE"),
  ENROLLER: ethers.id("ENROLLER_ROLE"),
  VENDOR_ENROLLER: ethers.id("VENDOR_ENROLLER_ROLE"),
  MINTER: ethers.id("MINTER_ROLE"),
  BURNER: ethers.id("BURNER_ROLE"),
  TOKEN_MOVER: ethers.id("TOKEN_MOVER_ROLE"),
  DISBURSER: ethers.id("DISBURSER_ROLE"),
  SCHEME_DRAWER: ethers.id("SCHEME_DRAWER_ROLE"),
  REDEEMER: ethers.id("REDEEMER_ROLE"),
};

/**
 * Deploys the full BharatChain contract system and wires every role. On a local network the single
 * deployer/relayer holds the human roles; in production these sit behind a multi-sig.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Operator:", deployer.address, "| network:", network.name);

  const roles = await (await ethers.getContractFactory("RoleRegistry")).deploy(deployer.address);
  const rolesAddr = await roles.getAddress();
  const token = await (await ethers.getContractFactory("DigitalRupee")).deploy(rolesAddr);
  const schemes = await (await ethers.getContractFactory("SchemeRegistry")).deploy(rolesAddr);
  const vendors = await (await ethers.getContractFactory("VendorRegistry")).deploy(rolesAddr);
  const beneficiaries = await (await ethers.getContractFactory("BeneficiaryRegistry")).deploy(rolesAddr);
  const vendorEnrollment = await (await ethers.getContractFactory("VendorEnrollmentRegistry")).deploy(rolesAddr);
  const router = await (
    await ethers.getContractFactory("PaymentRouter")
  ).deploy(
    rolesAddr,
    await token.getAddress(),
    await schemes.getAddress(),
    await vendors.getAddress(),
    await vendorEnrollment.getAddress(),
  );
  const disbursement = await (
    await ethers.getContractFactory("DisbursementController")
  ).deploy(
    rolesAddr,
    await token.getAddress(),
    await schemes.getAddress(),
    await beneficiaries.getAddress(),
    await router.getAddress(),
  );
  const redemption = await (
    await ethers.getContractFactory("RedemptionController")
  ).deploy(rolesAddr, await token.getAddress(), await router.getAddress());
  const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
  const zkEnroller = await (
    await ethers.getContractFactory("ZKEnroller")
  ).deploy(rolesAddr, await verifier.getAddress(), await beneficiaries.getAddress(), await schemes.getAddress());
  const vendorVerifier = await (await ethers.getContractFactory("VendorGroth16Verifier")).deploy();
  const vendorZkEnroller = await (
    await ethers.getContractFactory("VendorZKEnroller")
  ).deploy(
    rolesAddr,
    await vendorVerifier.getAddress(),
    await schemes.getAddress(),
    await vendorEnrollment.getAddress(),
  );

  // Human roles → operator (local single-key). Module roles → their contracts.
  // NOTE: ENROLLER is deliberately NOT granted to the operator — citizen enrolment must go
  // through ZKEnroller.enrollWithProof (Groth16-gated). Granting it to the relayer would let the
  // backend write BeneficiaryRegistry directly, bypassing the eligibility proof. Only the
  // ZKEnroller contract holds ENROLLER (granted below), mirroring the vendor arm.
  for (const r of [ROLE.RELAYER, ROLE.RBI_ADMIN, ROLE.AUTOMATION]) {
    await (await roles.grantRole(r, deployer.address)).wait();
  }
  await (await roles.grantRole(ROLE.MINTER, await disbursement.getAddress())).wait();
  await (await roles.grantRole(ROLE.DISBURSER, await disbursement.getAddress())).wait();
  await (await roles.grantRole(ROLE.SCHEME_DRAWER, await disbursement.getAddress())).wait();
  await (await roles.grantRole(ROLE.TOKEN_MOVER, await router.getAddress())).wait();
  await (await roles.grantRole(ROLE.BURNER, await redemption.getAddress())).wait();
  await (await roles.grantRole(ROLE.REDEEMER, await redemption.getAddress())).wait();
  await (await roles.grantRole(ROLE.ENROLLER, await zkEnroller.getAddress())).wait();
  await (await roles.grantRole(ROLE.VENDOR_ENROLLER, await vendorZkEnroller.getAddress())).wait();

  const addresses = {
    RoleRegistry: rolesAddr,
    DigitalRupee: await token.getAddress(),
    SchemeRegistry: await schemes.getAddress(),
    VendorRegistry: await vendors.getAddress(),
    BeneficiaryRegistry: await beneficiaries.getAddress(),
    VendorEnrollmentRegistry: await vendorEnrollment.getAddress(),
    PaymentRouter: await router.getAddress(),
    DisbursementController: await disbursement.getAddress(),
    RedemptionController: await redemption.getAddress(),
    Groth16Verifier: await verifier.getAddress(),
    ZKEnroller: await zkEnroller.getAddress(),
    VendorGroth16Verifier: await vendorVerifier.getAddress(),
    VendorZKEnroller: await vendorZkEnroller.getAddress(),
  };
  console.table(addresses);

  // Bundle the ABIs alongside the addresses so the backend consumes one self-contained file.
  const abis: Record<string, unknown> = {};
  for (const name of Object.keys(addresses)) {
    abis[name] = (await artifacts.readArtifact(name)).abi;
  }

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${network.name}.json`),
    JSON.stringify(
      { network: network.name, chainId: Number(network.config.chainId ?? 0), operator: deployer.address, addresses, abis },
      null,
      2,
    ),
  );
  console.log(`Saved → deployments/${network.name}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
