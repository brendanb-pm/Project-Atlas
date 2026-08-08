/** Contract wrapper. A future composition root may supply Sheets, SQL, or a fake. */
function SalesActivityRepository(adapter){this.adapter=adapter;}
SalesActivityRepository.prototype.create=function(record){return this.adapter.create(record);};
SalesActivityRepository.prototype.get=function(id){return this.adapter.get(id);};
SalesActivityRepository.prototype.update=function(id,record){return this.adapter.update(id,record);};
SalesActivityRepository.prototype.listByCustomerId=function(customerId){return this.adapter.listByCustomerId(customerId);};
SalesActivityRepository.prototype.listOpen=function(){return this.adapter.listOpen();};
