const { getDataConnect, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'default',
  service: 'inscriere-misterele-matematicii',
  location: 'us-central1'
};
exports.connectorConfig = connectorConfig;

