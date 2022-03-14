import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
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

            const ownerBalanceBefore = await tether.balanceOf(owner.address);

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);

            expect(await tether.allowance(owner.address, owner.address));

            expect(ownerBalanceBefore).to.equal(totalSupply);

            await stakingPool.stake(owner.address, amountStakedExpected);

            const ownerBalanceAfter = await tether.balanceOf(owner.address);
            const stakeData = await stakingPool.stakeholders(owner.address);

            expect(ownerBalanceAfter).to.equal(totalSupply - amountStakedExpected);
            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(0);
        });

        it("should have acct1 stake amount on behalf of owner", async function () {
            const amountStakedExpected = BigInt(2_000_000);

            const ownerBalanceBefore = await tether.balanceOf(owner.address);
            const acct1BalanceBefore = await tether.balanceOf(acct1.address);

            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);

            expect(await tether.allowance(owner.address, owner.address));

            expect(ownerBalanceBefore).to.equal(totalSupply);
            expect(acct1BalanceBefore).to.equal(0);

            await stakingPool.connect(acct1).stake(owner.address, amountStakedExpected);

            const ownerBalanceAfter = await tether.balanceOf(owner.address);
            const acct1BalanceAfter = await tether.balanceOf(acct1.address);
            const stakeData = await stakingPool.stakeholders(owner.address);

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

            expect(await tether.allowance(owner.address, owner.address));

            expect(ownerBalanceBefore).to.equal(totalSupply);

            await expect(stakingPool.stake(owner.address, amountStakedExpected))
                .to.be.revertedWith('ERC20: transfer amount exceeds balance');
        });

        it("should not stake due to 'ERC20: insufficient allowance'", async function () {
            const amountApprovedExpected = BigInt(1_999_999);
            const amountStakedExpected = BigInt(2_000_000);

            const ownerBalanceBefore = await tether.balanceOf(owner.address);

            await tether.connect(owner).approve(stakingPool.address, amountApprovedExpected);

            expect(await tether.allowance(owner.address, owner.address));

            expect(ownerBalanceBefore).to.equal(totalSupply);

            await expect(stakingPool.stake(owner.address, amountStakedExpected))
                .to.be.revertedWith('ERC20: insufficient allowance');
        });

    });

    describe("requestUnlock() test", async function () {

        const amountStakedExpected = 2_000_000;

        beforeEach(async function () {
            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await stakingPool.connect(owner).stake(owner.address, amountStakedExpected);

            await tether.connect(owner).transfer(acct1.address, 7_000_000);

            await tether.connect(acct1).approve(stakingPool.address, 2_000_000);
            await stakingPool.connect(acct1).stake(acct1.address, 2_000_000);
        });

        it("should create unlock request for exact, mid, and min amounts", async function () {
            const exactAmountRequestedExpected = 2_000_000;
            const midAmountRequestedExpected = 999_999;
            const minAmountRequestedExpected = 1;

            await stakingPool.connect(owner).requestUnlock(exactAmountRequestedExpected);
            await stakingPool.connect(owner).requestUnlock(midAmountRequestedExpected);
            await stakingPool.connect(acct1).requestUnlock(minAmountRequestedExpected);

            const ownerStakeData = await stakingPool.stakeholders(owner.address);
            const acct1StakeData = await stakingPool.stakeholders(acct1.address);

            expect(ownerStakeData.amountStaked).to.equal(amountStakedExpected);
            expect(ownerStakeData.numUnlockRequests).to.equal(2);
            expect(acct1StakeData.amountStaked).to.equal(amountStakedExpected);
            expect(acct1StakeData.numUnlockRequests).to.equal(1);
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

    });

    describe("unstake() test", async function () {

        const amountStakedExpected = 3_000_000;

        beforeEach(async function () {
            await tether.connect(owner).approve(stakingPool.address, amountStakedExpected);
            await stakingPool.connect(owner).stake(owner.address, amountStakedExpected);
            await stakingPool.connect(owner).requestUnlock(1_777_777);
            await stakingPool.connect(owner).requestUnlock(20);

            await tether.connect(owner).transfer(acct1.address, 7_000_000);

            await tether.connect(acct1).approve(stakingPool.address, 2_000_000);
            await stakingPool.connect(acct1).stake(acct1.address, 2_000_000);
        });

        it("should unstake all of owner's available funds", async function () {
            const duration = time.duration.hours(48);
            await time.increase(duration);

            const stakeDataBefore = await stakingPool.stakeholders(owner.address);

            expect(stakeDataBefore.amountStaked).to.equal(amountStakedExpected);
            expect(stakeDataBefore.numUnlockRequests).to.equal(2);

            await stakingPool.connect(owner).unstake();

            const stakeDataAfter = await stakingPool.stakeholders(owner.address);

            expect(stakeDataAfter.amountStaked).to.equal(amountStakedExpected - 1_777_777 - 20);
            expect(stakeDataAfter.numUnlockRequests).to.equal(0);
        });

        it("should unstake all of owner's available funds twice", async function () {
            let duration = time.duration.hours(48);
            await time.increase(duration);

            await stakingPool.connect(owner).unstake();

            await stakingPool.connect(owner).requestUnlock(400);

            duration = time.duration.hours(50);
            await time.increase(duration);

            const stakeDataBefore = await stakingPool.stakeholders(owner.address);

            expect(stakeDataBefore.amountStaked).to.equal(1222203);
            expect(stakeDataBefore.numUnlockRequests).to.equal(1);

            await stakingPool.connect(owner).unstake();

            const stakeDataAfter = await stakingPool.stakeholders(owner.address);

            expect(stakeDataAfter.amountStaked).to.equal(1222203 - 400);
            expect(stakeDataAfter.numUnlockRequests).to.equal(0);
        });

        it("should not unstake due to 'must have staked funds'", async function () {
            await expect(stakingPool.connect(acct2).unstake()).to.be.revertedWith('must have staked funds');
        });

        it("should not unstake due to 'must request unlock to unstake'", async function () {
            const amountStakedExpected = 70;

            await tether.connect(owner).transfer(acct2.address, amountStakedExpected);

            await tether.connect(acct2).approve(stakingPool.address, amountStakedExpected);
            await stakingPool.connect(acct2).stake(acct2.address, amountStakedExpected);

            await expect(stakingPool.connect(acct2).unstake()).to.be.revertedWith('must request unlock to unstake');

            const stakeData = await stakingPool.stakeholders(acct2.address);

            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(0);
        });

        it("should not unstake due to 'no funds available for unstaking'", async function () {
            await expect(stakingPool.connect(owner).unstake()).to.be.revertedWith('no funds available for unstaking');

            const stakeData = await stakingPool.stakeholders(owner.address);

            expect(stakeData.amountStaked).to.equal(amountStakedExpected);
            expect(stakeData.numUnlockRequests).to.equal(2);
        });

    });

});
