import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Chess } from 'chess.js'
import { ConnectClient, HOST_READY_TYPE, HOST_READY_TIMEOUT, SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect'
import { PostMessageTransport, ExtensionTransport } from '@unicitylabs/sphere-sdk/connect/browser'
import { getCoinIdBySymbol } from '@unicitylabs/sphere-sdk'
import './style.css'

const files = ['a','b','c','d','e','f','g','h']
const glyph = {
  p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚',
  P:'♙', N:'♘', B:'♗', R:'♖', Q:'♕', K:'♔'
}

const MOVES_PER_UCT = 20
const UCT_DECIMALS = 18
const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network'
const GAME_TREASURY = import.meta.env.VITE_GAME_TREASURY || ''
const UCT_COIN_ID = getCoinIdBySymbol('UCT')
const POPUP_NAME = 'sphere-wallet'
const POPUP_FEATURES = 'width=420,height=650'
const SESSION_KEY = 'sphere-chess-connect-session'

function calculateMoves(uct) {
  return Math.max(0, Math.floor(Number(uct) * MOVES_PER_UCT))
}

function isInIframe() {
  try { return window.parent !== window && window.self !== window.top } catch { return true }
}

function hasExtension() {
  try {
    const sphere = window.sphere
    return !!sphere && typeof sphere.isInstalled === 'function' && sphere.isInstalled() === true
  } catch { return false }
}

function walletConnectUrl() {
  return `${WALLET_URL}/connect?origin=${encodeURIComponent(location.origin)}`
}

function waitForHostReady(timeoutMs = HOST_READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Sphere Wallet did not become ready in time.'))
    }, timeoutMs)

    function handler(event) {
      if (event.data?.type !== HOST_READY_TYPE) return
      clearTimeout(timeout)
      window.removeEventListener('message', handler)
      resolve()
    }

    window.addEventListener('message', handler)
  })
}

const leaderboard = [
  ['1','NagaTimur','1,245 UCT','98%'],
  ['2','CaturManado','980 UCT','94%'],
  ['3','SphereKing','765 UCT','91%'],
  ['4','RajaPapan','620 UCT','88%'],
  ['5','KudaEmas','510 UCT','86%'],
  ['6','PemainBaru','420 UCT','82%'],
  ['7','Benteng99','355 UCT','79%'],
  ['8','SkakMat','290 UCT','76%']
]

