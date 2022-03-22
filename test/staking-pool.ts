import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { performance } from "perf_hooks";
import { Tether, Tether__factory } from "../typechain";
import { StakingPool__factory } from "../typechain/factories/StakingPool__factory";
import { StakingPool } from "../typechain/StakingPool";
const { time } = require('@openzeppelin/test-helpers');

describe("StakingPool Test", async function () {

    const totalSupply = BigInt(1_000_000 * (10 ** 18));

    let deployer: SignerWithAddress;
    let owner: SignerWithAddress, acct1: SignerWithAddress, acct2: SignerWithAddress;
    let tether: Tether;
    let stakingPool: StakingPool;

    beforeEach(async function () {
        [deployer, owner, acct1, acct2] = await ethers.getSigners();
        tether = await new Tether__factory(deployer).deploy(owner.address, totalSupply);
        stakingPool = await new StakingPool__factory(deployer).deploy(tether.address);
    });

    describe("stake() test", async function () {

        it("should stake amount for owner", async function () {
            const amountStakedExpected = BigInt(2_000_000);

            const poolBalanceBefore = await tether.balanceOf(stakingPool.address);
            const ownerBalanceBefore = await tether.balanceOf(owner.address);

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(owner).approve(owner.address, amountStakedExpected);

            expect(await tether.allowance(owner.address, stakingPool.address)).to.equal(amountStakedExpected);
            expect(await tether.allowance(owner.address, owner.address)).to.equal(amountStakedExpected);

            expect(poolBalanceBefore).to.equal(0);
            expect(ownerBalanceBefore).to.equal(totalSupply);

            await stakingPool.connect(owner).stake(owner.address, amountStakedExpected);

            const poolBalanceAfter = await tether.balanceOf(stakingPool.address);
            const ownerBalanceAfter = await tether.balanceOf(owner.address);
            const stakeData = await stakingPool.stakeholders(owner.address);

            expect(poolBalanceAfter).to.equal(amountStakedExpected);
            expect(ownerBalanceAfter).to.equal(totalSupply - amountStakedExpected);
            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(0);
        });

        it("should have acct1 stake amount on behalf of owner", async function () {
            const amountStakedExpected = BigInt(2_000_000);

            const poolBalanceBefore = await tether.balanceOf(stakingPool.address);
            const ownerBalanceBefore = await tether.balanceOf(owner.address);
            const acct1BalanceBefore = await tether.balanceOf(acct1.address);

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(owner).approve(acct1.address, amountStakedExpected);

            expect(await tether.allowance(owner.address, stakingPool.address)).to.be.equal(amountStakedExpected);
            expect(await tether.allowance(owner.address, acct1.address)).to.be.equal(amountStakedExpected);

            expect(poolBalanceBefore).to.equal(0);
            expect(ownerBalanceBefore).to.equal(totalSupply);
            expect(acct1BalanceBefore).to.equal(0);

            await stakingPool.connect(acct1).stake(owner.address, amountStakedExpected);

            const poolBalanceAfter = await tether.balanceOf(stakingPool.address);
            const ownerBalanceAfter = await tether.balanceOf(owner.address);
            const acct1BalanceAfter = await tether.balanceOf(acct1.address);
            const stakeData = await stakingPool.stakeholders(owner.address);

            expect(poolBalanceAfter).to.equal(amountStakedExpected);
            expect(ownerBalanceAfter).to.equal(totalSupply - amountStakedExpected);
            expect(acct1BalanceAfter).to.equal(0);
            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(0);
        });

        it("should not stake due to 'stake amount must be > 0'", async function () {
            await expect(stakingPool.stake(owner.address, 0)).to.be.revertedWith('stake amount must be > 0');
        });

        it("should not stake due to 'ERC20: transfer amount exceeds balance'", async function () {
            const amountStakedExpected = BigInt(1E25);

            const ownerBalanceBefore = await tether.balanceOf(owner.address);

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(owner).approve(owner.address, amountStakedExpected);

            expect(await tether.allowance(owner.address, owner.address));

            expect(ownerBalanceBefore).to.equal(totalSupply);

            await expect(stakingPool.connect(owner).stake(owner.address, amountStakedExpected))
                .to.be.revertedWith('ERC20: transfer amount exceeds balance');
        });

        it("should not stake due to 'ERC20: insufficient allowance'", async function () {
            const amountApprovedExpected = BigInt(1_999_999);
            const amountStakedExpected = BigInt(2_000_000);

            const ownerBalanceBefore = await tether.balanceOf(owner.address);

            await tether.connect(owner).approve(stakingPool.address, amountApprovedExpected);
            await tether.connect(owner).approve(owner.address, amountStakedExpected);

            expect(await tether.allowance(owner.address, owner.address));

            expect(ownerBalanceBefore).to.equal(totalSupply);

            await expect(stakingPool.connect(owner).stake(owner.address, amountStakedExpected))
                .to.be.revertedWith('ERC20: insufficient allowance');
        });

        it("should not stake due to 'staker allowance too low'", async function () {
            const amountStakedExpected = 2_000_000;
            const amountStakedLow = 1_000_000;

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(owner).approve(owner.address, amountStakedLow);

            await expect(stakingPool.connect(owner).stake(owner.address, amountStakedExpected))
                .to.be.revertedWith('staker allowance too low');
        });

    });

    describe("requestUnlock() test", async function () {

        const amountStakedExpected = 2_000_000;

        beforeEach(async function () {
            if (this.currentTest?.title === "should fail unlock request due to 'cannot unlock more than staked'") return;

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(owner).approve(owner.address, amountStakedExpected);
            await stakingPool.connect(owner).stake(owner.address, amountStakedExpected);

            await tether.connect(owner).transfer(acct1.address, 7_000_000);

            await tether.connect(acct1).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(acct1).approve(acct1.address, amountStakedExpected);
            await stakingPool.connect(acct1).stake(acct1.address, amountStakedExpected);
        });

        it("should create unlock request for exact, mid, and min amounts", async function () {
            await tether.connect(owner).approve(stakingPool.address, 999_999);
            await tether.connect(owner).approve(owner.address, 999_999);
            await stakingPool.connect(owner).stake(owner.address, 999_999);

            const exactAmountRequestedExpected = 2_000_000;
            const midAmountRequestedExpected = 999_999;
            const minAmountRequestedExpected = 1;

            await stakingPool.connect(owner).requestUnlock(exactAmountRequestedExpected);
            await stakingPool.connect(owner).requestUnlock(midAmountRequestedExpected);
            await stakingPool.connect(acct1).requestUnlock(minAmountRequestedExpected);

            const poolBalance = await tether.balanceOf(stakingPool.address);
            const ownerStakeData = await stakingPool.stakeholders(owner.address);
            const acct1StakeData = await stakingPool.stakeholders(acct1.address);

            expect(poolBalance).to.equal(amountStakedExpected * 2 + 999_999);
            expect(ownerStakeData.amountStaked).to.equal(amountStakedExpected + 999_999);
            expect(acct1StakeData.amountStaked).to.equal(amountStakedExpected);
        });

        it("should not create unlock request due to 'request amount must be > 0'", async function () {
            await expect(stakingPool.requestUnlock(0)).to.be.revertedWith('request amount must be > 0');
        });

        it("should not create unlock request due to 'must have staked funds'", async function () {
            const amountRequestedExpected = 2_000_000;

            await expect(stakingPool.connect(acct2).requestUnlock(amountRequestedExpected))
                .to.be.revertedWith('must have staked funds');
        });

        it("should not create unlock request due to 'requested amount too high'", async function () {
            const amountRequestedExpected = 2_000_001;

            await expect(stakingPool.connect(owner).requestUnlock(amountRequestedExpected))
                .to.be.revertedWith('requested amount too high');
        });

        it("should fail unlock request due to 'cannot unlock more than staked'", async function () {
            await tether.connect(owner).approve(stakingPool.address, 1000);
            await tether.connect(owner).approve(owner.address, 300);

            await stakingPool.connect(owner).stake(owner.address, 300);

            let stakeData = await stakingPool.stakeholders(owner.address);
            expect(stakeData.amountRequestedForUnlock).to.equal(0);
            expect(stakeData.amountStaked).to.equal(300);

            await stakingPool.connect(owner).requestUnlock(150);

            await time.increase(hours(49));

            stakeData = await stakingPool.stakeholders(owner.address);
            expect(stakeData.amountRequestedForUnlock).to.equal(150);
            expect(stakeData.amountStaked).to.equal(300);

            await expect(stakingPool.connect(owner).requestUnlock(250)).to.be.revertedWith('cannot unlock more than staked');

            stakeData = await stakingPool.stakeholders(owner.address);
            expect(stakeData.amountRequestedForUnlock).to.equal(150);
            expect(stakeData.amountStaked).to.equal(300);

            await stakingPool.connect(owner).requestUnlock(50);

            stakeData = await stakingPool.stakeholders(owner.address);
            expect(stakeData.amountRequestedForUnlock).to.equal(200);
            expect(stakeData.amountStaked).to.equal(300);

            await time.increase(hours(10));

            await stakingPool.connect(owner).unstake();

            stakeData = await stakingPool.stakeholders(owner.address);
            expect(stakeData.amountRequestedForUnlock).to.equal(50);
            expect(stakeData.amountStaked).to.equal(150);
        });

    });

    describe("unstake() test", async function () {

        const amountStakedExpected = 3_000_000;
        const amountUnstakedExpected = amountStakedExpected - 1_777_777 - 20;

        beforeEach(async function () {
            if (this.currentTest?.title === "should correctly compute funds available for unstaking every time") return;

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(owner).approve(owner.address, amountStakedExpected);
            await stakingPool.connect(owner).stake(owner.address, amountStakedExpected);
            await stakingPool.connect(owner).requestUnlock(1_777_777);
            await stakingPool.connect(owner).requestUnlock(20);

            await tether.connect(owner).transfer(acct1.address, 7_000_000);

            await tether.connect(acct1).approve(stakingPool.address, 2_000_000);
            await tether.connect(acct1).approve(acct1.address, 2_000_000);
            await stakingPool.connect(acct1).stake(acct1.address, 2_000_000);
        });

        it("should unstake all of owner's available funds", async function () {
            await time.increase(hours(48));

            const poolBalanceBefore = await tether.balanceOf(stakingPool.address);
            const stakeDataBefore = await stakingPool.stakeholders(owner.address);

            expect(poolBalanceBefore).to.equal(amountStakedExpected + 2_000_000);
            expect(stakeDataBefore.amountStaked).to.equal(amountStakedExpected);
            expect(stakeDataBefore.numUnlockRequests).to.equal(2);

            await stakingPool.connect(owner).unstake();

            const poolBalanceAfter = await tether.balanceOf(stakingPool.address);
            const stakeDataAfter = await stakingPool.stakeholders(owner.address);

            expect(poolBalanceAfter).to.equal(amountUnstakedExpected + 2_000_000);
            expect(stakeDataAfter.amountStaked).to.equal(amountUnstakedExpected);
            expect(stakeDataAfter.numUnlockRequests).to.equal(0);
        });

        it("should unstake available funds twice then revert once with 'no funds available for unstaking'", async function () {
            await time.increase(hours(48));

            await stakingPool.connect(owner).unstake();

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await stakingPool.connect(owner).stake(owner.address, 3_000);
            await stakingPool.connect(owner).requestUnlock(1_000);

            await time.increase(hours(48));

            await stakingPool.connect(owner).requestUnlock(1_700);
            await time.increase(hours(24));

            await stakingPool.connect(owner).requestUnlock(300);
            await time.increase(hours(10));

            await stakingPool.connect(owner).unstake();

            const poolBalanceAfter = await tether.balanceOf(stakingPool.address);
            const stakeDataAfter = await stakingPool.connect(owner).stakeholders(owner.address);

            expect(poolBalanceAfter).to.equal(amountUnstakedExpected + 2_000_000 + 2_000);
            expect(stakeDataAfter.amountStaked).to.equal(amountUnstakedExpected + 2_000);
            expect(stakeDataAfter.numUnlockRequests).to.equal(2);

            await stakingPool.connect(owner).stake(owner.address, 2);
            await stakingPool.connect(owner).requestUnlock(2);

            await time.increase(hours(2));

            await expect(stakingPool.connect(owner).unstake()).to.be.revertedWith('no funds available for unstaking');
        });

        it("should unstake all of owner's available funds twice", async function () {
            await time.increase(hours(48));

            await stakingPool.connect(owner).unstake();

            await stakingPool.connect(owner).requestUnlock(400);
            await time.increase(hours(50));

            const poolBalanceBefore = await tether.balanceOf(stakingPool.address);
            const stakeDataBefore = await stakingPool.stakeholders(owner.address);

            expect(poolBalanceBefore).to.equal(amountUnstakedExpected + 2_000_000);
            expect(stakeDataBefore.amountStaked).to.equal(1222203);
            expect(stakeDataBefore.numUnlockRequests).to.equal(1);

            await stakingPool.connect(owner).unstake();

            const poolBalanceAfter = await tether.balanceOf(stakingPool.address);
            const stakeDataAfter = await stakingPool.stakeholders(owner.address);

            expect(poolBalanceAfter).to.equal(amountUnstakedExpected + 2_000_000 - 400);
            expect(stakeDataAfter.amountStaked).to.equal(1_222_203 - 400);
            expect(stakeDataAfter.numUnlockRequests).to.equal(0);
        });

        it("should not unstake due to 'must have staked funds'", async function () {
            await expect(stakingPool.connect(acct2).unstake()).to.be.revertedWith('must have staked funds');
        });

        it("should not unstake due to 'must request unlock to unstake'", async function () {
            const amountStakedExpected = 70;

            await tether.connect(owner).transfer(acct2.address, amountStakedExpected);

            await tether.connect(acct2).approve(stakingPool.address, amountStakedExpected);
            await tether.connect(acct2).approve(acct2.address, amountStakedExpected);
            await stakingPool.connect(acct2).stake(acct2.address, amountStakedExpected);

            await expect(stakingPool.connect(acct2).unstake()).to.be.revertedWith('must request unlock to unstake');

            const poolBalance = await tether.balanceOf(stakingPool.address);
            const stakeData = await stakingPool.stakeholders(acct2.address);

            expect(poolBalance).to.equal(3_000_000 + 2_000_000 + amountStakedExpected);
            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(0);
        });

        it("should not unstake due to 'no funds available for unstaking'", async function () {
            await expect(stakingPool.connect(owner).unstake()).to.be.revertedWith('no funds available for unstaking');

            const poolBalance = await tether.balanceOf(stakingPool.address);
            const stakeData = await stakingPool.stakeholders(owner.address);

            expect(poolBalance).to.equal(amountStakedExpected + 2_000_000);
            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(2);
        });

        it("should correctly compute funds available for unstaking every time", async function () {
            await tether.connect(owner).approve(stakingPool.address, 500);
            await tether.connect(owner).approve(owner.address, 500);

            await verifyAmounts({
                amountStaked: 0, amountRequestedForUnlock: 0,
                stakingPoolBalance: 0, ownerBalance: totalSupply
            });

            await stakingPool.connect(owner).stake(owner.address, 500);

            await verifyAmounts({
                amountStaked: 500, amountRequestedForUnlock: 0,
                stakingPoolBalance: 500, ownerBalance: totalSupply - BigInt(500)
            });

            await stakingPool.connect(owner).requestUnlock(100);
            await time.increase(hours(48));
            await stakingPool.connect(owner).requestUnlock(200);

            await verifyAmounts({
                amountStaked: 500, amountRequestedForUnlock: 300,
                stakingPoolBalance: 500, ownerBalance: totalSupply - BigInt(500)
            });

            await stakingPool.connect(owner).unstake();

            await verifyAmounts({
                amountStaked: 400, amountRequestedForUnlock: 200,
                stakingPoolBalance: 400, ownerBalance: totalSupply - BigInt(400)
            });

            await stakingPool.connect(owner).requestUnlock(80);

            await verifyAmounts({
                amountStaked: 400, amountRequestedForUnlock: 280,
                stakingPoolBalance: 400, ownerBalance: totalSupply - BigInt(400)
            });

            await time.increase(hours(48));
            await stakingPool.connect(owner).unstake();

            await verifyAmounts({
                amountStaked: 120, amountRequestedForUnlock: 0,
                stakingPoolBalance: 120, ownerBalance: totalSupply - BigInt(120)
            });

            await stakingPool.connect(owner).requestUnlock(20);

            await verifyAmounts({
                amountStaked: 120, amountRequestedForUnlock: 20,
                stakingPoolBalance: 120, ownerBalance: totalSupply - BigInt(120)
            });

            await time.increase(hours(10));
            await stakingPool.connect(owner).requestUnlock(30);
            await time.increase(hours(39));

            await verifyAmounts({
                amountStaked: 120, amountRequestedForUnlock: 50,
                stakingPoolBalance: 120, ownerBalance: totalSupply - BigInt(120)
            });

            await stakingPool.connect(owner).unstake();

            await verifyAmounts({
                amountStaked: 100, amountRequestedForUnlock: 30,
                stakingPoolBalance: 100, ownerBalance: totalSupply - BigInt(100)
            });

            await time.increase(hours(10));
            await stakingPool.connect(owner).unstake();

            await verifyAmounts({
                amountStaked: 70, amountRequestedForUnlock: 0,
                stakingPoolBalance: 70, ownerBalance: totalSupply - BigInt(70)
            });

            await stakingPool.connect(owner).requestUnlock(10);
            await time.increase(hours(100));
            await stakingPool.connect(owner).unstake();

            await verifyAmounts({
                amountStaked: 60, amountRequestedForUnlock: 0,
                stakingPoolBalance: 60, ownerBalance: totalSupply - BigInt(60)
            });

            await stakingPool.connect(owner).requestUnlock(10);
            await stakingPool.connect(owner).requestUnlock(10);
            await stakingPool.connect(owner).requestUnlock(10);
            await stakingPool.connect(owner).requestUnlock(10);
            await stakingPool.connect(owner).requestUnlock(10);
            await stakingPool.connect(owner).requestUnlock(10);

            await verifyAmounts({
                amountStaked: 60, amountRequestedForUnlock: 60,
                stakingPoolBalance: 60, ownerBalance: totalSupply - BigInt(60)
            });

            await expect(stakingPool.connect(owner).unstake())
                .to.be.revertedWith('no funds available for unstaking');

            await verifyAmounts({
                amountStaked: 60, amountRequestedForUnlock: 60,
                stakingPoolBalance: 60, ownerBalance: totalSupply - BigInt(60)
            });

            await time.increase(hours(100));
            await stakingPool.connect(owner).unstake();

            await verifyAmounts({
                amountStaked: 0, amountRequestedForUnlock: 0,
                stakingPoolBalance: 0, ownerBalance: totalSupply
            });
        });

        async function verifyAmounts(args: {
            amountStaked: any,
            amountRequestedForUnlock: any,
            stakingPoolBalance: any,
            ownerBalance: any,
            acct1Balance?: any,
            acct2Balance?: any
        }) {
            args.acct1Balance = args.acct1Balance ?? 0;
            args.acct2Balance = args.acct2Balance ?? 0;

            const ownerStakeData = await stakingPool.stakeholders(owner.address);

            expect(ownerStakeData.amountStaked).to.be.equal(args.amountStaked);
            expect(ownerStakeData.amountRequestedForUnlock).to.be.equal(args.amountRequestedForUnlock);
            expect(await tether.balanceOf(stakingPool.address)).to.be.equal(args.stakingPoolBalance);
            expect(await tether.balanceOf(owner.address)).to.be.equal(args.ownerBalance);
            expect(await tether.balanceOf(acct1.address)).to.be.equal(args.acct1Balance);
            expect(await tether.balanceOf(acct2.address)).to.be.equal(args.acct2Balance);
        };

    });

    describe("load test", async function () {
        this.timeout(500_000);

        /**
         * Avg runtime with previous linear solution (w/ indexed mapping):
         *      For 100: 1,290 ms (956,975 gwei)
         *      For 1,000: 12,841 ms (8,937,944 gwei)
         *      For 10,000: > 50,000 ms ('Error: Timeout of 50000ms exceeded.')
         *
         * Avg runtime with previous linear solution (w/ array):
         *      For 100: 1,349 ms (975,061 gwei)
         *      For 1,000: 14,971 ms (9,118,751 gwei)
         *      For 10,000: > 50,000 ms ('Error: Timeout of 50000ms exceeded.')
         *
         * Avg runtime with current logarithmic solution (w/ array):
         *      For 100: 1,220 ms (898,532 gwei)
         *      For 1,000: 10,805 ms (8,318,476 gwei)
         *      For 10,000: 'Transaction ran out of gas'
         *
         * Avg runtime with current logarithmic solution (w/ indexed mapping):         <- Best
         *      For 100: 90.7 ms (103,417 gwei)
         *      For 1,000: 95.2 ms (103,417 gwei)
         *      For 10,000: 109 ms (103,417 gwei)
         */
        it("should create many unlock requests and unstake", async function () {
            const stakedAmount = 100;

            await tether.connect(owner).approve(stakingPool.address, stakedAmount);
            await tether.connect(owner).approve(owner.address, stakedAmount);

            await stakingPool.connect(owner).stake(owner.address, stakedAmount);

            for (let i = 0; i < stakedAmount; i++) {
                await stakingPool.connect(owner).requestUnlock(1);
            }

            let stakeData = await stakingPool.stakeholders(owner.address);

            expect(stakeData.amountRequestedForUnlock).to.be.equal(stakedAmount);
            expect(stakeData.amountStaked).to.be.equal(stakedAmount);

            expect(await tether.balanceOf(owner.address)).to.be.equal(totalSupply - BigInt(stakedAmount));
            await time.increase(hours(48));

            var unstakeStartTime = performance.now();
            await stakingPool.connect(owner).unstake();
            var unstakeEndTime = performance.now();

            console.log(`\t-> Runtime for ${stakedAmount} request unstake(): ${unstakeEndTime - unstakeStartTime}`);

            stakeData = await stakingPool.stakeholders(owner.address);

            expect(stakeData.amountRequestedForUnlock).to.be.equal(0);
            expect(stakeData.amountStaked).to.be.equal(0);
            expect(await tether.balanceOf(owner.address)).to.be.equal(totalSupply);
        });

    });

});

function hours(t: number) {
    return time.duration.hours(t);
}
