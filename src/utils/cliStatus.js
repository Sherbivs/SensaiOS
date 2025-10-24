const activityTracker = require('./activityTracker');

const UPDATE_INTERVAL_MS = 1000;

const HEARTBEAT_LABEL = (process.env.CLI_HEARTBEAT_LABEL || '').trim();
const HEARTBEAT_ICON = (process.env.CLI_HEARTBEAT_ICON || '.').trim();
const HEARTBEAT_MESSAGE = (process.env.CLI_HEARTBEAT_MESSAGE || '').trim();

function formatHeartbeatLine() {
  const parts = [];

  if (HEARTBEAT_LABEL) {
    parts.push(HEARTBEAT_LABEL);
  }

  if (HEARTBEAT_ICON) {
    parts.push(HEARTBEAT_ICON);
  }

  if (HEARTBEAT_MESSAGE) {
    parts.push(HEARTBEAT_MESSAGE);
  }

  if (parts.length === 0) {
    return '.';
  }

  return parts.join('  ');
}

let intervalHandle = null;
let unsubscribe = null;
let lastHeartbeatAt = 0;
let lastNonHeartbeatOutputAt = Date.now();

function markNonHeartbeatOutput() {
  lastNonHeartbeatOutputAt = Date.now();
}

function renderHeartbeat() {
  const now = Date.now();

  if (now - lastNonHeartbeatOutputAt < UPDATE_INTERVAL_MS) {
    return;
  }

  if (now - lastHeartbeatAt < UPDATE_INTERVAL_MS) {
    return;
  }

  const heartbeatLine = formatHeartbeatLine();
  console.log(heartbeatLine);
  lastHeartbeatAt = now;
}

function startStatusDisplay() {
  if (intervalHandle) {
    return;
  }

  if (typeof activityTracker.subscribe === 'function') {
    unsubscribe = activityTracker.subscribe(() => {
      markNonHeartbeatOutput();
    });
  }

  lastNonHeartbeatOutputAt = Date.now();
  lastHeartbeatAt = 0;

  intervalHandle = setInterval(renderHeartbeat, UPDATE_INTERVAL_MS);
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

}

function setPhase() {
  markNonHeartbeatOutput();
}

function setGuildCount() {
  markNonHeartbeatOutput();
}

function setSection() {
  markNonHeartbeatOutput();
}

function interruptConsoleOutput(writeFn) {
  if (typeof writeFn !== 'function') {
    return;
  }

  markNonHeartbeatOutput();
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
