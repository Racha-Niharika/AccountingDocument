sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/ui/core/BusyIndicator",
    "sap/m/MessageBox"
], function (Controller, MessageToast, Dialog, Button, Text, VBox, BusyIndicator, MessageBox) {
    'use strict';

    return Controller.extend("account.ext.controller.ListReportExtension", {
        accounting: function (oEvent) {
            // Show a confirmation dialog before proceeding
            if (!this._pConfirmDialog) {
                this._pConfirmDialog = new Dialog({
                    title: "Confirm Action",
                    content: new Text({ text: "Do you want to proceed with fetching the accounting data?" }),
                    beginButton: new Button({
                        text: "Yes",
                        press: function () {
                            this._pConfirmDialog.close();
                            this._fetchAccountingDataInBatches(); // Fetch data in batches
                        }.bind(this)
                    }),
                    endButton: new Button({
                        text: "No",
                        press: function () {
                            this._pConfirmDialog.close();
                        }.bind(this)
                    })
                });

                // Add the dialog to the view
                this.getView().addDependent(this._pConfirmDialog);
            }

            // Open the confirmation dialog
            this._pConfirmDialog.open();
        },

        _fetchAccountingDataInBatches: function () {
            // Initialize variables for batch processing
            var iBatchSize = 50; // Number of records to fetch per batch
            var iOffset = 0; // Offset for batch processing
            var iTotalFetched = 0; // Total fetched records

            // Create a dialog to display fetched data count
            if (!this._oDataDialog) {
                this._oDataDialog = new Dialog({
                    title: "Fetching Data",
                    content: new VBox({
                        items: [
                            new Text({ text: "Fetching data in batches..." }),
                            new Text({ text: "Fetched records: 0", id: "fetchedCountText" }) // Display fetched count
                        ]
                    }),
                    beginButton: new Button({
                        text: "Close",
                        press: function () {
                            this._oDataDialog.close();
                        }.bind(this)
                    })
                });

                // Add the dialog to the view
                this.getView().addDependent(this._oDataDialog);
            }

            // Open the dialog and start fetching data in batches
            this._oDataDialog.open();
            BusyIndicator.show(0);

            // Function to fetch data in batches
            var fetchBatch = function () {
                jQuery.ajax({
                    url: "/odata/v4/accountsrv/Accounting", // Update with the correct URL
                    method: "GET",
                    data: {
                        $limit: iBatchSize,
                        $offset: iOffset
                    },
                    success: function (result) {
                        // Increment the total fetched records
                        iTotalFetched += result.value.length;

                        // Update the count in the dialog
                        sap.ui.getCore().byId("fetchedCountText").setText("Fetched records: " + iTotalFetched);

                        // Check if more data needs to be fetched
                        if (result.value.length === iBatchSize) {
                            iOffset += iBatchSize;
                            fetchBatch(); // Fetch the next batch
                        } else {
                            // All batches fetched
                            MessageToast.show("All data fetched successfully.");
                            BusyIndicator.hide();
                        }
                    },
                    error: function (xhr, status, error) {
                        // Handle errors
                        console.error("Error fetching data:", error);
                        MessageBox.error("Failed to fetch data.");
                        BusyIndicator.hide();
                    }
                });
            }.bind(this);

            fetchBatch(); // Start the batch fetching process
        }
    });
});
