sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/ui/core/BusyIndicator" // Import BusyIndicator
], function (MessageToast, ODataModel, Dialog, Button, Text, VBox, BusyIndicator) {
    'use strict';

    // Helper function to fetch data with retry logic
    async function fetchWithRetry(url, options, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    return response;
                } else {
                    throw new Error(`Network response was not ok. Status: ${response.status} - ${response.statusText}`);
                }
            } catch (error) {
                if (attempt === retries) {
                    throw error; // Throw the error if this was the last attempt
                }
                console.log(`Attempt ${attempt} failed, retrying...`);
                await new Promise(res => setTimeout(res, 1000)); // Wait before retrying
            }
        }
    }

    // Function to fetch data in batches
    async function fetchDataInBatches(oModel, queryParams, batchSize) {
        return new Promise((resolve, reject) => {
            oModel.read("/A_OperationalAcctgDocItemCube", {
                urlParameters: {
                    $skip: queryParams.$skip,
                    $top: batchSize,
                    $filter: queryParams.$filter,
                    $select: "CompanyCode,FiscalYear,FiscalPeriod,AccountingDocument,LastChangeDate,AccountingDocumentType"
                },
                success: function (data) {
                    console.log('Data fetched successfully:', data);
                    if (data && data.results) {
                        resolve(data.results);
                    } else {
                        resolve([]);
                    }
                },
                error: function (error) {
                    console.error('Error fetching data:', error);
                    reject(error);
                }
            });
        });
    }

    // Function to remove metadata from records
    function removeMetadata(obj) {
        if (obj && typeof obj === 'object') {
            delete obj.__metadata;
            for (const key in obj) {
                if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
                    removeMetadata(obj[key]);
                }
            }
        }
    }

    // Function to insert records in batches
    async function insertRecordsInBatches(newRecords, updateProgressCallback, batchSize = 2000) {
        if (!Array.isArray(newRecords) || newRecords.length === 0) {
            console.log('No new records to insert.');
            return;
        }

        let totalRecordsInserted = 0;
        let totalBatchesInserted = 0;

        for (let i = 0; i < newRecords.length; i += batchSize) {
            const batch = newRecords.slice(i, i + batchSize);

            batch.forEach(record => removeMetadata(record));

            if (batch.length > 0) {
                try {
                    const response = await fetch('/odata/v4/accountsrv/insertRecords', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ records: batch })
                    });

                    if (!response.ok) {
                        throw new Error(`Server response was not ok. Status: ${response.status} - ${response.statusText}`);
                    }

                    totalRecordsInserted += batch.length;
                    totalBatchesInserted++;
                    console.log('Batch inserted successfully:', batch.length);

                    if (updateProgressCallback) {
                        updateProgressCallback(batchSize, totalBatchesInserted, totalRecordsInserted);
                    }
                } catch (error) {
                    console.error('Error inserting batch:', error);
                }
            } else {
                console.log('Batch was empty. Skipping.');
            }
        }
    }

    return {
        accounting: async function (oEvent) {
            // Create a dialog to display progress
            if (!this._oProgressDialog) {
                this._oProgressDialog = new Dialog({
                    title: "Data Fetching Progress",
                    contentWidth: "200px",
                    contentHeight: "300px",
                    content: new VBox({
                        items: [
                            new Text({ text: "Total records: 13126", id: "totalRecordsText" }), // Static total record count
                            new Text({ text: "Fetched records: 0", id: "fetchedCountText" }),
                            new Text({ text: "Number of batches: 0", id: "batchCountText" }),
                            new Text({ text: "Inserted batches: 0", id: "insertedBatchCountText" }),
                            new Text({ text: "Records inserted: 0", id: "insertedRecordsText" })
                        ]
                    }),
                    beginButton: new Button({
                        text: "Close",
                        press: function () {
                            this._oProgressDialog.close();
                        }.bind(this)
                    })
                });

                this.getView().addDependent(this._oProgressDialog);
            }

            this._oProgressDialog.open();
            BusyIndicator.show(); // Show busy indicator

            try {
                const oModel = new ODataModel({
                    serviceUrl: "https://my401292-api.s4hana.cloud.sap/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/",
                    synchronizationMode: "None",
                    headers: {
                        'Authorization': 'Basic ' + btoa("USER_NNRG:FMesUvVB}JhYD9nVbDfRoVcdEffwmVNJJScMzuzx")
                    },
                    autoExpandSelect: true
                });

                const metadataUrl = "https://my401292-api.s4hana.cloud.sap/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV/$metadata";

                await fetchWithRetry(metadataUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Basic ' + btoa("USER_NNRG:FMesUvVB}JhYD9nVbDfRoVcdEffwmVNJJScMzuzx")
                    }
                });

                let taxDocQuery = {
                    $filter: "",
                    $skip: 0
                };

                const taxDocItems = [];
                const batchSize = 2000;
                let iTotalFetched = 0;
                let iBatchCount = 0;

                // Fetch data in batches
                while (true) {
                    const batchResults = await fetchDataInBatches(oModel, taxDocQuery, batchSize);
                    if (batchResults.length === 0) break;

                    taxDocItems.push(...batchResults);
                    iTotalFetched += batchResults.length;
                    iBatchCount++;
                    taxDocQuery.$skip += batchSize;

                    // Update dialog text
                    sap.ui.getCore().byId("fetchedCountText").setText("Fetched records: " + iTotalFetched);
                    sap.ui.getCore().byId("batchCountText").setText("Number of batches: " + iBatchCount);
                }

                // Insert records in batches
                await insertRecordsInBatches(taxDocItems, function (batchSize, batchCount, recordsInserted) {
                    sap.ui.getCore().byId("insertedBatchCountText").setText("Inserted batches: " + batchCount);
                    sap.ui.getCore().byId("insertedRecordsText").setText("Records inserted: " + recordsInserted);
                });

                MessageToast.show('Data fetch and insertion completed successfully.');
            } catch (error) {
                console.error('Error during data fetch:', error);
                MessageToast.show('An error occurred while fetching data.');
            } finally {
                BusyIndicator.hide(); // Hide busy indicator
                this._oProgressDialog.close();
            }
        }
    };
});







