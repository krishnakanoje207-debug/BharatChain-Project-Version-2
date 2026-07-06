// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";

/// @title VendorRegistry
/// @notice Government-approved vendors and their category. No vendors are pre-seeded; vendors
///         self-register off-chain and an ADMIN approves them here. (A few dummy institutions are
///         the only seeded approvals, to make the non-agriculture scheme demos runnable.)
contract VendorRegistry is RoleAware {
    struct Vendor {
        uint8 category; // VendorCategory enum (see packages/shared)
        bool approved;
        bool exists;
    }

    mapping(address => Vendor) private _vendors;

    event VendorApproved(address indexed vendor, uint8 category);
    event VendorRevoked(address indexed vendor);

    constructor(RoleRegistry _roles) RoleAware(_roles) {}

    function approveVendor(address vendor, uint8 category) external only(Roles.ADMIN) {
        _vendors[vendor] = Vendor(category, true, true);
        emit VendorApproved(vendor, category);
    }

    function revokeVendor(address vendor) external only(Roles.ADMIN) {
        _vendors[vendor].approved = false;
        emit VendorRevoked(vendor);
    }

    function isApproved(address vendor) external view returns (bool) {
        return _vendors[vendor].approved;
    }

    function categoryOf(address vendor) external view returns (uint8) {
        return _vendors[vendor].category;
    }

    function getVendor(address vendor) external view returns (Vendor memory) {
        return _vendors[vendor];
    }
}
