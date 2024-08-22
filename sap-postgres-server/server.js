const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;
app.use(cors());
//app.use(express.json());
app.use(express.json({ limit: '100mb' }));

// PostgreSQL connection pool
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'postgres',
    port: 5432,
});
app.post('/insert-records', async (req, res) => {
    const { records } = req.body;

    if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: 'Invalid input. Expected an array of records.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Start a transaction

        const insertQuery = `
            INSERT INTO com_satinfotech_cloudapps_accounting (ID, CompanyCode, FiscalYear, FiscalPeriod, AccountingDocument, LastChangeDate, AccountingDocumentType)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;

        const insertedRecords = [];

        for (const record of records) {
            const { CompanyCode, FiscalYear, FiscalPeriod, AccountingDocument, LastChangeDate, AccountingDocumentType } = record;
            const id = uuidv4();

            const result = await client.query(insertQuery, [
                id,
                CompanyCode,
                FiscalYear,
                FiscalPeriod,
                AccountingDocument,
                LastChangeDate,
                AccountingDocumentType
            ]);

            insertedRecords.push(result.rows[0]); // Collect each inserted record
        }

        await client.query('COMMIT'); // Commit the transaction

        res.status(201).json(insertedRecords); // Return all inserted records
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction in case of error
        console.error('Error inserting records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
