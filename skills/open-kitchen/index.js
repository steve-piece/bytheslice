// skills/open-kitchen/index.js
// Exists only so `node --test skills/open-kitchen/` runs the colocated tests; the plugin never loads this folder as a module.
'use strict';

require('./kitchen-live.test.js');
require('./open-kitchen.test.js');
