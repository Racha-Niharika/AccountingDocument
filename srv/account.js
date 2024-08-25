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


/*
//annapurna code
const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

module.exports = cds.service.impl(async function () {
    const accountingapi = await cds.connect.to('API_OPLACCTGDOCITEMCUBE_SRV');
    const { Accounts, Accounting, Items } = this.entities;

    this.on('accounting', async (req) => {
        console.log("Button clicked");

        // Query the latest LastChangeDate from the local database for accdoc
        const lastSyncRecordAccdoc = await cds.run(
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

        let totalRecordsCountAccdoc;
        let totalRecordsCountDocItems;
        let totalRecords = 0;  // Initialize totalRecords to keep track of all processed records

        // Determine if this is an initial load or filtered load for accdoc
        if (lastSyncRecordAccdoc && lastSyncRecordAccdoc.LastChangeDate) {
            let lastSyncDate = lastSyncRecordAccdoc.LastChangeDate.slice(0, -1);  // Remove the 'Z'

            totalRecordsCountAccdoc = await accountingapi.send({
                method: 'GET',
                path: `/A_OperationalAcctgDocItemCube/$count?$filter=LastChangeDate gt datetime'${lastSyncDate}'`
            });
        } else {
            totalRecordsCountAccdoc = await accountingapi.send({
                method: 'GET',
                path: "/A_OperationalAcctgDocItemCube/$count"
            });
        }

        const batchSize = 5000;
        let startIndexAccdoc = 0;

        // Process accdoc in batches
        while (startIndexAccdoc < totalRecordsCountAccdoc) {
            let batchQueryAccdoc = SELECT.from(Accounts)
                .columns('CompanyCode', 'FiscalYear', 'FiscalPeriod', 'AccountingDocument', 'AccountingDocumentType', 'LastChangeDate')
                .where({ AccountingDocumentType: { in: ['RV', 'RE', 'DR', 'KR', 'DG', 'KG'] } })
                .and({ CompanyCodeCurrency: 'INR' })
                .limit(batchSize, startIndexAccdoc);

            if (lastSyncRecordAccdoc && lastSyncRecordAccdoc.LastChangeDate) {
                batchQueryAccdoc = batchQueryAccdoc.and({ LastChangeDate: { '>': lastSyncRecordAccdoc.LastChangeDate } });
            }

            const batchResultsAccdoc = await accountingapi.run(batchQueryAccdoc);
            console.log(`Processing batch starting at index ${startIndexAccdoc} of ${totalRecordsCountAccdoc} Accounting records`);

            const groupMapAccdoc = new Map();
            batchResultsAccdoc.forEach(item => {
                const groupKey = `${item.CompanyCode}-${item.FiscalYear}-${item.AccountingDocument}`;
                if (!groupMapAccdoc.has(groupKey)) {
                    item.ID = uuidv4();  // Assign a unique ID
                    groupMapAccdoc.set(groupKey, item);  // Store one record per group
                }
            });

            const groupedDataAccdoc = [];
            groupMapAccdoc.forEach(group => groupedDataAccdoc.push(group));

            // Insert records into the local database
            if (groupedDataAccdoc.length > 0) {
                await cds.run(UPSERT.into(Accounting).entries(groupedDataAccdoc));
                totalRecords += groupedDataAccdoc.length;  // Update totalRecords
            }

            startIndexAccdoc += batchSize;  // Move to the next batch
        }

        console.log('All batches processed successfully for accdoc.');

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