import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Tether, Tether__factory } from "../typechain";

describe("Tether Test", async function () {

    const totalSupply = BigInt(1_000_000 * (10 ** 18));

    let deployer: SignerWithAddress;
    let owner: SignerWithAddress, acct1: SignerWithAddress, acct2: SignerWithAddress;
    let tether: Tether;

    beforeEach(async function () {
        [deployer, owner, acct1, acct2] = await ethers.getSigners();
        tether = await new Tether__factory(deployer).deploy(owner.address, totalSupply);
    });

    describe("constructor() test", async function () {

        it("should mint 1e21 $USDT to owner", async function () {
            const ownerBalanceActual = await tether.balanceOf(owner.address);

            expect(ownerBalanceActual).to.equal(totalSupply);
        });

    });

    describe("transfer() test", async function () {

        it("should transfer from owner to acct1", async function () {
            const transferAmountExpected = BigInt(1_000_000);

            const ownerBalanceBefore = await tether.balanceOf(owner.address);
            const acct1BalanceBefore = await tether.balanceOf(acct1.address);

            expect(ownerBalanceBefore).to.equal(totalSupply);
            expect(acct1BalanceBefore).to.equal(0);

            await tether.connect(owner).transfer(acct1.address, transferAmountExpected);

            const ownerBalanceAfter = await tether.balanceOf(owner.address);
            const acct1BalanceAfter = await tether.balanceOf(acct1.address);

            expect(ownerBalanceAfter).to.equal(totalSupply - transferAmountExpected);
            expect(acct1BalanceAfter).to.equal(transferAmountExpected);
        });

    });

    describe("transferFrom() test", async function () {

        it("should transfer from owner to acct2 via acct1", async function () {
            const transferAmountExpected = BigInt(1_000_000);

            const ownerBalanceBefore = await tether.balanceOf(owner.address);
            const acct1BalanceBefore = await tether.balanceOf(acct1.address);
            const acct2BalanceBefore = await tether.balanceOf(acct2.address);

            expect(ownerBalanceBefore).to.equal(totalSupply);
            expect(acct1BalanceBefore).to.equal(0);
            expect(acct2BalanceBefore).to.equal(0);

            await tether.connect(owner).approve(acct1.address, transferAmountExpected);
            await tether.connect(acct1).transferFrom(owner.address, acct2.address, transferAmountExpected);

            const ownerBalanceAfter = await tether.balanceOf(owner.address);
            const acct1BalanceAfter = await tether.balanceOf(acct1.address);
            const acct2BalanceAfter = await tether.balanceOf(acct2.address);

            expect(ownerBalanceAfter).to.equal(totalSupply - transferAmountExpected);
            expect(acct1BalanceAfter).to.equal(0);
            expect(acct2BalanceAfter).to.equal(transferAmountExpected);
        });

    });

});
