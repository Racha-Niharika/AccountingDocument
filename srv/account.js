/*const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    const Accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    //const gsttaxapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV'); // Replace with your GST tax API connection
    const { Accounts, Items, Accounting } = this.entities;

    // Handle READ operation on the ext entity to filter based on specific criteria
    this.on('READ', 'Accounts', async (req) => {
        try {
            const query = req.query
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const result = await Accountingapi.run(query);

            if (!Array.isArray(result)) {
                console.error('Unexpected data format for ext entity:', result);
                return [];
            }

            return result;
        } catch (error) {
            console.error('Error fetching data from ext entity:', error);
            throw error;
        }
    });

    // Handle before READ operation on 'Accounting' entity to fetch and insert new records
    this.before('READ', 'Accounting', async (req) => {
        try {
            const query = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const res = await Accountingapi.run(query);

            if (!Array.isArray(res)) {
                console.error('Unexpected data format for Accounting records:', res);
                return;
            }

            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());
            console.log('Grouped records:', groupedData);

            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                console.log('Inserted new records into Accounting:', newRecords);
            } else {
                console.log('No new records to insert into Accounting.');
            }
        } catch (error) {
            console.error('Error processing Accounting records:', error);
            throw error;
        }
    });

    // Handle before READ operation on 'Items' entity to fetch and insert new records
    this.before('READ', 'Items', async (req) => {
        try {
            const query = SELECT.from(ext)
                .columns('AccountingDocument', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const sourceRecords = await Accountingapi.run(query);

            if (!Array.isArray(sourceRecords)) {
                console.error('Unexpected data format for Items records:', sourceRecords);
                return;
            }

            const recordsWithUUID = sourceRecords.map(record => ({
                ...record,
                ID: uuidv4(),
                id: record.AccountingDocument
            }));

            const existingRecords = await cds.run(
                SELECT.from(Items)
                    .columns('AccountingDocument')
                    .where({
                        AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                    })
            );

            const existingMap = new Map();
            existingRecords.forEach(record => {
                existingMap.set(record.AccountingDocument, record);
            });

            const newRecords = recordsWithUUID.filter(record => {
                return !existingMap.has(record.AccountingDocument);
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Items).entries(newRecords));
                console.log('Upserted records with UUIDs into Items:', newRecords);
            } else {
                console.log('No new records to upsert into Items.');
            }
        } catch (error) {
            console.error('Error processing Items records:', error);
            throw error;
        }
    });

    // Define the fetch action
    this.on('accounting', async (req) => {
        try {
            // Fetch data from the external service
            const query = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const res = await Accountingapi.run(query);

            if (!Array.isArray(res)) {
                console.error('Unexpected data format for fetch action:', res);
                return { message: 'No records found.' };
            }

            // Process Accounting records
            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());
            console.log('Grouped records for fetch action:', groupedData);

            // Insert or update Accounting records
            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                console.log('Inserted new records into Accounting via fetch action:', newRecords);
            } else {
                console.log('No new records to insert into Accounting via fetch action.');
            }

            // Process Items records
            const recordsWithUUID = res.map(record => ({
                ...record,
                ID: uuidv4(),
                id: record.AccountingDocument
            }));

            const existingItemsRecords = await cds.run(
                SELECT.from(Items)
                    .columns('AccountingDocument')
                    .where({
                        AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                    })
            );

            const existingItemsMap = new Map();
            existingItemsRecords.forEach(record => {
                existingItemsMap.set(record.AccountingDocument, record);
            });

            const newItemsRecords = recordsWithUUID.filter(record => {
                return !existingItemsMap.has(record.AccountingDocument);
            });

            if (newItemsRecords.length > 0) {
                await cds.run(UPSERT.into(Items).entries(newItemsRecords));
                console.log('Upserted records with UUIDs into Items via fetch action:', newItemsRecords);
            } else {
                console.log('No new records to upsert into Items via fetch action.');
            }

            // Handle LGSTTaxItem processing
            let lastsyncdate1 = await cds.run(
                SELECT.one.from(Accounting).columns('LastChangeDate').orderBy('LastChangeDate desc')
            );

            let counttaxdocs;

            if (lastsyncdate1 && lastsyncdate1.LastChangeDate) {
                const taxlastsyncdatetime = lastsyncdate1.LastChangeDate.toISOString();
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetimeoffset'${taxlastsyncdatetime}'`
                });
            } else {
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: 'A_OperationalAcctgDocItemCube/$count'
                 

                });
            }
            function convertSAPDateToISO(dateString) {
    const timestamp = parseInt(dateString.match(/\d+/)[0], 10); // Extract the timestamp
    return new Date(timestamp).toISOString(); // Convert to ISO string
}

function removeDuplicateEntries(results) {
    const uniqueResults = [];
    const seenIds = new Set();

    for (const item of results) {
        if (!seenIds.has(item.ID)) {
            uniqueResults.push(item);
            seenIds.add(item.ID);
        }
    }

    return uniqueResults;
}

for (let i = 0; i < counttaxdocs; i += 5000) {
    const taxdocitemsQuery = {
        method: 'GET',
        path: `A_OperationalAcctgDocItemCube?$skip=${i}&$top=5000`
    };

    let results = await Accountingapi.send(taxdocitemsQuery);

    results = results.map(item => {
        // Ensure LastChangeDate is in ISO format
        if (item.LastChangeDate) {
            item.LastChangeDate = convertSAPDateToISO(item.LastChangeDate);
        }

        // Ensure ID is not null
        if (!item.ID) {
            item.ID = generateUniqueID(item); // Optionally generate a unique ID if missing
        }

        return item;
    });

    // Remove duplicate entries
    results = removeDuplicateEntries(results);

    if (results.length > 0) { // Only attempt UPSERT if there are valid records
        console.log("In Batch ", i, " of ", counttaxdocs, " records");
        await cds.run(UPSERT.into(Accounting).entries(results));
    } else {
        console.log("Skipping Batch ", i, " due to missing or duplicate IDs");
    }
}

function generateUniqueID(item) {
    return `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}-${item.FiscalPeriod}`;}

            console.log('Count of new tax documents:', counttaxdocs);

            // Fetch and process GST tax items if needed
            // ...

            return { message: 'Fetch action completed successfully.' };
        } catch (error) {
            console.error('Error in fetch action:', error);
            throw error;
        }
    });
});
*/


