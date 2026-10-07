/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { withGradleProperties } = require('@expo/config-plugins');

const NEW_ARCH_PROPERTY = 'newArchEnabled';

function withNewArchitectureDisabled(config) {
  return withGradleProperties(config, config => {
    const property = { type: 'property', key: NEW_ARCH_PROPERTY, value: 'false' };
    const index = config.modResults.findIndex(
      item => item.type === 'property' && item.key === NEW_ARCH_PROPERTY,
    );

    if (index >= 0) config.modResults[index] = property;
    else config.modResults.push(property);
    return config;
  });
}

module.exports = withNewArchitectureDisabled;
