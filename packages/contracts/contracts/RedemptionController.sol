// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";
import {DigitalRupee} from "./DigitalRupee.sol";
import {PaymentRouter} from "./PaymentRouter.sol";

/// @title RedemptionController
/// @notice Vendor token -> fiat redemption. A vendor may only redeem DELIVERED (citizen-confirmed)
///         value. The RBI_ADMIN approves after the off-chain legitimacy/ITR check; on approval the
///         vendor's e₹ is burned and an event emitted (the fiat payout is simulated off-chain).
contract RedemptionController is RoleAware {
    enum Status {
        Pending,
        Approved,
        Rejected
    }

    struct Request {
        address vendor;
        uint256 amount;
        Status status;
    }

    DigitalRupee public immutable token;
    PaymentRouter public immutable router;

    Request[] public requests;

    event RedemptionRequested(uint256 indexed requestId, address indexed vendor, uint256 amount);
    event RedemptionApproved(uint256 indexed requestId, address indexed vendor, uint256 amount);
    event RedemptionRejected(uint256 indexed requestId, address indexed vendor, uint256 amount);

    error UnknownRequest(uint256 requestId);
    error NotPending(uint256 requestId);
    error ExceedsRedeemable(address vendor, uint256 requested, uint256 available);

    constructor(RoleRegistry _roles, DigitalRupee _token, PaymentRouter _router) RoleAware(_roles) {
        token = _token;
        router = _router;
    }

    /// @notice Vendor requests a redemption (submitted by the RELAYER on the vendor's behalf).
    function request(address vendor, uint256 amount) external only(Roles.RELAYER) returns (uint256 requestId) {
        uint256 available = router.vendorRedeemable(vendor);
        if (amount > available) revert ExceedsRedeemable(vendor, amount, available);
        requestId = requests.length;
        requests.push(Request(vendor, amount, Status.Pending));
        emit RedemptionRequested(requestId, vendor, amount);
    }

    /// @notice RBI approves after the ITR/legitimacy check -> consume redeemable + burn e₹.
    function approve(uint256 requestId) external only(Roles.RBI_ADMIN) {
        if (requestId >= requests.length) revert UnknownRequest(requestId);
        Request storage r = requests[requestId];
        if (r.status != Status.Pending) revert NotPending(requestId);
        r.status = Status.Approved;
        router.consumeRedeemable(r.vendor, r.amount); // re-checks availability
        token.burn(r.vendor, r.amount);
        emit RedemptionApproved(requestId, r.vendor, r.amount);
    }

    function reject(uint256 requestId) external only(Roles.RBI_ADMIN) {
        if (requestId >= requests.length) revert UnknownRequest(requestId);
        Request storage r = requests[requestId];
        if (r.status != Status.Pending) revert NotPending(requestId);
        r.status = Status.Rejected;
        emit RedemptionRejected(requestId, r.vendor, r.amount);
    }

    function requestCount() external view returns (uint256) {
        return requests.length;
    }
}
