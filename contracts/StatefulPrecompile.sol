// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Sample smart contract interact with stateful-precompiled
 */

interface IStatefulSimpleStorage {
  function store(uint) external;
  function retrieve() external view returns (uint);
}

contract SimpleStatefulPrecompiledContract {
  
    IStatefulSimpleStorage public precompiled;

    event StorageSet(uint value);

    constructor (IStatefulSimpleStorage _precompiled) {
      precompiled = _precompiled;
    }

    function store(uint value) public {
      precompiled.store(value);
      emit StorageSet(value);
    }

    function retrieve() public view returns (uint) {
      return precompiled.retrieve();
    }
}