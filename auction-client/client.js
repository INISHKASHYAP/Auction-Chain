'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');

class AuctionClient {
  constructor(serverPublicKey, askQuestion) {
    this.serverPublicKey = Buffer.from(serverPublicKey, 'hex');
    this.clientId = crypto.randomBytes(16).toString('hex');
    this.askQuestion = askQuestion;
  }

  async init() {
    console.log('Initializing client...');
    const hcore = new Hypercore('./db/rpc-client');
    const hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'binary' });
    await hbee.ready();

    let dhtSeed = (await hbee.get('dht-seed'))?.value;
    if (!dhtSeed) {
      dhtSeed = crypto.randomBytes(32);
      await hbee.put('dht-seed', dhtSeed);
    }

    const dht = new DHT({
      port: 40003, // Changed port to avoid conflicts
      keyPair: DHT.keyPair(dhtSeed),
      bootstrap: [{ host: '127.0.0.1', port: 30001 }] // Match the bootstrap node port
    });
    
    console.log('Connecting to DHT...');
    await dht.ready();
    console.log('DHT connected');

    this.rpc = new RPC({ dht });
    console.log('RPC initialized');
  }

  async checkServerReady() {
    try {
        console.log('Checking if the server is ready...');
        const response = await this.rpc.request(
            this.serverPublicKey, 
            'serverReady', 
            Buffer.from('Check if server is ready', 'utf-8'),
            { timeout: 5000 } // Add timeout
        );
        const result = JSON.parse(response.toString('utf-8'));
        console.log('Server response:', result);
        return true;
    } catch (error) {
        console.error('Error connecting to server:', error.message);
        return false;
    }
  }

  async openAuction(item, price, auctionType = 'english') {
    try {
        // Validate auction type
        if (!['english', 'dutch'].includes(auctionType.toLowerCase())) {
            console.log('\nError: Invalid auction type. Must be either "english" or "dutch"');
            return;
        }

        let decrementRate;
        let minimumPrice;
        
        if (auctionType.toLowerCase() === 'dutch') {
            // Use the existing readline interface from main()
            const getDecreaseRate = async () => {
                while (true) {
                    const input = await this.askQuestion('Enter price decrease rate per second (1-100): ');
                    const rate = parseFloat(input);

                    // Validate decrement rate
                    if (isNaN(rate) || rate <= 0 || rate > 100) {
                        console.log('Please enter a valid number between 1 and 100');
                        continue;
                    }
                    
                    // Ensure decrement rate isn't too high compared to starting price
                    if (rate > price * 0.2) { // Max 20% of price per second
                        console.log(`Decrease rate too high. Maximum allowed is ${Math.floor(price * 0.2)} per second`);
                        continue;
                    }
                    
                    return rate;
                }
            };

            decrementRate = await getDecreaseRate();
            minimumPrice = Math.floor(price * 0.5);
            console.log(`\nMinimum price set to: ${minimumPrice}`);
        }

        const payload = { 
            item, 
            price, 
            clientId: this.clientId, 
            auctionType: auctionType.toLowerCase(),
            decrementRate: auctionType.toLowerCase() === 'dutch' ? decrementRate : undefined,
            minimumPrice: auctionType.toLowerCase() === 'dutch' ? minimumPrice : undefined
        };
        
        const respRaw = await this.rpc.request(
            this.serverPublicKey, 
            'openAuction', 
            Buffer.from(JSON.stringify(payload), 'utf-8')
        );
        const resp = JSON.parse(respRaw.toString('utf-8'));
        
        if (resp.error) {
            console.log('\nError creating auction:', resp.error);
            return;
        }

        console.log('\nAuction opened with ID:', resp.auctionId);
        if (auctionType.toLowerCase() === 'dutch') {
            console.log('Dutch auction parameters:');
            console.log('- Starting price:', price);
            console.log('- Price decreases by:', decrementRate, 'per second');
            console.log('- Minimum price:', minimumPrice);
        }
        return resp.auctionId;
    } catch (error) {
        console.error('Error opening auction:', error.message);
    }
  }

  async placeBid(auctionId, bidder, amount) {
    try {
        // First get auction details
        const detailsRaw = await this.rpc.request(
            this.serverPublicKey,
            'getAuctionDetails',
            Buffer.from(JSON.stringify({ auctionId }), 'utf-8')
        );
        const details = JSON.parse(detailsRaw.toString('utf-8'));

        if (details.error) {
            console.log('\nError:', details.error);
            return;
        }

        if (details.closed) {
            console.log('\nThis auction is already closed');
            return;
        }

        console.log('\nCurrent auction status:');
        console.log('- Type:', details.auctionType);
        console.log('- Current price:', details.currentPrice);
        if (details.auctionType === 'dutch') {
            console.log('- Price decreasing by:', details.decrementRate, 'per second');
            console.log('- Minimum price:', details.minimumPrice);
        }

        const payload = { 
            auctionId, 
            bidder, 
            amount: parseFloat(amount), 
            clientId: this.clientId 
        };
        
        const respRaw = await this.rpc.request(
            this.serverPublicKey, 
            'placeBid', 
            Buffer.from(JSON.stringify(payload), 'utf-8')
        );
        const resp = JSON.parse(respRaw.toString('utf-8'));
        
        if (resp.error) {
            if (resp.currentPrice) {
                console.log(`\nBid failed: ${resp.error}`);
                console.log(`Current price is: ${resp.currentPrice}`);
            } else {
                console.log(`\nError: ${resp.error}`);
            }
            return;
        }

        if (resp.success) {
            console.log('\nBid placed successfully!');
            if (resp.closed) {
                console.log('Congratulations! You won the Dutch auction!');
                console.log(`Final price: ${resp.currentPrice}`);
            }
        }
    } catch (error) {
        console.error('Error placing bid:', error.message);
    }
  }

  async closeAuction(auctionId) {
    try {
        const payload = { 
            auctionId, 
            clientId: this.clientId,
            timestamp: Date.now()
        };
        
        console.log('Attempting to close auction:', auctionId);
        const respRaw = await this.rpc.request(
            this.serverPublicKey, 
            'closeAuction', 
            Buffer.from(JSON.stringify(payload), 'utf-8')
        );
        
        const resp = JSON.parse(respRaw.toString('utf-8'));
        
        if (resp.error) {
            console.log('Error closing auction:', resp.error);
            return;
        }
        
        if (resp.highestBid && resp.highestBid.amount > 0) {
            console.log('\nAuction closed successfully:');
            console.log('- Winning bidder:', resp.highestBid.bidder);
            console.log('- Winning amount:', resp.highestBid.amount);
            console.log('- Timestamp:', new Date(resp.highestBid.timestamp).toLocaleString());
        } else {
            console.log('\nAuction closed with no valid bids');
        }
    } catch (error) {
        console.error('Error closing auction:', error.message);
    }
  }
}

