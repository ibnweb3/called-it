// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title CalledItFloat
 * @notice The community liquidity vault behind Called It. Depositors put in USDso
 *         and receive shares (ERC-4626). The Croupier bot (`operator`) borrows a
 *         working float once per trading session and returns it — plus or minus
 *         what it made making a market — at session end. Positive sessions raise
 *         the share price; a cut goes to the prize pool. Negative sessions lower
 *         it. This money is at risk.
 *
 * @dev    Accounting model — one session at a time:
 *
 *         totalAssets = idle USDso held here + `borrowed` (principal out with the
 *         Croupier). `borrow()` moves cash to `croupierWallet` and records the
 *         principal, so the share price does not move when the float goes out.
 *         `settle()` / `forceClose()` pull back *everything* the croupier wallet
 *         holds and zero `borrowed`; if less came back than went out, the
 *         difference is a realized loss and the share price falls then.
 *
 *         The operator can NEVER move depositor funds to itself:
 *           - `borrow()` only ever sends to the owner-set `croupierWallet`
 *           - `settle()` cannot understate the return — it sweeps the whole
 *             croupier-wallet balance, so a compromised operator key cannot crash
 *             the share price by lying about a loss
 *           - all rug-relevant parameters (operator, croupierWallet, caps, prize)
 *             change only through a 24h-timelocked config
 *           - withdrawals are always open (never pausable) and are served from
 *             idle; with the 50%-of-TVL borrow cap there is always meaningful
 *             idle to exit against mid-session
 */
