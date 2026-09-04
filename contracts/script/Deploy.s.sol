// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { CalledItFloat } from "../src/CalledItFloat.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Deploy CalledItFloat.
 *
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://api.infra.testnet.somnia.network \
 *     --private-key $DEPLOYER_KEY --broadcast
 *
 * Env:
 *   FLOAT_ASSET            USDso / tUSDC address
 *                          testnet tUSDC 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E
 *   FLOAT_OWNER            governance address (multisig on mainnet)
 *   FLOAT_OPERATOR         the Croupier hot key's address
 *   FLOAT_CROUPIER_WALLET  dedicated wallet the float is sent to / swept from
 *                          (MUST hold nothing else)
 *   FLOAT_PRIZE_POOL       where the prize cut lands
 *   FLOAT_PRIZE_BPS        cut of session profit to the prize pool  (default 1000 = 10%)
 *   FLOAT_MAX_BORROW       absolute per-session borrow cap, asset units  (default 200e18)
 *   FLOAT_MAX_RATIO_BPS    per-session borrow cap as % of TVL  (default 5000 = 50%)
 *   FLOAT_MAX_SESSION_H    force-close deadline, hours  (default 26)
 */
contract Deploy is Script {
    function run() external returns (CalledItFloat vault) {
        address asset = vm.envAddress("FLOAT_ASSET");
        address owner = vm.envAddress("FLOAT_OWNER");

        CalledItFloat.Config memory cfg = CalledItFloat.Config({
            operator: vm.envAddress("FLOAT_OPERATOR"),
            croupierWallet: vm.envAddress("FLOAT_CROUPIER_WALLET"),
            prizePool: vm.envAddress("FLOAT_PRIZE_POOL"),
            prizeBps: uint16(vm.envOr("FLOAT_PRIZE_BPS", uint256(1_000))),
            maxBorrow: vm.envOr("FLOAT_MAX_BORROW", uint256(200 ether)),
            maxBorrowRatioBps: uint16(vm.envOr("FLOAT_MAX_RATIO_BPS", uint256(5_000))),
            maxSessionDuration: uint64(vm.envOr("FLOAT_MAX_SESSION_H", uint256(26)) * 1 hours)
        });

        vm.startBroadcast();
        vault = new CalledItFloat(IERC20(asset), "Called It Float", "ciFLOAT", owner, cfg);
        vm.stopBroadcast();

        console2.log("CalledItFloat:", address(vault));
        console2.log("  asset       ", asset);
        console2.log("  owner       ", owner);
        console2.log("  operator    ", cfg.operator);
        console2.log("  croupier    ", cfg.croupierWallet);
        console2.log("  prizePool   ", cfg.prizePool);
        console2.log("Next: from the croupier wallet, approve the vault for the asset (max).");
    }
}
