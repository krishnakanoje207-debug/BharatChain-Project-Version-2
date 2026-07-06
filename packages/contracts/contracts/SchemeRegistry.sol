// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RoleAware} from "./access/RoleAware.sol";
import {RoleRegistry} from "./access/RoleRegistry.sol";
import {Roles} from "./access/Roles.sol";

/// @title SchemeRegistry
/// @notice Welfare schemes with per-scheme fund, installment amount, sector category, and the
///         vendor categories they may pay. Enforces the fund draw-down invariant: disbursed <= fund.
contract SchemeRegistry is RoleAware {
    struct Scheme {
        string name;
        uint8 category; // SchemeCategory enum (see packages/shared)
        uint256 fund; // total allotted (wei of e₹)
        uint256 installmentAmount; // per-beneficiary per installment
        uint256 disbursed; // running total drawn down
        bool active;
    }

    Scheme[] private _schemes;
    // schemeId => vendorCategory(uint8) => allowed
    mapping(uint256 => mapping(uint8 => bool)) private _allowedVendorCat;

    event SchemeCreated(
        uint256 indexed schemeId, string name, uint8 category, uint256 fund, uint256 installmentAmount
    );
    event SchemeStatusChanged(uint256 indexed schemeId, bool active);
    event FundToppedUp(uint256 indexed schemeId, uint256 amount, uint256 fund);
    event FundDrawnDown(uint256 indexed schemeId, uint256 amount, uint256 disbursed, uint256 fund);

    error SchemeInactive(uint256 schemeId);
    error FundExhausted(uint256 schemeId, uint256 requested, uint256 remaining);
    error UnknownScheme(uint256 schemeId);

    constructor(RoleRegistry _roles) RoleAware(_roles) {}

    function createScheme(
        string calldata name,
        uint8 category,
        uint256 fund,
        uint256 installmentAmt,
        uint8[] calldata allowedVendorCategories
    ) external only(Roles.ADMIN) returns (uint256 schemeId) {
        schemeId = _schemes.length;
        _schemes.push(Scheme(name, category, fund, installmentAmt, 0, true));
        for (uint256 i = 0; i < allowedVendorCategories.length; i++) {
            _allowedVendorCat[schemeId][allowedVendorCategories[i]] = true;
        }
        emit SchemeCreated(schemeId, name, category, fund, installmentAmt);
    }

    function setActive(uint256 schemeId, bool active) external only(Roles.ADMIN) {
        _requireScheme(schemeId);
        _schemes[schemeId].active = active;
        emit SchemeStatusChanged(schemeId, active);
    }

    /// @notice Top up a scheme's allotted fund (admin "modify"). Eligibility/installment
    ///         are immutable once enrolees exist; only the fund ceiling can be raised.
    function topUpFund(uint256 schemeId, uint256 amount) external only(Roles.ADMIN) {
        _requireScheme(schemeId);
        _schemes[schemeId].fund += amount;
        emit FundToppedUp(schemeId, amount, _schemes[schemeId].fund);
    }

    /// @notice Draw down the scheme fund. Reverts if it would exceed the allotted fund
    ///         (disbursal stops when exhausted; remaining beneficiaries are queued off-chain).
    function drawDown(uint256 schemeId, uint256 amount) external only(Roles.SCHEME_DRAWER) {
        _requireScheme(schemeId);
        Scheme storage s = _schemes[schemeId];
        if (!s.active) revert SchemeInactive(schemeId);
        uint256 remaining = s.fund - s.disbursed;
        if (amount > remaining) revert FundExhausted(schemeId, amount, remaining);
        s.disbursed += amount;
        emit FundDrawnDown(schemeId, amount, s.disbursed, s.fund);
    }

    // ----- views -----
    function schemeCount() external view returns (uint256) {
        return _schemes.length;
    }

    function getScheme(uint256 schemeId) external view returns (Scheme memory) {
        _requireScheme(schemeId);
        return _schemes[schemeId];
    }

    function categoryOf(uint256 schemeId) external view returns (uint8) {
        _requireScheme(schemeId);
        return _schemes[schemeId].category;
    }

    function installmentAmount(uint256 schemeId) external view returns (uint256) {
        _requireScheme(schemeId);
        return _schemes[schemeId].installmentAmount;
    }

    function remainingFund(uint256 schemeId) external view returns (uint256) {
        _requireScheme(schemeId);
        return _schemes[schemeId].fund - _schemes[schemeId].disbursed;
    }

    function isVendorCategoryAllowed(uint256 schemeId, uint8 vendorCategory) external view returns (bool) {
        _requireScheme(schemeId);
        return _allowedVendorCat[schemeId][vendorCategory];
    }

    function isActive(uint256 schemeId) external view returns (bool) {
        _requireScheme(schemeId);
        return _schemes[schemeId].active;
    }

    function _requireScheme(uint256 schemeId) internal view {
        if (schemeId >= _schemes.length) revert UnknownScheme(schemeId);
    }
}
