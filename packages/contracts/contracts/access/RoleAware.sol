// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleRegistry} from "./RoleRegistry.sol";

/// @title RoleAware
/// @notice Base contract giving modules a shared reference to the RoleRegistry.
abstract contract RoleAware {
    RoleRegistry public immutable roles;

    error Forbidden(bytes32 role, address account);

    constructor(RoleRegistry _roles) {
        roles = _roles;
    }

    modifier only(bytes32 role) {
        if (!roles.hasRole(role, msg.sender)) revert Forbidden(role, msg.sender);
        _;
    }
}
