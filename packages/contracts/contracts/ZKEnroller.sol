// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";
import {BeneficiaryRegistry} from "./BeneficiaryRegistry.sol";
import {SchemeRegistry} from "./SchemeRegistry.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}

/// @title ZKEnroller
/// @notice Verifier-gated enrollment. A citizen is enrolled only when a valid Groth16 eligibility proof
///         is supplied: the proof attests Merkle-inclusion in the committed government registry root and
///         the scheme's eligibility predicate, and yields a per-identity nullifier that blocks
///         double-claims. This is the Phase-2 replacement for the relayer's direct enroll.
/// @dev publicSignals = [nullifier, root, schemeId, schemeCategory] (circuit output first, then
///      public inputs). `schemeCategory` is the scheme's sector and selects the in-circuit predicate;
///      it is bound here to the scheme's actual category so a proof minted for one sector cannot
///      enrol a scheme of another.
contract ZKEnroller is RoleAware {
    IGroth16Verifier public immutable verifier;
    BeneficiaryRegistry public immutable beneficiaries;
    SchemeRegistry public immutable schemes;

    /// @notice Committed Merkle root of the government reference registry (updated when real citizens
    ///         are appended). Set by ADMIN.
    uint256 public registryRoot;

    event RegistryRootUpdated(uint256 root);
    event EnrolledWithProof(uint256 indexed schemeId, address indexed citizen, bytes32 nullifier);

    error InvalidProof();
    error RootMismatch(uint256 expected, uint256 got);
    error SchemeMismatch(uint256 expected, uint256 got);
    error CategoryMismatch(uint256 expected, uint256 got);

    constructor(
        RoleRegistry _roles,
        IGroth16Verifier _verifier,
        BeneficiaryRegistry _beneficiaries,
        SchemeRegistry _schemes
    ) RoleAware(_roles) {
        verifier = _verifier;
        beneficiaries = _beneficiaries;
        schemes = _schemes;
    }

    function setRegistryRoot(uint256 root) external only(Roles.ADMIN) {
        registryRoot = root;
        emit RegistryRootUpdated(root);
    }

    /// @notice Enroll a citizen by verifying their eligibility proof. Submitted by the RELAYER.
    function enrollWithProof(
        uint256 schemeId,
        address citizen,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata pubSignals
    ) external only(Roles.RELAYER) {
        // pubSignals = [nullifier, root, schemeId, schemeCategory]
        if (pubSignals[1] != registryRoot) revert RootMismatch(registryRoot, pubSignals[1]);
        if (pubSignals[2] != schemeId) revert SchemeMismatch(schemeId, pubSignals[2]);
        // Bind the proof's sector to the scheme's actual category: the in-circuit predicate proven
        // must be the one for THIS scheme's sector.
        uint256 category = schemes.categoryOf(schemeId);
        if (pubSignals[3] != category) revert CategoryMismatch(category, pubSignals[3]);
        if (!verifier.verifyProof(a, b, c, pubSignals)) revert InvalidProof();
        bytes32 nullifier = bytes32(pubSignals[0]);
        beneficiaries.enroll(schemeId, citizen, nullifier);
        emit EnrolledWithProof(schemeId, citizen, nullifier);
    }
}
