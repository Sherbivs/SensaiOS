// Forwarder for compatibility with legacy start commands
// Delegates to the primary boot script in src/index.js
module.exports = require('./src/index.js');
// Forwarder for compatibility with older start commands
module.exports = require('./src');
