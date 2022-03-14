# staking-pool-challenge

Estimated `StakingPool` gas usage: 995360 (3.3% of block limit)

Estimated `Tether (USDT)` gas usage: 1223662 (4.1% of block limit)

---

### Deployed to Ropsten
* Tether: https://ropsten.etherscan.io/token/0x972ddffa988584f5c83cebae4a428bad2fcc09ae
* StakingPool: https://ropsten.etherscan.io/address/0xc2ee73da693ca5ca3ef057a971689ce95d99fb26

---

### To Run Locally

To clean: `npx hardhat clean`

To compile: `npx hardhat compile`

To test: `npx hardhat test`

To run against hh: `npx hardhat run scripts/run.ts`

To run against local node:
* In one terminal instance: `npx hardhat node`
* In another: `npx hardhat run scripts/run.ts --network localhost`

To deploy to Ropsten, or any other testnet:
* Replace or satisfy env vars in `hardhat.consig.ts` & `scripts/deploy.ts`
* `npx hardhat run scripts/deploy.ts --network ropsten`

---

### Author: Noah Bayindirli (@nbayindirli)
