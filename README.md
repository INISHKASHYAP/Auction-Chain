# Real-Time Auction System (CLI) Setup and Deployment Guide

This guide provides step-by-step instructions to set up and deploy a real-time auction system using Node.js and HyperDHT for decentralized communication. This system allows multiple clients to interact in real-time.

## Approach and Priorities

In designing and implementing this real-time auction system, our approach prioritized simplicity, scalability, and real-time updates. We aimed to create a decentralized architecture using HyperDHT for:

- **Decentralization:** Utilizing HyperDHT for peer-to-peer communication to reduce reliance on centralized servers and improve fault tolerance.
- **Real-Time Updates:** Ensuring instant updates for clients on new auctions, bids, and auction closures.

## Prerequisites

Before you begin, ensure you have the following installed:
```
- Node.js version 14.x or higher (Use `node --version` to check)
```
  - If you don't have Node.js, install it from [here](https://nodejs.org/).
- Install HyperDHT globally:
  ```
  npm install hyperdht -g
  ```

## Getting Started

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/INISHKASHYAP/Auction-Chain.git
   cd Auction-Chain
   ```

2. **Folder Structure:**
   ```
   auction-system
   ├── index.js                 # Main server logic
   ├── auction-client
   │   ├── client.js            # Client interaction logic
   │   └── server.js            # Client notification logic
   ├── start_hyperdht.sh        # Shell script to start HyperDHT
   ├── package.json             # Node.js dependencies
   └── README.md  
   ```

3. **Install Dependencies:**

   ```bash
   npm install
   ```

4. **Deploy HyperDHT for Peer Discovery:**

   Ensure HyperDHT is running to facilitate peer discovery and communication. Use the provided shell script (start_hyperdht.sh) or follow the instructions in the README to start HyperDHT.

   ```bash
   chmod +x start_hyperdht.sh
   ./start_hyperdht.sh --bootstrap --host 127.0.0.1 --port 30001
   ```

5. **Start the Auction Server:**

   ```bash
   npm start
   ```

   This command initializes the auction server, which listens for client connections and manages auctions.

6. **Client Interaction:**

   Clients can interact with the server using `auction-client/client.js` and `auction-client/server.js`. You'll need the **server's public key** (serverPubKey), which is generated when the auction server is started.

   To run the client and server in separate terminals:

   - In one terminal, run the auction server:
     ```bash
     npm run start-server
     node auction-client/server.js
     ```

   - In another terminal, run the client:
     ```bash
     npm run start-client
     node auction-client/client.js <server-public-key>
     ```

   The `server-public-key` is generated when you start the server and is required to establish communication.

7. **Viewing Logs:**

   Monitor server logs for auction events, bids, and closures in real-time on the terminals. The logs will display when auctions are created, bids are placed, and auctions are closed.

## Usage

### Opening an Auction

- **English Auction:**
  ```bash
  open
  item: Antique Timepiece
  price: 1000
  auction type: english
  ```

- **Dutch Auction:**
  ```bash
  open
  item: Limited Edition Print
  price: 500
  auction type: dutch
  price decrease rate: 5
  ```

### Placing a Bid

To place a bid on an active auction:

1. Enter the command: `bid`
2. Enter the auction ID: `[auction-id]`
3. Enter the bidder's name: `[name]`
4. Enter the bid amount: `[bid-amount]`

### Closing Auctions

- **Who can close auctions?** Only the client who started the auction can close it, determining the highest bid and notifying all connected clients.

## Approach

The development of this P2P auction system involved several key steps:

1. **Client-Server Setup:** Initially, I set up a basic client-server model using HyperDHT and HyperSwarm/RPC to ensure basic communication.
2. **Persistent Auction Data:** I integrated Hypercore and Hyperbee for persistent storage of auction data, allowing clients to securely store and retrieve auction information.
3. **Real-Time Broadcasting:** Broadcasting auction events (like new bids) in real-time across clients was a challenge. After experimenting with DHT lookup and broadcasting techniques, I refined the approach to ensure smooth real-time updates.
4. **Testing & Documentation:** After thorough testing, I improved the codebase and updated the documentation to provide clear and easy-to-follow instructions.

---

By implementing a decentralized, real-time auction system using HyperDHT, we aim to create a more efficient, fault-tolerant solution for peer-to-peer auctions.


"Bridging traditional auction principles with modern technology."
