import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("Zillopoly", function () {
  let hobo;
  let zillopoly;
  let owner;
  let player1;
  let player2;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const HOUSE_FUNDING = ethers.parseEther("100000");
  const PLAYER_TOKENS = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();

    // Deploy Hobo
    const Hobo = await ethers.getContractFactory("Hobo");
    hobo = await Hobo.deploy(INITIAL_SUPPLY);
    await hobo.waitForDeployment();

    // Deploy Zillopoly
    const Zillopoly = await ethers.getContractFactory("Zillopoly");
    zillopoly = await Zillopoly.deploy(await hobo.getAddress());
    await zillopoly.waitForDeployment();

    // Fund the house
    await hobo.approve(await zillopoly.getAddress(), HOUSE_FUNDING);
    await zillopoly.fundHouse(HOUSE_FUNDING);

    // Give players some HOBO
    await hobo.transfer(player1.address, PLAYER_TOKENS);
    await hobo.transfer(player2.address, PLAYER_TOKENS);
  });

  describe("Deployment", function () {
    it("Should set the correct HOBO token", async function () {
      expect(await zillopoly.hoboToken()).to.equal(await hobo.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await zillopoly.owner()).to.equal(owner.address);
    });

    it("Should have correct house balance after funding", async function () {
      expect(await zillopoly.houseBalance()).to.equal(HOUSE_FUNDING);
    });
  });

  describe("Playing the game", function () {
    it("Should allow a player to play with valid parameters", async function () {
      const betAmount = ethers.parseEther("10");

      // Approve game to spend player's tokens
      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);

      // Play the game (guess OVER 50)
      await expect(
        zillopoly.connect(player1).play(betAmount, 50, 1) // 1 = OVER
      ).to.emit(zillopoly, "GamePlayed");
    });

    it("Should revert if bet amount is below minimum", async function () {
      const betAmount = ethers.parseEther("0.5");

      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);

      await expect(
        zillopoly.connect(player1).play(betAmount, 50, 1)
      ).to.be.revertedWith("Bet amount too low");
    });

    it("Should revert if bet amount exceeds maximum", async function () {
      const betAmount = ethers.parseEther("101");

      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);

      await expect(
        zillopoly.connect(player1).play(betAmount, 50, 1)
      ).to.be.revertedWith("Bet amount exceeds maximum");
    });

    it("Should revert if threshold is invalid", async function () {
      const betAmount = ethers.parseEther("10");

      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);

      await expect(
        zillopoly.connect(player1).play(betAmount, 0, 1)
      ).to.be.revertedWith("Threshold must be between 1 and 99");

      await expect(
        zillopoly.connect(player1).play(betAmount, 100, 1)
      ).to.be.revertedWith("Threshold must be between 1 and 99");
    });

    it("Should correctly handle a winning bet", async function () {
      const betAmount = ethers.parseEther("10");

      // Use UNDER with threshold 99 to have very high chance of winning
      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);

      const initialBalance = await hobo.balanceOf(player1.address);

      // Play with UNDER 99 (very high chance of winning since random is 1-100)
      const tx = await zillopoly.connect(player1).play(betAmount, 99, 0); // 0 = UNDER
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "GamePlayed"
      );

      // With threshold 99 and UNDER, we should win (random number 1-98 wins)
      if (event && event.args.won) {
        // Player should receive 2x bet
        const finalBalance = await hobo.balanceOf(player1.address);
        // Balance should increase by betAmount (they get 2x back, but spent 1x)
        expect(finalBalance).to.equal(initialBalance + betAmount);
      } else {
        // Very unlikely but if we lose, balance should decrease
        const finalBalance = await hobo.balanceOf(player1.address);
        expect(finalBalance).to.equal(initialBalance - betAmount);
      }
    });

    it("Should correctly handle a losing bet", async function () {
      const betAmount = ethers.parseEther("10");

      // Use OVER with threshold 1 to have very high chance of losing
      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);

      const initialBalance = await hobo.balanceOf(player1.address);
      const initialHouseBalance = await zillopoly.houseBalance();

      // Play with OVER 1 (very high chance of losing since random is 1-100, only 2-100 wins)
      const tx = await zillopoly.connect(player1).play(betAmount, 1, 1); // 1 = OVER
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === "GamePlayed"
      );

      // With threshold 1 and OVER, we will almost certainly lose (only random 2-100 wins, 1 loses)
      if (event && !event.args.won) {
        // Player should lose their bet
        const finalBalance = await hobo.balanceOf(player1.address);
        expect(finalBalance).to.equal(initialBalance - betAmount);

        // House should gain the bet
        const finalHouseBalance = await zillopoly.houseBalance();
        expect(finalHouseBalance).to.equal(initialHouseBalance + betAmount);
      } else {
        // Very unlikely but if we win, balance should increase
        const finalBalance = await hobo.balanceOf(player1.address);
        expect(finalBalance).to.equal(initialBalance + betAmount);
      }
    });

    it("Should record game history", async function () {
      const betAmount = ethers.parseEther("10");

      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount);
      await zillopoly.connect(player1).play(betAmount, 50, 1);

      const history = await zillopoly.getPlayerHistory(player1.address);
      expect(history.length).to.equal(1);
      expect(history[0].player).to.equal(player1.address);
      expect(history[0].betAmount).to.equal(betAmount);
      expect(history[0].threshold).to.equal(50);
    });

    it("Should track total games", async function () {
      const betAmount = ethers.parseEther("10");

      await hobo.connect(player1).approve(await zillopoly.getAddress(), betAmount * 2n);
      await zillopoly.connect(player1).play(betAmount, 50, 1);
      await zillopoly.connect(player1).play(betAmount, 30, 0); // 0 = UNDER

      expect(await zillopoly.getTotalGames()).to.equal(2);
    });
  });

  describe("House management", function () {
    it("Should allow owner to fund the house", async function () {
      const additionalFunding = ethers.parseEther("10000");

      await hobo.approve(await zillopoly.getAddress(), additionalFunding);

      const initialHouseBalance = await zillopoly.houseBalance();
      await zillopoly.fundHouse(additionalFunding);

      expect(await zillopoly.houseBalance()).to.equal(
        initialHouseBalance + additionalFunding
      );
    });

    it("Should allow owner to withdraw from house", async function () {
      const withdrawAmount = ethers.parseEther("1000");

      const initialOwnerBalance = await hobo.balanceOf(owner.address);
      await zillopoly.withdrawHouse(withdrawAmount);

      expect(await hobo.balanceOf(owner.address)).to.equal(
        initialOwnerBalance + withdrawAmount
      );
      expect(await zillopoly.houseBalance()).to.equal(
        HOUSE_FUNDING - withdrawAmount
      );
    });

    it("Should not allow non-owner to fund house", async function () {
      const additionalFunding = ethers.parseEther("1000");

      await hobo.connect(player1).approve(await zillopoly.getAddress(), additionalFunding);

      await expect(
        zillopoly.connect(player1).fundHouse(additionalFunding)
      ).to.be.reverted;
    });

    it("Should not allow non-owner to withdraw from house", async function () {
      await expect(
        zillopoly.connect(player1).withdrawHouse(ethers.parseEther("100"))
      ).to.be.reverted;
    });
  });

  describe("Configuration", function () {
    it("Should allow owner to update max bet", async function () {
      const newMaxBet = ethers.parseEther("500");

      await zillopoly.setMaxBet(newMaxBet);
      expect(await zillopoly.maxBet()).to.equal(newMaxBet);
    });

    it("Should not allow setting max bet below min bet", async function () {
      await expect(
        zillopoly.setMaxBet(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Max bet must be >= min bet");
    });

    it("Should not allow non-owner to update max bet", async function () {
      await expect(
        zillopoly.connect(player1).setMaxBet(ethers.parseEther("500"))
      ).to.be.reverted;
    });
  });
});
