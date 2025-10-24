const activityTracker = require('./activityTracker');

const UPDATE_INTERVAL_MS = 1000;

const HEARTBEAT_LABEL = (process.env.CLI_HEARTBEAT_LABEL || process.env.RENDER_SERVICE_NAME || '').trim();
const HEARTBEAT_ICON = (process.env.CLI_HEARTBEAT_ICON || '❤️').trim();
const HEARTBEAT_MESSAGE = (process.env.CLI_HEARTBEAT_MESSAGE || 'Heartbeat').trim();
const HEARTBEAT_LOCALE = (process.env.CLI_HEARTBEAT_LOCALE || 'en-US').trim();

function createHeartbeatFormatter(locale) {
  const options = {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch (err) {
    return new Intl.DateTimeFormat('en-US', options);
  }
}

const heartbeatFormatter = createHeartbeatFormatter(HEARTBEAT_LOCALE);

function formatHeartbeatLine(now) {
  const formattedTimestamp = heartbeatFormatter.format(now);
  const parts = [formattedTimestamp];

  if (HEARTBEAT_LABEL) {
    parts.push(HEARTBEAT_LABEL);
  }

  if (HEARTBEAT_ICON) {
    parts.push(HEARTBEAT_ICON);
  }

  if (HEARTBEAT_MESSAGE) {
    parts.push(HEARTBEAT_MESSAGE);
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

  const heartbeatLine = formatHeartbeatLine(new Date(now));
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
