/**
 * Secure Backend Server for Math Knight
 * Handles all Gemini API calls to protect your API key
 * 
 * Setup:
 * 1. npm install express cors dotenv
 * 2. Create .env file with: GEMINI_API_KEY=your_actual_key_here
 * 3. node server.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting helper (basic)
const requestCounts = {};
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000;

function checkRateLimit(ip) {
    const now = Date.now();
    if (!requestCounts[ip]) {
        requestCounts[ip] = { count: 0, reset: now + RATE_WINDOW };
    }
    
    if (now > requestCounts[ip].reset) {
        requestCounts[ip] = { count: 0, reset: now + RATE_WINDOW };
    }
    
    requestCounts[ip].count++;
    return requestCounts[ip].count <= RATE_LIMIT;
}

// Validate API key exists
if (!process.env.GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not found in .env file');
    console.error('Create a .env file with: GEMINI_API_KEY=your_key_here');
    process.exit(1);
}

/**
 * POST /api/generate-text
 * Calls Gemini to generate narrative text
 */
app.post('/api/generate-text', async (req, res) => {
    try {
        // Rate limiting
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ 
                error: 'Too many requests. Please wait before trying again.' 
            });
        }

        const { userQuery, systemPrompt } = req.body;

        // Validation
        if (!userQuery || typeof userQuery !== 'string') {
            return res.status(400).json({ error: 'Invalid userQuery' });
        }
        if (userQuery.length > 2000) {
            return res.status(400).json({ error: 'Query too long (max 2000 characters)' });
        }

        const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2-flash:generateContent';
        
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }]
        };

        if (systemPrompt && typeof systemPrompt === 'string') {
            payload.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const response = await fetch(`${apiUrl}?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API error:', errorData);
            return res.status(response.status).json({ 
                error: 'Gemini API error',
                details: errorData.error?.message 
            });
        }

        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(500).json({ error: 'No response from Gemini' });
        }

        res.json({ text });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/generate-tts
 * Calls Gemini to generate speech audio
 */
app.post('/api/generate-tts', async (req, res) => {
    try {
        // Rate limiting
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ 
                error: 'Too many requests. Please wait before trying again.' 
            });
        }

        const { text, voiceName } = req.body;

        // Validation
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Invalid text' });
        }
        if (text.length > 1000) {
            return res.status(400).json({ error: 'Text too long (max 1000 characters)' });
        }

        const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2-flash-preview-tts:generateContent';
        
        const payload = {
            contents: [{ parts: [{ text }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { 
                        prebuiltVoiceConfig: { 
                            voiceName: voiceName || "Charon" 
                        } 
                    }
                }
            }
        };

        const response = await fetch(`${apiUrl}?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini TTS error:', errorData);
            return res.status(response.status).json({ 
                error: 'Gemini TTS error',
                details: errorData.error?.message 
            });
        }

        const result = await response.json();
        const audioData = result?.candidates?.[0]?.content?.parts?.[0];

        if (!audioData?.inlineData?.data) {
            return res.status(500).json({ error: 'No audio from Gemini' });
        }

        res.json({ 
            data: audioData.inlineData.data,
            mimeType: audioData.inlineData.mimeType 
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Math Knight server running on http://localhost:${PORT}`);
    console.log('API endpoints:');
    console.log('  POST /api/generate-text');
    console.log('  POST /api/generate-tts');
});
