// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {DigitalRupee} from "./DigitalRupee.sol";
import {SchemeRegistry} from "./SchemeRegistry.sol";
import {BeneficiaryRegistry} from "./BeneficiaryRegistry.sol";
import {PaymentRouter} from "./PaymentRouter.sol";

/// @title DisbursementController
/// @notice Pull-based, fund-drawing-down disbursal. Each installment commits a Merkle root of
///         (citizen, amount) allocations and draws the scheme fund down by the installment total
///         (reverting if it would exceed the fund). Citizens claim via Merkle proof (submitted by the
///         relayer): e₹ is minted into the PaymentRouter escrow and credited to the citizen's
///         entitlement. No unbounded on-chain loop — this is how it survives India-scale beneficiary
///         counts.
contract DisbursementController is RoleAware {
    struct Installment {
        uint256 schemeId;
        bytes32 merkleRoot;
        uint256 allocated;
    }

    DigitalRupee public immutable token;
    SchemeRegistry public immutable schemes;
    BeneficiaryRegistry public immutable beneficiaries;
    PaymentRouter public immutable router;

    Installment[] public installments;
    mapping(uint256 => mapping(address => bool)) public claimed; // installmentId => citizen

    event InstallmentCreated(
        uint256 indexed installmentId, uint256 indexed schemeId, bytes32 merkleRoot, uint256 allocated
    );
    event Claimed(uint256 indexed installmentId, uint256 indexed schemeId, address indexed citizen, uint256 amount);

    error UnknownInstallment(uint256 installmentId);
    error AlreadyClaimed(uint256 installmentId, address citizen);
    error NotEnrolled(uint256 schemeId, address citizen);
    error InvalidProof();

    constructor(
        RoleRegistry _roles,
        DigitalRupee _token,
        SchemeRegistry _schemes,
        BeneficiaryRegistry _beneficiaries,
        PaymentRouter _router
    ) RoleAware(_roles) {
        token = _token;
        schemes = _schemes;
        beneficiaries = _beneficiaries;
        router = _router;
    }

    /// @notice Open an installment for a scheme (triggered by AUTOMATION/Chainlink or RBI_ADMIN).
    ///         Draws the scheme fund down by `allocated` (reverts if it would exceed the fund).
    function createInstallment(uint256 schemeId, bytes32 merkleRoot, uint256 allocated)
        external
        returns (uint256 installmentId)
    {
        if (!roles.hasRole(Roles.AUTOMATION, msg.sender) && !roles.hasRole(Roles.RBI_ADMIN, msg.sender)) {
            revert Forbidden(Roles.AUTOMATION, msg.sender);
        }
        schemes.drawDown(schemeId, allocated); // reverts on fund exhaustion
        installmentId = installments.length;
        installments.push(Installment(schemeId, merkleRoot, allocated));
        emit InstallmentCreated(installmentId, schemeId, merkleRoot, allocated);
    }

    /// @notice Claim a citizen's allocation in an installment (submitted by the RELAYER).
    /// @dev Leaf = keccak256(bytes.concat(keccak256(abi.encode(citizen, amount)))) — matches
    ///      OpenZeppelin's StandardMerkleTree used off-chain to build the root/proofs.
    function claim(uint256 installmentId, address citizen, uint256 amount, bytes32[] calldata proof)
        external
        only(Roles.RELAYER)
    {
        if (installmentId >= installments.length) revert UnknownInstallment(installmentId);
        Installment storage ins = installments[installmentId];
        if (claimed[installmentId][citizen]) revert AlreadyClaimed(installmentId, citizen);
        if (!beneficiaries.isEnrolled(ins.schemeId, citizen)) revert NotEnrolled(ins.schemeId, citizen);

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(citizen, amount))));
        if (!MerkleProof.verify(proof, ins.merkleRoot, leaf)) revert InvalidProof();

        claimed[installmentId][citizen] = true;
        token.mint(address(router), amount); // mint into escrow
        router.credit(ins.schemeId, citizen, amount); // credit entitlement
        emit Claimed(installmentId, ins.schemeId, citizen, amount);
    }

    function installmentCount() external view returns (uint256) {
        return installments.length;
    }
}
