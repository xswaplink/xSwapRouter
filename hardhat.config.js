require('@openzeppelin/hardhat-upgrades')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-ethers')
require('@nomicfoundation/hardhat-chai-matchers')
require('solidity-coverage')
require('hardhat-contract-sizer')

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            runs: 200,
            enabled: true,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {},
  },
}
