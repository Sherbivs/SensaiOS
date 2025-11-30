/* eslint-disable no-console */
/**
 * Infinity Gauntlet - Test API Server
 * 
 * Provides mock REST API endpoints for Android app development and testing.
 * Runs on port 3001 (separate from main bot on port 3000).
 * 
 * Android emulator access: http://10.0.2.2:3001/api
 * Local network access: http://YOUR_IP:3001/api
 * 
 * Endpoints:
 * - GET /api/health - Health check
 * - GET /api/channels - List all channels
 * - GET /api/channels/:id - Get single channel
 * - GET /api/pokemon/species - List all Pokemon species
 * - GET /api/trainer/:userId - Get trainer profile
 * 
 * Created: 2025-11-30
 * Team: Network Refactor - Backend Support
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());  // Allow Android app to connect
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ══════════════════════════════════════════════════════════════
// HEALTH & STATUS ENDPOINTS
// ══════════════════════════════════════════════════════════════

/**
 * Health check endpoint
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'test-api',
        services: {
            database: { status: 'ok', latency: 45 },
            cache: { status: 'ok', latency: 5 },
            discord: { status: 'ok', latency: 120 }
        }
    });
});

// ══════════════════════════════════════════════════════════════
// CHANNEL ENDPOINTS
// ══════════════════════════════════════════════════════════════

// Mock channel data
const mockChannels = [
    {
        id: '1234567890',
        name: 'homestead',
        description: 'Your private gameplay channel - home, heal, and manage your Pokemon',
        category: 'gameplay',
        icon: '🏠',
        unreadCount: 0,
        lastMessageTimestamp: Date.now() - 600000  // 10 minutes ago
    },
    {
        id: '1234567891',
        name: 'arena',
        description: 'Battle against other trainers in competitive PvP matches',
        category: 'pvp',
        icon: '⚔️',
        unreadCount: 3,
        lastMessageTimestamp: Date.now() - 120000  // 2 minutes ago
    },
    {
        id: '1234567892',
        name: 'wild-encounters',
        description: 'Explore routes and encounter wild Pokemon',
        category: 'gameplay',
        icon: '🌿',
        unreadCount: 0,
        lastMessageTimestamp: Date.now() - 1800000  // 30 minutes ago
    },
    {
        id: '1234567893',
        name: 'shop',
        description: 'Purchase items, Poke Balls, and equipment',
        category: 'economy',
        icon: '🏪',
        unreadCount: 1,
        lastMessageTimestamp: Date.now() - 300000  // 5 minutes ago
    },
    {
        id: '1234567894',
        name: 'announcements',
        description: 'Important updates and announcements',
        category: 'system',
        icon: '📢',
        unreadCount: 2,
        lastMessageTimestamp: Date.now() - 86400000  // 1 day ago
    }
];

/**
 * Get all channels
 * GET /api/channels
 */
app.get('/api/channels', (req, res) => {
    console.log(`✅ Returning ${mockChannels.length} channels`);
    res.json(mockChannels);
});

/**
 * Get single channel by ID
 * GET /api/channels/:id
 */
app.get('/api/channels/:id', (req, res) => {
    const { id } = req.params;
    const channel = mockChannels.find(ch => ch.id === id);
    
    if (channel) {
        console.log(`✅ Found channel: ${channel.name}`);
        res.json(channel);
    } else {
        console.log(`❌ Channel not found: ${id}`);
        res.status(404).json({ error: 'Channel not found' });
    }
});

// ══════════════════════════════════════════════════════════════
// POKEMON & SPECIES ENDPOINTS
// ══════════════════════════════════════════════════════════════

