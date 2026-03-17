import { NextResponse } from "next/server";
import { ethers } from "ethers";

// ABIs & Config
import Factory from "@/utils/pump/abis/Factory.json";
import config from "@/utils/pump/config.json";

// 3 production souls
const souls = [
  { name: "Trello Core", slug: "TREL" },
  { name: "Slack Connect", slug: "SLCK" },
  { name: "CalDAV Calendar", slug: "CALD" }
];

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // We get the first unlocked account from the Hardhat node
    const signer = await provider.getSigner(0);

    const factoryAddress = (config as any)["31337"].factory.address;
    const factory = new ethers.Contract(factoryAddress, Factory, signer);
    
    const fee = await factory.fee();
    const results = [];

    for (const soul of souls) {
      const tx = await (factory as any).create(soul.name, soul.slug, { value: fee });
      const receipt = await tx.wait();
      results.push(`Created ${soul.name} at tx ${receipt.hash}`);
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
