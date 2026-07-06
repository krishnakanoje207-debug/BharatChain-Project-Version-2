// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";

/// @title VendorEnrollmentRegistry
/// @notice Per-scheme set of ZK-approved vendors (the vendor analogue of BeneficiaryRegistry).
///         A vendor is enrolled into a scheme only after proving, in zero knowledge, membership in
///         the committed government business registry with a valid trade licence and a category the
///         scheme allows. The nullifier = hash(canonicalBusinessId, schemeId) blocks the same
///         business enrolling a scheme twice (even via a different payout address).
/// @dev Writes are gated behind the VENDOR_ENROLLER role (held by VendorZKEnroller).
contract VendorEnrollmentRegistry is RoleAware {
    mapping(uint256 => mapping(address => bool)) private _enrolled; // schemeId => vendor
    mapping(bytes32 => bool) private _nullifierUsed;

    event VendorEnrolled(uint256 indexed schemeId, address indexed vendor, bytes32 nullifier);

    error NullifierAlreadyUsed(bytes32 nullifier);
    error AlreadyEnrolled(uint256 schemeId, address vendor);

    constructor(RoleRegistry _roles) RoleAware(_roles) {}

    function enroll(uint256 schemeId, address vendor, bytes32 nullifier) external only(Roles.VENDOR_ENROLLER) {
        if (_nullifierUsed[nullifier]) revert NullifierAlreadyUsed(nullifier);
        if (_enrolled[schemeId][vendor]) revert AlreadyEnrolled(schemeId, vendor);
        _nullifierUsed[nullifier] = true;
        _enrolled[schemeId][vendor] = true;
        emit VendorEnrolled(schemeId, vendor, nullifier);
    }

    function isEnrolled(uint256 schemeId, address vendor) external view returns (bool) {
        return _enrolled[schemeId][vendor];
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return _nullifierUsed[nullifier];
    }
}
