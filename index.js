'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');

class AuctionServer {
  constructor() {}

  async init() {
    console.log('Initializing Auction Server...');
    const hcore = new Hypercore('./db/rpc-server');
    this.hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'json' });
    await this.hbee.ready();
    console.log('Database ready');

    const dhtSeed = crypto.randomBytes(32);
    const dht = new DHT({
      port: 40001,
      keyPair: DHT.keyPair(dhtSeed),
      bootstrap: [{ host: '127.0.0.1', port: 30001 }]
    });

    console.log('Waiting for DHT to be ready...');
    await dht.ready();
    console.log('DHT is ready');

    const rpcSeed = crypto.randomBytes(32);
    this.rpc = new RPC({ seed: rpcSeed, dht });
    this.rpcServer = this.rpc.createServer();
    
    console.log('RPC server created, attempting to listen...');
    await this.rpcServer.listen();
    console.log('RPC server started listening on public key:', this.rpcServer.publicKey.toString('hex'));

    this.setupHandlers();
    console.log('Server initialization complete');
  }

  setupHandlers() {
    this.rpcServer.respond('serverReady', async () => {
      return Buffer.from(JSON.stringify({
        status: 'ready',
        timestamp: Date.now(),
        serverId: this.rpcServer.publicKey.toString('hex')
      }), 'utf-8');
    });

    this.rpcServer.respond('registerClient', async (reqRaw) => {
      try {
        const req = JSON.parse(reqRaw.toString('utf-8'));
        const serverId = this.rpcServer.publicKey.toString('hex');

        const clients = (await this.hbee.get(serverId))?.value || { clients: [] };
        
        // Check if client already exists
        if (!clients.clients.includes(req.serverPublicKey)) {
          clients.clients.push(req.serverPublicKey);
          await this.hbee.put(serverId, clients);
          console.log('Registered new client:', req.serverPublicKey);
        } else {
          console.log('Client already registered:', req.serverPublicKey);
        }

        return Buffer.from(JSON.stringify({ 
          success: true, 
          message: 'Registration successful',
          timestamp: Date.now()
        }), 'utf-8');
      } catch (error) {
        console.error('Error in registerClient:', error);
        return Buffer.from(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), 'utf-8');
      }
    });

    this.rpcServer.respond('openAuction', async (reqRaw) => {
      try {
        const req = JSON.parse(reqRaw.toString('utf-8'));
        const auctionId = crypto.randomBytes(16).toString('hex');

        const auctionDetails = { 
          ...req, 
          auctionId, 
          bids: [], 
          closed: false, 
          auctionType: req.auctionType || 'english', 
          startPrice: parseFloat(req.price),
          startTime: Date.now(),
          // Dutch auction parameters
          decrementRate: req.auctionType === 'dutch' ? (parseFloat(req.decrementRate) || 1) : 0,
          minimumPrice: req.auctionType === 'dutch' ? (parseFloat(req.minimumPrice) || 0) : 0,
          currentPrice: parseFloat(req.price) // Initial price
        };

        await this.hbee.put(auctionId, auctionDetails);
        await this.notifyClients('newAuction', { 
          auctionId, 
          auction: auctionDetails 
        });
        
        // For Dutch auctions, start price decrease
        if (req.auctionType === 'dutch') {
          this.startDutchAuctionTimer(auctionId);
        }

        return Buffer.from(JSON.stringify({ auctionId }), 'utf-8');
      } catch (error) {
        console.error('Error in openAuction:', error);
        return Buffer.from(JSON.stringify({ error: error.message }), 'utf-8');
      }
    });

    this.rpcServer.respond('placeBid', async (reqRaw) => {
      try {
        const req = JSON.parse(reqRaw.toString('utf-8'));
        const auctionDetails = (await this.hbee.get(req.auctionId))?.value;
        
        if (!auctionDetails) {
          return Buffer.from(JSON.stringify({ error: 'Auction not found' }), 'utf-8');
        }

        if (auctionDetails.closed) {
          return Buffer.from(JSON.stringify({ error: 'Auction already closed' }), 'utf-8');
        }

        const bidAmount = parseFloat(req.amount);

        if (auctionDetails.auctionType === 'dutch') {
          const currentPrice = this.calculateDutchPrice(
            auctionDetails.startPrice,
            auctionDetails.startTime,
            auctionDetails.decrementRate,
            auctionDetails.minimumPrice
          );

          if (bidAmount < currentPrice) {
            return Buffer.from(JSON.stringify({ 
              error: 'Bid must be equal to or higher than current price',
              currentPrice 
            }), 'utf-8');
          }

          // Dutch auction ends with first valid bid
          auctionDetails.closed = true;
          auctionDetails.winner = req.bidder;
          auctionDetails.finalPrice = bidAmount;
          auctionDetails.winningBid = {
            bidder: req.bidder,
            amount: bidAmount,
            timestamp: Date.now()
          };
        } else { // English auction
          // Get current highest bid or use starting price if no bids
          const currentHighestBid = auctionDetails.bids.length > 0 
            ? auctionDetails.bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, { amount: 0 })
            : { amount: auctionDetails.startPrice };

          if (bidAmount <= currentHighestBid.amount) {
            return Buffer.from(JSON.stringify({ 
              error: `Bid must be higher than ${currentHighestBid.amount === auctionDetails.startPrice ? 'starting price' : 'current highest bid'}`,
              currentHighestBid: currentHighestBid.amount,
              startPrice: auctionDetails.startPrice
            }), 'utf-8');
          }
        }

        // Record the bid
        const newBid = { 
          bidder: req.bidder, 
          amount: bidAmount, 
          timestamp: Date.now() 
        };
        auctionDetails.bids.push(newBid);
        auctionDetails.currentPrice = bidAmount;
        
        await this.hbee.put(req.auctionId, auctionDetails);
        await this.notifyClients('newBid', { 
          auctionId: req.auctionId, 
          bid: newBid,
          auctionType: auctionDetails.auctionType,
          closed: auctionDetails.closed,
          currentPrice: bidAmount
        });

        return Buffer.from(JSON.stringify({ 
          success: true,
          currentPrice: bidAmount,
          closed: auctionDetails.closed
        }), 'utf-8');
      } catch (error) {
        console.error('Error in placeBid:', error);
        return Buffer.from(JSON.stringify({ error: error.message }), 'utf-8');
      }
    });

    this.rpcServer.respond('closeAuction', async (reqRaw) => {
      try {
        const req = JSON.parse(reqRaw.toString('utf-8'));
        const auctionDetails = (await this.hbee.get(req.auctionId))?.value;
        
        if (!auctionDetails) {
          return Buffer.from(JSON.stringify({ 
            error: 'Auction not found' 
          }), 'utf-8');
        }

        if (auctionDetails.closed) {
          return Buffer.from(JSON.stringify({ 
            error: 'Auction already closed',
            highestBid: auctionDetails.highestBid || null
          }), 'utf-8');
        }

        // Mark auction as closed
        auctionDetails.closed = true;
        
        // For English auctions, find the highest bid
        if (auctionDetails.auctionType === 'english') {
          const highestBid = auctionDetails.bids.reduce(
            (max, bid) => bid.amount > max.amount ? bid : max, 
            { amount: 0, bidder: null, timestamp: null }
          );
          auctionDetails.highestBid = highestBid;
        }
        // For Dutch auctions, the winning bid is already stored
        
        // Update auction details
        await this.hbee.put(req.auctionId, auctionDetails);

        // Notify all clients about auction closure
        await this.notifyClients('auctionClosed', { 
          auctionId: req.auctionId, 
          highestBid: auctionDetails.highestBid,
          winningBid: auctionDetails.winningBid,
          auctionType: auctionDetails.auctionType,
          finalPrice: auctionDetails.finalPrice
        });

        return Buffer.from(JSON.stringify({ 
          success: true,
          highestBid: auctionDetails.highestBid,
          winningBid: auctionDetails.winningBid,
          auctionType: auctionDetails.auctionType
        }), 'utf-8');
      } catch (error) {
        console.error('Error in closeAuction:', error);
        return Buffer.from(JSON.stringify({ 
          error: error.message 
        }), 'utf-8');
      }
    });

    this.rpcServer.respond('getAuctionDetails', async (reqRaw) => {
      try {
        const req = JSON.parse(reqRaw.toString('utf-8'));
        const auctionDetails = (await this.hbee.get(req.auctionId))?.value;
        
        if (!auctionDetails) {
          return Buffer.from(JSON.stringify({ error: 'Auction not found' }), 'utf-8');
        }

        if (auctionDetails.auctionType === 'dutch') {
          const currentPrice = this.calculateDutchPrice(
            auctionDetails.startPrice,
            auctionDetails.startTime,
            auctionDetails.decrementRate,
            auctionDetails.minimumPrice
          );
          auctionDetails.currentPrice = currentPrice;
        }

        return Buffer.from(JSON.stringify(auctionDetails), 'utf-8');
      } catch (error) {
        console.error('Error in getAuctionDetails:', error);
        return Buffer.from(JSON.stringify({ error: error.message }), 'utf-8');
      }
    });
  }

  calculateDutchPrice(startPrice, startTime, decrementRate, minimumPrice) {
    const elapsedTime = (Date.now() - startTime) / 1000; // time in seconds
    const currentPrice = startPrice - (decrementRate * elapsedTime);
    return Math.max(currentPrice, minimumPrice);
  }

  async notifyClients(type, data) {
    try {
        const clients = (await this.hbee.get(this.rpcServer.publicKey.toString('hex')))?.value?.clients || [];
        const notifications = clients.map(async (clientKey) => {
            try {
                await this.rpc.request(
                    Buffer.from(clientKey, 'hex'),
                    type,
                    Buffer.from(JSON.stringify(data), 'utf-8'),
                    { timeout: 5000 }
                );
            } catch (error) {
                console.error(`Failed to notify client ${clientKey}:`, error.message);
            }
        });
        await Promise.all(notifications);
    } catch (error) {
        console.error('Error in notifyClients:', error);
    }
  }

  async startDutchAuctionTimer(auctionId) {
    const updateInterval = 5000; // 5000ms = 5 seconds between updates
    console.log(`\nStarting Dutch auction ${auctionId}`);
    console.log('Price updates will be shown every 5 seconds...\n');

    const timer = setInterval(async () => {
        try {
            const auctionDetails = (await this.hbee.get(auctionId))?.value;
            if (!auctionDetails || auctionDetails.closed) {
                console.log(`Dutch auction ${auctionId} closed`);
                clearInterval(timer);
                return;
            }

            const currentPrice = this.calculateDutchPrice(
                auctionDetails.startPrice,
                auctionDetails.startTime,
                auctionDetails.decrementRate,
                auctionDetails.minimumPrice
            );

            // Check if minimum price reached
            if (currentPrice <= auctionDetails.minimumPrice) {
                auctionDetails.closed = true;
                auctionDetails.currentPrice = auctionDetails.minimumPrice;
                await this.hbee.put(auctionId, auctionDetails);
                console.log(`\nAuction ${auctionId} reached minimum price of ${auctionDetails.minimumPrice}`);
                await this.notifyClients('auctionClosed', { 
                    auctionId, 
                    reason: 'minimum_price_reached',
                    finalPrice: auctionDetails.minimumPrice
                });
                clearInterval(timer);
            } else {
                // Update current price
                auctionDetails.currentPrice = currentPrice;
                await this.hbee.put(auctionId, auctionDetails);
                console.log(`Auction ${auctionId} current price: ${currentPrice.toFixed(2)}`);
                await this.notifyClients('priceUpdate', { 
                    auctionId, 
                    currentPrice 
                });
            }
        } catch (error) {
            console.error('Error in Dutch auction timer:', error);
            clearInterval(timer);
        }
    }, updateInterval);
  }
}

const main = async () => {
  const auctionServer = new AuctionServer();
  await auctionServer.init();
};

main().catch(console.error);
