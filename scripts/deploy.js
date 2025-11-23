import hre from "hardhat";

async function main() {
  console.log("Deploying Zillopoly contracts...");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy HOBO token with initial supply of 1 million tokens
  const initialSupply = hre.ethers.parseEther("1000000");
  console.log("\nDeploying HOBO Token...");
  const Hobo = await hre.ethers.getContractFactory("Hobo");
  const hobo = await Hobo.deploy(initialSupply);
  await hobo.waitForDeployment();
  const hoboAddress = await hobo.getAddress();
  console.log("HOBO Token deployed to:", hoboAddress);

  // Deploy Zillopoly
  console.log("\nDeploying Zillopoly...");
  const Zillopoly = await hre.ethers.getContractFactory("Zillopoly");
  const zillopoly = await Zillopoly.deploy(hoboAddress);
  await zillopoly.waitForDeployment();
  const zillopolyAddress = await zillopoly.getAddress();
  console.log("Zillopoly deployed to:", zillopolyAddress);

  // Fund the house with HOBO tokens
  const houseFunding = hre.ethers.parseEther("100000"); // 100k HOBO for the house
  console.log("\nFunding house with", hre.ethers.formatEther(houseFunding), "HOBO...");

  // Approve Zillopoly contract to spend HOBO
  const approveTx = await hobo.approve(zillopolyAddress, houseFunding);
  await approveTx.wait();
  console.log("Approved Zillopoly contract to spend HOBO");

  // Fund the house
  const fundTx = await zillopoly.fundHouse(houseFunding);
  await fundTx.wait();
  console.log("House funded successfully");

  console.log("\n=== Deployment Summary ===");
  console.log("HOBO Token:", hoboAddress);
  console.log("Zillopoly:", zillopolyAddress);
  console.log("House Balance:", hre.ethers.formatEther(await zillopoly.houseBalance()), "HOBO");
  console.log("Deployer Balance:", hre.ethers.formatEther(await hobo.balanceOf(deployer.address)), "HOBO");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
