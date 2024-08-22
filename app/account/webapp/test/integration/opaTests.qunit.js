sap.ui.require(
    [
        'sap/fe/test/JourneyRunner',
        'account/test/integration/FirstJourney',
		'account/test/integration/pages/AccountingList',
		'account/test/integration/pages/AccountingObjectPage',
		'account/test/integration/pages/ItemsObjectPage'
    ],
    function(JourneyRunner, opaJourney, AccountingList, AccountingObjectPage, ItemsObjectPage) {
        'use strict';
        var JourneyRunner = new JourneyRunner({
            // start index.html in web folder
            launchUrl: sap.ui.require.toUrl('account') + '/index.html'
        });

       
        JourneyRunner.run(
            {
                pages: { 
					onTheAccountingList: AccountingList,
					onTheAccountingObjectPage: AccountingObjectPage,
					onTheItemsObjectPage: ItemsObjectPage
                }
            },
            opaJourney.run
        );
    }
);