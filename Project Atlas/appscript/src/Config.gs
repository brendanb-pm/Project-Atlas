/**
 * The default mapping is deliberately only an example.  VMOS reads headers at
 * runtime and refuses writes when a configured field is not represented in the
 * existing workbook.  Set VMOS_SHEET_MAPPING in Script Properties to override.
 */
var VMOS_DEFAULT_MAPPING = {
  Customer: { sheetName: 'Customers', idField: 'CustomerID', idPrefix: 'CUST', required: ['name'], fields: { id: ['CustomerID', 'Customer ID'], name: ['CustomerName', 'Customer Name', 'Name'], email: ['Email'], phone: ['Phone'], status: ['Status'], createdAt: ['CreatedAt', 'Created At'] } },
  RFQ: { sheetName: 'RFQs', idField: 'RFQID', idPrefix: 'RFQ', required: ['customerId', 'description'], fields: { id: ['RFQID', 'RFQ ID'], customerId: ['CustomerID', 'Customer ID'], description: ['Description', 'RFQ Description'], receivedDate: ['ReceivedDate', 'Received Date'], dueDate: ['DueDate', 'Due Date'], status: ['Status'], createdAt: ['CreatedAt', 'Created At'] } },
  Quote: { sheetName: 'Quotes', idField: 'QuoteID', idPrefix: 'VQT', required: ['rfqId', 'customerId'], fields: { id: ['QuoteID', 'Quote ID'], rfqId: ['RFQID', 'RFQ ID'], customerId: ['CustomerID', 'Customer ID'], description: ['Description'], amount: ['Amount', 'Quote Amount'], status: ['Status'], createdAt: ['CreatedAt', 'Created At'] } },
  Job: { sheetName: 'Jobs', idField: 'JobID', idPrefix: 'JOB', required: ['quoteId', 'customerId', 'name'], fields: { id: ['JobID', 'Job ID'], quoteId: ['QuoteID', 'Quote ID'], customerId: ['CustomerID', 'Customer ID'], name: ['JobName', 'Job Name', 'Name'], status: ['Status'], dueDate: ['DueDate', 'Due Date'], createdAt: ['CreatedAt', 'Created At'] } },
  Invoice: { sheetName: 'Invoices', idField: 'InvoiceID', idPrefix: 'INV', required: ['jobId', 'customerId'], fields: { id: ['InvoiceID', 'Invoice ID'], jobId: ['JobID', 'Job ID'], customerId: ['CustomerID', 'Customer ID'], amount: ['Amount', 'Invoice Amount'], status: ['Status'], issueDate: ['IssueDate', 'Issue Date'], dueDate: ['DueDate', 'Due Date'], createdAt: ['CreatedAt', 'Created At'] } }
};

function getVmosConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('VMOS_SPREADSHEET_ID');
  if (!spreadsheetId) throw new VmosConfigurationError('VMOS_SPREADSHEET_ID is not configured. See README setup.');
  var configuredMapping = properties.getProperty('VMOS_SHEET_MAPPING');
  var mapping = configuredMapping ? JSON.parse(configuredMapping) : VMOS_DEFAULT_MAPPING;
  return { spreadsheetId: spreadsheetId, mapping: mapping };
}
