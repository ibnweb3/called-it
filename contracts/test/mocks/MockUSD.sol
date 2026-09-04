// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Stand-in for USDso / tUSDC with configurable decimals.
contract MockUSD is ERC20 {
    uint8 private immutable _dec;

    constructor(uint8 decimals_) ERC20("Mock USD", "mUSD") {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
