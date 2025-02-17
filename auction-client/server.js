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
      port: 50001,
      keyPair: DHT.keyPair(dhtSeed),
      bootstrap: [{ host: '127.0.0.1', port: 30001 }]
    });
    await dht.ready();

    this.rpc = new RPC({ dht });

    this.server = this.rpc.createServer();
    await this.server.listen();
    console.log('Client RPC server started listening on public key:', this.server.publicKey.toString('hex'));
    
    // Send a ready signal
    this.server.respond('serverReady', () => {
      return 'Server is ready!';
    });

    this.registerClient();
    this.setupHandlers();
  }

  async registerClient() {
    try {
      console.log('Attempting to register with server...');
      await this.rpc.request(this.serverPublicKey, 'registerClient', Buffer.from(JSON.stringify({ serverPublicKey: this.server.publicKey.toString('hex') }), 'utf-8'));
      console.log('Client registered with the server.');
    } catch (error) {
      console.error('Error registering client:', error);
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