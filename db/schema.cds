namespace com.satinfotech.cloudapps;
using {cuid} from '@sap/cds/common';

entity Accounting: cuid{
    
    @title: 'CompanyCode'
    
    key CompanyCode: String(20);
    @title: 'FiscalYear'
   
    FiscalYear: String(4);
    @title: 'FiscalPeriod'
   
    FiscalPeriod: String(3);
    @title: 'PostingDate'
   PostingDate: String(10);
    @title: 'AccountingDocument'
    AccountingDocument: String(15);
    @title: 'AccountingDocumentType'
    AccountingDocumentType: String(15);
    @title: 'DocumentReferenceID'
    DocumentReferenceID: String(15);
    @title: 'Customer GSTN'
    CustomerGSTN: String(10);
    @title: 'SupplierGSTN'
    SupplierGSTN: String(10);
    Items : Composition of many Items on Items.id=$self;
}
entity Items : cuid {
     key ID : UUID;
     id:Association to Accounting;
    @title: 'lineno'
    lineno: String(50);
    @title: 'AccountingDocument'
    AccountingDocument: String(50);
    @title: 'HSN'
    HSN: String(50);
     @title: 'GLAccount'
   GLAccount: String(50);
   @title: 'DocumentText'
   DocumentText: String(50);
   @title: 'GSTkey'
   GSTkey: String(50);
   @title: 'POS'
   POS: String(50);
   @title: 'TaxCode'
   TaxCode: String(50);
   @title: 'TaxItemAccDoc'
   TaxItemAccDoc: String(50);
   @title: 'GLAccount'
   AccountingDocumentID: String(50);
   

}