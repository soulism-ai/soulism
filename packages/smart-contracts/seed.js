const hre = require("hardhat");

const souls = [
  { name: "Trello Core", slug: "TREL" },
  { name: "Slack Connect", slug: "SLCK" },
  { name: "CalDAV Calendar", slug: "CALD" }
];

async function main() {
  const factoryAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const Factory = await hre.ethers.getContractAt("Factory", factoryAddress);

  const fee = await Factory.fee();
  console.log(`Factory Fee: ${hre.ethers.formatUnits(fee, 18)} ETH`);

  for (const soul of souls) {
    console.log(`[+] Deploying ${soul.name} (${soul.slug}) to the Factory...`);
    const tx = await Factory.create(soul.name, soul.slug, { value: fee });
    const receipt = await tx.wait();
    console.log(`    -> Transaction mined: ${receipt.hash}`);
  }
  
  console.log("Successfully seeded 3 production souls!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
