// Main entry point — imports all modules to initialize the application.
// Module execution order matters: drawing and zoom must be available
// before grid builds, and toolbar must run after grid.
import './drawing.js';
import './zoom.js';
import './copy-export.js';
import './grid.js';
import './drop-handler.js';
import './toolbar.js';
import './color-filter.js';
import './keyboard.js';
import './init.js';
