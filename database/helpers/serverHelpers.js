const Server = require('../models/Server');

// Get house balance
async function getHouseBalance() {
    try {
        let server = await Server.findOne({ serverId: 'default' });
        if (!server) {
            server = new Server({ serverId: 'default', houseBalance: 0 });
            await server.save();
        }
        return server.houseBalance;
    } catch (error) {
        console.error('Error getting house balance:', error);
        return 0;
    }
}

// Update house balance
async function updateHouse(amount) {
    try {
        let server = await Server.findOne({ serverId: 'default' });
        if (!server) {
            server = new Server({ serverId: 'default', houseBalance: amount });
        } else {
            server.houseBalance += amount;
        }
        await server.save();
        return server.houseBalance;
    } catch (error) {
        console.error('Error updating house balance:', error);
        return 0;
    }
}

module.exports = {
    getHouseBalance,
    updateHouse
};
