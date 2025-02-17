# Real-Time Auction System (CLI) Setup and Deployment Guide

This guide provides step-by-step instructions to set up and deploy a real-time auction system using Node.js and HyperDHT for decentralized communication. This system allows multiple clients to interact with a central server for managing auctions, bids, and notifications in real-time.

Demo: https://www.loom.com/share/007e16c39aee4c889733dc10aaaa5b50?sid=cbae188b-a8f0-43c6-b2f9-5a389b116a66

## Approach and Priorities

In designing and implementing this real-time auction system, our approach prioritized simplicity, scalability, and real-time updates. We aimed to create a decentralized architecture using HyperDHT for peer discovery and communication, ensuring robustness and fault tolerance. Key priorities included:

- **Decentralization:** Utilizing HyperDHT for peer-to-peer communication to reduce reliance on centralized servers and improve fault tolerance.
  
- **Real-Time Updates:** Ensuring instant updates for clients on new auctions, bids, and auction closures.
  

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (version 14.x or higher)
-  HyperDHT running globaly ``` npm install hyperdht -g```

## Getting Started

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/your-repo/auction-system.git
   cd auction-system

2. **Folder Structure:**
    ```
    auction-system
    ├── index.js        # Main server logic
    ├── auction-client/client.js        # Client interaction logic
    ├──  auction-client/server.js       # Client notification logic
    ├── start_hyperdht.sh    # Shell script to start HyperDHT
    ├── package.json     # Node.js dependencies
    └── README.md  
    ```


3. **Install the dependencies:**

``` 
npm intall
```

4. **Deploy HyperDHT for Peer Discovery:**

Ensure HyperDHT is running to facilitate peer discovery and communication. Use the provided shell script (start_hyperdht.sh) or follow the instructions in the README to start HyperDHT.

    ```
        chmod +x start_hyperdht.sh
        ./start_hyperdht.sh --bootstrap --host 127.0.0.1 --port 30001
    ```

5. **Start the Auction Server:**

``` 
npm start
```

This command initializes the auction server, which listens for client connections and manages auctions.


6. **Client Interaction:**

Clients can interact with the server using auction-client/client.js and auction-client/server.js. Add server's public key (serverPubKey) obtained during server startup when prompt.

```npm run client```
```node run server```


Run client and server in seperate server, since it is a CLI tool


7. **Viewing Logs:**

Monitor server logs for auction events, bids, and closures in real-time on the terminals.



8. **Usage**

Opening an Auction: Clients can open new auctions by sending requests to the server using client.js. (you can run multiple instance by coyping code instance)

Placing Bids: Clients can place bids on active auctions via client.js, triggering real-time updates for other clients.

Closing Auctions: Only the client who started the auction can close it, determining the highest bid and notifying all clients.



9. **Approach:**


    In approaching the development of the P2P auction system, I began by setting up a basic client, server using HyperDHT and HyperSwarm/RPC to understand the request-response model and ensure basic communication between clients and the server. This foundational setup helped me grasp the essentials of peer discovery and handling RPC calls effectively.

    Next, I explored how Hypercore and Hyperbee could be integrated to persistently store auction data on the server sent by clients. 

    Once this was up and running, a significant challenge was broadcasting information to all connected clients in real-time. Initially experimenting with DHT lookup and announcements for broadcasting,  but didn't had much success. Refining the approach, I opted for a request-respond model where each client and their own server communicated with a auction server. This method proved more reliable for broadcasting updates and notifications to all clients simultaneously.


    After testing thoroughly I improvised the code and documentation.



