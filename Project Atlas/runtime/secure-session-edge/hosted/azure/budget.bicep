targetScope = 'resourceGroup'

@description('Monthly amount in subscription billing currency. This alert does not stop resources.')
@minValue(1)
param amount int
param firstOfMonth string
param endDate string
@minLength(1)
param recipients array

resource budget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: 'atlas-mos140c-acceptance'
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: firstOfMonth
      endDate: endDate
    }
    notifications: {
      actual50: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 50, thresholdType: 'Actual', contactEmails: recipients }
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, thresholdType: 'Actual', contactEmails: recipients }
      actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Actual', contactEmails: recipients }
      forecast100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, thresholdType: 'Forecasted', contactEmails: recipients }
    }
  }
}
