// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";
import {SchemeRegistry} from "./SchemeRegistry.sol";
import {VendorEnrollmentRegistry} from "./VendorEnrollmentRegistry.sol";

interface IVendorGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}

/// @title VendorZKEnroller
/// @notice Verifier-gated vendor enrolment (the vendor analogue of ZKEnroller). A vendor is enrolled
///         into a scheme only when a valid Groth16 proof attests Merkle-inclusion in the committed
///         business registry root, a valid trade licence, and a category equal to `requiredCategory`
///         — and that category is one the scheme allows. Yields a per-business nullifier.
/// @dev publicSignals = [nullifier, root, schemeId, requiredCategory] (circuit output first, then
///      public inputs). Submitted by the RELAYER.
contract VendorZKEnroller is RoleAware {
    IVendorGroth16Verifier public immutable verifier;
    SchemeRegistry public immutable schemes;
    VendorEnrollmentRegistry public immutable enrollments;

    /// @notice Committed Merkle root of the government business reference registry. Set by ADMIN.
    uint256 public vendorRegistryRoot;

    event VendorRegistryRootUpdated(uint256 root);
    event VendorEnrolledWithProof(
        uint256 indexed schemeId, address indexed vendor, uint8 category, bytes32 nullifier
    );

    error InvalidProof();
    error RootMismatch(uint256 expected, uint256 got);
    error SchemeMismatch(uint256 expected, uint256 got);
    error CategoryMismatch(uint256 expected, uint256 got);
    error CategoryNotAllowed(uint256 schemeId, uint8 category);

    constructor(
        RoleRegistry _roles,
        IVendorGroth16Verifier _verifier,
        SchemeRegistry _schemes,
        VendorEnrollmentRegistry _enrollments
    ) RoleAware(_roles) {
        verifier = _verifier;
        schemes = _schemes;
        enrollments = _enrollments;
    }

    function setVendorRegistryRoot(uint256 root) external only(Roles.ADMIN) {
        vendorRegistryRoot = root;
        emit VendorRegistryRootUpdated(root);
    }

    /// @notice Enrol a vendor into a scheme by verifying their eligibility proof.
    function enrollVendorWithProof(
        uint256 schemeId,
        address vendor,
        uint8 requiredCategory,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata pubSignals
    ) external only(Roles.RELAYER) {
        // pubSignals = [nullifier, root, schemeId, requiredCategory]
        if (pubSignals[1] != vendorRegistryRoot) revert RootMismatch(vendorRegistryRoot, pubSignals[1]);
        if (pubSignals[2] != schemeId) revert SchemeMismatch(schemeId, pubSignals[2]);
        if (pubSignals[3] != requiredCategory) revert CategoryMismatch(requiredCategory, pubSignals[3]);
        if (!schemes.isVendorCategoryAllowed(schemeId, requiredCategory)) {
            revert CategoryNotAllowed(schemeId, requiredCategory);
        }
        if (!verifier.verifyProof(a, b, c, pubSignals)) revert InvalidProof();

        bytes32 nullifier = bytes32(pubSignals[0]);
        enrollments.enroll(schemeId, vendor, nullifier);
        emit VendorEnrolledWithProof(schemeId, vendor, requiredCategory, nullifier);
    }
}
