import { ethers } from "hardhat";
import { Tether__factory } from "../typechain";
import { StakingPool__factory } from "../typechain/factories/StakingPool__factory";

async function main() {
    const [deployer, owner] = await ethers.getSigners();
    const tether = await new Tether__factory(deployer).deploy(
        process.env.MASK_ADDRESS_A1 || "", BigInt(1_000_000 * (10 ** 18))
    );
    const stakingPool = await new StakingPool__factory(deployer).deploy(tether.address);

    console.log('Tether address:', tether.address);
    console.log('StakingPool address:', stakingPool.address);
    console.log('Deployer address:', deployer.address);
    console.log('Owner address:', process.env.MASK_ADDRESS_A1 || 'n/a');
    console.log('Owner USDT balance:', await tether.balanceOf(process.env.MASK_ADDRESS_A1 || 'n/a'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
