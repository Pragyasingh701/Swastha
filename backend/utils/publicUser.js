// A user record as it may leave the server. The password hash must never be
// in a response, whatever the wire-encryption layer would later strip: that
// layer fails open on an internal error and skips very deeply nested values,
// so the hash is removed here, at the source.
const PRIVATE_FIELDS = ['password', 'password_hash', 'passwordHash'];

export function publicUser(user) {
  if (!user || typeof user !== 'object') return user;
  const copy = { ...user };
  for (const field of PRIVATE_FIELDS) {
    delete copy[field];
  }
  return copy;
}
