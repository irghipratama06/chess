# Sphere Chess

Mobile-friendly React + Vite chess game for Sphere Testnet 2.

## Important deposit behavior

- Connecting the wallet does **not** deposit UCT.
- Clicking **Deposit & Verify in Wallet** opens a separate Sphere Wallet approval request.
- Move credits are added only after the wallet approves the UCT transfer.
- UCT is 18 decimals on Sphere testnet; the Connect `send` intent uses base units.
- The game recipient must be configured as `VITE_GAME_TREASURY` in Vercel.

### Vercel environment variable

Add:

`VITE_GAME_TREASURY=<YOUR_GAME_SPHERE_IDENTITY_OR_DIRECT_ADDRESS>`

The recipient must be a valid Sphere identity/address that can receive UCT. Do not put a private key or seed phrase in this variable.

## Sphere connection

The app uses the current Sphere Connect browser flow with `SPHERE_NETWORKS.testnet2`. In a Sphere iframe it uses postMessage; with the browser extension it uses the extension transport; otherwise it opens the Sphere hosted wallet popup.

## Board sizing

The chessboard is constrained to a square size and centered on mobile, preventing the board column from stretching/shrinking with the side panel.

## Deploy

1. Upload the extracted project files to the GitHub repository root.
2. Vercel preset: **Vite**.
3. Root Directory: `./`.
4. Add `VITE_GAME_TREASURY` in Vercel Environment Variables.
5. Redeploy.
