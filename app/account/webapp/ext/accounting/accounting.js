/*
sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator"
], function(MessageToast, BusyIndicator) {
    'use strict';

    return {
        loadData: function(oBindingContext, aSelectedContexts) {
            MessageToast.show("Custom handler invoked.");

            // Debugging: Log the binding context and selected contexts
            console.log("oBindingContext: ", oBindingContext);
            console.log("aSelectedContexts: ", aSelectedContexts);

            // Check if the selected contexts array is valid
            if (aSelectedContexts && aSelectedContexts.length > 0 && aSelectedContexts[0]) {
                const context = aSelectedContexts[0]; // First selected context
                
                // Log the context to ensure it's valid
                console.log("Selected context: ", context);

                 // Check if editFlow is defined and has the invokeAction method
                if (this.editFlow && typeof this.editFlow.invokeAction === 'function') {
                    // Invoke the bound action with the selected context
                    this.editFlow.invokeAction('accountsrv/loaddata', {
                        contexts: [context] // Pass the context to the invokeAction
                    }).then(function(result) {
                        console.log("Action executed successfully.");
                        BusyIndicator.show();
                        console.log(result.value);
                        context.getModel().refresh();
                    }).catch(function(error) {
                        console.error("Error invoking action:", error);
                    }).finally(function() {
                        BusyIndicator.hide();
                    });
                } else {
                    console.error("editFlow or invokeAction is not available.");
                }

            } else {
                console.error("No context provided for the bound action.");
            }
        }
    };
});
*/

sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/model/odata/v2/ODataModel"
], function (MessageToast, ODataModel) {
    'use strict';

    return {
        accounting: async function (oEvent) {
            MessageToast.show("Fetching data...");
            try {
                // Create an OData Model with the service URL and headers
                const oModel = new ODataModel({
                    serviceUrl: "https://my401292-api.s4hana.cloud.sap/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/",
                    synchronizationMode: "None",
                    headers: {
                        'Authorization': 'Basic ' + btoa("USER_NNRG:FMesUvVB}JhYD9nVbDfRoVcdEffwmVNJJScMzuzx")
                    },
                    autoExpandSelect: true
                });

                let lastSyncDate;
                const metadataUrl = "https://my401292-api.s4hana.cloud.sap/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/$metadata";
                
                console.log('Fetching metadata from:', metadataUrl);
                
                const response = await fetch(metadataUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Basic ' + btoa("USER_NNRG:FMesUvVB}JhYD9nVbDfRoVcdEffwmVNJJScMzuzx")
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Network response was not ok. Status: ${response.status} - ${response.statusText}`);
                }
                
                const metadata = await response.text();
                console.log("Metadata fetched successfully:", metadata);
                
                let taxDocQuery = {
                    $filter: "",
                    $skip: 0
                };

                if (lastSyncDate) {
                    taxDocQuery.$filter = `LastChangeDate gt datetimeoffset'${lastSyncDate}'`;
                }

                const taxDocItems = [];
                const batchSize = 2000;

                while (true) {
                    const batchResults = await fetchDataInBatches(oModel, taxDocQuery, batchSize);
                    if (batchResults.length === 0) break;

                    taxDocItems.push(...batchResults);
                    taxDocQuery.$skip += batchSize;
                }

                await insertRecordsInBatches(taxDocItems);

                MessageToast.show('Data fetch and insertion completed successfully.');
            } catch (error) {
                console.error('Error during data fetch:', error);
                MessageToast.show('An error occurred while fetching data.');
            }
        }
    };

    async function fetchDataInBatches(oModel, queryParams, batchSize) {
        return new Promise((resolve, reject) => {
            oModel.read("/A_OperationalAcctgDocItemCube", {
                urlParameters: {
                    $skip: queryParams.$skip,
                    $top: batchSize,
                    $filter: queryParams.$filter
                },
                success: function (data) {
                    resolve(data.results);
                },
                error: function (error) {
                    reject(error);
                }
            });
        });
    }

    async function insertRecordsInBatches(newRecords, batchSize = 2000) {
        if (newRecords.length === 0) {
            console.log('No new records to insert.');
            return;
        }

        for (let i = 0; i < newRecords.length; i += batchSize) {
            const batch = newRecords.slice(i, i + batchSize);
            console.log(`Processing batch of ${batch.length} records.`);

            try {
                const response = await fetch('http://localhost:3000/insert-records', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ records: batch })
                });

                if (!response.ok) {
                    throw new Error(`Server response was not ok. Status: ${response.status} - ${response.statusText}`);
                }

                console.log('Batch inserted successfully:', batch.length);
            } catch (error) {
                console.error('Error inserting batch:', error);
            }
        }
    }
});