function App() {
  const [wallet, setWallet] = useState(null)
  const [game, setGame] = useState(() => new Chess())
  const [selected, setSelected] = useState(null)
  const [stake, setStake] = useState('5')
  const [difficulty, setDifficulty] = useState('Medium')
  const [status, setStatus] = useState('Connect your Sphere Wallet to start playing.')
  const [credits, setCredits] = useState(0)
  const [tab, setTab] = useState('game')
  const [depositing, setDepositing] = useState(false)
  const clientRef = useRef(null)
  const transportRef = useRef(null)
  const popupRef = useRef(null)

  const board = game.board()
  const turnText = game.turn() === 'w' ? 'Your turn' : 'Computer is thinking…'
  const identity = wallet?.nametag || wallet?.directAddress || wallet?.chainPubkey || 'Connected'

  async function connectSphere() {
    setStatus('Opening Sphere Wallet approval…')

    if (isInIframe()) {
      const transport = PostMessageTransport.forClient()
      const client = new ConnectClient({
        transport,
        dapp: { name: 'Sphere Chess', description: 'UCT chess game', url: location.origin },
        network: SPHERE_NETWORKS.testnet2
      })
      const result = await client.connect()
      transportRef.current = transport
      clientRef.current = client
      return result
    }

    if (hasExtension()) {
      const transport = ExtensionTransport.forClient()
      const client = new ConnectClient({
        transport,
        dapp: { name: 'Sphere Chess', description: 'UCT chess game', url: location.origin },
        network: SPHERE_NETWORKS.testnet2
      })
      const result = await client.connect()
      transportRef.current = transport
      clientRef.current = client
      return result
    }

    const popup = window.open(walletConnectUrl(), POPUP_NAME, POPUP_FEATURES)
    if (!popup) throw new Error('Popup blocked. Allow popups for Sphere Chess and try again.')
    popupRef.current = popup

    const transport = PostMessageTransport.forClient({ target: popup, targetOrigin: WALLET_URL })
    const client = new ConnectClient({
      transport,
      dapp: { name: 'Sphere Chess', description: 'UCT chess game', url: location.origin },
      network: SPHERE_NETWORKS.testnet2
    })

    await waitForHostReady()
    const result = await client.connect()
    if (result.sessionId) sessionStorage.setItem(SESSION_KEY, result.sessionId)
    transportRef.current = transport
    clientRef.current = client
    return result
  }

  async function handleConnect() {
    try {
      const result = await connectSphere()
      setWallet(result.identity ?? result.connection?.identity ?? null)
      setStatus('Wallet connected. Deposits require a separate approval in Sphere Wallet.')
    } catch (e) {
      const code = e?.code ? ` (${e.code})` : ''
      setStatus(`${e?.message || 'Sphere connection failed. Please try again.'}${code}`)
    }
  }

  async function depositToGame() {
    if (!wallet || !clientRef.current) return setStatus('Connect your Sphere Wallet first.')
    const amount = Number(stake)
    if (!Number.isInteger(amount) || amount < 5) return setStatus('Minimum deposit is 5 UCT.')
    if (!GAME_TREASURY) return setStatus('Game treasury is not configured. Add VITE_GAME_TREASURY in Vercel before accepting real deposits.')
    if (!UCT_COIN_ID) return setStatus('UCT token ID is not available on this network.')

    setDepositing(true)
    setStatus(`Confirm ${amount} UCT in Sphere Wallet. Your move credits will be added only after the wallet approves the transfer.`)

    try {
      const baseUnits = (BigInt(amount) * (10n ** BigInt(UCT_DECIMALS))).toString()
      const result = await clientRef.current.intent('send', {
        to: GAME_TREASURY,
        amount: baseUnits,
        coinId: UCT_COIN_ID
      })

      setCredits(c => c + calculateMoves(amount))
      const pending = result?.deliveryPending ? ' The transfer is certified and delivery is still pending.' : ''
      setStatus(`Deposit approved: ${amount} UCT. ${calculateMoves(amount)} move credits added.${pending}`)
    } catch (e) {
      const code = e?.code ? ` (${e.code})` : ''
      if (e?.code === 'CERTIFICATION_UNCONFIRMED') {
        setStatus(`The UCT transfer may already be on-chain, but confirmation is still pending. Do not send it again.${code}`)
      } else {
        setStatus(`Deposit was not completed. No move credits were added. ${e?.message || 'Wallet approval was rejected.'}${code}`)
      }
    } finally {
      setDepositing(false)
    }
  }

  function newGame() {
    setGame(new Chess())
    setSelected(null)
    setStatus(credits > 0 ? 'New game started. You are playing as White.' : 'Make a verified UCT deposit to receive move credits.')
  }

  function makeComputerMove(nextGame) {
    const moves = nextGame.moves({ verbose: true })
    if (!moves.length) return
    const values = { p:1, n:3, b:3, r:5, q:9, k:100 }
    const scored = moves.map(m => {
      let score = Math.random() * 0.6
      if (m.san.includes('#')) score += 1000
      else if (m.san.includes('+')) score += 30
      if (m.captured) score += (values[m.captured] || 0) * 5
      if (m.promotion) score += 8
      return { m, score }
    }).sort((a,b) => b.score-a.score)
    const chosen = scored[0].m
    nextGame.move(chosen)
    setGame(new Chess(nextGame.fen()))
    if (nextGame.isCheckmate()) setStatus('Checkmate! The computer wins.')
    else if (nextGame.isDraw()) setStatus('Game ended in a draw.')
    else setStatus('Your turn.')
  }

  function clickSquare(row, col) {
    if (!wallet) return setStatus('Connect your Sphere Wallet first.')
    if (credits <= 0) return setStatus('You have no move credits. Make a verified UCT deposit first.')
    if (game.turn() !== 'w') return

    const square = `${files[col]}${8-row}`
    if (!selected) {
      const piece = board[row][col]
      if (piece?.color === 'w') setSelected(square)
      return
    }

    const next = new Chess(game.fen())
    try {
      next.move({ from: selected, to: square, promotion: 'q' })
      setCredits(c => Math.max(0, c - 1))
      setSelected(null)
      setGame(new Chess(next.fen()))
      if (next.isCheckmate()) {
        setStatus('You win! Checkmate.')
        return
      }
      if (next.isDraw()) {
        setStatus('Game ended in a draw.')
        return
      }
      setStatus('Computer is thinking…')
      setTimeout(() => makeComputerMove(next), difficulty === 'Hard' ? 700 : difficulty === 'Medium' ? 450 : 250)
    } catch {
      setSelected(null)
      setStatus('Invalid move.')
    }
  }

  useEffect(() => {
    return () => {
      transportRef.current?.destroy?.()
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
    }
  }, [])

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="brand">♟ <span>Sphere Chess</span></div>
          <p>Play chess against the computer using UCT Testnet 2</p>
        </div>
        {!wallet ? (
          <button className="primary" onClick={handleConnect}>Connect Sphere Wallet</button>
        ) : (
          <div className="wallet">✓ {String(identity).slice(0, 18)}{String(identity).length > 18 ? '…' : ''}</div>
        )}
      </header>

      <section className="hero">
        <h1>Play chess, earn move credits, and climb the leaderboard.</h1>
        <p>Connect your Sphere wallet, then approve every UCT deposit inside your wallet. <b>50% of every weekly deposit feeds the prize pool for the top 5 players.</b></p>
      </section>

      <nav className="tabs">
        <button className={tab==='game'?'active':''} onClick={()=>setTab('game')}>♟ Game</button>
        <button className={tab==='leaderboard'?'active':''} onClick={()=>setTab('leaderboard')}>🏆 Leaderboard</button>
      </nav>

      {tab === 'game' ? (
        <>
          <section className="panel controls">
            <div className="field">
              <label>UCT Deposit</label>
              <div className="input-row"><input value={stake} onChange={e=>setStake(e.target.value)} inputMode="numeric" min="5" step="5" /><span>UCT</span></div>
              <small className="hint">5 UCT = 100 moves • 10 UCT = 200 moves • 15 UCT = 300 moves</small>
            </div>
            <div className="field">
              <label>Computer Difficulty</label>
              <select value={difficulty} onChange={e=>setDifficulty(e.target.value)}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </div>
            <button className="deposit-button" disabled={!wallet || depositing} onClick={depositToGame}>{depositing ? 'Waiting for Wallet Approval…' : 'Deposit & Verify in Wallet'}</button>
            <button onClick={newGame}>New Game</button>
          </section>

          <div className="credit-line"><span>Move credits: <b>{credits}</b></span><span className="network">Sphere Testnet 2</span></div>
          <p className="status">{status}</p>

          <section className="game-wrap">
            <div className="board-column">
              <div className="playerbar"><span>You</span><b>White</b><span>{turnText}</span></div>
              <div className="board-shell">
                <div className="board">
                  {board.map((row,r)=>row.map((cell,c)=>{
                    const sq=`${files[c]}${8-r}`
                    const dark=(r+c)%2===1
                    return <button key={sq} className={`sq ${dark?'dark':'light'} ${selected===sq?'selected':''}`} onClick={()=>clickSquare(r,c)}>
                      {cell && <span className={cell.color==='w'?'white-piece':'black-piece'}>{glyph[cell.color==='w'?cell.type.toUpperCase():cell.type]}</span>}
                    </button>
                  }))}
                </div>
              </div>
              <div className="playerbar"><span>Computer</span><b>Black</b><span>● Online</span></div>
            </div>

            <aside className="panel side">
              <h2>Game Information</h2>
              <div className="stat"><span>Deposit</span><b>{stake} UCT</b></div>
              <div className="stat"><span>Moves Remaining</span><b>{credits}</b></div>
              <div className="stat"><span>Difficulty</span><b>{difficulty}</b></div>
              <hr/>
              <h3>Deposit Verification</h3>
              <p>Connecting your wallet does not deposit funds. Every deposit opens a separate Sphere Wallet approval request. Move credits are added only after the wallet accepts the UCT transfer.</p>
              <h3>Move Credits</h3>
              <p>Every 1 UCT = 20 moves. 5 UCT = 100 moves, 10 UCT = 200 moves, 15 UCT = 300 moves.</p>
              <h3>Weekly Prize</h3>
              <p>50% of weekly deposits goes into the prize pool.</p>
              <p className="prize">🏆 Top 5 Players</p>
              <small>For real production deposits, VITE_GAME_TREASURY must point to the game's receiving Sphere identity/address. Prize accounting and payouts should be finalized by a backend.</small>
            </aside>
          </section>
        </>
      ) : (
        <section className="panel leaderboard">
          <div className="leader-head"><div><h2>🏆 Leaderboard</h2><p>Sample rankings for the application interface.</p></div><div className="week">This Week</div></div>
          <div className="pool"><span>Weekly Prize Pool</span><b>50% of weekly deposits</b></div>
          {leaderboard.map(([rank,name,prize,win])=><div className="rank" key={rank}><strong>#{rank}</strong><span className="avatar">{name[0]}</span><div><b>{name}</b><small>Win rate {win}</small></div><em>{prize}</em></div>)}
          <p className="footnote">The top 5 players are eligible to share the prize pool according to the game rules implemented by the backend.</p>
        </section>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
