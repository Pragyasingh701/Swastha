// POST /api/crypto/handshake — establishes the per-session AES-256-GCM key
// used by middleware/wireCrypto.js. Deliberately unauthenticated: it must
// work before login, since /login, /register, and clinic.js's public
// verifyClinicCode all carry designated sensitive fields before any JWT
// exists.
import express from 'express';
import { generateEcdhKeyPair, exportRawPublicKey, importRawPublicKey, deriveSessionKey } from '../crypto/webcrypto.js';
import { createSession } from '../crypto/sessionStore.js';

const router = express.Router();

router.post('/handshake', async (req, res) => {
  const { clientPublicKey } = req.body || {};
  if (!clientPublicKey || typeof clientPublicKey !== 'string') {
    return res.status(400).json({ message: 'clientPublicKey (base64, raw P-256 point) is required.' });
  }

  try {
    const serverKeyPair = await generateEcdhKeyPair();
    const peerPublicKey = await importRawPublicKey(clientPublicKey);
    const sessionKey = await deriveSessionKey(serverKeyPair.privateKey, peerPublicKey);
    const { sessionId, expiresAt } = createSession(sessionKey);
    const serverPublicKey = await exportRawPublicKey(serverKeyPair.publicKey);

    return res.json({ sessionId, serverPublicKey, expiresAt });
  } catch (err) {
    console.error('[POST /api/crypto/handshake] failed:', err.message);
    return res.status(400).json({ message: 'Could not establish a secure session.' });
  }
});

export default router;
