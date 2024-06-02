const { smock } = require('@defi-wonderland/smock')
const chai = require('chai')
const { ethers } = require('hardhat')

const { expect } = chai
chai.use(smock.matchers)

describe('CCIPBase contract', function () {
  let CCIPBase
  let ccipBase
  let owner
  let addr1
  let addr2
  let token

  let sourceChainSelector
  let tokenAddress
  let senderAddress

  beforeEach(async function () {
    await ethers.provider.send('hardhat_reset')
    CCIPBase = await ethers.getContractFactory('CCIPBaseContract')
    ;[owner, addr1, addr2] = await ethers.getSigners()
    // Assuming the appropriate contract addresses are provided
    token = await smock.fake(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20'
    )

    instantiateMessage = [addr1.address, owner.address]

    ccipBase = await upgrades.deployProxy(CCIPBase, instantiateMessage, {
      kind: 'uups',
    })

    sourceChainSelector = '111'
    tokenAddress = addr2.address
    senderAddress = addr2.address
  })

  describe('Queries', function () {
    it('Should return false for whitelistedSenders', async function () {
      const isWhitelisted = await ccipBase.whitelistedSenders(
        sourceChainSelector,
        senderAddress
      )

      expect(isWhitelisted).to.equal(false)
    })

    it('Should return false for whitelistedTokens', async function () {
      const isWhitelisted = await ccipBase.whitelistedTokens(tokenAddress)

      expect(isWhitelisted).to.equal(false)
    })
  })

  describe('Management', function () {
    it('Should whitelist sender as owner', async function () {
      await ccipBase
        .connect(owner)
        .updateWhitelistSender(sourceChainSelector, senderAddress, true)
      const isWhitelisted = await ccipBase.whitelistedSenders(
        sourceChainSelector,
        senderAddress
      )

      expect(isWhitelisted).to.eq(true)
    })

    it('Should revert when not owner and trying to whitelist sender', async function () {
      await expect(
        ccipBase
          .connect(addr1)
          .updateWhitelistSender(sourceChainSelector, senderAddress, true)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should revert when not owner and trying to update updateWhitelistSenderMany', async function () {
      await expect(
        ccipBase
          .connect(addr1)
          .updateWhitelistSenderMany(
            [sourceChainSelector],
            [addr1.address],
            [true]
          )
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should revert if arrays are not the same length', async function () {
      const chainSelector1 = 1
      const chainSelector2 = 2

      await expect(
        ccipBase
          .connect(owner)
          .updateWhitelistSenderMany(
            [chainSelector1],
            [addr1.address, addr2.address],
            [true, true]
          )
      ).to.be.revertedWithCustomError(ccipBase, 'IncorrectArrayLength')
      await expect(
        ccipBase
          .connect(owner)
          .updateWhitelistSenderMany(
            [chainSelector1, chainSelector2],
            [addr2.address],
            [true, true]
          )
      ).to.be.revertedWithCustomError(ccipBase, 'IncorrectArrayLength')
      await expect(
        ccipBase
          .connect(owner)
          .updateWhitelistSenderMany(
            [chainSelector1, chainSelector2],
            [addr1.address, addr2.address],
            [true]
          )
      ).to.be.revertedWithCustomError(ccipBase, 'IncorrectArrayLength')
    })

    it('should update the chain selector to xSwapRouter map', async function () {
      const chainSelector1 = 1
      const chainSelector2 = 2
      await ccipBase
        .connect(owner)
        .updateWhitelistSenderMany(
          [chainSelector1, chainSelector2],
          [addr1.address, addr2.address],
          [true, true]
        )
      const isWhitelisted1 = await ccipBase.whitelistedSenders(
        chainSelector1,
        addr1.address
      )
      const isWhitelisted2 = await ccipBase.whitelistedSenders(
        chainSelector2,
        addr2.address
      )

      expect(isWhitelisted1).to.eq(true)
      expect(isWhitelisted2).to.eq(true)
    })

    it('Should whitelist token as owner', async function () {
      await ccipBase.connect(owner).updateWhitelistToken(tokenAddress, true)
      const isWhitelisted = await ccipBase.whitelistedTokens(tokenAddress)

      expect(isWhitelisted).to.eq(true)
    })

    it('Should revert when not owner and trying to whitelist token', async function () {
      await expect(
        ccipBase.connect(addr1).updateWhitelistToken(tokenAddress, true)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('Emergency Withdraw', function () {
    it('Should allow owner to withdraw Ether', async function () {
      const initialDeposit = ethers.utils.parseEther('1')

      await owner.sendTransaction({
        to: ccipBase.address,
        value: initialDeposit,
      })
      const initialOwnerBalance = await ethers.provider.getBalance(
        owner.address
      )
      const initialContractBalance = await ethers.provider.getBalance(
        ccipBase.address
      )

      const tx = await ccipBase.emergencyWithdraw(
        ethers.constants.AddressZero,
        initialContractBalance
      )

      await expect(tx)
        .to.emit(ccipBase, 'EmergencyWithdraw')
        .withArgs(ethers.constants.AddressZero, initialDeposit)

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address)
      const finalContractBalance = await ethers.provider.getBalance(
        ccipBase.address
      )

      expect(finalOwnerBalance).to.be.gt(initialOwnerBalance) // Owner's balance should increase
      expect(finalContractBalance).to.equal(ethers.BigNumber.from(0)) // Contract's balance should be 0
    })

    it('Should allow owner to withdraw ERC20 tokens', async function () {
      const tokenBalance = 1000
      token.balanceOf.returns(tokenBalance)

      const tx = await ccipBase.emergencyWithdraw(token.address, tokenBalance)

      await expect(tx)
        .to.emit(ccipBase, 'EmergencyWithdraw')
        .withArgs(token.address, tokenBalance)

      expect(token.transfer).to.have.been.calledOnceWith(
        owner.address,
        tokenBalance
      )
    })

    it('Should revert when non-owner tries to do emergency withdraw', async function () {
      await expect(
        ccipBase
          .connect(addr1)
          .emergencyWithdraw(ethers.constants.AddressZero, 0)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  // Additional tests for _ccipReceive and other contract functions can be added here
})
