// Keeps people's details out of the server logs.
//
// Many catch blocks log the whole error object. Those carry more than the message: a
// database error includes the offending row ("Key (email)=(a@b.com) already exists"), an
// HTTP error can include the request it made. Render keeps these logs, and this is a
// health app, so nothing that identifies a person may end up there.
//
// Installed once, for every console call, rather than editing each of the ~170 call
// sites. An error is reduced to its name, message, code, status and stack; anything
// that looks like an email, an Indian mobile number or a login token is masked in every
// string. Set LOG_RAW=1 to switch it off while debugging on your own machine.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOBILE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const TOKEN = /\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const MAX_STACK_FRAMES = 6;

export function redactText(text) {
  return String(text).replace(TOKEN, '[token]').replace(EMAIL, '[email]').replace(MOBILE, '[number]');
}

function looksLikeError(value) {
  if (value instanceof Error) return true;
  return Boolean(value) && typeof value === 'object' && typeof value.message === 'string'
    && ('stack' in value || 'code' in value || 'details' in value || 'hint' in value);
}

// name, message, code and status are kept. `details`, `hint`, `cause` and any request or
// response attached to the error are dropped: that is where the personal data sits.
export function describeError(err) {
  const name = err.name && err.name !== 'Error' ? `${err.name}: ` : '';
  let out = `${name}${redactText(err.message || 'error')}`;
  const extras = [];
  if (err.code !== undefined) extras.push(`code=${redactText(err.code)}`);
  if (err.status !== undefined) extras.push(`status=${redactText(err.status)}`);
  if (err.cause?.code !== undefined) extras.push(`cause=${redactText(err.cause.code)}`);
  if (extras.length) out += ` [${extras.join(' ')}]`;
  if (typeof err.stack === 'string') {
    const frames = err.stack.split('\n').filter((line) => /^\s+at /.test(line)).slice(0, MAX_STACK_FRAMES);
    if (frames.length) out += `\n${redactText(frames.join('\n'))}`;
  }
  return out;
}

export function scrubArgs(args) {
  return args.map((arg) => {
    if (typeof arg === 'string') return redactText(arg);
    if (looksLikeError(arg)) return describeError(arg);
    return arg;
  });
}

export function installSafeLogging(target = console) {
  if (process.env.LOG_RAW === '1' || target.__safeLoggingInstalled) return;
  target.__safeLoggingInstalled = true;
  for (const method of ['log', 'info', 'warn', 'error']) {
    const original = target[method].bind(target);
    target[method] = (...args) => original(...scrubArgs(args));
  }
}

installSafeLogging();
