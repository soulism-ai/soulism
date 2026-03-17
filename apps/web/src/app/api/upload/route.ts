import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { scanSystemPrompt } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const formData = await req.formData();
    
    const packageName = formData.get("packageName") as string;
    const version = formData.get("version") as string;
    const description = formData.get("description") as string;
    const web3Account = formData.get("web3Account") as string;
    const file = formData.get("file") as File;

    if (!packageName || !version || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!session && !web3Account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // AI Anti-Virus Scanner: Scan description (and potentially file contents) for harm
    const isHarmful = await scanSystemPrompt(description);
    if (isHarmful) {
      return NextResponse.json({ error: "Upload rejected: AI Scanner flagged content as harmful or malicious." }, { status: 403 });
    }

    // In a full production env, you would upload the File to S3/Cloud Storage here.
    // We will just store the metadata in the database for now.
    const uploader = session?.user?.name || web3Account || "Unknown";
    const fileSize = file ? file.size : 0;

    // Create the table if it doesn't exist (useful for first-time setup on Neon)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS souls_registry (
        id SERIAL PRIMARY KEY,
        package_name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        description TEXT,
        uploader VARCHAR(255),
        file_size INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        views INT DEFAULT 0,
        score FLOAT DEFAULT 0.0,
        is_flagged BOOLEAN DEFAULT FALSE
      )
    `);

    // Insert the record
    const result = await pool.query(
      `INSERT INTO souls_registry (package_name, version, description, uploader, file_size)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [packageName, version, description, uploader, fileSize]
    );

    return NextResponse.json({ 
      success: true, 
      id: result.rows[0].id,
      message: "Successfully uploaded to database" 
    }, { status: 200 });

  } catch (error: any) {
    console.error("Upload API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
