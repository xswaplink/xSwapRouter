// SPDX-License-Identifier: UNLICENSED
// © Copyright XSwap.link. All Rights Reserved
pragma solidity 0.8.17;

import {CCIPBaseUpgradeable} from "../CCIPBaseUpgradeable.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CCIPBaseContract is
    Initializable,
    UUPSUpgradeable,
    CCIPBaseUpgradeable
{
    function initialize(address _router, address _owner) public initializer {
        __CCIPBase_init(_router);
        _transferOwnership(_owner);
    }

    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal virtual override {}

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
