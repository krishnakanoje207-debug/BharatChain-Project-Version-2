// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Roles} from "./Roles.sol";

/// @title RoleRegistry
/// @notice Single source of truth for access control across BharatChain.
/// @dev The deployer is DEFAULT_ADMIN and ADMIN; it grants the module/operator roles
///      during deployment. In production these privileged ops sit behind a multi-sig.
contract RoleRegistry is AccessControl {
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(Roles.ADMIN, admin);
    }
}
