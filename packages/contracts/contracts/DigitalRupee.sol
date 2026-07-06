// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";

/// @title DigitalRupee (e₹)
/// @notice Transfer-restricted CBDC-style token. 1 token = ₹1 (18 decimals).
/// @dev Citizens never hold transferable balances — escrow (PaymentRouter) holds minted tokens
///      and moves them to vendors on payment; vendors' tokens leave only via redemption burn.
///      Only MINTER may mint, only BURNER may burn, and any peer transfer requires the caller to
///      hold TOKEN_MOVER (the PaymentRouter). This restriction is what makes every downstream
///      control (category gating, proof-of-delivery) actually enforceable.
contract DigitalRupee is ERC20, RoleAware {
    error TransferRestricted(address caller);

    constructor(RoleRegistry _roles) ERC20("Digital Rupee", "eINR") RoleAware(_roles) {}

    /// @notice Mint tokens (called by DisbursementController into escrow on claim).
    function mint(address to, uint256 amount) external only(Roles.MINTER) {
        _mint(to, amount);
    }

    /// @notice Burn tokens (called by RedemptionController on token -> fiat redemption).
    function burn(address from, uint256 amount) external only(Roles.BURNER) {
        _burn(from, amount);
    }

    /// @dev Restrict peer transfers to TOKEN_MOVER modules. Mint (from==0) and burn (to==0) pass through.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            if (!roles.hasRole(Roles.TOKEN_MOVER, msg.sender)) revert TransferRestricted(msg.sender);
        }
        super._update(from, to, value);
    }
}
