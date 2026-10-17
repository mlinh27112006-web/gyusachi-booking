
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

async function main() {
    const migrationFile = process.argv[2];

    if (!migrationFile) {
        throw new Error(
            "Vui lòng cung cấp đường dẫn file SQL."
        );
    }

    const filePath = path.resolve(migrationFile);

    if (!fs.existsSync(filePath)) {
        throw new Error(`Không tìm thấy file: ${filePath}`);
    }

    const sql = fs.readFileSync(filePath, "utf8");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: true,
        },
        connectionTimeoutMillis: 15000,
    });

    try {
        await pool.query(sql);
        console.log("Migration đã thực thi thành công.");
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error("Migration thất bại:", error.message);
    process.exitCode = 1;
});