/*
sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox"
], function (MessageToast, BusyIndicator, Dialog, Button, Text, VBox) {
    'use strict';

    return {
        
        accounting: function () {
            // Create and open the dialog
            var oDialog = new Dialog({
                title: 'Fetching Records',
                content: [
                    new VBox({
                        items: [
                            new Text({ text: 'Fetching records from API, please wait...' })
                        ]
                    })
                ],
                beginButton: new Button({
                    text: 'Cancel',
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function() {
                    oDialog.destroy();
                }
            });

            oDialog.open();

            // Execute the accounting action
            $.ajax({
                url: "/odata/v4/accountsrv/accounting", 
                type: 'POST',
                contentType: "application/json",
                success: function (result) {
                    console.log("Action executed successfully.");
                    console.log(result); // This should contain the "YAYYYYYYYYYYYYYYYYY" string if your action is successful

                    // Close the dialog after successful execution
                    oDialog.close();
                },
                error: function (error) {
                    console.error("Error executing action:", error);

                    // Close the dialog on error as well
                    oDialog.close();
                }
            });
        }
    };
});
*/

/*sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox"
], function (MessageToast, BusyIndicator, Dialog, Button, Text, VBox) {
    'use strict';

    return {
        accounting: function () {
            var iBatchSize = 5000; // Number of records to fetch per batch
            var iOffset = 0; // Offset for batch processing
            var iTotalFetched = 0; // Total fetched records
            var iBatchCount = 0; // Number of batches fetched
            var lastSyncDate = "2024-01-01"; // Example lastSyncDate, set this to your required date

            // Create a dialog to display fetched data count and batch information
            if (!this._oDataDialog) {
                this._oDataDialog = new Dialog({
                    title: "Fetching Data",
                    contentWidth: "400px", // Set the width of the dialog
                    contentHeight: "300px", // Set the height of the dialog
                    content: new VBox({
                        items: [
                            new Text({ text: "Fetched records: 0", id: "fetchedCountText" }),
                            new Text({ text: "Number of batches: 0", id: "batchCountText" }) // Display batch count
                        ]
                    }),
                    beginButton: new Button({
                        text: "Close",
                        press: function () {
                            this._oDataDialog.close();
                        }.bind(this)
                    })
                });

                this.getView().addDependent(this._oDataDialog);
            }

            this._oDataDialog.open();
            BusyIndicator.show(0);

            // Perform the POST request first
            $.ajax({
                url: "/odata/v4/accountsrv/accounting",
                type: 'POST',
                contentType: "application/json",
                success: function (result) {
                    console.log("Action executed successfully.");
                    console.log(result); // This should contain the "YAYYYYYYYYYYYYYYYYY" string if your action is successful

                    // Start fetching data after the POST request succeeds
                    var fetchBatch = function () {
                        $.ajax({
                            url: "/odata/v4/accountsrv/Accounting",
                            type: 'GET',
                            data: {
                                $top: iBatchSize,
                                $skip: iOffset,
                                $filter: `LastChangeDate gt ${encodeURIComponent('2024-01-01')}` // Use DateTime format
                            },
                            success: function (result) {
                                iTotalFetched += result.value.length;
                                iBatchCount++; // Increment batch count

                                // Update the count and batch information in the dialog
                                sap.ui.getCore().byId("fetchedCountText").setText("Fetched records: " + iTotalFetched);
                                sap.ui.getCore().byId("batchCountText").setText("Number of batches: " + iBatchCount);

                                if (result.value.length === iBatchSize) {
                                    iOffset += iBatchSize;
                                    fetchBatch(); // Fetch the next batch
                                } else {
                                    MessageToast.show("All data fetched successfully.");
                                    BusyIndicator.hide();
                                    this._oDataDialog.close();
                                }
                            }.bind(this),
                            error: function (xhr, status, error) {
                                console.error("Error fetching data:", error);
                                MessageToast.show("Failed to fetch data.");
                                BusyIndicator.hide();
                            }
                        });
                    }.bind(this);
                    
                    fetchBatch(); // Start the batch fetching process
                }.bind(this),
                error: function (xhr, status, error) {
                    console.error("Error executing POST action:", error);
                    MessageToast.show("Failed to execute action.");
                    BusyIndicator.hide();
                }
            });
        }
    };
});
*/