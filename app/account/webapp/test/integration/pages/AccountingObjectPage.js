sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'account',
            componentId: 'AccountingObjectPage',
            contextPath: '/Accounting'
        },
        CustomPageDefinitions
    );
});