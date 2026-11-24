targetScope = 'resourceGroup'

@description('DNS label prefix unique to this acceptance installation.')
@minLength(3)
@maxLength(20)
param prefix string
param sshPublicKey string
@description('Operator public IPv4 address with an explicit /32.')
param operatorSshCidr string
param vmAdminUsername string = 'atlasoperator'
@description('Exact Ubuntu 24.04 server image version verified in the selected region. Record it in the approval evidence.')
param ubuntuImageVersion string
@secure()
param postgresAdminPassword string

@description('Azure region verified for the exact subscription and resource configuration.')
param location string
@description('Ubuntu x64 VM SKU verified in the selected region.')
param vmSize string
var tags = {
  project: 'Atlas'
  story: 'MOS-140C'
  environment: 'acceptance'
  'data-classification': 'synthetic'
  owner: 'GreyFirSystems'
  lifecycle: 'temporary'
}
var dbZoneName = '${prefix}.private.postgres.database.azure.com'

resource securityGroup 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${prefix}-vm-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'operator-ssh'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '22'
          sourceAddressPrefix: operatorSshCidr
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'public-web'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRanges: ['80', '443']
          sourceAddressPrefix: 'Internet'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'deny-other-inbound'
        properties: {
          priority: 120
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
    ]
  }
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${prefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.81.0.0/24']
    }
  }
  resource app 'subnets' = {
    name: 'application'
    properties: {
      addressPrefix: '10.81.0.0/27'
      defaultOutboundAccess: false
      networkSecurityGroup: { id: securityGroup.id }
    }
  }
  resource database 'subnets' = {
    name: 'postgres'
    properties: {
      addressPrefix: '10.81.0.32/27'
      delegations: [
        {
          name: 'flexible-postgres'
          properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
        }
      ]
    }
  }
}

resource dns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: dbZoneName
  location: 'global'
  tags: tags
  resource link 'virtualNetworkLinks' = {
    name: '${prefix}-link'
    location: 'global'
    properties: {
      registrationEnabled: false
      virtualNetwork: { id: network.id }
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '17'
    administratorLogin: 'atlasbootstrap'
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: network::database.id
      privateDnsZoneArmResourceId: dns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [dns::link]
}

resource publicIp 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: '${prefix}-ip'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: '${prefix}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'primary'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: { id: publicIp.id }
          subnet: { id: network::app.id }
        }
      }
    ]
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: '${prefix}-vm'
  location: location
  tags: tags
  properties: {
    hardwareProfile: { vmSize: vmSize }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: ubuntuImageVersion
      }
      osDisk: {
        diskSizeGB: 64
        createOption: 'FromImage'
        deleteOption: 'Delete'
        managedDisk: { storageAccountType: 'StandardSSD_LRS' }
      }
    }
    osProfile: {
      computerName: '${prefix}-vm'
      adminUsername: vmAdminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${vmAdminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        { id: nic.id }
      ]
    }
  }
}

output vmName string = vm.name
output publicAddress string = publicIp.properties.ipAddress
output postgresFqdn string = database.properties.fullyQualifiedDomainName
