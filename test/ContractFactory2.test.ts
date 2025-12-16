import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ContractFactory2", function () {
    let contractFactory2: any;
    let owner: any;
    let user1: any;
    let user2: any;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        contractFactory2 = await ethers.deployContract("ContractFactory2");
        await contractFactory2.waitForDeployment();
    });

    describe("ERC20 Creation", function () {
        it("Should create a new ERC20 token correctly", async function () {
            const name = "Test Token";
            const symbol = "TEST";
            const decimals = 18;
            const initialSupply = ethers.parseEther("1000");

            const tx = await contractFactory2.createERC20(name, symbol, decimals, initialSupply, user1.address);
            const receipt = await tx.wait();

            // Check for ERC20Created event
            // event ERC20Created(address indexed tokenAddress, string name, string symbol, uint256 initialSupply, address indexed owner);

            // We can't easily parse logs without the interface sometimes, but ethers v6 does it if the contract instance is known. 
            // contractFactory2 is the one emitting.

            const filter = contractFactory2.filters.ERC20Created();
            const events = await contractFactory2.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
            expect(events.length).to.equal(1);

            const event = events[0];
            expect(event.args[1]).to.equal(name);
            expect(event.args[2]).to.equal(symbol);
            expect(event.args[3]).to.equal(initialSupply);
            expect(event.args[4]).to.equal(user1.address);

            const tokenAddress = event.args[0];

            // Verify the deployed token
            const Token = await ethers.getContractFactory("contracts/ContractFactory2.sol:SimpleERC20");
            const token = Token.attach(tokenAddress) as any;

            expect(await token.name()).to.equal(name);
            expect(await token.symbol()).to.equal(symbol);
            expect(await token.decimals()).to.equal(decimals);
            expect(await token.balanceOf(user1.address)).to.equal(initialSupply);
            expect(await token.owner()).to.equal(user1.address);
        });
    });

    describe("ERC721 Creation", function () {
        it("Should create a new ERC721 token correctly", async function () {
            const name = "Test NFT";
            const symbol = "TNFT";
            const baseURI = "https://api.example.com/";
            const initialMintAmount = 5;

            const tx = await contractFactory2.createERC721(name, symbol, baseURI, user1.address, initialMintAmount);
            const receipt = await tx.wait();

            const filter = contractFactory2.filters.ERC721Created();
            const events = await contractFactory2.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
            expect(events.length).to.equal(1);

            // event ERC721Created(address indexed tokenAddress, string name, string symbol, string baseTokenURI, address indexed owner, uint256 initialMintAmount);
            const event = events[0];
            expect(event.args[0]).to.not.equal(ethers.ZeroAddress);
            expect(event.args[1]).to.equal(name);
            expect(event.args[2]).to.equal(symbol);
            expect(event.args[3]).to.equal(baseURI);
            expect(event.args[4]).to.equal(user1.address);
            expect(event.args[5]).to.equal(initialMintAmount);

            const tokenAddress = event.args[0];
            const Token = await ethers.getContractFactory("contracts/ContractFactory2.sol:SimpleERC721");
            const token = Token.attach(tokenAddress) as any;

            expect(await token.name()).to.equal(name);
            expect(await token.symbol()).to.equal(symbol);
            expect(await token.owner()).to.equal(user1.address);
            expect(await token.balanceOf(user1.address)).to.equal(initialMintAmount);
        });
    });

    describe("ERC1155 Creation", function () {
        it("Should create a new ERC1155 token correctly", async function () {
            const uri = "https://api.example.com/{id}.json";
            const name = "Test Collection";
            const initialTokenIds = [1, 2, 3];
            const initialAmounts = [100, 200, 300];

            const tx = await contractFactory2.createERC1155(uri, name, initialTokenIds, initialAmounts, user1.address);
            const receipt = await tx.wait();

            const filter = contractFactory2.filters.ERC1155Created();
            const events = await contractFactory2.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
            expect(events.length).to.equal(1);

            // event ERC1155Created(address indexed tokenAddress, address indexed owner, string name, uint256 initialTokensCount);
            const event = events[0];
            expect(event.args[0]).to.not.equal(ethers.ZeroAddress);
            expect(event.args[1]).to.equal(user1.address);
            expect(event.args[2]).to.equal(name);
            expect(event.args[3]).to.equal(initialTokenIds.length);

            const tokenAddress = event.args[0];
            const Token = await ethers.getContractFactory("contracts/ContractFactory2.sol:SimpleERC1155");
            const token = Token.attach(tokenAddress) as any;

            expect(await token.uri(0)).to.equal(uri);
            expect(await token.owner()).to.equal(user1.address);
            expect(await token.balanceOf(user1.address, 1)).to.equal(100);
            expect(await token.balanceOf(user1.address, 2)).to.equal(200);
            expect(await token.balanceOf(user1.address, 3)).to.equal(300);
        });

        it("Should create ERC1155 Simple", async function () {
            const uri = "https://simple.example.com/{id}.json";
            const name = "Simple Collection";
            const initialTokenId = 1;
            const initialAmount = 1000;

            const tx = await contractFactory2.createERC1155Simple(uri, name, initialTokenId, initialAmount, user1.address);
            const receipt = await tx.wait();

            const filter = contractFactory2.filters.ERC1155Created();
            const events = await contractFactory2.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
            expect(events.length).to.equal(1);

            const tokenAddress = events[0].args[0];
            const Token = await ethers.getContractFactory("contracts/ContractFactory2.sol:SimpleERC1155");
            const token = Token.attach(tokenAddress) as any;

            expect(await token.balanceOf(user1.address, initialTokenId)).to.equal(initialAmount);
            expect(await token.owner()).to.equal(user1.address);
        });

        it("Should revert if array length mismatch in createERC1155", async function () {
            const uri = "https://fail.example.com/{id}.json";
            const name = "Fail Collection";
            const initialTokenIds = [1, 2];
            const initialAmounts = [100]; // Mismatch

            await expect(
                contractFactory2.createERC1155(uri, name, initialTokenIds, initialAmounts, user1.address)
            ).to.be.revertedWithCustomError(contractFactory2, "ArrayLengthMismatch"); // Factory checks this? Or SimpleERC1155?

            // factory checks it at line 305: if (initialTokenIds.length != initialAmounts.length) revert ArrayLengthMismatch();
            // and defines 'error ArrayLengthMismatch();' at global level (file scope).
            // Since custom error is defined in ContractFactory2.sol (file scope), we need to check if it's attached to the contract ABI.
            // Usually file-level errors are attached to contracts that use them in ABI.
        });
    });

    describe("View Functions", function () {
        it("Should track created tokens by creator", async function () {
            await contractFactory2.createERC20("Token1", "TK1", 18, 100, user1.address);
            await contractFactory2.createERC721("NFT1", "N1", "uri", user1.address, 0);

            const erc20s = await contractFactory2.getCreatorERC20Tokens(user1.address);
            expect(erc20s.length).to.equal(1);

            const erc721s = await contractFactory2.getCreatorERC721Tokens(user1.address);
            expect(erc721s.length).to.equal(1);
        });
    });
});
