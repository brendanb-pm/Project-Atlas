/** The Sheets adapter is selected only at this repository composition boundary. */
function SalesActivityRepository(adapter){this.adapter=adapter||new SheetsRepository('SalesActivity',getSalesActivityConfig_().mapping,SpreadsheetApp.openById(getSalesActivityConfig_().spreadsheetId));}
SalesActivityRepository.prototype.create=function(record){return this.adapter.insert(record);};
SalesActivityRepository.prototype.get=function(id){return this.adapter.findById(id);};
SalesActivityRepository.prototype.update=function(id,record){return this.adapter.updateById(id,record);};
SalesActivityRepository.prototype.list=function(){return this.adapter.list();};
SalesActivityRepository.prototype.listByCustomerId=function(customerId){return this.list().filter(function(row){return String(row.customerId)===String(customerId);});};
SalesActivityRepository.prototype.listOpen=function(){return this.list().filter(function(row){return ['OPEN','FOLLOW_UP_DUE','OVERDUE'].indexOf(row.status)!==-1;});};
