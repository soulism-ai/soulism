import { ethers } from "ethers";
import fs from "fs";

// Load factory config
const FactoryABI = JSON.parse(fs.readFileSync("./src/utils/pump/abis/Factory.json", "utf-8"));
const config = JSON.parse(fs.readFileSync("./src/utils/pump/config.json", "utf-8"));
const address = config["31337"].factory.address;

// 3 production souls based on the original mock database elements
const souls = [
  { name: "Trello Core", slug: "TREL" },
  { name: "Slack Connect", slug: "SLCK" },
  { name: "CalDAV Calendar", slug: "CALD" }
];

async function main() {
  console.log("Connecting to local Hardhat node...");
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // Use the local node's primary unlocked account
  const signer = await provider.getSigner(0);
  console.log(`Using signer: ${signer.address}`);

  const factory = new ethers.Contract(address, FactoryABI, signer);
  const fee = await factory.fee();
  console.log(`Factory Fee: ${ethers.formatUnits(fee, 18)} ETH`);

  for (const soul of souls) {
    console.log(`[+] Deploying ${soul.name} (${soul.slug}) to the Factory...`);
    const tx = await factory.create(soul.name, soul.slug, { value: fee });
    const receipt = await tx.wait();
    console.log(`    -> Transaction mined: ${receipt.hash}`);
  }
  
  console.log("Successfully seeded 3 production souls!");
}

main().catch((err) => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
