// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeFiConfig
 * @dev Configuration contract for DeFi operations - Sepolia
 */
library DeFiConfig
{
   //======================================================
   // Sepolia addresses
   //======================================================

   // TODO: Replace with the actual Sepolia master contract
   address private constant MASTER_ADDRESS =
      0x0000000000000000000000000000000000000000;

   // Ethereum Sepolia WETH
    address private constant WETH_ADDRESS =
        address(uint160(0x00fff9976782d46cc05630d1f6ebab18b2324d6b14));

   //======================================================
   // Configuration
   //======================================================

   uint256 private constant MAX_FLASH_LOAN_AMOUNT =
      1000 ether;

   function getMasterAddress()
      internal
      pure
      returns(address)
   {
      return MASTER_ADDRESS;
   }

   function getMaxFlashLoanAmount()
      internal
      pure
      returns(uint256)
   {
      return MAX_FLASH_LOAN_AMOUNT;
   }

   function isValidFlashLoanAmount(uint256 amount)
      internal
      pure
      returns(bool)
   {
      return amount > 0 &&
             amount <= MAX_FLASH_LOAN_AMOUNT;
   }

   function getWethAddress()
      internal
      pure
      returns(address)
   {
      return WETH_ADDRESS;
   }
}