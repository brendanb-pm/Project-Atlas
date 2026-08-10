/** Test-only adapters for provider-contract tests; never invoke external services. */
function ExternalBoardProviderMock_() { this.calls = []; }
ExternalBoardProviderMock_.prototype.requestCreate = function (payload) { this.calls.push({ type: 'CREATE', payload: payload }); return payload; };
ExternalBoardProviderMock_.prototype.requestMove = function (payload) { this.calls.push({ type: 'MOVE', payload: payload }); return payload; };
ExternalBoardProviderMock_.prototype.requestReconcile = function (payload) { this.calls.push({ type: 'RECONCILE', payload: payload }); return payload; };

function CustomerNotificationProviderMock_() { this.calls = []; }
CustomerNotificationProviderMock_.prototype.send = function (event) { this.calls.push(event); return { providerReference: 'mock-' + this.calls.length }; };