const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    const gstapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');

    let fetchStatus = {
        messages: ["Initializing..."],  
        completed: false
    };

    const docTypes = ['RV', 'DR', 'DG', 'RE', 'KR', 'KG']; // Define the document types to filter by

    // Function to handle the data fetching and upserting logic
    async function fetchAndUpsertData() {
        try {
            const { Accounting,Items, Accounts } = this.entities;

            // Fetch data for Accounting with filtering by AccountingDocumentType
            const qry = SELECT.from(Accounts)
                .columns([
                    'CompanyCode',
                    'FiscalYear',
                    'AccountingDocument',
                    'AccountingDocumentItem',
                    'AccountingDocumentType',
                    'DocumentReferenceID',
                    'GLAccount',
                    'TaxCode'
                ])
                .where({ AccountingDocumentType: { in: docTypes } });

            let res = await gstapi.run(qry);
            console.log('Fetched Data:', res);

            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());

            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns(['CompanyCode', 'FiscalYear', 'AccountingDocument'])
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) },
                        AccountingDocumentType: { in: docTypes }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            // Upsert Accounting data
            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                fetchStatus.messages.push("Data upserted successfully to Accounting");
            } else {
                fetchStatus.messages.push("No new data to upsert to Accounting.");
            }

            // Fetch data for Items with filtering by AccountingDocumentType
            const qryItems = SELECT.from(Accounts)
                .columns([
                    'AccountingDocumentItem',
                    'GLAccount',
                    'TaxCode',
                    'CompanyCode',
                    'AccountingDocument',
                    'FiscalYear',
                    'AmountInTransactionCurrency'
                ])
                .where({ AccountingDocumentType: { in: docTypes } });

            let sourceRecords = await gstapi.run(qryItems);
            console.log('Fetched Data for Items:', sourceRecords);

            const recordsWithUUID = sourceRecords.map(record => ({
                ...record,
                ID: record.ID || uuidv4()
            }));

            const existingItemsRecords = await cds.run(
                SELECT.from(Items)
                    .columns(['AccountingDocumentItem', 'FiscalYear'])
                    .where({
                        AccountingDocumentItem: { in: recordsWithUUID.map(r => r.AccountingDocumentItem) },
                        FiscalYear: { in: recordsWithUUID.map(r => r.FiscalYear) }
                    })
            );

            const existingMap = new Map();
            existingItemsRecords.forEach(record => {
                const key = `${record.AccountingDocumentItem}-${record.FiscalYear}`;
                existingMap.set(key, record);
            });

            const newItemsRecords = recordsWithUUID.filter(record => {
                const key = `${record.AccountingDocumentItem}-${record.FiscalYear}`;
                return !existingMap.has(key);
            });

            // Upsert Items data
            if (newItemsRecords.length > 0) {
                await cds.run(UPSERT.into(Items).entries(newItemsRecords));
                fetchStatus.messages.push("Upserted records with UUIDs into Items");
            } else {
                fetchStatus.messages.push("No new records to upsert into Items.");
            }

            // Handle LGSTTaxItem processing with batch processing
            let lastsyncdate1 = await cds.run(
                SELECT.one.from(Accounting).columns('LastChangeDate').orderBy('LastChangeDate desc')
            );

            let counttaxdocs;
            let taxlastsyncdatetime;

            if (lastsyncdate1 && lastsyncdate1.LastChangeDate) {
                taxlastsyncdatetime = lastsyncdate1.LastChangeDate.toISOString();
                counttaxdocs = await gstapi.send({
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetimeoffset'${taxlastsyncdatetime}'`
                });
            } else {
                counttaxdocs = await gstapi.send({
                    method: 'GET',
                    path: 'A_OperationalAcctgDocItemCube/$count'
                });
            }

            if (counttaxdocs === 0) {
                fetchStatus.messages.push('No new tax documents to process.');
                fetchStatus.completed = true;
                return { message: 'No new tax documents to process.', batchResults: [] };
            }

            const batchSize = 5000;
            let count = 1;
            const batchResults = [];
            let newDataFetched = false;

            for (let i = 0; i < counttaxdocs; i += batchSize) {
                // Determine the upper limit of the current batch
                let upperLimit = i + batchSize;
                if (upperLimit > counttaxdocs) {
                    upperLimit = counttaxdocs;  // Adjust if the upper limit exceeds the total count
                }

                const taxdocitemsQuery = {
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube?$skip=${i}&$top=${batchSize}`
                };

                let results = await gstapi.send(taxdocitemsQuery);

                results = results.map(item => {
                    if (item.LastChangeDate) {
                        item.LastChangeDate = convertSAPDateToISO(item.LastChangeDate);
                    }
                    item.ID = item.ID || uuidv4();
                    return item;
                });

                results = removeDuplicateEntries(results);

                // Filter results to include only those with desired AccountingDocumentType
                results = results.filter(item => docTypes.includes(item.AccountingDocumentType));

                if (results.length > 0) {
                    newDataFetched = true;
                    fetchStatus.messages.push(`Processing Batch ${count} (${i + 1} to ${upperLimit}) of ${counttaxdocs} records`);
                    await cds.run(UPSERT.into(Accounting).entries(results));
                    batchResults.push(`Batch ${count} processed.`);
                    count += 1;
                } else {
                    fetchStatus.messages.push(`Skipping batch ${count} due to missing or duplicate IDs`);
                }

                if (i === 0 && !newDataFetched) {
                    fetchStatus.messages.push('No new records found in the first batch. Stopping further batch processing.');
                    break;
                }
            }

            if (newDataFetched) {
                fetchStatus.messages.push('All records processed successfully.');
            } else {
                fetchStatus.messages.push('No new data to process after the initial batch. All records are fetched.');
            }

            fetchStatus.completed = true;
            return { message: 'All records processed.', batchResults };
        } catch (error) {
            console.error("Error during data fetch and upsert operation:", error);
            fetchStatus.messages.push("Error during data fetch and upsert operation");
            fetchStatus.completed = true;
            throw error;
        }
    }

    // Register the ListReporter handler
    this.on('ListReporter', async (req) => {
        try {
            fetchStatus = { messages: ["Initializing..."], completed: false }; // Reset status
            const result = await fetchAndUpsertData.call(this);
            console.log("fetch status", fetchStatus);
            return true;
        } catch (error) {
            console.error("Error during ListReporter operation:", error);
            req.error(500, 'Error during data fetch and upsert operation');
        }
    });

    // Register the StatusReporter handler
    this.on('GSTFetchStatus', async (req) => {
        console.log(fetchStatus);
        return fetchStatus;
    });
});

