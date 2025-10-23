const activityTracker = require('./activityTracker');

const UPDATE_INTERVAL_MS = 1000;

let intervalHandle = null;
let unsubscribe = null;
let lastOutputWasDot = false;

function render() {
  process.stdout.write('.');
  lastOutputWasDot = true;
}

function startStatusDisplay() {
  if (intervalHandle) {
    return;
  }

  if (typeof activityTracker.subscribe === 'function') {
    unsubscribe = activityTracker.subscribe(() => {});
  }

  render();
  intervalHandle = setInterval(render, UPDATE_INTERVAL_MS);
}

function stopStatusDisplay() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (lastOutputWasDot) {
    process.stdout.write('\n');
    lastOutputWasDot = false;
  }
}

function setPhase() {}

function setGuildCount() {}

function setSection() {}

function interruptConsoleOutput(writeFn) {
  if (typeof writeFn !== 'function') {
    return;
  }

  if (lastOutputWasDot) {
    process.stdout.write('\n');
    lastOutputWasDot = false;
  }

  writeFn();
}

module.exports = {
  startStatusDisplay,
  stopStatusDisplay,
  setPhase,
  setGuildCount,
  setSection,
  interruptConsoleOutput,
};
