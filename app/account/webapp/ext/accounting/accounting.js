sap.ui.define([
    "sap/m/MessageToast",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox"
], function (MessageToast, ODataModel, Dialog, Button, Text, VBox) {
    'use strict';

    return {
        accounting: async function (oEvent) {
            // Create a dialog to display progress
            if (!this._oProgressDialog) {
                this._oProgressDialog = new Dialog({
                    title: "Data Fetching Progress",
                    contentWidth: "400px",
                    contentHeight: "300px",
                    content: new VBox({
                        items: [
                            new Text({ text: "Total records: 0", id: "totalRecordsText" }),
                            new Text({ text: "Fetched records: 0", id: "fetchedCountText" }),
                            new Text({ text: "Number of batches: 0", id: "batchCountText" }),
                            new Text({ text: "Total batches: 0", id: "totalBatchesText" }),
                            new Text({ text: "Remaining batches: 0", id: "remainingBatchesText" })
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
            MessageToast.show("Fetching data...");

            try {
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
                let iTotalFetched = 0;
                let iBatchCount = 0;
                let iTotalBatches;

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

                    const remainingBatches = iTotalBatches - iBatchCount;
                    sap.ui.getCore().byId("remainingBatchesText").setText("Remaining batches: " + remainingBatches);
                }

                await insertRecordsInBatches(taxDocItems);

                MessageToast.show('Data fetch and insertion completed successfully.');
            } catch (error) {
                console.error('Error during data fetch:', error);
                MessageToast.show('An error occurred while fetching data.');
            } finally {
                BusyIndicator.hide();
                this._oProgressDialog.close();
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
                    if (data && data.results) {
                        resolve(data.results);
                    } else {
                        resolve([]); // Handle unexpected structure
                    }
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