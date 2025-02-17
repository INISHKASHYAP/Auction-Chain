'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');

class ClientServer {
  constructor(serverPublicKey) {
    try {
      this.serverPublicKey = Buffer.from(serverPublicKey, 'hex');
    } catch (error) {
      console.error('Invalid server public key format.');
      process.exit(1);
    }
  }

  async init() {
    console.log('Initializing ClientServer...');
    const hcore = new Hypercore('./db/rpc-client-server');
    const hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'binary' });
    await hbee.ready();

    let dhtSeed = (await hbee.get('dht-seed'))?.value;
    if (!dhtSeed) {
      dhtSeed = crypto.randomBytes(32);
      await hbee.put('dht-seed', dhtSeed);
    }

    const dht = new DHT({
      port: 40002,
      keyPair: DHT.keyPair(dhtSeed),
      bootstrap: [{ host: '127.0.0.1', port: 30001 }]
    });

    console.log('Waiting for DHT to be ready...');
    await dht.ready();
    console.log('DHT is ready');

    this.rpc = new RPC({ dht });
    console.log('RPC instance created');

    this.server = this.rpc.createServer();
    console.log('RPC server created, attempting to listen...');
    await this.server.listen();
    console.log('Client RPC server started listening on public key:', this.server.publicKey.toString('hex'));
    
    // Send a ready signal with more detailed response
    this.server.respond('serverReady', () => {
      console.log('Received serverReady request');
      return Buffer.from(JSON.stringify({
        status: 'ready',
        timestamp: Date.now(),
        clientId: this.server.publicKey.toString('hex')
      }), 'utf-8');
    });

    // Wait a bit longer for network stabilization
    console.log('Waiting for network stabilization...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Attempting to register with main server...');
    await this.registerClient();
    this.setupHandlers();
  }

  async registerClient(retryCount = 5) {
    const register = async () => {
      try {
        console.log('Attempting to register with server...');
        const payload = {
          serverPublicKey: this.server.publicKey.toString('hex'),
          timestamp: Date.now()
        };
        const response = await this.rpc.request(
          this.serverPublicKey,
          'registerClient',
          Buffer.from(JSON.stringify(payload), 'utf-8'),
          { timeout: 5000 } // Add timeout option
        );
        console.log('Client registered with the server:', response.toString('utf-8'));
        return true;
      } catch (error) {
        console.error('Error registering client:', error.message);
        return false;
      }
    };

    let attempts = retryCount;
    while (attempts > 0) {
      const success = await register();
      if (success) return;
      
      console.log(`Registration failed. Retrying in 2 seconds... (${attempts} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts--;
    }
    
    if (attempts === 0) {
      console.error('Failed to register client after multiple attempts.');
      process.exit(1);
    }
  }

  setupHandlers() {
    this.server.respond('auctionUpdate', (reqRaw) => {
      const msg = JSON.parse(reqRaw.toString('utf-8'));
      if (msg.type === 'newAuction') {
        console.log(`> New auction opened: ${msg.auctionId}`, msg.auction);
      } else if (msg.type === 'newBid') {
        console.log(`> New bid placed on auction ${msg.auctionId}:`, msg.bid);
      } else if (msg.type === 'auctionClosed') {
        console.log(`> Auction ${msg.auctionId} closed with highest bid:`, msg.highestBid);
      } else if (msg.type === 'auctionClosedError') {
        console.log(`> Error ${msg.auctionId}`, msg.message);
      }
    });

    this.server.respond('newAuction', (reqRaw) => {
      const data = JSON.parse(reqRaw.toString('utf-8'));
      console.log(`> New auction created: ${data.auctionId}`, data.auction);
      return Buffer.from(JSON.stringify({ received: true }), 'utf-8');
    });

    this.server.respond('newBid', (reqRaw) => {
      const data = JSON.parse(reqRaw.toString('utf-8'));
      console.log(`> New bid received for auction ${data.auctionId}:`, data.bid);
      return Buffer.from(JSON.stringify({ received: true }), 'utf-8');
    });

    this.server.respond('auctionClosed', (reqRaw) => {
      const data = JSON.parse(reqRaw.toString('utf-8'));
      console.log(`> Auction closed ${data.auctionId}`, data);
      return Buffer.from(JSON.stringify({ received: true }), 'utf-8');
    });

    this.server.respond('priceUpdate', (reqRaw) => {
      const data = JSON.parse(reqRaw.toString('utf-8'));
      console.log(`\n> Price update for auction ${data.auctionId}`);
      console.log(`  Current price: ${data.currentPrice.toFixed(2)}`);
      return Buffer.from(JSON.stringify({ received: true }), 'utf-8');
    });
  }
}

const main = async () => {
  const serverPublicKey = process.argv[2];

  if (!serverPublicKey) {
    console.error('Error: Server public key is required.');
    process.exit(1);
  }

  console.log('Server public key received:', serverPublicKey);

  const auctionClient = new ClientServer(serverPublicKey);

  try {
    await auctionClient.init();
    console.log('ClientServer initialized successfully!');
  } catch (error) {
    console.error('Error initializing ClientServer:', error);
    process.exit(1);
  }
};

main().catch(console.error);