/**
 * The default mapping is deliberately only an example.  VMOS reads headers at
 * runtime and refuses writes when a configured field is not represented in the
 * existing workbook.  Set VMOS_SHEET_MAPPING in Script Properties to override.
 */
var VMOS_DEFAULT_MAPPING = {
  Customer: { sheetName: 'Customers', idField: 'CustomerID', idPrefix: 'CUST', required: ['name'], fields: { id: ['CustomerID'], companyId: ['CompanyID'], name: ['Company Name'], primaryContact: ['Primary Contact'], email: ['Email'], phone: ['Phone'], billingTerms: ['Billing Terms'], creditLimit: ['Credit Limit'], earlyPayDiscount: ['Early Pay Discount'], salesRep: ['Sales Rep'], notes: ['Notes'], createdAt: ['Created At'], updatedAt: ['Updated At'], createdBy: ['Created By'], updatedBy: ['Updated By'] } },
  RFQ: { sheetName: "RFQ's", idField: 'RFQID', idPrefix: 'RFQ', required: ['customerId', 'description'], fields: { id: ['RFQID'], customerId: ['CustomerID'], companyId: ['CompanyID'], contactId: ['ContactID'], customerRfqNumber: ['Customer RFQ Number'], receivedDate: ['Received Date'], dueDate: ['Due Date'], description: ['Description'], status: ['Status'], priority: ['Priority'], source: ['Source'], notes: ['Notes'], createdAt: ['Created At'], updatedAt: ['Updated At'], createdBy: ['Created By'], updatedBy: ['Updated By'] } },
  Quote: { sheetName: 'Quotes', idField: 'QuoteID', idPrefix: 'VQT', required: ['rfqId', 'customerId'], fields: { id: ['QuoteID'], rfqId: ['RFQID'], customerId: ['CustomerID'], quoteDate: ['Quote Date'], expirationDate: ['Expiration Date'], status: ['Status'], subtotal: ['Subtotal'], nre: ['NRE'], tooling: ['Tooling'], material: ['Material'], outsideServices: ['Outside Services'], shipping: ['Shipping'], tax: ['Tax'], total: ['Total'], leadTime: ['Lead Time'], paymentTerms: ['Payment Terms'], confidenceScore: ['Confidence Score'], notes: ['Notes'], createdAt: ['Created At'], updatedAt: ['Updated At'], createdBy: ['Created By'], updatedBy: ['Updated By'] } },
  // Jobs has no supplied "Created At" header. The service will therefore not
  // write one; see the deployment guide for this production-schema conflict.
  Job: { sheetName: 'Jobs', idField: 'JobID', idPrefix: 'JOB', required: ['quoteId', 'customerId'], fields: { id: ['JobID'], customerId: ['CustomerID'], quoteId: ['QuoteID'], partId: ['PartID'], revision: ['Revision'], poNumber: ['PO Number'], quantity: ['Quantity'], dueDate: ['Due Date'], status: ['Status'], program: ['Program'], fixture: ['Fixture'], machine: ['Machine'], operator: ['Operator'], nre: ['NRE'], toolingRecovery: ['Tooling Recovery'], materialCost: ['Material Cost'], estimatedHours: ['Estimated Hours'], actualHours: ['Actual Hours'], grossMargin: ['Gross Margin'], confidenceScore: ['Confidence Score'], updatedAt: ['Updated At'], createdBy: ['Created By'], updatedBy: ['Updated By'] } },
  Invoice: { sheetName: 'Invoices', idField: 'InvoiceID', idPrefix: 'INV', required: ['jobId', 'customerId'], fields: { id: ['InvoiceID'], jobId: ['JobID'], customerId: ['CustomerID'], invoiceDate: ['Invoice Date'], dueDate: ['Due Date'], status: ['Status'], poNumber: ['PO Number'], subtotal: ['Subtotal'], tax: ['Tax'], shipping: ['Shipping'], total: ['Total'], amountPaid: ['Amount Paid'], balanceDue: ['Balance Due'], paymentDate: ['Payment Date'], paymentTerms: ['Payment Terms'], notes: ['Notes'], createdAt: ['Created At'], updatedAt: ['Updated At'], createdBy: ['Created By'], updatedBy: ['Updated By'] } }
};

function getVmosConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('VMOS_SPREADSHEET_ID');
  if (!spreadsheetId) throw new VmosConfigurationError_('VMOS_SPREADSHEET_ID is not configured. See README setup.');
  var configuredMapping = properties.getProperty('VMOS_SHEET_MAPPING');
  var mapping = configuredMapping ? JSON.parse(configuredMapping) : VMOS_DEFAULT_MAPPING;
  return { spreadsheetId: spreadsheetId, mapping: mapping };
}
