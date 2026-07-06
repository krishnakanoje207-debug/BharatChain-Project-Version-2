// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Roles
/// @notice Central role identifiers used across BharatChain contracts.
/// @dev Human roles (ADMIN/RBI_ADMIN/RELAYER/AUTOMATION) are granted to operators;
///      module capabilities (MINTER/BURNER/TOKEN_MOVER/DISBURSER/ENROLLER/SCHEME_DRAWER/REDEEMER)
///      are granted to specific contracts during deployment.
library Roles {
    bytes32 internal constant ADMIN = keccak256("ADMIN_ROLE");
    bytes32 internal constant RBI_ADMIN = keccak256("RBI_ADMIN_ROLE");
    bytes32 internal constant RELAYER = keccak256("RELAYER_ROLE");
    bytes32 internal constant AUTOMATION = keccak256("AUTOMATION_ROLE");

    bytes32 internal constant MINTER = keccak256("MINTER_ROLE");
    bytes32 internal constant BURNER = keccak256("BURNER_ROLE");
    bytes32 internal constant TOKEN_MOVER = keccak256("TOKEN_MOVER_ROLE");
    bytes32 internal constant DISBURSER = keccak256("DISBURSER_ROLE");
    bytes32 internal constant ENROLLER = keccak256("ENROLLER_ROLE");
    bytes32 internal constant VENDOR_ENROLLER = keccak256("VENDOR_ENROLLER_ROLE");
    bytes32 internal constant SCHEME_DRAWER = keccak256("SCHEME_DRAWER_ROLE");
    bytes32 internal constant REDEEMER = keccak256("REDEEMER_ROLE");
}