function convertSAPDateToISO(dateString) {
    const timestamp = parseInt(dateString.match(/\d+/)[0], 10);
    return new Date(timestamp).toISOString();
}

function removeDuplicateEntries(results) {
    const uniqueResults = [];
    const seenIds = new Set();

    for (const item of results) {
        if (!seenIds.has(item.ID)) {
            uniqueResults.push(item);
            seenIds.add(item.ID);
        }
    }

    return uniqueResults;
}
/*
const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
    
    const { Accounting } = this.entities;

    this.on('insertRecords', async (req) => {
        try {
            const { records } = req.data;

            if (!records || records.length === 0) {
                return { message: 'No records to insert' };
            }

            // Insert records into the Accounting table in batches
            const BATCH_SIZE = 1000;
            for (let i = 0; i < records.length; i += BATCH_SIZE) {
                const batch = records.slice(i, i + BATCH_SIZE);
                await cds.transaction(req).run(INSERT.into(Accounting).entries(batch));
            }

            return { message: `${records.length} records inserted successfully` };
        } catch (error) {
            console.error('Error inserting records:', error);
            req.error(500, 'Failed to insert records');
        }
    });

    // Other actions and handlers...
});
*/
/*const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

// Define the service implementation
module.exports = cds.service.impl(async function() {
    const { Accounting } = this.entities;

    // Define the 'accounting' action handler
    this.on('accounting', async (req) => {
        const records = req.data.records;

        if (!records || !Array.isArray(records)) {
            throw new Error('Invalid input. Expected an array of records.');
        }

        const tx = this.transaction(); // Use this.transaction() to get a transaction context

        try {
            // Insert records in batches
            const batchSize = 2000;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);

                const insertPromises = batch.map(record => {
                    const id = uuidv4(); // Generate unique ID for each record
                    return tx.run(
                        `INSERT INTO Accounting (ID, CompanyCode, FiscalYear, FiscalPeriod, AccountingDocument, LastChangeDate, AccountingDocumentType)
                        VALUES (
                            $1, $2, $3, $4, $5, $6, $7
                        )`,
                        [
                            id,
                            record.CompanyCode,
                            record.FiscalYear,
                            record.FiscalPeriod,
                            record.AccountingDocument,
                            record.LastChangeDate,
                            record.AccountingDocumentType
                        ]
                    );
                });

                await Promise.all(insertPromises);
                console.log(`Processed batch of ${batch.length} records.`);
            }

            await tx.commit(); // Commit the transaction
            return { message: 'Records inserted successfully.' };

        } catch (error) {
            await tx.rollback(); // Rollback the transaction in case of an error
            console.error('Error inserting records:', error);
            throw new Error('An error occurred while inserting records.');
        }
    });
});
//reethika
*/




