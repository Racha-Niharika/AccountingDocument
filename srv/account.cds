using {com.satinfotech.cloudapps as db} from '../db/schema';
using {API_OPLACCTGDOCITEMCUBE_SRV as accountapi} from './external/API_OPLACCTGDOCITEMCUBE_SRV';
service accountsrv{  
    //entity Accounting as projection on db.Accounting;
      entity Items as projection on db.Items;
       //action syncAccountingData(); 
entity Accounts as projection on accountapi.A_OperationalAcctgDocItemCube{
        CompanyCode,
        FiscalYear,
        FiscalPeriod,
        AccountingDocument,
        AccountingDocumentItem,
        AccountingDocumentType,
        TaxCode,
        GLAccount,
        TransactionTypeDetermination,
        CompanyCodeCurrency,
         LastChangeDate
  }
   entity Accounting as projection on db.Accounting;
   action insertBatchData(data: array of accountsrv.Accounting);
   action accounting() returns String;
}
//annotate accountsrv.Accounting @odata.draft.enabled;
annotate accountsrv.Items @odata.draft.enabled;
annotate accountsrv.Accounting with @(
    UI.LineItem: [
       
        {
            Label: 'CompanyCode',
            Value: CompanyCode
        },
        {
            Label: 'FiscalYear',
            Value: FiscalYear
        },
        {
            Label: 'FiscalPeriod',
            Value: FiscalPeriod
        },
        {
            Label: 'AccountingDocument',
            Value: AccountingDocument
        },
         {
            Label: 'Document Type',
            Value: AccountingDocumentType
        },
{
            Label: 'LastChangeDate',
            Value: LastChangeDate
        },
         
    ],
     UI.SelectionFields: [ AccountingDocument , CompanyCode, FiscalYear],    
    UI.FieldGroup #account: {
        $Type: 'UI.FieldGroupType',
        Data: [
            {
            Label: 'CompanyCode',
            Value: CompanyCode
        },
        {
            Label: 'FiscalYear',
            Value: FiscalYear
        },
        {
            Label: 'FiscalPeriod',
            Value: FiscalPeriod
        },
        {
            Label: 'AccountingDocument',
            Value: AccountingDocument
        },
         {
            Label: 'AccountingDocumentType',
            Value: AccountingDocumentType
        }
       ,{
            Label: 'LastChangeDate',
            Value: LastChangeDate
        }
        

        ]
    },
    UI.Facets: [
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'hospitalFacet',
            Label: 'Account Document ',
            Target: '@UI.FieldGroup#account'
        },
        
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'ItemsFacet',
            Label: 'Items',
            Target:'Items/@UI.LineItem',
            
        }
        
    ]
);

annotate accountsrv.Items with @(
    UI.LineItem:[
      
    {
            Label: 'AccountingDocument',
            Value: AccountingDocument
        },
        {
            Label: 'AccountingDocumentItem',
            Value: AccountingDocumentItem
        },
        {
            Label: 'TaxCode',
            Value: TaxCode
        },
        {
            Label: 'GLAccount',
            Value: GLAccount
        },
        {
            Label: 'TransactionTypeDetermination',
            Value: TransactionTypeDetermination
        }
    ],
);
