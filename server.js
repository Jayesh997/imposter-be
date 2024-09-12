const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'https://imposter-fe.vercel.app',
        methods: ['GET', 'POST']
    }
});

// Use CORS middleware to allow requests from any origin
app.use(cors());
app.use(express.static('public'));

// Game logic state
let games = {};

// Define categories and words
const categories = {
    fruits: ['banana', 'apple', 'orange', 'grape', 'kiwi', 'mango', 'pineapple', 'strawberry', 'blueberry', 'peach'],
    cricketers: ['Sachin Tendulkar', 'Virat Kohli', 'Ricky Ponting', 'MS Dhoni', 'AB de Villiers', 'Rohit Sharma', 'Brian Lara', 'Yuvraj Singh', 'Chris Gayle', 'Shane Warne'],
    animals: ['lion', 'tiger', 'elephant', 'giraffe', 'zebra', 'kangaroo', 'panda', 'dolphin', 'eagle', 'penguin'],
    countries: ['India', 'United States', 'Canada', 'Australia', 'Brazil', 'China', 'Japan', 'Germany', 'Russia', 'South Africa'],
    sports: ['football', 'cricket', 'basketball', 'tennis', 'hockey', 'golf', 'rugby', 'baseball', 'boxing', 'swimming'],
    movies: ['Inception', 'Titanic', 'Avatar', 'The Dark Knight', 'The Godfather', 'Forrest Gump', 'Jurassic Park', 'Pulp Fiction', 'The Matrix', 'Interstellar'],
    colors: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white', 'brown'],
    cars: ['Toyota', 'Ford', 'BMW', 'Mercedes', 'Tesla', 'Honda', 'Audi', 'Chevrolet', 'Volkswagen', 'Nissan'],
    cities: ['New York', 'London', 'Tokyo', 'Paris', 'Sydney', 'Dubai', 'Toronto', 'Moscow', 'Berlin', 'Beijing'],
    books: ['Harry Potter', 'The Lord of the Rings', 'The Hobbit', 'The Song of Fire and Ice', '50 shades of Grey', 'The Geeta', 'The Quran', 'The Bible'],
    vegetables: ['carrot', 'broccoli', 'potato', 'spinach', 'tomato', 'cucumber', 'onion', 'bell pepper', 'garlic', 'cauliflower'],
    vehicles: ['car', 'bicycle', 'motorcycle', 'airplane', 'train', 'boat', 'bus', 'truck', 'scooter', 'helicopter'],
    occupations: ['doctor', 'engineer', 'teacher', 'lawyer', 'artist', 'scientist', 'police officer', 'firefighter', 'chef', 'nurse'],
    companies: ['Apple', 'Google', 'Microsoft', 'Amazon', 'Facebook', 'Tesla', 'Samsung', 'Intel', 'IBM', 'Netflix'],
    planets: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Ceres'],
    sports: ['soccer', 'cricket', 'basketball', 'tennis', 'hockey', 'baseball', 'golf', 'rugby', 'volleyball', 'badminton'],
    superheroes: ['Spider-Man', 'Superman', 'Batman', 'Wonder Woman', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Black Panther', 'Flash'],
};


// Function to get a random category and word
function getRandomCategoryAndWord() {
    const categoryKeys = Object.keys(categories);
    const category = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
    const words = categories[category];
    const word = words[Math.floor(Math.random() * words.length)];
    return { category, word };
}

// Socket.io logic
io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    // Create a game
    socket.on('createGame', (gameId, username) => {
        games[gameId] = {
            players: [{ id: socket.id, name: username, score: 0, isImposter: false }],
            secretWord: '',
            category: '',
            started: false,
            currentRound: 1,
            scores: {},
            imposterHistory: [] // Track which players have been the imposter
        };
        socket.join(gameId);
        io.to(gameId).emit('gameStateUpdate', games[gameId]);
    });

    // Join a game
    socket.on('joinGame', (gameId, username) => {
        if (games[gameId] && !games[gameId].started) {
            games[gameId].players.push({ id: socket.id, name: username, score: 0, isImposter: false });
            socket.join(gameId);
            io.to(gameId).emit('gameStateUpdate', games[gameId]);
        } else {
            socket.emit('error', 'Game not found or already started');
        }
    });

    // Update score
    socket.on('updateScore', (gameId, playerId, points) => {
        const game = games[gameId];
        if (game) {
            const player = game.players.find(p => p.id === playerId);
            if (player) {
                player.score += points;
                io.to(gameId).emit('gameStateUpdate', game);
            }
        }
    });

    // Start game
    socket.on('startGame', (gameId) => {
        const game = games[gameId];
        if (game && !game.started) {
            const { category, word } = getRandomCategoryAndWord();
            game.secretWord = word;
            game.category = category;
            game.started = true;
            game.currentRound = 1;
            game.scores = {}; // Initialize scores
            game.imposterHistory = []; // Reset imposter history

            // Select the first imposter randomly
            selectNewImposter(gameId);
            io.to(gameId).emit('startGame', gameId);
            io.to(gameId).emit('gameStateUpdate', game);
        }
    });


    socket.on('fetchGameData', (gameId) => {
        const gameData = games[gameId]; // Fetch the game data based on the game ID
        if (gameData) {
            socket.emit('gameDataFetched', gameData); // Send game data back to the client
        } else {
            socket.emit('error', 'Game not found');
        }
    });


    // Submit word
    socket.on('submitWord', (gameId, word) => {
        const game = games[gameId];
        if (game) {
            const player = game.players.find(p => p.id === socket.id);
            if (player) {
                player.word = word;
                io.to(gameId).emit('gameStateUpdate', game);
            }
        }
    });

    // Handle vote
    socket.on('vote', (gameId, votedId) => {
        const game = games[gameId];
        if (game) {
            const player = game.players.find(p => p.id === socket.id);
            if (player) {
                player.vote = votedId;

                // Check if all players have voted
                const allVoted = game.players.every(p => p.vote);
                if (allVoted) {
                    // Count votes
                    const votes = game.players.reduce((acc, p) => {
                        acc[p.vote] = (acc[p.vote] || 0) + 1;
                        return acc;
                    }, {});

                    const imposter = game.players.find(p => p.isImposter);
                    const imposterVotes = votes[imposter.id] || 0;
                    const majorityVotes = Math.floor(game.players.length / 2) + 1;

                    if (imposterVotes >= majorityVotes) {
                        // Imposter was identified
                        game.players.forEach(p => {
                            if (!p.isImposter) {
                                p.score += 20;
                            }
                        });
                        io.to(gameId).emit('roundResult', 'Innocents won! 💯');
                    } else {
                        // Imposter was not identified
                        game.players.forEach(p => {
                            if (p.isImposter) {
                                p.score += 50;
                            }
                        });
                        io.to(gameId).emit('roundResult', 'Imposter won! ☠️');
                    }

                    // Reveal the imposter
                    io.to(gameId).emit('revealImposter', imposter.id);

                    // Prepare for the next round after a short delay
                    setTimeout(() => {
                        if (game.currentRound < 5) {
                            game.currentRound++;
                            game.players.forEach(p => {
                                p.word = null;
                                p.vote = null;
                                p.isImposter = false; // Reset imposter status
                            });

                            // Select a new imposter and generate new category and word
                            selectNewImposter(gameId);
                            const { category, word } = getRandomCategoryAndWord();
                            game.secretWord = word;
                            game.category = category;
                            io.to(gameId).emit('gameStateUpdate', game);
                        } else {
                            // End the game
                            io.to(gameId).emit('gameEnded', game.players);
                            delete games[gameId];
                        }
                    }, 5000); // 5-second delay before starting the next round
                } else {
                    // Send the updated game state to all players
                    io.to(gameId).emit('gameStateUpdate', game);
                }
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);

        for (const gameId in games) {
            const game = games[gameId];
            const playerIndex = game.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                game.players.splice(playerIndex, 1);

                if (game.players.length === 0) {
                    delete games[gameId];
                } else {
                    io.to(gameId).emit('gameStateUpdate', game);
                }

                break;
            }
        }
    });
});

// Function to select a new imposter, ensuring no repeats until all have been imposter
function selectNewImposter(gameId) {
    const game = games[gameId];
    if (!game) {
        console.error(`Game with ID ${gameId} not found`);
        return;
    }

    const availablePlayers = game.players.filter(p => !game.imposterHistory.includes(p.id));
    console.log('Available players for new imposter:', availablePlayers);

    if (availablePlayers.length === 0) {
        console.log('All players have been imposters. Resetting history.');
        game.imposterHistory = [];
        return selectNewImposter(gameId); // Retry selecting an imposter
    }

    const newImposterIndex = Math.floor(Math.random() * availablePlayers.length);
    const newImposter = availablePlayers[newImposterIndex];

    if (newImposter) {
        newImposter.isImposter = true;
        game.imposterHistory.push(newImposter.id);
    } else {
        console.error("No available players to select as imposter");
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