/*
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    this.on('accounting', async (req) => {
        try {
            console.log('Starting accounting fetch action');
            
            // Connect to the external service
            const Accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
            const { Accounts, Accounting, Items } = this.entities;

            // Fetch data from the external service
            const query = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const res = await Accountingapi.run(query);

            if (!Array.isArray(res)) {
                console.error('Unexpected data format for fetch action:', res);
                return { message: 'No records found.' };
            }

            // Process Accounting records
            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());
            console.log('Grouped records:', groupedData);

            // Insert or update Accounting records
            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                console.log('Inserted new records into Accounting:', newRecords);
            } else {
                console.log('No new records to insert into Accounting.');
            }

            // Process Items records
            const recordsWithUUID = res.map(record => ({
                ...record,
                ID: uuidv4(),
                id: record.AccountingDocument
            }));

            const existingItemsRecords = await cds.run(
                SELECT.from(Items)
                    .columns('AccountingDocument')
                    .where({
                        AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                    })
            );

            const existingItemsMap = new Map();
            existingItemsRecords.forEach(record => {
                existingItemsMap.set(record.AccountingDocument, record);
            });

            const newItemsRecords = recordsWithUUID.filter(record => {
                return !existingItemsMap.has(record.AccountingDocument);
            });

            if (newItemsRecords.length > 0) {
                await cds.run(UPSERT.into(Items).entries(newItemsRecords));
                console.log('Upserted records with UUIDs into Items:', newItemsRecords);
            } else {
                console.log('No new records to upsert into Items.');
            }

            // Handle LGSTTaxItem processing
            let lastsyncdate1 = await cds.run(
                SELECT.one.from(Accounting).columns('LastChangeDate').orderBy('LastChangeDate desc')
            );

            let counttaxdocs;

            if (lastsyncdate1 && lastsyncdate1.LastChangeDate) {
                const taxlastsyncdatetime = lastsyncdate1.LastChangeDate.toISOString();
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetimeoffset'${taxlastsyncdatetime}'`
                });
            } else {
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: 'A_OperationalAcctgDocItemCube/$count'
                });
            }

            console.log('Count of new tax documents:', counttaxdocs);

            // Process documents in batches
            function convertSAPDateToISO(dateString) {
                const timestamp = parseInt(dateString.match(/\d+/)[0], 10); // Extract the timestamp
                return new Date(timestamp).toISOString(); // Convert to ISO string
            }

            function removeDuplicateEntries(results) {
                const uniqueResults = [];
                const seenIds = new Set();

                for (const item of results) {
                    if (!seenIds.has(item.ID)) {
                        uniqueResults.push(item);
                        seenIds.add(item.ID);
                    }
                }

                return uniqueResults;
            }

            for (let i = 0; i < counttaxdocs; i += 5000) {
                const taxdocitemsQuery = {
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube?$skip=${i}&$top=5000`
                };

                let results = await Accountingapi.send(taxdocitemsQuery);

                results = results.map(item => {
                    // Ensure LastChangeDate is in ISO format
                    if (item.LastChangeDate) {
                        item.LastChangeDate = convertSAPDateToISO(item.LastChangeDate);
                    }

                    // Ensure ID is not null
                    if (!item.ID) {
                        item.ID = generateUniqueID(item); // Optionally generate a unique ID if missing
                    }

                    return item;
                });

                // Remove duplicate entries
                results = removeDuplicateEntries(results);

                if (results.length > 0) {
                    console.log(`Processing Batch ${i} of ${counttaxdocs}`);
                    await cds.run(UPSERT.into(Accounting).entries(results));
                } else {
                    console.log(`Skipping Batch ${i} due to missing or duplicate IDs`);
                }
            }

            function generateUniqueID(item) {
                return `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}-${item.FiscalPeriod}`;
            }

            return 'Data fetched and processed successfully.';
        } catch (error) {
            console.error('Error in fetch action:', error);
            throw error;
        }
    });
    
        this.on('insertBatchData', async (req) => {
            const data = req.data; // Data passed from the client
    
            if (!data || !Array.isArray(data)) {
                throw new Error('Invalid data for insertion.');
            }
    
            const tx = cds.transaction(req);
            try {
                // Insert data in batches
                const batchSize = 500;
                for (let i = 0; i < data.length; i += batchSize) {
                    const batch = data.slice(i, i + batchSize);
                    await tx.run(INSERT.into('Accounting').entries(batch));
                }
                return { message: 'Data inserted successfully' };
            } catch (error) {
                console.error('Error inserting batch data:', error);
                throw new Error('Failed to insert batch data.');
            }
        });
    });

*/
/*
//annapurna code
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    const accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    const { Accounts, Accounting, Items } = this.entities;

    this.on('accounting', async (req) => {
        console.log("Button clicked");

        // Query the latest LastChangeDate from the local database for Accounting
        const lastSyncRecordAccounting = await cds.run(
            SELECT.one.columns('LastChangeDate')
                .from(Accounting)
                .orderBy('LastChangeDate desc')
        );

        // Query the latest LastChangeDate from the local database for Items
        const lastSyncRecordDocItems = await cds.run(
            SELECT.one.columns('LastChangeDate')
                .from(Items)
                .orderBy('LastChangeDate desc')
        );

        let totalRecordsCountAccounting;
        let totalRecordsCountDocItems;
        let totalRecords = 0;  // Initialize totalRecords to keep track of all processed records

        // Determine if this is an initial load or filtered load for Accounting
        if (lastSyncRecordAccounting && lastSyncRecordAccounting.LastChangeDate) {
            let lastSyncDate = lastSyncRecordAccounting.LastChangeDate.slice(0, -1);  // Remove the 'Z'

            totalRecordsCountAccounting = await accountingapi.send({
                method: 'GET',
                path: `/A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetime'${lastSyncDate}'`
            });
        } else {
            totalRecordsCountAccounting = await accountingapi.send({
                method: 'GET',
                path: "/A_OperationalAcctgDocItemCube/$count"
            });
        }

        const batchSize = 5000;
        let startIndexAccounting = 0;

        // Process Accounting in batches
        while (startIndexAccounting < totalRecordsCountAccounting) {
            let batchQueryAccounting = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'LastChangeDate')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' })
                .limit(batchSize, startIndexAccounting);

            if (lastSyncRecordAccounting && lastSyncRecordAccounting.LastChangeDate) {
                batchQueryAccounting = batchQueryAccounting.and({ LastChangeDate: { '>': lastSyncRecordAccounting.LastChangeDate } });
            }

            const batchResultsAccounting = await accountingapi.run(batchQueryAccounting);
            console.log(`Processing batch starting at index ${startIndexAccounting} of ${totalRecordsCountAccounting} Accounting records`);

            const groupMapAccounting = new Map();
            batchResultsAccounting.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMapAccounting.has(groupKey)) {
                    item.ID = uuidv4();  // Assign a unique ID
                    groupMapAccounting.set(groupKey, item);  // Store one record per group
                }
            });

            const groupedDataAccounting = [];
            groupMapAccounting.forEach(group => groupedDataAccounting.push(group));

            // Insert records into the local database
            if (groupedDataAccounting.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(groupedDataAccounting));
                totalRecords += groupedDataAccounting.length;  // Update totalRecords
            }

            startIndexAccounting += batchSize;  // Move to the next batch
        }

        console.log('All batches processed successfully for Accounting.');

        // Now handle Items
        let startIndexDocItems = 0;

        // Determine if this is an initial load or filtered load for Items
        if (lastSyncRecordDocItems && lastSyncRecordDocItems.LastChangeDate) {
            let lastSyncDate = lastSyncRecordDocItems.LastChangeDate.slice(0, -1);  // Remove the 'Z'

            totalRecordsCountDocItems = await accountingapi.send({
                method: 'GET',
                path: `/A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetime'${lastSyncDate}'`
            });
        } else {
            totalRecordsCountDocItems = await accountingapi.send({
                method: 'GET',
                path: "/A_OperationalAcctgDocItemCube/$count"
            });
        }

        // Process Items in batches
        while (startIndexDocItems < totalRecordsCountDocItems) {
            let batchQueryDocItems = SELECT.from(Accounts)
                .columns('AccountingDocument', 'AccountingDocumentItem', 'TaxCode', 'GLAccount', 'TransactionTypeDetermination', 'CompanyCode', 'FiscalYear', 'AmountInCompanyCodeCurrency', 'LastChangeDate')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' })
                .limit(batchSize, startIndexDocItems);

            if (lastSyncRecordDocItems && lastSyncRecordDocItems.LastChangeDate) {
                batchQueryDocItems = batchQueryDocItems.and({ LastChangeDate: { '>': lastSyncRecordDocItems.LastChangeDate } });
            }

            const batchResultsDocItems = await accountingapi.run(batchQueryDocItems);
            console.log(`Processing batch starting at index ${startIndexDocItems} of ${totalRecordsCountDocItems} Items records`);

            const groupMapDocItems = new Map();
            batchResultsDocItems.forEach(item => {
                const groupKey = `${item.AccountingDocument}-${item.AccountingDocumentItem}-${item.CompanyCode}-${item.FiscalYear}`;
                if (!groupMapDocItems.has(groupKey)) {
                    item.ID = uuidv4();  // Assign a unique ID
                    groupMapDocItems.set(groupKey, item);  // Store one record per group
                }
            });

            const groupedDataDocItems = [];
            groupMapDocItems.forEach(group => groupedDataDocItems.push(group));

            // Insert records into the local database
            if (groupedDataDocItems.length > 0) {
                await cds.run(UPSERT.into(Items).entries(groupedDataDocItems));
                totalRecords += groupedDataDocItems.length;  // Update totalRecords
            }

            startIndexDocItems += batchSize;  // Move to the next batch
        }

        console.log('All batches processed successfully for Items.');
        console.log(`Total records processed: ${totalRecords}`);  // Log the totalRecords count
    });
});

*/

