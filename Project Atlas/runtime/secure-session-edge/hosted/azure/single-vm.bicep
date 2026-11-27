targetScope = 'resourceGroup'

@description('DNS label prefix unique to this acceptance installation.')
@minLength(3)
@maxLength(20)
param prefix string
param sshPublicKey string
@description('Operator public IPv4 address with an explicit /32.')
@minLength(10)
@maxLength(18)
param operatorSshCidr string
param vmAdminUsername string = 'atlasoperator'
@description('Exact Ubuntu 24.04 server image version verified in the selected region. Record it in the approval evidence.')
param ubuntuImageVersion string

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
// Reject an unsafe prefix via NSG validation even if Portal is used without preflight.
var operatorSshSource = endsWith(operatorSshCidr, '/32') && length(split(operatorSshCidr, '.')) == 4 && !contains(operatorSshCidr, ':') ? operatorSshCidr : 'invalid-operator-ipv4'

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
          sourceAddressPrefix: operatorSshSource
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
      dataDisks: [
        {
          lun: 0
          name: '${prefix}-pg-data'
          diskSizeGB: 32
          createOption: 'Empty'
          deleteOption: 'Detach'
          managedDisk: { storageAccountType: 'StandardSSD_LRS' }
        }
      ]
      osDisk: {
        diskSizeGB: 64
        createOption: 'FromImage'
        deleteOption: 'Detach'
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
