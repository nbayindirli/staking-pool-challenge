// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "./Tether.sol";

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

    event Staked(address indexed _staker, address indexed _stakeholder, uint256 _amount, uint256 _timestamp);
    event Unstaked(address indexed _stakeholder, uint256 _amount, uint256 _timestamp);

    struct UnlockRequest {
        uint256 amount;
        uint256 timestamp;
    }

    struct StakeData {
        uint256 amountStaked;
        uint256 numUnlockRequests;
        mapping(uint256 => UnlockRequest) unlockRequests;
    }

    mapping(address => StakeData) public stakeholders;

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
    function stake(address _stakeholder, uint256 _amountStaked) external {
        require(_amountStaked > 0, "stake amount must be > 0");

        bool success = tether.transferFrom(_stakeholder, address(this), _amountStaked);
        require(success, "transferFrom failed");

        stakeholders[_stakeholder].amountStaked += _amountStaked;

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

        require(stakeData.amountStaked > 0, "must have staked funds");
        require(_amountRequested <= stakeData.amountStaked, "requested amount too high");

        stakeData.numUnlockRequests++;

        UnlockRequest storage unlockRequest = stakeData.unlockRequests[stakeData.numUnlockRequests];
        unlockRequest.amount = _amountRequested;
        unlockRequest.timestamp = block.timestamp;
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
    function unstake() external {
        StakeData storage stakeData = stakeholders[msg.sender];

        require(stakeData.amountStaked > 0, "must have staked funds");

        uint256 numUnlockRequests = stakeData.numUnlockRequests;

        require(numUnlockRequests > 0, "must request unlock to unstake");

        uint256 amountUnstaked;
        UnlockRequest memory unlockRequest;

        for (uint256 r = 1; r <= numUnlockRequests; r++) {
            unlockRequest = stakeData.unlockRequests[r];
            if (unlockRequest.amount > 0) {
                if (unlockRequest.timestamp <= (block.timestamp - 48 hours)) {
                    amountUnstaked += unlockRequest.amount;
                    delete stakeData.unlockRequests[r];
                    stakeData.numUnlockRequests--;
                }
            }
        }

        require(amountUnstaked > 0, "no funds available for unstaking");

        bool success = tether.approve(address(this), amountUnstaked);
        require(success, "approve failed");

        success = tether.transferFrom(address(this), msg.sender, amountUnstaked);
        require(success, "transferFrom failed");

        stakeData.amountStaked -= amountUnstaked;

        emit Unstaked(msg.sender, amountUnstaked, block.timestamp);
    }
}
