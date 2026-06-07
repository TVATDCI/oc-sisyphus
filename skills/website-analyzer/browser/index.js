/**
 * Browser Automation Module Entry Point
 * Website-analyzer v1.2.0 - Runtime Analysis Engine
 * 
 * Exports all browser inspection modules for use by the skill workflow
 */

const { BrowserInspector } = require('./inspector');
const { Injector } = require('./injector');
const { BrowserLauncher } = require('./launcher');
const { ThreeInspector } = require('./three-inspector');
const { AnimationRecorder } = require('./animation-recorder');
const { StateExtractor } = require('./state-extractor');
const { RouteMapper } = require('./route-mapper');

module.exports = {
  BrowserInspector,
  BrowserLauncher,
  Injector,
  ThreeInspector,
  AnimationRecorder,
  StateExtractor,
  RouteMapper,
  
  // Convenience factory function
  createInspector(page, options) {
    return new BrowserInspector(page, options);
  },
  
  async launch(url, options = {}) {
    const launcher = new BrowserLauncher(options);
    await launcher.launchDirect();
    await launcher.navigate(url);
    return launcher;
  }
};