const main = async () => {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (query) => {
    return new Promise((resolve) => readline.question(query, resolve));
  };

  const serverPublicKey = await askQuestion('Enter server public key to start: ');
  const auctionClient = new AuctionClient(serverPublicKey, askQuestion);
  await auctionClient.init();

  // Wait until the server is ready
  let serverReady = false;
  while (!serverReady) {
    serverReady = await auctionClient.checkServerReady();
    if (!serverReady) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Retry every second
    }
  }

  while (true) {
    const command = await askQuestion('Enter command (open, bid, close, exit): ');

    if (command === 'exit') {
      console.log('Exiting...');
      readline.close();
      break;
    }

    if (command === 'open') {
      const item = await askQuestion('Enter item: ');
      const price = await askQuestion('Enter price: ');
      let auctionType;
      while (true) {
        auctionType = await askQuestion('Enter auction type (english/dutch): ');
        if (['english', 'dutch'].includes(auctionType.toLowerCase())) {
          break;
        }
        console.log('Invalid auction type. Please enter either "english" or "dutch"');
      }
      await auctionClient.openAuction(item, parseFloat(price), auctionType);
    } else if (command === 'bid') {
      const auctionId = await askQuestion('Enter auction ID: ');
      const bidder = await askQuestion('Enter bidder: ');
      const amount = await askQuestion('Enter amount: ');
      await auctionClient.placeBid(auctionId, bidder, parseFloat(amount));
    } else if (command === 'close') {
      const auctionId = await askQuestion('Enter auction ID: ');
      await auctionClient.closeAuction(auctionId);
    } else {
      console.log('Invalid command');
    }
  }
};

main().catch(console.error);