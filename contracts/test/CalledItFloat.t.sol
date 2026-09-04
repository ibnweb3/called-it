// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { CalledItFloat } from "../src/CalledItFloat.sol";
import { MockUSD } from "./mocks/MockUSD.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

contract CalledItFloatTest is Test {
    MockUSD usd;
    CalledItFloat vault;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address croupier = makeAddr("croupierWallet");
    address prizePool = makeAddr("prizePool");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address sink = makeAddr("sink");

    uint256 constant UNIT = 1e18;

    function _cfg() internal view returns (CalledItFloat.Config memory) {
        return CalledItFloat.Config({
            operator: operator,
            croupierWallet: croupier,
            prizePool: prizePool,
            prizeBps: 1_000, // 10%
            maxBorrow: 100_000 * UNIT,
            maxBorrowRatioBps: 5_000, // 50%
            maxSessionDuration: 26 hours
        });
    }

    function setUp() public {
        usd = new MockUSD(18);
        vault = new CalledItFloat(IERC20(address(usd)), "Called It Float", "ciFLOAT", owner, _cfg());

        // the croupier wallet lets the vault sweep it back
        vm.prank(croupier);
        usd.approve(address(vault), type(uint256).max);

        for (uint256 i; i < 3; i++) {
            address who = [alice, bob, address(this)][i];
            usd.mint(who, 1_000_000 * UNIT);
            vm.prank(who);
            usd.approve(address(vault), type(uint256).max);
        }
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amount, who);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Vault basics
    // ─────────────────────────────────────────────────────────────────────────

    function test_DepositThenRedeemRoundtrips() public {
        uint256 shares = _deposit(alice, 10_000 * UNIT);
        assertEq(vault.totalAssets(), 10_000 * UNIT);
        assertEq(vault.balanceOf(alice), shares);

        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        assertApproxEqAbs(assets, 10_000 * UNIT, 1);
        assertEq(vault.totalAssets(), 0);
    }

    function test_SharesAreProportional() public {
        _deposit(alice, 10_000 * UNIT);
        _deposit(bob, 30_000 * UNIT);
        // bob put in 3x → holds ~3x the shares
        assertApproxEqRel(vault.balanceOf(bob), vault.balanceOf(alice) * 3, 1e12);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sessions: borrow / settle / P&L
    // ─────────────────────────────────────────────────────────────────────────

    function test_BorrowMovesCashButNotSharePrice() public {
        _deposit(alice, 10_000 * UNIT);
        uint256 before = vault.convertToAssets(vault.balanceOf(alice));

        vm.prank(operator);
        vault.borrow(5_000 * UNIT);

        assertEq(usd.balanceOf(croupier), 5_000 * UNIT);
        assertEq(vault.idleAssets(), 5_000 * UNIT);
        assertEq(vault.borrowed(), 5_000 * UNIT);
        assertEq(vault.totalAssets(), 10_000 * UNIT);
        assertEq(vault.convertToAssets(vault.balanceOf(alice)), before);
        assertTrue(vault.sessionOpen());
    }

    function test_SettleWithProfitRaisesSharePriceAndPaysPrize() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(operator);
        vault.borrow(5_000 * UNIT);

        // croupier makes 1,000 profit
        usd.mint(croupier, 1_000 * UNIT);

        vm.prank(operator);
        vault.settle();

        assertEq(vault.borrowed(), 0);
        assertEq(usd.balanceOf(croupier), 0, "swept fully");
        assertEq(usd.balanceOf(prizePool), 100 * UNIT, "10% of 1,000 profit");
        assertEq(vault.totalAssets(), 10_900 * UNIT);

        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 out = vault.redeem(shares, alice, alice);
        assertApproxEqAbs(out, 10_900 * UNIT, 2);
    }

    function test_SettleWithLossLowersSharePrice() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(operator);
        vault.borrow(5_000 * UNIT);

        // croupier loses 2,000
        vm.prank(croupier);
        usd.transfer(sink, 2_000 * UNIT);

        vm.prank(operator);
        vault.settle();

        assertEq(vault.borrowed(), 0);
        assertEq(usd.balanceOf(prizePool), 0, "no prize on a loss");
        assertEq(vault.totalAssets(), 8_000 * UNIT);

        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 out = vault.redeem(shares, alice, alice);
        assertApproxEqAbs(out, 8_000 * UNIT, 2);
    }

    function test_SettleSweepsWholeCroupierBalance_OperatorCannotUnderstate() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(operator);
        vault.borrow(5_000 * UNIT);
        usd.mint(croupier, 3_000 * UNIT); // 8,000 sitting in the croupier wallet

        vm.prank(operator);
        vault.settle();

        // there is no code path for the operator to report less than the wallet holds
        assertEq(usd.balanceOf(croupier), 0);
        assertEq(vault.totalAssets(), 10_000 * UNIT + 3_000 * UNIT - 300 * UNIT); // +profit -10% prize
    }

    function test_CannotBorrowTwice() public {
        _deposit(alice, 10_000 * UNIT);
        vm.startPrank(operator);
        vault.borrow(1_000 * UNIT);
        vm.expectRevert(CalledItFloat.SessionAlreadyOpen.selector);
        vault.borrow(1_000 * UNIT);
        vm.stopPrank();
    }

    function test_CannotBorrowAboveMaxBorrow() public {
        _deposit(alice, 500_000 * UNIT);
        vm.prank(operator);
        vm.expectRevert(CalledItFloat.BorrowTooLarge.selector);
        vault.borrow(100_001 * UNIT);
    }

    function test_CannotBorrowAboveRatio() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(operator);
        vm.expectRevert(CalledItFloat.BorrowExceedsRatio.selector);
        vault.borrow(5_001 * UNIT); // > 50% of 10,000
    }

    function test_NonOperatorCannotBorrow() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(alice);
        vm.expectRevert(CalledItFloat.NotOperator.selector);
        vault.borrow(1 * UNIT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Withdrawal liquidity during a session
    // ─────────────────────────────────────────────────────────────────────────

    function test_MaxWithdrawCappedAtIdleDuringSession() public {
        _deposit(alice, 10_000 * UNIT);
        _deposit(bob, 10_000 * UNIT);

        vm.prank(operator);
        vault.borrow(10_000 * UNIT); // 50% of 20,000 TVL; idle now 10,000

        // alice can still take her full 10,000 (idle covers it)
        assertEq(vault.maxWithdraw(alice), 10_000 * UNIT);
        vm.prank(alice);
        vault.withdraw(10_000 * UNIT, alice, alice);

        // now idle is 0 — bob is stuck until settle
        assertEq(vault.maxWithdraw(bob), 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxWithdraw.selector, bob, 1, 0));
        vault.withdraw(1, bob, bob);

        // after settle bob is whole again
        vm.prank(operator);
        vault.settle();
        assertApproxEqAbs(vault.maxWithdraw(bob), 10_000 * UNIT, 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // forceClose
    // ─────────────────────────────────────────────────────────────────────────

    function test_ForceCloseRevertsBeforeDeadline() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(operator);
        vault.borrow(5_000 * UNIT);

        vm.expectRevert(CalledItFloat.SessionNotStale.selector);
        vault.forceClose();
    }

    function test_ForceCloseByAnyoneWritesOffMissingFloat() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(operator);
        vault.borrow(5_000 * UNIT);

        // bot dies, float gone
        vm.prank(croupier);
        usd.transfer(sink, 5_000 * UNIT);

        vm.warp(block.timestamp + 27 hours);
        vm.prank(bob); // not the operator, not the owner
        vault.forceClose();

        assertEq(vault.borrowed(), 0);
        assertEq(vault.totalAssets(), 5_000 * UNIT); // the 5,000 that stayed idle
        // alice can recover the surviving half
        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 out = vault.redeem(shares, alice, alice);
        assertApproxEqAbs(out, 5_000 * UNIT, 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Config timelock & pause
    // ─────────────────────────────────────────────────────────────────────────

    function test_ConfigChangeIsTimelocked() public {
        CalledItFloat.Config memory next = _cfg();
        next.prizeBps = 2_000;

        vm.prank(owner);
        vault.proposeConfig(next);

        vm.expectRevert(CalledItFloat.TimelockNotElapsed.selector);
        vault.applyConfig();

        vm.warp(block.timestamp + 24 hours);
        vault.applyConfig(); // permissionless once elapsed

        (,,, uint16 prizeBps,,,) = vault.config();
        assertEq(prizeBps, 2_000);
    }

    function test_ProposeConfigRejectsOverCap() public {
        CalledItFloat.Config memory bad = _cfg();
        bad.prizeBps = 2_001;
        vm.prank(owner);
        vm.expectRevert(CalledItFloat.PrizeBpsTooHigh.selector);
        vault.proposeConfig(bad);

        bad = _cfg();
        bad.maxBorrowRatioBps = 5_001;
        vm.prank(owner);
        vm.expectRevert(CalledItFloat.RatioTooHigh.selector);
        vault.proposeConfig(bad);
    }

    function test_NonOwnerCannotProposeConfig() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.proposeConfig(_cfg());
    }

    function test_PauseBlocksDepositsNotWithdrawals() public {
        _deposit(alice, 10_000 * UNIT);
        vm.prank(owner);
        vault.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(1 * UNIT, bob);

        // alice can still leave
        uint256 half = vault.balanceOf(alice) / 2;
        vm.prank(alice);
        vault.redeem(half, alice, alice);

        // and the operator can still wind a session down
        vm.prank(owner);
        vault.unpause();
        vm.prank(operator);
        vault.borrow(1_000 * UNIT);
        vm.prank(owner);
        vault.pause();
        vm.prank(operator);
        vault.settle();
        assertEq(vault.borrowed(), 0);
    }

    function test_SweepCroupierDust() public {
        usd.mint(croupier, 42 * UNIT);
        vm.prank(owner);
        vault.sweepCroupierDust();
        assertEq(usd.balanceOf(croupier), 0);
        assertEq(vault.totalAssets(), 42 * UNIT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Inflation attack
    // ─────────────────────────────────────────────────────────────────────────

    function test_InflationAttackDoesNotStealVictimDeposit() public {
        // attacker seeds 1 wei then donates a pile
        address attacker = makeAddr("attacker");
        usd.mint(attacker, 100_000 * UNIT);
        vm.startPrank(attacker);
        usd.approve(address(vault), type(uint256).max);
        vault.deposit(1, attacker);
        usd.transfer(address(vault), 10_000 * UNIT); // donation
        vm.stopPrank();

        // victim deposits after the donation
        _deposit(alice, 5_000 * UNIT);

        // victim's shares are still worth ~their deposit, not rounded to dust
        uint256 recoverable = vault.convertToAssets(vault.balanceOf(alice));
        assertGt(recoverable, 4_990 * UNIT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: a depositor never redeems for more than they put in (no free money)
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_RoundtripNeverProfitsWithoutASession(uint256 amount) public {
        amount = bound(amount, 1e6, 500_000 * UNIT);
        uint256 shares = _deposit(alice, amount);
        vm.prank(alice);
        uint256 out = vault.redeem(shares, alice, alice);
        assertLe(out, amount);
        assertGe(out, amount - 2);
    }
}