/*
//my code
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    this.on('accounting', async (req) => {
        try {
            console.log('Starting accounting fetch action');
            
            // Connect to the external service
            const Accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
            const { Accounts, Accounting, Items } = this.entities;

            // Fetch data from the external service
            const query = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });

            const res = await Accountingapi.run(query);

            if (!Array.isArray(res)) {
                console.error('Unexpected data format for fetch action:', res);
                return { message: 'No records found.' };
            }

            // Process Accounting records
            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);
                }
            });

            const groupedData = Array.from(groupMap.values());
            console.log('Grouped records:', groupedData);

            // Insert or update Accounting records
            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                console.log('Inserted new records into Accounting:', newRecords);
            } else {
                console.log('No new records to insert into Accounting.');
            }

            // Process Items records
            const recordsWithUUID = res.map(record => ({
                ...record,
                ID: uuidv4(),
                id: record.AccountingDocument
            }));

            const existingItemsRecords = await cds.run(
                SELECT.from(Items)
                    .columns('AccountingDocument')
                    .where({
                        AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                    })
            );

            const existingItemsMap = new Map();
            existingItemsRecords.forEach(record => {
                existingItemsMap.set(record.AccountingDocument, record);
            });

            const newItemsRecords = recordsWithUUID.filter(record => {
                return !existingItemsMap.has(record.AccountingDocument);
            });

            if (newItemsRecords.length > 0) {
                await cds.run(UPSERT.into(Items).entries(newItemsRecords));
                console.log('Upserted records with UUIDs into Items:', newItemsRecords);
            } else {
                console.log('No new records to upsert into Items.');
            }

            // Handle LGSTTaxItem processing
            let lastsyncdate1 = await cds.run(
                SELECT.one.from(Accounting).columns('LastChangeDate').orderBy('LastChangeDate desc')
            );

            let counttaxdocs;

            if (lastsyncdate1 && lastsyncdate1.LastChangeDate) {
                const taxlastsyncdatetime = lastsyncdate1.LastChangeDate.toISOString();
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetimeoffset'${taxlastsyncdatetime}'`
                });
            } else {
                counttaxdocs = await Accountingapi.send({
                    method: 'GET',
                    path: 'A_OperationalAcctgDocItemCube/$count'
                });
            }

            console.log('Count of new tax documents:', counttaxdocs);

            // Process documents in batches
            function convertSAPDateToISO(dateString) {
                const timestamp = parseInt(dateString.match(/\d+/)[0], 10); // Extract the timestamp
                return new Date(timestamp).toISOString(); // Convert to ISO string
            }

            function removeDuplicateEntries(results) {
                const uniqueResults = [];
                const seenIds = new Set();

                for (const item of results) {
                    if (!seenIds.has(item.ID)) {
                        uniqueResults.push(item);
                        seenIds.add(item.ID);
                    }
                }

                return uniqueResults;
            }

            for (let i = 0; i < counttaxdocs; i += 5000) {
                const taxdocitemsQuery = {
                    method: 'GET',
                    path: `A_OperationalAcctgDocItemCube?$skip=${i}&$top=5000`
                };

                let results = await Accountingapi.send(taxdocitemsQuery);

                results = results.map(item => {
                    // Ensure LastChangeDate is in ISO format
                    if (item.LastChangeDate) {
                        item.LastChangeDate = convertSAPDateToISO(item.LastChangeDate);
                    }

                    // Ensure ID is not null
                    if (!item.ID) {
                        item.ID = generateUniqueID(item); // Optionally generate a unique ID if missing
                    }

                    return item;
                });

                // Remove duplicate entries
                results = removeDuplicateEntries(results);

                if (results.length > 0) {
                    console.log(`In Batch ${i} of ${counttaxdocs} records`);
                    await cds.run(UPSERT.into(Accounting).entries(results));
                } else {
                    console.log(`Skipping Batch ${i} due to missing or duplicate IDs`);
                }
            }

            function generateUniqueID(item) {
                return `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}-${item.FiscalPeriod}`;
            }

            return 'Data fetched and processed successfully.';
        } catch (error) {
            console.error('Error in fetch action:', error);
            throw error;
        }
    });
});
*/
/*
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid'); // Import UUID library
module.exports = cds.service.impl(async function() {
    const accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    const { Accounting, Accounts, Items} = this.entities; // Use local entities

    this.on('READ', 'Accounts', async req => {
        const query = req.query
            .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
            .and({ CompanyCodeCurrency: 'INR' });
        const result = await accountingapi.run(query);
        return result;
    });

    this.before('READ', 'Accounting', async req => {
        // Select data from Accounts
        const query = SELECT.from(Accounts)
            .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType')
            .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
            .and({ CompanyCodeCurrency: 'INR' });

            const res = await accountingapi.run(query);
            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);  // Store only one record per group
                }
            });

            const groupedData = [];
            groupMap.forEach(group => groupedData.push(group));
            console.log('Grouped records:', groupedData);

            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                //console.log('Inserted new records:', newRecords);
            } else {
                //console.log('No new records to insert.');
            }

    });

    const { v4: uuidv4 } = require('uuid'); // Import UUID library

    this.before('READ', 'Items', async (req) => {
        // Fetch records from the source
        const query = SELECT.from(Accounts)
            .columns('AccountingDocument', 'AccountingDocumentItem', 'TaxCode', 'GLAccount', 'TransactionTypeDetermination', 'CompanyCode', 'FiscalYear')
            .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
            .and({ CompanyCodeCurrency: 'INR' });

        const sourceRecords = await accountingapi.run(query);
        console.log('Fetched records:', sourceRecords);

        // Add UUID to each record
        const recordsWithUUID = sourceRecords.map(record => ({
            ...record,
            ID: uuidv4() // Generate UUID for each record
        }));

        // Fetch existing records from the Items table
        const existingRecords = await cds.run(
            SELECT.from(Items)
                .columns('AccountingDocument', 'AccountingDocumentItem', 'CompanyCode', 'FiscalYear')
                .where({
                    AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) },
                    AccountingDocumentItem: { in: recordsWithUUID.map(r => r.AccountingDocumentItem) },
                    CompanyCode: { in: recordsWithUUID.map(r => r.CompanyCode) },
                    FiscalYear: { in: recordsWithUUID.map(r => r.FiscalYear) }
                })
        );

        // Convert existing records to a map for fast lookup
        const existingMap = new Map();
        existingRecords.forEach(record => {
            const key = `${record.AccountingDocument}-${record.AccountingDocumentItem}-${record.CompanyCode}-${record.FiscalYear}`;
            existingMap.set(key, record);
        });

        // Filter out records that already exist in the table
        const newRecords = recordsWithUUID.filter(record => {
            const key = `${record.AccountingDocument}-${record.AccountingDocumentItem}-${record.CompanyCode}-${record.FiscalYear}`;
            return !existingMap.has(key);
        });

        if (newRecords.length > 0) {
            // Perform the UPSERT operation
            await cds.run(UPSERT.into(Items).entries(newRecords));
            console.log('Upserted records with UUIDs:', newRecords);
        } else {
            console.log('No new records to upsert.');
        }
    });


     // Define the fetch action
     this.on('accounting', async (req) => {
        try {
            // Fetch data from the external service
            const query = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'TaxCode', 'GLAccount')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' });
    
            const res = await accountingapi.run(query);
    
            if (!Array.isArray(res)) {
                console.error('Unexpected data format for accounting action:', res);
                return { message: 'No records found.' };
            }
    
            // Process Accounting records
            await processAccountingRecords(res);
    
            // Process Items records
            await processItemsRecords(res);
    
            // Handle LGSTTaxItem processing
            await handleLGSTTaxItem();
    
            return { message: 'Accounting action completed successfully.' };
        } catch (error) {
            console.error('Error in accounting action:', error);
            throw error;
        }
    });
    
    async function processAccountingRecords(res) {
        const groupMap = new Map();
        res.forEach(item => {
            const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
            if (!groupMap.has(groupKey)) {
                item.ID = uuidv4();
                groupMap.set(groupKey, item);
            }
        });
    
        const groupedData = Array.from(groupMap.values());
        console.log('Grouped records for accounting action:', groupedData);
    
        const existingRecords = await cds.run(
            SELECT.from(Accounting)
                .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                .where({
                    CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                    FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                    AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                })
        );
    
        const newRecords = groupedData.filter(groupedRecord => {
            return !existingRecords.some(existingRecord =>
                existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                existingRecord.AccountingDocument === groupedRecord.AccountingDocument
            );
        });
    
        if (newRecords.length > 0) {
            await cds.run(UPSERT.into(Accounting).entries(newRecords));
            console.log('Inserted new records into Accounting via accounting action:', newRecords);
        } else {
            console.log('No new records to insert into Accounting via accounting action.');
        }
    }
    
    async function processItemsRecords(res) {
        const recordsWithUUID = res.map(record => ({
            ...record,
            ID: uuidv4(),
            id: record.AccountingDocument
        }));
    
        const existingItemsRecords = await cds.run(
            SELECT.from(Items)
                .columns('AccountingDocument')
                .where({
                    AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) }
                })
        );
    
        const existingItemsMap = new Map();
        existingItemsRecords.forEach(record => {
            existingItemsMap.set(record.AccountingDocument, record);
        });
    
        const newItemsRecords = recordsWithUUID.filter(record => {
            return !existingItemsMap.has(record.AccountingDocument);
        });
    
        if (newItemsRecords.length > 0) {
            await cds.run(UPSERT.into(Items).entries(newItemsRecords));
            console.log('Upserted records with UUIDs into Items via accounting action:', newItemsRecords);
        } else {
            console.log('No new records to upsert into Items via accounting action.');
        }
    }
    
    async function handleLGSTTaxItem() {
        let lastsyncdate1 = await cds.run(
            SELECT.one.from(Accounting).columns('LastChangeDate').orderBy('LastChangeDate desc')
        );
    
        let counttaxdocs;
    
        if (lastsyncdate1 && lastsyncdate1.LastChangeDate) {
            const taxlastsyncdatetime = lastsyncdate1.LastChangeDate.toISOString();
            counttaxdocs = await accountingapi.send({
                method: 'GET',
                path: `A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetimeoffset'${taxlastsyncdatetime}'`
            });
        } else {
            counttaxdocs = await accountingapi.send({
                method: 'GET',
                path: 'A_OperationalAcctgDocItemCube/$count'
            });
        }
    
        console.log('Count of new tax documents:', counttaxdocs);
    
        // Fetch and process GST tax items if needed
        // Implement further processing as required...
    }
})
*/


