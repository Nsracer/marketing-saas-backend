import express from 'express';
import chatService from '../services/chatService.js';

const router = express.Router();

/**
 * POST /api/chat/send
 * Process a chat message with enhanced AI capabilities
 */
router.post('/send', async (req, res) => {
    try {
        const { email, message, conversationHistory } = req.body;

        if (!email || !message) {
            return res.status(400).json({
                success: false,
                error: 'Email and message are required'
            });
        }

        // Validate message length
        if (message.length > 2000) {
            return res.status(400).json({
                success: false,
                error: 'Message is too long. Please keep it under 2000 characters.'
            });
        }

        console.log(`💬 Chat request from ${email}: "${message.substring(0, 50)}..."`);

        const response = await chatService.chat(email, message, conversationHistory);

        return res.json({
            success: true,
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Chat route error:', error);
        
        // Return user-friendly error messages
        const errorMessage = error.message || 'Failed to process chat message';
        const statusCode = error.message?.includes('API key') ? 503 : 500;

        return res.status(statusCode).json({
            success: false,
            error: errorMessage
        });
    }
});

/**
 * POST /api/chat/clear
 * Clear conversation history for a user
 */
router.post('/clear', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        chatService.clearHistory(email);

        return res.json({
            success: true,
            message: 'Conversation history cleared'
        });

    } catch (error) {
        console.error('❌ Clear history error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to clear conversation history'
        });
    }
});

/**
 * GET /api/chat/health
 * Check if chat service is available
 */
router.get('/health', async (req, res) => {
    try {
        const hasOpenAI = !!process.env.OPENAI;
        
        return res.json({
            success: true,
            status: hasOpenAI ? 'operational' : 'degraded',
            message: hasOpenAI 
                ? 'Chat service is fully operational' 
                : 'OpenAI API key not configured',
            features: {
                aiResponses: hasOpenAI,
                conversationHistory: true,
                contextAwareness: true
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Health check failed'
        });
    }
});

export default router;
