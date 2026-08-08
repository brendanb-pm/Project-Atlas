/** Test-only adapters for provider-contract tests; never invoke external services. */
function ExternalBoardProviderMock() { this.calls = []; }
ExternalBoardProviderMock.prototype.requestCreate = function (payload) { this.calls.push({ type: 'CREATE', payload: payload }); return payload; };
ExternalBoardProviderMock.prototype.requestMove = function (payload) { this.calls.push({ type: 'MOVE', payload: payload }); return payload; };
ExternalBoardProviderMock.prototype.requestReconcile = function (payload) { this.calls.push({ type: 'RECONCILE', payload: payload }); return payload; };

function CustomerNotificationProviderMock() { this.calls = []; }
CustomerNotificationProviderMock.prototype.send = function (event) { this.calls.push(event); return { providerReference: 'mock-' + this.calls.length }; };