/*
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid'); // Import UUID library

module.exports = cds.service.impl(async function() {
    const accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    const { Accounting, Accounts, Items } = this.entities; // Only use local entities

   

    this.on('loaddata', async (req) => {
        try {
            console.log("Button clicked");
            // Add your data processing logic here
            // Example: const result = await someFunction();
            return true; // Return appropriate result
        } catch (error) {
            console.error("Error in loaddata action:", error);
            return false; // Indicate failure
        }
    });
    
   
    
    
    
    
    
    
});


*/

/**let lastsyncdate1 = await cds.run(SELECT.one.columns('LastChangeDate').from(Accounting).orderBy('LastChangeDate desc'));
        if(lastsyncdate1){
            let taxlastsyncdatetime=lastsyncdate1.LastChangeDate;
            counttaxdocs = await accountingapi.send({method:'GET', path: "YY1_GSTAcctgTaxItm/$count?$filter=LastChangeDate gt datetimeoffset'"+taxlastsyncdatetime+"'"})    
        }else{
            counttaxdocs = await accountingapi.send({method:'GET', path: "YY1_GSTAcctgTaxItm/$count"})    
            taxdocqry = SELECT.from(Accounts);
        
        }
            
taxdocitems = []
        for(i=0;i<counttaxdocs;i=i+5000){
            taxdocqry = taxdocqry.limit(5000,i);
            let results = await accountingapi.run(taxdocqry);
            console.log("In Batch ",i," of ",counttaxdocs, " records");
            await cds.run(UPSERT.into(Accounting).entries(results));
            //taxdocitems.push(...results);
        }
            
*/
/*const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid'); // Import UUID library
module.exports = cds.service.impl(async function() {
    const accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    const { Accounting, Accounts, Items} = this.entities; // Use local entities

    this.on('READ', 'Accounts', async req => {
        const query = req.query
            .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
            .and({ CompanyCodeCurrency: 'INR' });
        const result = await accountingapi.run(query);
        return result;
    });

    this.before('READ', 'Accounting', async req => {
        // Select data from Accounts
        const query = SELECT.from(Accounts)
            .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType')
            .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
            .and({ CompanyCodeCurrency: 'INR' });
    
            const res = await accountingapi.run(query);
            const groupMap = new Map();
            res.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMap.has(groupKey)) {
                    item.ID = uuidv4();
                    groupMap.set(groupKey, item);  // Store only one record per group
                }
            });

            const groupedData = [];
            groupMap.forEach(group => groupedData.push(group));
            console.log('Grouped records:', groupedData);
        
            const existingRecords = await cds.run(
                SELECT.from(Accounting)
                    .columns('CompanyCode', 'FiscalYear', 'AccountingDocument')
                    .where({
                        CompanyCode: { in: groupedData.map(r => r.CompanyCode) },
                        FiscalYear: { in: groupedData.map(r => r.FiscalYear) },
                        AccountingDocument: { in: groupedData.map(r => r.AccountingDocument) }
                    })
            );

            const newRecords = groupedData.filter(groupedRecord => {
                return !existingRecords.some(existingRecord =>
                    existingRecord.CompanyCode === groupedRecord.CompanyCode &&
                    existingRecord.FiscalYear === groupedRecord.FiscalYear &&
                    existingRecord.AccountingDocument === groupedRecord.AccountingDocument
                );
            });

            if (newRecords.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(newRecords));
                //console.log('Inserted new records:', newRecords);
            } else {
                //console.log('No new records to insert.');
            }
      
    });

    const { v4: uuidv4 } = require('uuid'); // Import UUID library

    this.before('READ', 'Items', async (req) => {
        // Fetch records from the source
        const query = SELECT.from(Accounts)
            .columns('AccountingDocument', 'AccountingDocumentItem', 'TaxCode', 'GLAccount', 'TransactionTypeDetermination', 'CompanyCode', 'FiscalYear')
            .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
            .and({ CompanyCodeCurrency: 'INR' });
    
        const sourceRecords = await accountingapi.run(query);
        console.log('Fetched records:', sourceRecords);
    
        // Add UUID to each record
        const recordsWithUUID = sourceRecords.map(record => ({
            ...record,
            ID: uuidv4() // Generate UUID for each record
        }));
    
        // Fetch existing records from the Items table
        const existingRecords = await cds.run(
            SELECT.from(Items)
                .columns('AccountingDocument', 'AccountingDocumentItem', 'CompanyCode', 'FiscalYear')
                .where({
                    AccountingDocument: { in: recordsWithUUID.map(r => r.AccountingDocument) },
                    AccountingDocumentItem: { in: recordsWithUUID.map(r => r.AccountingDocumentItem) },
                    CompanyCode: { in: recordsWithUUID.map(r => r.CompanyCode) },
                    FiscalYear: { in: recordsWithUUID.map(r => r.FiscalYear) }
                })
        );
    
        // Convert existing records to a map for fast lookup
        const existingMap = new Map();
        existingRecords.forEach(record => {
            const key = `${record.AccountingDocument}-${record.AccountingDocumentItem}-${record.CompanyCode}-${record.FiscalYear}`;
            existingMap.set(key, record);
        });
    
        // Filter out records that already exist in the table
        const newRecords = recordsWithUUID.filter(record => {
            const key = `${record.AccountingDocument}-${record.AccountingDocumentItem}-${record.CompanyCode}-${record.FiscalYear}`;
            return !existingMap.has(key);
        });
    
        if (newRecords.length > 0) {
            // Perform the UPSERT operation
            await cds.run(UPSERT.into(Items).entries(newRecords));
            console.log('Upserted records with UUIDs:', newRecords);
        } else {
            console.log('No new records to upsert.');
        }
    });
    
        
       
        
        
        
        
});
*/