import { Client } from 'pg';

async function main() {
  const connectionString = 'postgresql://neondb_owner:npg_tNRvgFYoU14G@ep-sparkling-truth-adke4he8-pooler.c-2.us-east-1.aws.neon.tech/soulism?sslmode=require';
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Check what tables exist
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log("Tables found:", res.rows.map(r => r.table_name));
    
    // If souls or personas tables exist, query them
    let targetTable = null;
    for (const r of res.rows) {
       if (r.table_name.toLowerCase().includes('soul') || r.table_name.toLowerCase().includes('persona')) {
          targetTable = r.table_name;
          break;
       }
    }
    
    if (targetTable) {
       console.log(`Found target table: ${targetTable}`);
       const data = await client.query(`SELECT * FROM "${targetTable}" LIMIT 5`);
       console.log("Data:", data.rows);
    } else {
       console.log("No souls/personas table found.");
    }

  } catch (e) {
    console.error("DB Error:", e);
  } finally {
    await client.end();
  }
}

main();
