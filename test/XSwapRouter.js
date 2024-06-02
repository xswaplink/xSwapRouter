const { smock } = require('@defi-wonderland/smock')
const chai = require('chai')
const { BigNumber } = require('ethers')
const { ethers } = require('hardhat')

const { expect } = chai
chai.use(smock.matchers)

const getExampleCallsData = () => [
  Object.values({
    callType: '1', // CallType
    target: '0xA8627B835c64d087eEEe4EAB11F02DC88dEBD0e4', // address
    value: '0', // uint256
    callData: '0x', // bytes
    payload: '0x', // bytes
  }),
]

describe('xSwapRouter contract', function () {
  let XSwapRouter
  let xSwapRouter
  let user
  let CCIPRouterAcc, addr2
  let owner
  let destinationChainSelector
  let sourceChainSelector
  let destinationXSwapRouterAddress
  let ETHAddress

  // contracts
  let ccipRouter,
    paymentToken,
    tokenIn,
    tokenOut,
    tokenFinal,
    xSwapExecutor,
    feeOracle,
    feeCollector

  beforeEach(async function () {
    await ethers.provider.send('hardhat_reset')
    ;[user, CCIPRouterAcc, owner, addr2] = await ethers.getSigners()

    ccipRouter = await smock.fake('IRouterClient', {
      address: CCIPRouterAcc.address,
    })
    paymentToken = await smock.fake(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20'
    )
    tokenIn = await smock.fake(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20'
    )
    tokenOut = await smock.fake(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20'
    )
    tokenFinal = await smock.fake(
      '@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20'
    )
    feeOracle = await smock.fake('IFeeOracle')
    feeCollector = await smock.fake('IFeeCollector')
    xSwapExecutor = await smock.fake('IXSwapExecutor')

    XSwapRouter = await ethers.getContractFactory('XSwapRouter')
    ETHAddress = '0x0000000000000000000000000000000000000000'

    ccipRouter.address = CCIPRouterAcc.address

    // Assuming the appropriate contract addresses are provided

    const instantiateMessage = [
      ccipRouter.address,
      feeOracle.address,
      feeCollector.address,
      xSwapExecutor.address,
      owner.address,
    ]

    xSwapRouter = await upgrades.deployProxy(XSwapRouter, instantiateMessage, {
      kind: 'uups',
    })

    // configuration
    destinationChainSelector = '14767482510784806043'
    sourceChainSelector = '16767482510784806043'
    destinationXSwapRouterAddress = '0xD21341536c5cF5EB1bcb58f6723cE26e8D8E90e4'

    await xSwapRouter
      .connect(owner)
      .updateWhitelistSender(sourceChainSelector, xSwapRouter.address, true)

    await xSwapRouter
      .connect(owner)
      .updateWhitelistSender(
        destinationChainSelector,
        destinationXSwapRouterAddress,
        true
      )

    await xSwapRouter
      .connect(owner)
      .updateWhitelistToken(tokenOut.address, true)

    await xSwapRouter
      .connect(owner)
      .updateChainSelectorToXSwapRouterMap(
        destinationChainSelector,
        destinationXSwapRouterAddress
      )

    await xSwapRouter
      .connect(owner)
      .updateChainSelectorToXSwapRouterMap(
        sourceChainSelector,
        destinationXSwapRouterAddress
      )
  })

  describe('setXSwapExecutor', function () {
    it('Should set xswap executor address', async function () {
      const newExecutorAddress = addr2.address

      await xSwapRouter.connect(owner).setXSwapExecutor(newExecutorAddress)
      const xSwapExecutorAddress = await xSwapRouter.xSwapExecutor()

      expect(xSwapExecutorAddress).to.equal(newExecutorAddress)
    })

    it('Should revert when not owner and trying to set xswap executor address', async function () {
      await expect(
        xSwapRouter.connect(addr2).setXSwapExecutor(addr2.address)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })
  describe('updateChainSelectorToXSwapRouterMap', function () {
    it('Should update chainSelectorToXSwapRouterMap as owner', async function () {
      const chainSelector = 1
      const newXSwapRouter = addr2.address

      await xSwapRouter
        .connect(owner)
        .updateChainSelectorToXSwapRouterMap(chainSelector, newXSwapRouter)
      const updatedXSwapRouter =
        await xSwapRouter.chainSelectorToXSwapRouterMap(chainSelector)

      expect(updatedXSwapRouter).to.equal(newXSwapRouter)
    })

    it('Should revert when not owner and trying to update chainSelectorToXSwapRouterMap', async function () {
      const chainSelector = 1
      const newXSwapRouter = addr2.address

      await expect(
        xSwapRouter
          .connect(addr2)
          .updateChainSelectorToXSwapRouterMap(chainSelector, newXSwapRouter)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('updateChainSelectorToXSwapRouterMapMany', function () {
    it('Should revert when not owner and trying to update updateChainSelectorToXSwapRouterMapMany', async function () {
      const chainSelector = 1

      await expect(
        xSwapRouter
          .connect(addr2)
          .updateChainSelectorToXSwapRouterMapMany(
            [chainSelector],
            [addr2.address]
          )
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('should revert if arrays are not the same length', async function () {
      const chainSelector = 1
      await expect(
        xSwapRouter
          .connect(owner)
          .updateChainSelectorToXSwapRouterMapMany(
            [chainSelector, chainSelector],
            [addr2.address]
          )
      ).to.be.revertedWithCustomError(xSwapRouter, 'IncorrectArrayLength')
    })

    it('should update the chain selector to xSwapRouter map', async function () {
      const chainSelector1 = 1
      const chainSelector2 = 2

      await xSwapRouter
        .connect(owner)
        .updateChainSelectorToXSwapRouterMapMany(
          [chainSelector1, chainSelector2],
          [addr2.address, user.address]
        )

      expect(
        await xSwapRouter.chainSelectorToXSwapRouterMap(chainSelector1)
      ).to.equal(addr2.address)
      expect(
        await xSwapRouter.chainSelectorToXSwapRouterMap(chainSelector2)
      ).to.equal(user.address)
    })
  })
  describe('getFees', function () {
    let swapDestinationData, payload, oracleFeeAmount, ccipFeeAmount

    const _buildCCIPMessage = (
      receiver,
      _swapDestinationData,
      _token,
      _amount,
      _feeTokenAddress,
      _gasLimit
    ) => {
      const abi = ethers.utils.defaultAbiCoder
      const tokenAmounts = [{ token: _token, amount: BigNumber.from(_amount) }]

      // try to encode extraArgs
      return {
        receiver: abi.encode(['address'], [receiver]),
        data: abi.encode(
          [
            ethers.utils.ParamType.from({
              type: 'tuple',
              name: 'SwapDataDestination',
              components: [
                { name: 'receiver', type: 'address' },
                { name: 'tokenOut', type: 'address' },
                { name: 'estimatedAmountOut', type: 'uint256' },
                { name: 'calls', type: 'bytes' },
              ],
            }),
          ],
          [_swapDestinationData]
        ),
        tokenAmounts: tokenAmounts,
        extraArgs:
          '0x97a657c900000000000000000000000000000000000000000000000000000000000c3500',
        feeToken: _feeTokenAddress,
      }
    }

    beforeEach(function () {
      swapDestinationData = {
        receiver: user.address,
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: [],
      }

      payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        tokenOut.address,
        '1000',
        800000, // uint256 _gasLimit
      ]

      oracleFeeAmount = 100000
      ccipFeeAmount = 9999999
      feeOracle.getFee.returns({
        tokenFee: '0',
        nativeFee: oracleFeeAmount,
      })
      ccipRouter.getFee.returns(ccipFeeAmount)
    })
    it('Should estimate fees in erc20 token', async function () {
      const res = await xSwapRouter.getFees(...payload, user.address, '0x')
      expect(res.xSwapFee.nativeFee).to.eq(oracleFeeAmount)
      expect(res.ccipFee).to.eq(ccipFeeAmount)
      const msg = _buildCCIPMessage(
        destinationXSwapRouterAddress,
        swapDestinationData,
        tokenOut.address,
        payload[4],
        paymentToken.address,
        payload[5]
      )

      expect(ccipRouter.getFee.getCall(0).args.destinationChainSelector).to.eq(
        destinationChainSelector
      )

      const resultMessage = ccipRouter.getFee.getCall(0).args.message

      expect(resultMessage.receiver).to.eq(msg.receiver)
      expect(resultMessage.data).to.eq(msg.data)

      expect(resultMessage.extraArgs).to.eq(msg.extraArgs)
      expect(resultMessage.feeToken).to.eq(msg.feeToken)
    })
    it('Should estimate fees in native', async function () {
      payload[0] = ETHAddress
      const res = await xSwapRouter.getFees(...payload, user.address, '0x')
      expect(res.xSwapFee.nativeFee).to.eq(oracleFeeAmount)
      expect(res.ccipFee).to.eq(ccipFeeAmount)

      const msg = _buildCCIPMessage(
        destinationXSwapRouterAddress,
        swapDestinationData,
        paymentToken.address,
        payload[4],
        ETHAddress,
        payload[5]
      )

      expect(ccipRouter.getFee.getCall(0).args.destinationChainSelector).to.eq(
        destinationChainSelector
      )

      const resultMessage = ccipRouter.getFee.getCall(0).args.message

      expect(resultMessage.receiver).to.eq(msg.receiver)
      expect(resultMessage.data).to.eq(msg.data)
      expect(resultMessage.extraArgs).to.eq(msg.extraArgs)
      expect(resultMessage.feeToken).to.eq(msg.feeToken)
    })
  })

  describe('swapAndSendMessage', function () {
    let swapDestinationData,
      swapOriginData,
      payload,
      oracleFeeAmount,
      ccipFeeAmount

    beforeEach(function () {
      const amountIn = '999'
      swapDestinationData = {
        receiver: user.address,
        // tokenIn: tokenOut.address,
        // amountIn: "1000",
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: [],
      }
      swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        tokenIn: tokenOut.address,
        amountIn,
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: [],
        additionalData: '0x',
      }

      payload = [
        ETHAddress, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]
      oracleFeeAmount = 100
      ccipFeeAmount = 9999999
      feeOracle.getFee.returns({
        tokenFee: '0',
        nativeFee: oracleFeeAmount,
      })
      ccipRouter.getFee.returns(ccipFeeAmount)
      tokenOut.balanceOf.returns(amountIn)
    })
    it('Should revert if destination chain is not supported', async function () {
      const wrongDestinationChainSelector = '14767482510784806044'

      const payload = [
        paymentToken.address, // address _paymentToken,
        wrongDestinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      await expect(
        xSwapRouter.swapAndSendMessage(...payload, {
          value: oracleFeeAmount,
        })
      ).to.be.revertedWithCustomError(
        xSwapRouter,
        'NoXSwapRouterOnSelectedChain'
      )
    })
    it('Should revert if token used for transfer is not supported', async function () {
      const wrongTokenOut = tokenIn.address

      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        tokenIn: tokenIn.address,
        amountIn: '999',
        tokenOut: wrongTokenOut,
        estimatedAmountOut: '999',
        calls: [],
        additionalData: '0x',
      }
      const payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]
      await expect(
        xSwapRouter.swapAndSendMessage(...payload, {
          value: oracleFeeAmount,
        })
      ).to.be.revertedWithCustomError(xSwapRouter, 'TokenNotWhitelisted')
    })
    it('Should revert if swap failed', async function () {
      const swapOriginData = {
        tokenIn: tokenIn.address,
        amountIn: '999',
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        calls: getExampleCallsData(),
        additionalData: '0x',
      }
      const payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]
      xSwapExecutor.run.reverts()

      await expect(
        xSwapRouter.swapAndSendMessage(...payload, {
          value: oracleFeeAmount,
        })
      ).to.be.reverted
    })
    it('Should revert if not enought value to pay for Instant ccip recieve', async function () {
      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: 10,
        tokenIn: tokenIn.address,
        amountIn: '999',
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: getExampleCallsData(),
        additionalData: '0x',
      }
      const payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      await expect(
        xSwapRouter.swapAndSendMessage(...payload, {
          value: oracleFeeAmount,
        })
      ).to.be.reverted
    })
    it('Should skip the swap if the calls is empty', async function () {
      await xSwapRouter.swapAndSendMessage(...payload, {
        value: oracleFeeAmount + ccipFeeAmount,
      })
      expect(xSwapExecutor.run).callCount(0)
    })
    it('Should allow to swap erc20 and send the message', async function () {
      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '10',
        tokenIn: tokenIn.address,
        amountIn: '999',
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: getExampleCallsData(),
        additionalData: '0x',
      }
      const payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      const tx = await xSwapRouter
        .connect(user)
        .swapAndSendMessage(...payload, {
          value: oracleFeeAmount + swapOriginData.valueForInstantCcipRecieve,
        })

      expect(tokenIn.transferFrom).to.be.calledWith(
        user.address,
        xSwapRouter.address,
        swapOriginData.amountIn
      )

      expect(tokenIn.approve).to.be.calledWith(
        xSwapExecutor.address,
        swapOriginData.amountIn
      )
      expect(xSwapExecutor.run).callCount(1)
      expect(ccipRouter.getFee).callCount(1)

      expect(paymentToken.transferFrom).to.be.calledOnceWith(
        user.address,
        xSwapRouter.address,
        ccipFeeAmount
      )
      expect(paymentToken.approve).to.be.calledOnceWith(
        ccipRouter.address,
        ccipFeeAmount
      )

      expect(feeCollector.receiveNative).to.be.calledTwice

      await expect(tx).to.emit(xSwapRouter, 'MessageSent')
    })
    it('Should allow to swap erc20 charge fee and send the message', async function () {
      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        tokenIn: tokenIn.address,
        amountIn: '10000',
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: getExampleCallsData(),
        additionalData: '0x',
      }
      const payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      const tokenFee = '1000'
      feeOracle.getFee.returns({
        tokenFee: tokenFee,
        nativeFee: oracleFeeAmount,
      })

      await xSwapRouter.connect(user).swapAndSendMessage(...payload, {
        value: oracleFeeAmount,
      })

      expect(feeCollector.receiveToken).to.be.calledWith(
        tokenOut.address,
        tokenFee
      )
    })
    it('Should allow to swap native and send the message', async function () {
      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        tokenIn: ETHAddress,
        amountIn: '999',
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: getExampleCallsData(),
        additionalData: '0x',
      }
      const payload = [
        paymentToken.address, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      const tx = await xSwapRouter
        .connect(user)
        .swapAndSendMessage(...payload, {
          value: oracleFeeAmount + ccipFeeAmount + swapOriginData.amountIn,
        })

      expect(xSwapExecutor.run).callCount(1)
      expect(ccipRouter.getFee).callCount(1)

      expect(paymentToken.transferFrom).to.be.calledOnceWith(
        user.address,
        xSwapRouter.address,
        ccipFeeAmount
      )
      expect(paymentToken.approve).to.be.calledOnceWith(
        ccipRouter.address,
        ccipFeeAmount
      )

      expect(feeCollector.receiveNative).to.be.calledOnce

      await expect(tx).to.emit(xSwapRouter, 'MessageSent')
    })
    it('Should allow to swap and pay for ccip native', async function () {
      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        tokenIn: ETHAddress,
        amountIn: '999',
        tokenOut: tokenOut.address,
        estimatedAmountOut: '999',
        calls: getExampleCallsData(),
        additionalData: '0x',
      }
      const payload = [
        ETHAddress, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      const tx = await xSwapRouter.swapAndSendMessage(...payload, {
        value: oracleFeeAmount + ccipFeeAmount + swapOriginData.amountIn,
      })

      expect(xSwapExecutor.run).callCount(1)
      expect(ccipRouter.getFee).callCount(1)

      expect(ccipRouter.ccipSend).to.calledWithValue(ccipFeeAmount)

      expect(feeCollector.receiveNative).to.be.calledOnce

      await expect(tx).to.emit(xSwapRouter, 'MessageSent')
    })
    it('Should revert if the msg value to low when swapping native', async function () {
      const swapOriginData = {
        valueForDestinationGas: '0',
        valueForInstantCcipRecieve: '0',
        tokenIn: ETHAddress,
        estimatedAmountOut: '999',
        amountIn: '9999999999',
        tokenOut: tokenOut.address,
        calls: getExampleCallsData(),
        additionalData: '0x',
      }

      const payload = [
        ETHAddress, // address _paymentToken,
        destinationChainSelector, // uint64 _destinationChainSelector,
        swapDestinationData, // SwapDestinationData calldata _data,
        swapOriginData, // SwapOriginData calldata _data,
        '800000', // uint256 _gasLimit
      ]

      await expect(
        xSwapRouter.swapAndSendMessage(...payload, {
          value: oracleFeeAmount + ccipFeeAmount,
        })
      ).to.be.revertedWithCustomError(XSwapRouter, 'NotEnoughNative')
    })
    it('Should skip the swap and approve only the amount recieved from sender', async function () {
      const baseTokenAmount = '100'
      tokenOut.balanceOf.returnsAtCall(0, baseTokenAmount)
      tokenOut.balanceOf.returnsAtCall(1, swapOriginData.amountIn)
      await xSwapRouter.swapAndSendMessage(...payload, {
        value: oracleFeeAmount + ccipFeeAmount,
      })
      expect(tokenOut.approve).calledWith(
        ccipRouter.address,
        +swapOriginData.amountIn - +baseTokenAmount
      )
    })
  })
  describe('_ccipReceive', function () {
    let swapDestinationData, abi, any2EvmMsg

    const getMessage = (swapDestinationData) => {
      abi = ethers.utils.defaultAbiCoder
      return {
        messageId: ethers.utils.randomBytes(32),
        sourceChainSelector: sourceChainSelector,
        sender: abi.encode(['address'], [xSwapRouter.address]),
        data: abi.encode(
          [
            'tuple(address,address,uint256,tuple(uint8,address,uint256,bytes,bytes)[])',
          ],

          [Object.values(swapDestinationData)]
        ),
        destTokenAmounts: [
          { token: tokenOut.address, amount: BigNumber.from('1000') },
        ],
      }
    }

    beforeEach(function () {
      swapDestinationData = {
        receiver: user.address,
        tokenOut: tokenFinal.address,
        estimatedAmountOut: '999',
        calls: [],
      }
      any2EvmMsg = getMessage(swapDestinationData)
    })

    it('Should revert if source chain not whitelisted', async function () {
      any2EvmMsg.sourceChainSelector = '123'
      await expect(
        xSwapRouter.connect(CCIPRouterAcc).ccipReceive(any2EvmMsg)
      ).to.be.revertedWithCustomError(xSwapRouter, 'SenderNotWhitelisted')
    })
    it('Should revert if sender not whitelisted', async function () {
      await xSwapRouter
        .connect(owner)
        .updateWhitelistSender(sourceChainSelector, xSwapRouter.address, false)

      await expect(
        xSwapRouter.connect(CCIPRouterAcc).ccipReceive(any2EvmMsg)
      ).to.be.revertedWithCustomError(xSwapRouter, 'SenderNotWhitelisted')
    })
    it('Should skip the swap and transfer funds to the receiver if calls is empty', async function () {
      swapDestinationData.calls = []
      await xSwapRouter.connect(CCIPRouterAcc).ccipReceive(any2EvmMsg)
      expect(tokenOut.transfer).to.be.calledOnceWith(
        swapDestinationData.receiver,
        '1000'
      )
    })
    it('Should swap and transfer the swapped funds to the receiver', async function () {
      swapDestinationData.calls = getExampleCallsData()
      const newMessage = getMessage(swapDestinationData)
      const tx = await xSwapRouter
        .connect(CCIPRouterAcc)
        .ccipReceive(newMessage)
      expect(xSwapExecutor.run).callCount(1)

      await expect(tx).to.emit(xSwapRouter, 'MessageReceived')
    })
    it('Should swap to native and transfer the swapped funds to the receiver without touching contract funds', async function () {
      swapDestinationData.calls = getExampleCallsData()
      swapDestinationData.calls[0].value = '100'
      swapDestinationData.tokenOut = ethers.constants.AddressZero
      const newMessage = getMessage(swapDestinationData)

      await owner.sendTransaction({
        to: xSwapRouter.address,
        value: swapDestinationData.calls[0].value,
      })

      let contractBalance = await ethers.provider.getBalance(
        xSwapRouter.address
      )
      expect(contractBalance).to.equal(swapDestinationData.calls[0].value)

      const tx = await xSwapRouter
        .connect(CCIPRouterAcc)
        .ccipReceive(newMessage)
      expect(xSwapExecutor.run).callCount(1)

      await expect(tx).to.emit(xSwapRouter, 'MessageReceived')

      contractBalance = await ethers.provider.getBalance(xSwapRouter.address)
      expect(contractBalance).to.equal('100')
    })
    it('Should fail swap and transfer the funds to the receiver', async function () {
      swapDestinationData.calls = getExampleCallsData()
      const newMessage = getMessage(swapDestinationData)
      xSwapExecutor.run.reverts()
      const tx = await xSwapRouter
        .connect(CCIPRouterAcc)
        .ccipReceive(newMessage)
      expect(xSwapExecutor.run).callCount(1)

      expect(tokenOut.approve).to.be.calledWith(xSwapExecutor.address, '1000')
      expect(tokenOut.transfer).to.be.calledWith(
        swapDestinationData.receiver,
        '1000'
      )
      await expect(tx).to.emit(xSwapRouter, 'MessageReceived')
    })
  })

  describe('instantCcipReceive', function () {
    let swapDestinationData, abi, any2EvmMsg

    const getMessage = (swapDestinationData) => {
      abi = ethers.utils.defaultAbiCoder
      return {
        messageId: ethers.utils.randomBytes(32),
        sourceChainSelector: sourceChainSelector,
        sender: abi.encode(['address'], [xSwapRouter.address]),
        data: abi.encode(
          [
            'tuple(address,address,uint256,tuple(uint8,address,uint256,bytes,bytes)[])',
          ],

          [Object.values(swapDestinationData)]
        ),
        destTokenAmounts: [
          {
            token: tokenOut.address,
            amount: BigNumber.from('1000'),
          },
        ],
      }
    }

    beforeEach(function () {
      swapDestinationData = {
        receiver: user.address,
        tokenOut: tokenFinal.address,
        estimatedAmountOut: '999',
        calls: [],
      }
      any2EvmMsg = getMessage(swapDestinationData)
    })
    const getHash = (message) => {
      return ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['tuple(bytes32,uint64,bytes,bytes,tuple(address,uint256)[])'],
          [
            [
              message.messageId,
              message.sourceChainSelector,
              message.sender,
              message.data,
              message.destTokenAmounts.map((obj) => [obj.token, obj.amount]),
            ],
          ]
        )
      )
    }

    it('should execute message and store msg sender under created hash', async function () {
      // Call the run function
      await xSwapRouter.connect(addr2).instantCcipReceive(any2EvmMsg)

      // Calculate the hash of the call data
      const hash = getHash(any2EvmMsg)

      expect(tokenOut.transferFrom).to.have.been.calledOnce

      expect(tokenOut.transferFrom).to.have.been.calledOnceWith(
        addr2.address,
        xSwapRouter.address,
        any2EvmMsg.destTokenAmounts[0].amount
      )

      // Check that the msg sender was stored under the created hash
      expect(
        await xSwapRouter.messageExecutionHashToExecutorMap(hash)
      ).to.equal(addr2.address)
    })
    it('should revert if called again after it message was executed by someone else', async function () {
      await xSwapRouter.connect(owner).instantCcipReceive(any2EvmMsg)
      // Call the run function again
      await await expect(
        xSwapRouter.connect(addr2).instantCcipReceive(any2EvmMsg)
      ).to.be.revertedWithCustomError(xSwapRouter, 'MessageAlreadyExecuted')
    })
    it('should revert if already executed by router', async function () {
      // execute by ccip router
      await xSwapRouter.connect(CCIPRouterAcc).ccipReceive(any2EvmMsg)
      // Call the run function again
      await await expect(
        xSwapRouter.connect(owner).instantCcipReceive(any2EvmMsg)
      ).to.be.revertedWithCustomError(xSwapRouter, 'MessageAlreadyExecuted')
    })
    it('should revert if no tokens provided', async function () {
      await expect(
        xSwapRouter.connect(addr2).instantCcipReceive({
          ...any2EvmMsg,
          destTokenAmounts: [],
        })
      ).to.be.revertedWithCustomError(
        xSwapRouter,
        'MessageMustTransferOnlyOneToken'
      )
    })
    it('should execute message and then router payback the executor', async function () {
      // Call the run function
      await xSwapRouter.connect(addr2).instantCcipReceive(any2EvmMsg)

      // Call the run function again but as router
      await xSwapRouter.connect(CCIPRouterAcc).ccipReceive(any2EvmMsg)

      expect(tokenOut.transferFrom).to.have.been.calledOnceWith(
        addr2.address,
        xSwapRouter.address,
        any2EvmMsg.destTokenAmounts[0].amount
      )
      // give back the funds
      expect(tokenOut.transfer.atCall(1)).to.have.been.calledWith(
        addr2.address,
        any2EvmMsg.destTokenAmounts[0].amount
      )
    })
    it('should not payback the executor if message amount was corrupted', async function () {
      // Call the run function
      const fakeAmount = BigNumber.from('1')
      await xSwapRouter.connect(addr2).instantCcipReceive({
        ...any2EvmMsg,
        destTokenAmounts: [
          { ...any2EvmMsg.destTokenAmounts[0], amount: fakeAmount },
        ],
      })

      // Call the run function again but as router
      await xSwapRouter.connect(CCIPRouterAcc).ccipReceive(any2EvmMsg)

      expect(tokenOut.transferFrom).to.have.been.calledOnceWith(
        addr2.address,
        xSwapRouter.address,
        fakeAmount
      )
      // give back the funds
      expect(tokenOut.transfer.atCall(1)).to.have.been.calledWith(
        swapDestinationData.receiver,
        any2EvmMsg.destTokenAmounts[0].amount
      )
    })
  })
})