// Mock Pokemon species data
const mockSpecies = [
    {
        id: 'bulbasaur',
        nationalDexNumber: 1,
        name: 'Bulbasaur',
        types: ['grass', 'poison'],
        baseStats: {
            hp: 45,
            attack: 49,
            defense: 49,
            specialAttack: 65,
            specialDefense: 65,
            speed: 45
        },
        abilities: ['overgrow', 'chlorophyll'],
        sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'
    },
    {
        id: 'charmander',
        nationalDexNumber: 4,
        name: 'Charmander',
        types: ['fire'],
        baseStats: {
            hp: 39,
            attack: 52,
            defense: 43,
            specialAttack: 60,
            specialDefense: 50,
            speed: 65
        },
        abilities: ['blaze', 'solar-power'],
        sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png'
    },
    {
        id: 'squirtle',
        nationalDexNumber: 7,
        name: 'Squirtle',
        types: ['water'],
        baseStats: {
            hp: 44,
            attack: 48,
            defense: 65,
            specialAttack: 50,
            specialDefense: 64,
            speed: 43
        },
        abilities: ['torrent', 'rain-dish'],
        sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png'
    },
    {
        id: 'pikachu',
        nationalDexNumber: 25,
        name: 'Pikachu',
        types: ['electric'],
        baseStats: {
            hp: 35,
            attack: 55,
            defense: 40,
            specialAttack: 50,
            specialDefense: 50,
            speed: 90
        },
        abilities: ['static', 'lightning-rod'],
        sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png'
    }
];

/**
 * Get all Pokemon species
 * GET /api/pokemon/species
 */
app.get('/api/pokemon/species', (req, res) => {
    const limit = parseInt(req.query.limit) || mockSpecies.length;
    const species = mockSpecies.slice(0, limit);
    
    console.log(`✅ Returning ${species.length} Pokemon species`);
    res.json(species);
});

/**
 * Get single Pokemon species by ID
 * GET /api/pokemon/species/:id
 */
app.get('/api/pokemon/species/:id', (req, res) => {
    const { id } = req.params;
    const species = mockSpecies.find(s => s.id === id || s.nationalDexNumber === parseInt(id));
    
    if (species) {
        console.log(`✅ Found species: ${species.name}`);
        res.json(species);
    } else {
        console.log(`❌ Species not found: ${id}`);
        res.status(404).json({ error: 'Species not found' });
    }
});

// ══════════════════════════════════════════════════════════════
// TRAINER ENDPOINTS
// ══════════════════════════════════════════════════════════════

// Mock trainer data
const mockTrainers = {
    'user123': {
        id: 'user123',
        username: 'TrainerRed',
        badges: 3,
        money: 5420,
        boxCount: 12,
        startedAt: Date.now() - 2592000000,  // 30 days ago
        lastActive: Date.now() - 120000  // 2 minutes ago
    }
};

/**
 * Get trainer profile
 * GET /api/trainer/:userId
 */
app.get('/api/trainer/:userId', (req, res) => {
    const { userId } = req.params;
    const trainer = mockTrainers[userId];
    
    if (trainer) {
        console.log(`✅ Found trainer: ${trainer.username}`);
        res.json(trainer);
    } else {
        console.log(`❌ Trainer not found: ${userId}`);
        res.status(404).json({ error: 'Trainer not found' });
    }
});

/**
 * Create new trainer profile
 * POST /api/trainer
 */
app.post('/api/trainer', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    const newTrainer = {
        id: `user${Date.now()}`,
        username,
        badges: 0,
        money: 500,
        boxCount: 1,
        startedAt: Date.now(),
        lastActive: Date.now()
    };
    
    mockTrainers[newTrainer.id] = newTrainer;
    console.log(`✅ Created new trainer: ${username}`);
    res.status(201).json(newTrainer);
});

// ══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, _next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message
    });
});

// ══════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '═'.repeat(60));
    console.log('🚀 Infinity Gauntlet - Test API Server');
    console.log('═'.repeat(60));
    console.log(`\n📡 Server listening on port ${PORT}`);
    console.log(`\n📱 Android Emulator: http://10.0.2.2:${PORT}/api`);
    console.log(`🌐 Local Network: http://YOUR_IP:${PORT}/api`);
    console.log(`💻 Localhost: http://localhost:${PORT}/api\n`);
    console.log('📋 Available Endpoints:');
    console.log('  • GET  /api/health');
    console.log('  • GET  /api/channels');
    console.log('  • GET  /api/channels/:id');
    console.log('  • GET  /api/pokemon/species');
    console.log('  • GET  /api/pokemon/species/:id');
    console.log('  • GET  /api/trainer/:userId');
    console.log('  • POST /api/trainer');
    console.log('\n' + '═'.repeat(60) + '\n');
});
