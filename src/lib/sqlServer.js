import "server-only";
import sql from "mssql";

let pool = null;

/**
 * Get or create SQL Server connection pool
 * @returns {Promise<sql.ConnectionPool>}
 */
export async function getSqlPool() {
    if (pool && pool.connected) {
        return pool;
    }

    const config = {
        server: process.env.SQL_SERVER,
        database: process.env.SQL_DATABASE,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        port: parseInt(process.env.SQL_PORT || "1433", 10),
        options: {
            encrypt: process.env.SQL_ENCRYPT === "true",
            trustServerCertificate: process.env.SQL_TRUST_CERT === "true",
            enableArithAbort: true,
            // Request timeout for individual queries (30 seconds)
            requestTimeout: 30000,
            // Connection timeout (15 seconds)
            connectionTimeout: 15000,
        },
        pool: {
            // Increased pool size for 50-200 concurrent users
            max: 50,
            min: 5,
            // Keep connections alive for 5 minutes of inactivity
            idleTimeoutMillis: 300000,
            // Time to wait for a connection from pool before timing out
            acquireTimeoutMillis: 30000,
            // Validate connection before using from pool
            validateConnection: true,
        },
    };

    try {
        pool = await new sql.ConnectionPool(config).connect();
        console.log("SQL Server connection pool established");
        return pool;
    } catch (error) {
        console.error("SQL Server connection failed:", error);
        throw error;
    }
}

/**
 * Execute a SQL query with parameters
 * @param {string} query - SQL query string
 * @param {Object} params - Query parameters { name: value }
 * @returns {Promise<sql.IResult<any>>}
 */
export async function executeQuery(query, params = {}) {
    const pool = await getSqlPool();
    const request = pool.request();

    // Set timeout for this specific query (30 seconds)
    request.timeout = 30000;

    // Add parameters to request
    Object.entries(params).forEach(([name, value]) => {
        request.input(name, value);
    });

    return await request.query(query);
}

/**
 * Close the connection pool (for cleanup)
 */
export async function closeSqlPool() {
    if (pool) {
        await pool.close();
        pool = null;
        console.log("SQL Server connection pool closed");
    }
}
