using {com.satinfotech.cloudapps as db} from '../db/schema';
service accountsrv{  
    entity Accounting as projection on db.Accounting{
         @UI.Hidden: true
        ID,
        *
    };
}
annotate accountsrv.Accounting @odata.draft.enabled;
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
            Label: 'PostingDate',
            Value: PostingDate
        },
         {
            Label: 'AccountingDocument',
            Value: AccountingDocument
        }
,
         {
            Label: 'AccountingDocumentType',
            Value: AccountingDocumentType
        },
        {
            Label: 'DocumentReferenceID',
            Value: DocumentReferenceID
        },
        
         {
            Label: 'CustomerGSTN',
            Value: CustomerGSTN
        },
        {
            Label: 'SupplierGSTN',
            Value: SupplierGSTN
        }
        
    ],
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
            Label: 'PostingDate',
            Value: PostingDate
        },
         {
            Label: 'AccountingDocument',
            Value: AccountingDocument
        }
,
         {
            Label: 'AccountingDocumentType',
            Value: AccountingDocumentType
        },
        {
            Label: 'DocumentReferenceID',
            Value: DocumentReferenceID
        },
         {
            Label: 'CustomerGSTN',
            Value: CustomerGSTN
        },
        {
            Label: 'SupplierGSTN',
            Value: SupplierGSTN
        }
        

        ]
    },
    UI.Facets: [
        {
            $Type: 'UI.ReferenceFacet',
            ID: 'hospitalFacet',
            Label: 'hospital Facets',
            Target: '@UI.FieldGroup#account'
        }
       ,
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
            
            Label: 'lineno',
            Value: lineno

        },
         {
            Label: 'AccountingDocument',
            Value:  AccountingDocument
        },
        {
            Label: 'HSN',
            Value: HSN
        },
        {
            Label: 'GLAccount',
            Value: GLAccount
        },
        {
            Label: 'DocumentText',
            Value: DocumentText
        },
        {
            Label: 'GSTkey',
            Value: GSTkey
        },
        {
            Label: 'POS',
            Value: POS
        },
        {
            Label: 'TaxCode',
            Value: TaxCode
        },
        {
            Label: 'TaxItemAccDoc',
            Value: TaxItemAccDoc
        },
        {
            Label: 'AccountingDocumentID',
            Value: AccountingDocumentID
        },
    ],
    UI.FieldGroup #Items : {
        $Type : 'UI.FieldGroupType',
        Data : [
           
        {
            
            Label: 'lineno',
            Value: lineno

        },
         {
            Label: 'AccountingDocument',
            Value:  AccountingDocument
        },
        {
            Label: 'HSN',
            Value: HSN
        },
        {
            Label: 'GLAccount',
            Value: GLAccount
        },
        {
            Label: 'DocumentText',
            Value: DocumentText
        },
        {
            Label: 'GSTkey',
            Value: GSTkey
        },
        {
            Label: 'POS',
            Value: POS
        },
        {
            Label: 'TaxCode',
            Value: TaxCode
        },
        {
            Label: 'TaxItemAccDoc',
            Value: TaxItemAccDoc
        },
        {
            Label: 'AccountingDocumentID',
            Value: AccountingDocumentID
        },
         
       
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'DoctorFacet',
            Label : 'Doctors',
            Target : '@UI.FieldGroup#Items',
        },
    ],
);
