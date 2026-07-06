import { expect } from "chai";
import { ethers } from "hardhat";
import { ROLE } from "./helpers/deploy";

describe("DigitalRupee", () => {
  async function fixture() {
    const [admin, mover, user] = await ethers.getSigners();
    const roles = await (await ethers.getContractFactory("RoleRegistry")).deploy(admin.address);
    const token = await (await ethers.getContractFactory("DigitalRupee")).deploy(await roles.getAddress());
    return { admin, mover, user, roles, token };
  }

  it("has correct metadata", async () => {
    const { token } = await fixture();
    expect(await token.name()).to.equal("Digital Rupee");
    expect(await token.symbol()).to.equal("eINR");
    expect(await token.decimals()).to.equal(18n);
  });

  it("only MINTER can mint", async () => {
    const { admin, user, roles, token } = await fixture();
    await expect(token.connect(user).mint(user.address, 1n)).to.be.revertedWithCustomError(token, "Forbidden");
    await roles.grantRole(ROLE.MINTER, admin.address);
    await token.mint(user.address, 100n);
    expect(await token.balanceOf(user.address)).to.equal(100n);
  });

  it("blocks peer transfers unless the caller holds TOKEN_MOVER", async () => {
    const { admin, mover, user, roles, token } = await fixture();
    await roles.grantRole(ROLE.MINTER, admin.address);
    await token.mint(user.address, 100n);

    // user (no TOKEN_MOVER) cannot move tokens
    await expect(token.connect(user).transfer(mover.address, 10n)).to.be.revertedWithCustomError(
      token,
      "TransferRestricted",
    );

    // granting TOKEN_MOVER unlocks transfers from that caller
    await roles.grantRole(ROLE.TOKEN_MOVER, user.address);
    await token.connect(user).transfer(mover.address, 10n);
    expect(await token.balanceOf(mover.address)).to.equal(10n);
  });
});