contract CalledItFloat is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint16 internal constant BPS = 10_000;
    uint256 public constant CONFIG_TIMELOCK = 24 hours;
    uint16 public constant MAX_PRIZE_BPS = 2_000; // 20% of session profit, hard ceiling
    uint16 public constant MAX_BORROW_RATIO_BPS = 5_000; // 50% of TVL, hard ceiling
    uint64 public constant MIN_SESSION_DURATION = 1 hours;
    uint64 public constant MAX_SESSION_DURATION = 7 days;

    struct Config {
        /// @notice Hot key allowed to open/settle sessions. Cannot touch funds otherwise.
        address operator;
        /// @notice Dedicated wallet the float is sent to and swept back from. Must hold nothing else.
        address croupierWallet;
        /// @notice Where the prize cut of positive sessions is sent.
        address prizePool;
        /// @notice Cut of session PROFIT sent to the prize pool, in bps. <= MAX_PRIZE_BPS.
        uint16 prizeBps;
        /// @notice Absolute ceiling on a single session's borrow, in asset units.
        uint256 maxBorrow;
        /// @notice Ceiling on a session's borrow as a fraction of TVL, in bps. <= MAX_BORROW_RATIO_BPS.
        uint16 maxBorrowRatioBps;
        /// @notice After this long, anyone may force-close a stale session.
        uint64 maxSessionDuration;
    }

    Config public config;
    Config public pendingConfig;
    uint64 public configEffectiveAt;

    /// @notice Principal currently out with the Croupier (0 when no session is open).
    uint256 public borrowed;
    /// @notice Timestamp after which `forceClose()` is callable (0 when no session).
    uint64 public sessionDeadline;

    event SessionOpened(uint256 amount, uint64 deadline);
    event SessionClosed(uint256 principal, uint256 returned, uint256 prizePaid);
    event PrizePaid(address indexed to, uint256 amount);
    event ConfigProposed(uint64 effectiveAt);
    event ConfigApplied();
    event CroupierDustSwept(uint256 amount);

    error NotOperator();
    error SessionAlreadyOpen();
    error NoOpenSession();
    error SessionNotStale();
    error BorrowTooLarge();
    error BorrowExceedsRatio();
    error ZeroAddress();
    error PrizeBpsTooHigh();
    error RatioTooHigh();
    error BadSessionDuration();
    error NoPendingConfig();
    error TimelockNotElapsed();

    modifier onlyOperator() {
        if (msg.sender != config.operator) revert NotOperator();
        _;
    }

    constructor(IERC20 asset_, string memory name_, string memory symbol_, address owner_, Config memory cfg_)
        ERC20(name_, symbol_)
        ERC4626(asset_)
        Ownable(owner_)
    {
        if (owner_ == address(0)) revert ZeroAddress();
        _validateConfig(cfg_);
        config = cfg_;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Vault accounting
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Idle cash + float out with the Croupier. Realized losses show up here
    ///      the moment a session closes short.
    function totalAssets() public view override returns (uint256) {
        return _idle() + borrowed;
    }

    /// @dev Stronger inflation-attack resistance than the ERC4626 default: virtual
    ///      shares scale is 1e6, so a share-price manipulation via donation needs
    ///      ~1e6x the victim's deposit to round their shares to zero.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @notice USDso held by the vault right now (not deployed).
    function idleAssets() external view returns (uint256) {
        return _idle();
    }

    /// @notice True while the Croupier holds a float.
    function sessionOpen() external view returns (bool) {
        return borrowed != 0;
    }

    /// @notice Assets backing 1e18 shares — a convenience for UIs.
    function sharePrice() external view returns (uint256) {
        return convertToAssets(1e18);
    }

    function _idle() internal view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-4626 entrypoints — deposits pause with the vault, withdrawals never do
    // ─────────────────────────────────────────────────────────────────────────

    function deposit(uint256 assets, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner);
    }

    /// @dev Exits are served from idle only — the Croupier can't be forced to
    ///      return the float mid-session. The borrow-ratio cap keeps idle >= 50%.
    ///      Off-session, idle == totalAssets, so the standard limits apply and a
    ///      holder can always exit in full (no conversion-rounding dust left behind).
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (borrowed == 0) return super.maxWithdraw(owner);
        return Math.min(super.maxWithdraw(owner), _idle());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        if (borrowed == 0) return super.maxRedeem(owner);
        uint256 idleInShares = _convertToShares(_idle(), Math.Rounding.Floor);
        return Math.min(super.maxRedeem(owner), idleInShares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sessions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Open a session: send `amount` of float to the Croupier wallet.
    function borrow(uint256 amount) external onlyOperator whenNotPaused nonReentrant {
        if (borrowed != 0) revert SessionAlreadyOpen();
        if (amount == 0 || amount > config.maxBorrow) revert BorrowTooLarge();
        if (amount > (totalAssets() * config.maxBorrowRatioBps) / BPS) revert BorrowExceedsRatio();

        borrowed = amount;
        sessionDeadline = uint64(block.timestamp) + config.maxSessionDuration;
        emit SessionOpened(amount, sessionDeadline);

        IERC20(asset()).safeTransfer(config.croupierWallet, amount);
    }

    /// @notice Close the open session. Sweeps everything the Croupier wallet
    ///         holds back into the vault, realizes P&L, pays the prize cut.
    function settle() external onlyOperator nonReentrant {
        if (borrowed == 0) revert NoOpenSession();
        _sweepAndClose();
    }

    /// @notice Anyone can close a session the operator left open past its deadline.
    ///         Recovers whatever it can from the Croupier wallet and writes off
    ///         the rest, so withdrawals are never stranded behind a dead bot.
    function forceClose() external nonReentrant {
        if (borrowed == 0) revert NoOpenSession();
        if (block.timestamp < sessionDeadline) revert SessionNotStale();
        _sweepAndClose();
    }

    function _sweepAndClose() internal {
        IERC20 a = IERC20(asset());
        address w = config.croupierWallet;
        uint256 recoverable = Math.min(a.allowance(w, address(this)), a.balanceOf(w));

        uint256 principal = borrowed;
        borrowed = 0;
        sessionDeadline = 0;

        uint256 prize;
        if (recoverable > principal) {
            prize = ((recoverable - principal) * config.prizeBps) / BPS;
        }
        emit SessionClosed(principal, recoverable, prize);

        if (recoverable > 0) {
            a.safeTransferFrom(w, address(this), recoverable);
        }
        if (prize > 0) {
            a.safeTransfer(config.prizePool, prize);
            emit PrizePaid(config.prizePool, prize);
        }
    }

    /// @notice Owner recovers any stray asset left in the Croupier wallet between
    ///         sessions (the wallet is meant to hold nothing when idle).
    function sweepCroupierDust() external onlyOwner nonReentrant {
        if (borrowed != 0) revert SessionAlreadyOpen();
        IERC20 a = IERC20(asset());
        address w = config.croupierWallet;
        uint256 amount = Math.min(a.allowance(w, address(this)), a.balanceOf(w));
        if (amount > 0) {
            a.safeTransferFrom(w, address(this), amount);
            emit CroupierDustSwept(amount);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Config (timelocked) & pause
    // ─────────────────────────────────────────────────────────────────────────

    function proposeConfig(Config calldata cfg_) external onlyOwner {
        _validateConfig(cfg_);
        pendingConfig = cfg_;
        configEffectiveAt = uint64(block.timestamp + CONFIG_TIMELOCK);
        emit ConfigProposed(configEffectiveAt);
    }

    function applyConfig() external {
        if (configEffectiveAt == 0) revert NoPendingConfig();
        if (block.timestamp < configEffectiveAt) revert TimelockNotElapsed();
        config = pendingConfig;
        delete pendingConfig;
        configEffectiveAt = 0;
        emit ConfigApplied();
    }

    function cancelPendingConfig() external onlyOwner {
        delete pendingConfig;
        configEffectiveAt = 0;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _validateConfig(Config memory cfg_) internal pure {
        if (cfg_.operator == address(0) || cfg_.croupierWallet == address(0) || cfg_.prizePool == address(0)) revert ZeroAddress();
        if (cfg_.prizeBps > MAX_PRIZE_BPS) revert PrizeBpsTooHigh();
        if (cfg_.maxBorrowRatioBps == 0 || cfg_.maxBorrowRatioBps > MAX_BORROW_RATIO_BPS) {
            revert RatioTooHigh();
        }
        if (cfg_.maxSessionDuration < MIN_SESSION_DURATION || cfg_.maxSessionDuration > MAX_SESSION_DURATION) revert BadSessionDuration();
    }
}
