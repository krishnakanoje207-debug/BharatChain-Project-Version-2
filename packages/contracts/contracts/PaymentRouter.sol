// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";
import {DigitalRupee} from "./DigitalRupee.sol";
import {SchemeRegistry} from "./SchemeRegistry.sol";
import {VendorRegistry} from "./VendorRegistry.sol";
import {VendorEnrollmentRegistry} from "./VendorEnrollmentRegistry.sol";

/// @title PaymentRouter
/// @notice The citizen-side wallet + payment rail. Holds per-(scheme,citizen) entitlements and the
///         escrow of minted e₹. Citizens never hold transferable tokens; on payment the router moves
///         escrowed e₹ to an approved, category-allowed vendor. Redemption draws only from DELIVERED
///         payments (proof-of-delivery).
contract PaymentRouter is RoleAware {
    enum PaymentState {
        None,
        Paid,
        Delivered
    }

    struct Payment {
        address citizen;
        address vendor;
        uint256 schemeId;
        uint256 amount;
        PaymentState state;
    }

    DigitalRupee public immutable token;
    SchemeRegistry public immutable schemes;
    VendorRegistry public immutable vendors;
    VendorEnrollmentRegistry public immutable vendorEnrollment;

    // schemeId => citizen => entitled (spendable) balance
    mapping(uint256 => mapping(address => uint256)) public entitlement;
    // vendor => delivered-but-not-yet-redeemed balance
    mapping(address => uint256) public vendorRedeemable;

    Payment[] public payments;

    event Credited(uint256 indexed schemeId, address indexed citizen, uint256 amount);
    event Paid(
        uint256 indexed paymentId, address indexed citizen, address indexed vendor, uint256 schemeId, uint256 amount
    );
    event Delivered(uint256 indexed paymentId, address indexed vendor, uint256 amount);
    event RedeemableConsumed(address indexed vendor, uint256 amount);

    error InsufficientEntitlement(uint256 schemeId, address citizen, uint256 requested, uint256 available);
    error VendorNotApproved(address vendor);
    error VendorNotEnrolled(uint256 schemeId, address vendor);
    error VendorCategoryNotAllowed(uint256 schemeId, address vendor, uint8 vendorCategory);
    error InvalidPayment(uint256 paymentId);
    error NotPaid(uint256 paymentId);
    error InsufficientRedeemable(address vendor, uint256 requested, uint256 available);

    constructor(
        RoleRegistry _roles,
        DigitalRupee _token,
        SchemeRegistry _schemes,
        VendorRegistry _vendors,
        VendorEnrollmentRegistry _vendorEnrollment
    ) RoleAware(_roles) {
        token = _token;
        schemes = _schemes;
        vendors = _vendors;
        vendorEnrollment = _vendorEnrollment;
    }

    /// @notice Credit a citizen's entitlement for a scheme (called by DisbursementController on claim).
    function credit(uint256 schemeId, address citizen, uint256 amount) external only(Roles.DISBURSER) {
        entitlement[schemeId][citizen] += amount;
        emit Credited(schemeId, citizen, amount);
    }

    /// @notice Pay an approved, category-allowed vendor from a citizen's scheme entitlement.
    /// @dev Called by the RELAYER on behalf of the (keyless) citizen.
    function pay(address citizen, uint256 schemeId, address vendor, uint256 amount)
        external
        only(Roles.RELAYER)
        returns (uint256 paymentId)
    {
        uint256 available = entitlement[schemeId][citizen];
        if (amount > available) revert InsufficientEntitlement(schemeId, citizen, amount, available);
        if (!vendors.isApproved(vendor)) revert VendorNotApproved(vendor);
        uint8 vcat = vendors.categoryOf(vendor);
        if (!schemes.isVendorCategoryAllowed(schemeId, vcat)) {
            revert VendorCategoryNotAllowed(schemeId, vendor, vcat);
        }
        // Per-scheme ZK enrolment gate: the vendor must have proven business-registry eligibility
        // for this scheme (in addition to the admin approval above).
        if (!vendorEnrollment.isEnrolled(schemeId, vendor)) revert VendorNotEnrolled(schemeId, vendor);

        entitlement[schemeId][citizen] = available - amount;
        // Move escrowed e₹ (held by this router) to the vendor.
        token.transfer(vendor, amount);

        paymentId = payments.length;
        payments.push(Payment(citizen, vendor, schemeId, amount, PaymentState.Paid));
        emit Paid(paymentId, citizen, vendor, schemeId, amount);
    }

    /// @notice Citizen confirms receipt -> payment becomes DELIVERED and redeemable by the vendor.
    function confirmDelivery(uint256 paymentId) external only(Roles.RELAYER) {
        if (paymentId >= payments.length) revert InvalidPayment(paymentId);
        Payment storage p = payments[paymentId];
        if (p.state != PaymentState.Paid) revert NotPaid(paymentId);
        p.state = PaymentState.Delivered;
        vendorRedeemable[p.vendor] += p.amount;
        emit Delivered(paymentId, p.vendor, p.amount);
    }

    /// @notice Consume a vendor's redeemable balance (called by RedemptionController on approval).
    function consumeRedeemable(address vendor, uint256 amount) external only(Roles.REDEEMER) {
        uint256 available = vendorRedeemable[vendor];
        if (amount > available) revert InsufficientRedeemable(vendor, amount, available);
        vendorRedeemable[vendor] = available - amount;
        emit RedeemableConsumed(vendor, amount);
    }

    function paymentCount() external view returns (uint256) {
        return payments.length;
    }
}
