namespace com.satinfotech.cloudapps;
using {managed,cuid} from '@sap/cds/common';

entity Accounting : cuid,managed{
    key ID:UUID;
    @title: 'CompanyCode'
    
    CompanyCode: String(20);
    @title: 'FiscalYear'
   
    FiscalYear: String(4);
    @title: 'FiscalPeriod'
   
    FiscalPeriod: String(10);
        
    @title: 'AccountingDocument'
    AccountingDocument: String(15);
    @title: ' LastChangeDate'
    LastChangeDate:Date;
    @title: 'AccountingDocumentType'
    AccountingDocumentType: String(15);
     Items :Composition of  many Items on Items.AccountingDocument=$self.AccountingDocument and Items.CompanyCode = $self.CompanyCode 
                                            and Items.FiscalYear = $self.FiscalYear;
   
}
entity Items : cuid,managed {
    key ID:UUID;
    CompanyCode : String(4);
    FiscalYear:String(4);
    AccountingDocument:String(10);
    AccountingDocumentItem : String(10);
   TaxCode:String(2);
   GLAccount:String(10);
   TransactionTypeDetermination:String(3);
 
}