// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "./Tether.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
* Solidity Challenge: Staking Pool
*
* Author: Noah Bayindirli (nbayindirli)
*
* Key:
* - Staker: The one who performs a stake.
* - Stakeholder: The one who owns the assets of a stake.
*/
contract StakingPool {
    using SafeMath for uint256;

    event Staked(address indexed _staker, address indexed _stakeholder, uint256 _amount, uint256 _timestamp);
    event Unstaked(address indexed _stakeholder, uint256 _amount, uint256 _timestamp);

    struct UnlockRequest {
        uint256 amountRequestedUntilNow;
        uint256 timestamp;
    }

    struct StakeData {
        uint256 amountStaked;
        uint256 amountRequestedForUnlock;
        uint256 numUnlockRequests;
        mapping(uint256 => UnlockRequest) unlockRequests;
    }

    mapping(address => StakeData) public stakeholders;

    bool private locked;

    modifier denyReentrant() {
        require(!locked, "reentrancy denied");
        locked = true;
        _;
        locked = false;
    }

    Tether public tether;

    constructor(address _tetherAddress) {
        tether = Tether(_tetherAddress);
    }

    /**
    * @dev Stake/lock a user's funds into the contract.
    *      May be called by fund owner or a different approved user.
    *
    * Emits a {Staked} event.
    *
    * Requirements:
    * - _stakeholder has pre-approved _staker via tether.approve(_staker, _amount)
    */
    function stake(address _stakeholder, uint256 _amountStaked) external denyReentrant {
        require(_amountStaked > 0, "stake amount must be > 0");
        require(_amountStaked <= tether.allowance(_stakeholder, msg.sender), "staker allowance too low");

        stakeholders[_stakeholder].amountStaked = (stakeholders[_stakeholder].amountStaked).add(_amountStaked);

        bool success = tether.transferFrom(_stakeholder, address(this), _amountStaked);
        require(success, "transferFrom failed");

        emit Staked(msg.sender, _stakeholder, _amountStaked, block.timestamp);
    }

    /**
    * @dev Request a portion (or all) of a user's funds to be unlocked.
    *      May only be called by fund owner.
    *
    * Requirements:
    * - Can only be called by the stakeholder
    */
    function requestUnlock(uint256 _amountRequested) external {
        require(_amountRequested > 0, "request amount must be > 0");

        StakeData storage stakeData = stakeholders[msg.sender];

        uint256 amountStaked = stakeData.amountStaked;

        require(amountStaked > 0, "must have staked funds");
        require(_amountRequested <= amountStaked, "requested amount too high");

        uint256 amountRequestedForUnlock = stakeData.amountRequestedForUnlock.add(_amountRequested);

        require(amountRequestedForUnlock <= amountStaked, "cannot unlock more than staked");

        uint256 numUnlockRequests = stakeData.numUnlockRequests;

        require(numUnlockRequests < type(uint256).max, "at request max, please unstake");

        stakeData.amountRequestedForUnlock = amountRequestedForUnlock;
        stakeData.unlockRequests[numUnlockRequests].amountRequestedUntilNow = amountRequestedForUnlock;
        stakeData.unlockRequests[numUnlockRequests].timestamp = block.timestamp;
        stakeData.numUnlockRequests = numUnlockRequests.add(1);
    }

    /**
    * @dev Un-stake any available user funds from the contract.
    *      May only be called by fund owner.
    *
    * Emits an {Unstaked} event.
    *
    * Requirements:
    * - 48hr grace period between requesting unlock and unstaking
    */
    function unstake() external denyReentrant {
        StakeData storage stakeData = stakeholders[msg.sender];

        require(stakeData.amountStaked > 0, "must have staked funds");
        require(stakeData.numUnlockRequests > 0, "must request unlock to unstake");

        uint256 currentTime = block.timestamp;
        uint256 amountUnstaked = getAmountUnstaked(stakeData, currentTime.sub(48 hours));

        require(amountUnstaked > 0, "no funds available for unstaking");

        stakeData.amountStaked = stakeData.amountStaked.sub(amountUnstaked);
        stakeData.amountRequestedForUnlock = stakeData.amountRequestedForUnlock.sub(amountUnstaked);

        bool success = tether.approve(address(this), amountUnstaked);
        require(success, "approve failed");

        success = tether.transferFrom(address(this), msg.sender, amountUnstaked);
        require(success, "transferFrom failed");

        emit Unstaked(msg.sender, amountUnstaked, currentTime);
    }

    /**
    * @dev Retrieves amount unstaked for a specific timestamp
    *
    * Requirements:
    * - stakeData.unlockRequests is sorted in ascending order
    */
    function getAmountUnstaked(StakeData storage stakeData, uint256 _targetTimestamp) private returns (uint256) {
        (uint256 index, bool noOlderOrEqualTimestamps) = findClosestTimeIndex(stakeData, _targetTimestamp);

        if (noOlderOrEqualTimestamps) {
            return 0;
        }

        uint256 amountRequestedUntilNow = stakeData.unlockRequests[index].amountRequestedUntilNow;
        rebalanceFutureAmountsRequested(stakeData, index, amountRequestedUntilNow);

        return amountRequestedUntilNow;
    }

    /**
    * @dev Modified binary search function.
    *      Finds the index of a stakeData.unlockRequest timestamp <= _targetTimestamp
    *      that is closest to _targetTimestamp in O(log n).
    *
    * Requirements:
    * - stakeData.unlockRequests is sorted in ascending order
    */
    function findClosestTimeIndex(
        StakeData storage stakeData, uint256 _targetTimestamp
    ) private view returns (uint256, bool) {
        mapping(uint256 => UnlockRequest) storage unlockRequests = stakeData.unlockRequests;

        if (unlockRequests[0].timestamp > _targetTimestamp) {
            return (0, true);
        }
        if (unlockRequests[0].timestamp == _targetTimestamp) {
            return (0, false);
        }

        uint256 endIndex = stakeData.numUnlockRequests;

        if (unlockRequests[endIndex.sub(1)].timestamp <= _targetTimestamp) {
            return (endIndex.sub(1), false);
        }

        uint256 leftPointer;
        uint256 rightPointer = endIndex;
        uint256 midIndex;

        while (leftPointer < rightPointer) {
            midIndex = (leftPointer.add(rightPointer)).div(2);

            if (unlockRequests[midIndex].timestamp == _targetTimestamp) {
                return (midIndex, false);
            }
            if (unlockRequests[midIndex].timestamp > _targetTimestamp) {
                if (midIndex > 0 && unlockRequests[midIndex.sub(1)].timestamp < _targetTimestamp) {
                    return (midIndex.sub(1), false);
                }
                rightPointer = midIndex;
            } else {
                if (midIndex < endIndex.sub(1) && unlockRequests[midIndex.add(1)].timestamp > _targetTimestamp) {
                    return (midIndex, false);
                }
                leftPointer = midIndex.add(1);
            }
        }
        return (midIndex, false);
    }

    /**
    * @dev Rebalances locked amountRequestedUntilNow values, reducing them by _amountUnstaked.
    *      Updates stakeData.unlockRequests state to only contain non-zero requests.
    *
    * Requirements:
    * - stakeData.unlockRequests is sorted in ascending order
    */
    function rebalanceFutureAmountsRequested(
        StakeData storage stakeData, uint256 _latestUnlockedIndex, uint256 _amountUnstaked
    ) private {
        uint256 length = stakeData.numUnlockRequests;

        UnlockRequest storage lockedRequest;
        UnlockRequest storage staleUnlockRequest;

        for (uint256 r = _latestUnlockedIndex; r < length.sub(1); r++) {
            lockedRequest = stakeData.unlockRequests[r.sub(_latestUnlockedIndex)];
            staleUnlockRequest = stakeData.unlockRequests[r.add(1)];

            lockedRequest.amountRequestedUntilNow = staleUnlockRequest.amountRequestedUntilNow.sub(_amountUnstaked);
            lockedRequest.timestamp = staleUnlockRequest.timestamp;

            delete stakeData.unlockRequests[r.add(1)];
        }

        stakeData.numUnlockRequests = length.sub(_latestUnlockedIndex).sub(1);
    }
}
