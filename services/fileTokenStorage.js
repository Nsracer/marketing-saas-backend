// File-based token storage service as fallback when Supabase is not configured
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'oauth_tokens.json');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// Read tokens from file
async function readTokensFile() {
    try {
        await ensureDataDir();
        const data = await fs.readFile(TOKENS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

// Write tokens to file
async function writeTokensFile(tokens) {
    await ensureDataDir();
    await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// Bug #8 Fix: Use createCipheriv instead of deprecated createCipher
function encryptToken(token) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.GOOGLE_CLIENT_SECRET || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

// Bug #8 Fix: Use createDecipheriv instead of deprecated createDecipher
function decryptToken(encryptedToken) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(process.env.GOOGLE_CLIENT_SECRET || 'default-key', 'salt', 32);
        const [ivHex, encrypted] = encryptedToken.split(':');
        if (!ivHex || !encrypted) {
            console.warn('Invalid encrypted token format');
            return encryptedToken;
        }
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.warn('Token decryption failed, returning as-is:', error.message);
        return encryptedToken;
    }
}

export const fileTokenStorage = {
    /**
     * Get user ID from email (create if doesn't exist)
     */
    async getUserIdFromEmail(email) {
        const tokens = await readTokensFile();

        // Find existing user by email
        for (const [userId, userData] of Object.entries(tokens)) {
            if (userData.email === email) {
                return userId;
            }
        }

        // Create new user ID
        const newUserId = crypto.randomUUID();
        tokens[newUserId] = {
            email: email,
            tokens: null,
            created_at: new Date().toISOString()
        };

        await writeTokensFile(tokens);
        return newUserId;
    },

    /**
     * Store Google OAuth tokens for a user
     */
    async storeGoogleTokens(userId, tokens) {
        try {
            const allTokens = await readTokensFile();

            if (!allTokens[userId]) {
                throw new Error(`User ${userId} not found`);
            }

            // Encrypt sensitive token data
            const encryptedTokens = {
                access_token: encryptToken(tokens.access_token),
                refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
                token_type: tokens.token_type || 'Bearer',
                scope: tokens.scope || '',
                expires_at: new Date(tokens.expiry_date).toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            allTokens[userId].tokens = encryptedTokens;
            await writeTokensFile(allTokens);

            console.log('✅ Google tokens stored in file for user:', userId);
            return {
                id: crypto.randomUUID(),
                user_id: userId,
                ...encryptedTokens
            };
        } catch (error) {
            console.error('❌ Error storing Google tokens in file:', error);
            throw error;
        }
    },

    /**
     * Retrieve Google OAuth tokens for a user
     */
    async getGoogleTokens(userId) {
        try {
            const allTokens = await readTokensFile();

            if (!allTokens[userId] || !allTokens[userId].tokens) {
                return null;
            }

            const tokens = allTokens[userId].tokens;

            // Decrypt tokens
            const decryptedTokens = {
                ...tokens,
                access_token: decryptToken(tokens.access_token),
                refresh_token: tokens.refresh_token ? decryptToken(tokens.refresh_token) : null
            };

            // Check if tokens are expired
            const expiresAt = new Date(tokens.expires_at);
            const now = new Date();

            if (expiresAt <= now) {
                console.log('🔄 Google tokens expired for user:', userId);
                return { ...decryptedTokens, expired: true };
            }

            return decryptedTokens;
        } catch (error) {
            console.error('❌ Error retrieving Google tokens from file:', error);
            throw error;
        }
    },

    /**
     * Update Google OAuth tokens (for refresh)
     */
    async updateGoogleTokens(userId, newTokens) {
        try {
            const allTokens = await readTokensFile();

            if (!allTokens[userId] || !allTokens[userId].tokens) {
                throw new Error(`No tokens found for user ${userId}`);
            }

            // Update with new encrypted tokens
            const updateData = {
                access_token: encryptToken(newTokens.access_token),
                expires_at: newTokens.expires_at,
                updated_at: new Date().toISOString()
            };

            // Update refresh token if provided
            if (newTokens.refresh_token) {
                updateData.refresh_token = encryptToken(newTokens.refresh_token);
            }

            allTokens[userId].tokens = {
                ...allTokens[userId].tokens,
                ...updateData
            };

            await writeTokensFile(allTokens);

            console.log('✅ Google tokens updated in file for user:', userId);
            return allTokens[userId].tokens;
        } catch (error) {
            console.error('❌ Error updating Google tokens in file:', error);
            throw error;
        }
    },

    /**
     * Delete Google OAuth tokens for a user
     */
    async deleteGoogleTokens(userId) {
        try {
            const allTokens = await readTokensFile();

            if (allTokens[userId]) {
                allTokens[userId].tokens = null;
                await writeTokensFile(allTokens);
            }

            console.log('✅ Google tokens deleted from file for user:', userId);
            return true;
        } catch (error) {
            console.error('❌ Error deleting Google tokens from file:', error);
            throw error;
        }
    }
};
