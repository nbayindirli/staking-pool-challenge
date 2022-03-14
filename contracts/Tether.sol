// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Tether is ERC20 {

    constructor(address _owner, uint256 _totalSupply) ERC20("Tether", "USDT") {
        _mint(_owner, _totalSupply);
    }
}
