// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MassiveGrantATM {
    event Ping(address indexed caller, uint256 indexed id, uint256 totalForCaller);
    event Received(address indexed from, uint256 amount);

    mapping(address => uint256) public pingCount;
    uint256 public totalPings;

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function ping(uint256 id) external returns (uint256 totalForCaller) {
        totalForCaller = ++pingCount[msg.sender];
        totalPings += 1;
        emit Ping(msg.sender, id, totalForCaller);
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}
