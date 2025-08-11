\# XRPL RWA CLI - Quick Reference



\## 🚀 Essential Commands



\### Setup \& Health

```bash

node xrpl-cli.js setup          # Interactive wizard

node xrpl-cli.js health         # System status

node xrpl-cli.js help           # All commands

```



\### Wallet Management

```bash

node xrpl-cli.js wallet:create --name "My Wallet"

node xrpl-cli.js wallet:list

node xrpl-cli.js wallet:balance

```



\### Token Creation

```bash

node xrpl-cli.js token:create --name "Property Token" --code "PROP" --supply 1000000

node xrpl-cli.js token:list

```



\### Investment Operations

```bash

node xrpl-cli.js invest:list           # See opportunities

node xrpl-cli.js invest:trustline      # Create trustline

node xrpl-cli.js invest:portfolio      # View holdings

```



\## 📋 Common Workflows



\### Asset Owner (Tokenize Property)

1\. `wallet:create` - Create company wallet

2\. `token:create` - Tokenize your asset

3\. `token:list` - Verify token creation



\### Investor (Buy Tokens)

1\. `wallet:create` - Create investment wallet

2\. `invest:list` - Browse opportunities

3\. `invest:trustline` - Enable token receipt

4\. `invest:portfolio` - Track investments



\## 🔧 Troubleshooting

\- \*\*API Error\*\*: Check `node xrpl-cli.js health`

\- \*\*Wallet Issues\*\*: Run `node xrpl-cli.js wallet:select`

\- \*\*Missing Commands\*\*: Update with `npm install`



\## 📞 Emergency

\- Backup wallets: Copy `.xrpl-cli/` folder

\- Lost access: Use seed phrase with `wallet:import`

\- System down: Restart API server first



\## 🌐 Network Status

\- \*\*TESTNET\*\*: Safe for testing (current)

\- \*\*MAINNET\*\*: Production (real money)

\- Switch via environment variables

