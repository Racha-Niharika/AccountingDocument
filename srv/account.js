
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



/**let lastsyncdate1 = await cds.run(SELECT.one.columns('JournalEntryLastChangeDateTime').from(LGSTTaxItem).orderBy('JournalEntryLastChangeDateTime desc'));
        if(lastsyncdate1){
            let taxlastsyncdatetime=lastsyncdate1.JournalEntryLastChangeDateTime;
            counttaxdocs = await gsttaxapi.send({method:'GET', path: "YY1_GSTAcctgTaxItm/$count?$filter=JournalEntryLastChangeDateTime gt datetimeoffset'"+taxlastsyncdatetime+"'"})    
        }else{
            counttaxdocs = await gsttaxapi.send({method:'GET', path: "YY1_GSTAcctgTaxItm/$count"})    
            taxdocqry = SELECT.from(GSTTaxItem);
        
        }
            
taxdocitems = []
        for(i=0;i<counttaxdocs;i=i+5000){
            taxdocqry = taxdocqry.limit(5000,i);
            let results = await gsttaxapi.run(taxdocqry);
            console.log("In Batch ",i," of ",counttaxdocs, " records");
            await cds.run(UPSERT.into(LGSTTaxItem).entries(results));
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
    
        // Fetch existing records from the AccountingDocumentItems table
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