// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";

/// @title BeneficiaryRegistry
/// @notice Per-scheme set of approved citizens, tracked by commitment/nullifier (no PII on-chain).
/// @dev Phase 1 gates enroll() behind the ENROLLER role (the relayer). Phase 2 swaps this for a
///      ZK-verifier-gated enroll where the nullifier = hash(canonicalDocId, schemeId) is proven
///      in-circuit. The nullifier prevents double-claims per scheme and is consumed only on
///      successful enrollment (so a rejected applicant can retry).
contract BeneficiaryRegistry is RoleAware {
    mapping(uint256 => mapping(address => bool)) private _enrolled; // schemeId => citizen
    mapping(bytes32 => bool) private _nullifierUsed;

    event Enrolled(uint256 indexed schemeId, address indexed citizen, bytes32 nullifier);

    error NullifierAlreadyUsed(bytes32 nullifier);
    error AlreadyEnrolled(uint256 schemeId, address citizen);

    constructor(RoleRegistry _roles) RoleAware(_roles) {}

    function enroll(uint256 schemeId, address citizen, bytes32 nullifier) external only(Roles.ENROLLER) {
        if (_nullifierUsed[nullifier]) revert NullifierAlreadyUsed(nullifier);
        if (_enrolled[schemeId][citizen]) revert AlreadyEnrolled(schemeId, citizen);
        _nullifierUsed[nullifier] = true;
        _enrolled[schemeId][citizen] = true;
        emit Enrolled(schemeId, citizen, nullifier);
    }

    function isEnrolled(uint256 schemeId, address citizen) external view returns (bool) {
        return _enrolled[schemeId][citizen];
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return _nullifierUsed[nullifier];
    }
}
