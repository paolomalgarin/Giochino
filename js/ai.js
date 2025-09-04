// Copia/incolla questa funzione dentro app.js (dopo le helper già presenti).
function findBestMove() {
    // CONFIG
    const MAX_DEPTH = 3;          // profondità di ricerca (3 è un buon compromesso)
    const MAX_MOVES = 80;         // limite di branching (ordina e taglia)
    const TIME_BUDGET_MS = 1200;  // se vuoi limitare il tempo, non usato attivamente qui (placeholder)

    // Determina quale giocatore sta giocando per la AI:
    // la AI è il giocatore opposto ad App.mode (come fa il tuo playGame)
    const aiIsHost = App.mode !== 'host'; // se App.mode è host, l'AI è guest (p2)
    const aiVal = aiIsHost ? 1 : -1;      // p1 -> 1, p2 -> -1
    const humanVal = -aiVal;

    // Clona uno stato di gioco (deep copy)
    function cloneState(state) {
        return {
            field: state.field.map(row => row.slice()),
            players: {
                p1: { ...state.players.p1 },
                p2: { ...state.players.p2 },
            },
            maxAmmo: state.maxAmmo,
            running: state.running,
        };
    }

    // helper generici usando lo stato passato (non App.game)
    function getNearbyCellsState(state, i, j, radius = 2) {
        const nearby = [];
        for (let di = -radius; di <= radius; di++) {
            for (let dj = -radius; dj <= radius; dj++) {
                if (di === 0 && dj === 0) continue;
                const ni = i + di, nj = j + dj;
                if (ni < 0 || ni >= SIZE || nj < 0 || nj >= SIZE) continue;
                nearby.push({ i: ni, j: nj });
            }
        }
        return nearby;
    }

    function getMoovableCellsState(state, i, j, myVal) {
        const result = new Set();
        const addToResult = (x, y) => result.add(`${x},${y}`);

        // 8 adiacenti
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                if (di === 0 && dj === 0) continue;
                const ni = i + di, nj = j + dj;
                if (ni >= 0 && ni < SIZE && nj >= 0 && nj < SIZE) addToResult(ni, nj);
            }
        }

        // Se la cella corrente è del nostro colore, espandi il blob ortogonale
        if (state.field[i][j] === myVal) {
            const visited = new Set();
            const queue = [[i, j]];
            while (queue.length > 0) {
                const [ci, cj] = queue.shift();
                const key = `${ci},${cj}`;
                if (visited.has(key)) continue;
                visited.add(key);
                addToResult(ci, cj);
                const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
                for (const [di, dj] of dirs) {
                    const ni = ci + di, nj = cj + dj;
                    if (ni >= 0 && ni < SIZE && nj >= 0 && nj < SIZE && state.field[ni][nj] === myVal && !visited.has(`${ni},${nj}`)) {
                        queue.push([ni, nj]);
                    }
                }
            }
        }

        return Array.from(result).map(s => {
            const [x, y] = s.split(',').map(Number);
            return { i: x, j: y };
        });
    }

    function isCellInArraySimple(i, j, arr) {
        return Array.isArray(arr) && arr.some(c => c.i === i && c.j === j);
    }

    // applica una mossa su uno stato clonato (non modifica App)
    // move: { i, j, btn }, playerVal = 1 or -1
    function applyMove(state, move, playerVal) {
        const res = cloneState(state);
        const currentPlayer = playerVal === 1 ? res.players.p1 : res.players.p2;
        const enemyPlayer = playerVal === 1 ? res.players.p2 : res.players.p1;
        const val = playerVal;

        if (move.btn === 0) {
            // sparo: coloro la cella
            res.field[move.i][move.j] = val;
            currentPlayer.ammo = Math.max(0, currentPlayer.ammo - 1);
            // se ho dipinto la cella su cui sta il nemico -> il nemico perde una vita
            if (move.i === enemyPlayer.i && move.j === enemyPlayer.j && res.field[enemyPlayer.i][enemyPlayer.j] === val) {
                enemyPlayer.lives -= 1;
            }
        } else {
            // movimento: aggiorno posizione, isSquid true
            currentPlayer.i = move.i;
            currentPlayer.j = move.j;
            // se la cella è del mio colore ripristino ammo
            if (res.field[move.i][move.j] === val) currentPlayer.ammo = res.maxAmmo;
        }

        // dopo la mossa, se il giocatore si trova su cella di colore opposto, perde vita
        if (res.field[currentPlayer.i][currentPlayer.j] === -val) {
            currentPlayer.lives -= 1;
        }

        return res;
    }

    // valutazione euristica dello stato per AI (più alto = meglio per AI)
    function evaluateState(state, aiValLocal) {
        const aiPlayer = aiValLocal === 1 ? state.players.p1 : state.players.p2;
        const huPlayer = aiValLocal === 1 ? state.players.p2 : state.players.p1;

        // 1) vite: massiccia importanza
        const lifeScore = (aiPlayer.lives - huPlayer.lives) * 1000;

        // 2) territorio: conteggio celle colore
        let aiCells = 0, huCells = 0;
        for (let x = 0; x < SIZE; x++) {
            for (let y = 0; y < SIZE; y++) {
                if (state.field[x][y] === aiValLocal) aiCells++;
                else if (state.field[x][y] === -aiValLocal) huCells++;
            }
        }
        const territoryScore = (aiCells - huCells) * 10;

        // 3) connected blob size (favorisce espansione da posizione)
        function blobSizeFrom(posI, posJ, val) {
            if (posI == null) return 0;
            if (posI < 0 || posJ < 0) return 0;
            const visited = new Set();
            const queue = [[posI, posJ]];
            let count = 0;
            while (queue.length) {
                const [ci, cj] = queue.shift();
                const key = `${ci},${cj}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (state.field[ci][cj] !== val) continue;
                count++;
                const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
                for (const [di, dj] of dirs) {
                    const ni = ci + di, nj = cj + dj;
                    if (ni>=0 && ni<SIZE && nj>=0 && nj<SIZE && !visited.has(`${ni},${nj}`)) {
                        queue.push([ni, nj]);
                    }
                }
            }
            return count;
        }
        const aiBlob = blobSizeFrom(aiPlayer.i, aiPlayer.j, aiValLocal);
        const huBlob = blobSizeFrom(huPlayer.i, huPlayer.j, -aiValLocal);
        const blobScore = (aiBlob - huBlob) * 30;

        // 4) mobilità: numero di mosse possibili
        const aiMoves = getMoovableCellsState(state, aiPlayer.i, aiPlayer.j, aiValLocal).length + getNearbyCellsState(state, aiPlayer.i, aiPlayer.j).length;
        const huMoves = getMoovableCellsState(state, huPlayer.i, huPlayer.j, -aiValLocal).length + getNearbyCellsState(state, huPlayer.i, huPlayer.j).length;
        const mobilityScore = (aiMoves - huMoves) * 3;

        // 5) ammo: valore marginale
        const ammoScore = (aiPlayer.ammo - huPlayer.ammo) * 15;

        // 6) penalità se il giocatore sta su cella avversario (rischio vita)
        const aiOnEnemyCell = state.field[aiPlayer.i][aiPlayer.j] === -aiValLocal ? -200 : 0;
        const huOnEnemyCell = state.field[huPlayer.i][huPlayer.j] === aiValLocal ? 200 : 0;

        // somma
        return lifeScore + territoryScore + blobScore + mobilityScore + ammoScore + aiOnEnemyCell + huOnEnemyCell;
    }

    // Genera mosse legali per playerVal sullo stato dato
    function generateMoves(state, playerVal) {
        const pl = playerVal === 1 ? state.players.p1 : state.players.p2;
        const myVal = playerVal;
        const movables = getMoovableCellsState(state, pl.i, pl.j, myVal);
        const shootables = getNearbyCellsState(state, pl.i, pl.j, 2);

        const moves = [];

        // 1) spari (btn === 0) solo se ammo > 0 e non sparare su cella dello stesso colore
        if (pl.ammo > 0) {
            for (const c of shootables) {
                if (state.field[c.i][c.j] === myVal) continue; // proibito
                // heur: preferisci colpire nemico o espandere (ma lascio generare tutto)
                moves.push({ i: c.i, j: c.j, btn: 0, type: 'shoot' });
            }
        }

        // 2) movimenti (btn !== 0) su tutte le cell possibili (includo restare sulla posizione corrente)
        for (const c of movables) {
            // evita muovere su cella che è del nemico (su cui si perde vita) a meno che sia utile
            moves.push({ i: c.i, j: c.j, btn: 1, type: 'move' });
        }

        // Se nessuna mossa trovata (molto raro), fa nulla (restafermo)
        if (moves.length === 0) {
            moves.push({ i: pl.i, j: pl.j, btn: 1, type: 'move' });
        }

        return moves;
    }

    // Ordina mosse per potenzialità (move ordering)
    function orderMoves(state, moves, playerVal) {
        // assegna un punteggio rapido per tagliare il branching: priorità a kill, espansione, ammo refill
        const scored = moves.map(m => {
            let score = 0;
            const pl = playerVal === 1 ? state.players.p1 : state.players.p2;
            const enemy = playerVal === 1 ? state.players.p2 : state.players.p1;

            if (m.btn === 0) { // shoot
                // colpire direttamente il nemico è molto buono
                if (m.i === enemy.i && m.j === enemy.j) score += 1000;
                // dipingere vicino al nemico vicino -> buon attacco
                const distToEnemy = Math.abs(m.i - enemy.i) + Math.abs(m.j - enemy.j);
                score += Math.max(0, 10 - distToEnemy);
            } else {
                // muovere su cella dello stesso colore => refill ammo (buono)
                if (state.field[m.i][m.j] === playerVal) score += 80;
                // muovere su cella avversaria è rischioso (perdita vita)
                if (state.field[m.i][m.j] === -playerVal) score -= 200;
                // maggiore blob size in quella posizione -> preferito (espansione)
                // stima: contare ortogonalmente
                let sameAdj = 0;
                const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
                for (const [di, dj] of dirs) {
                    const ni = m.i + di, nj = m.j + dj;
                    if (ni>=0 && ni<SIZE && nj>=0 && nj<SIZE && state.field[ni][nj] === playerVal) sameAdj++;
                }
                score += sameAdj * 25;
                // se muovi verso il nemico, leggera preferenza per attaccare ma non troppo
                const distToEnemy = Math.abs(m.i - enemy.i) + Math.abs(m.j - enemy.j);
                score += Math.max(0, 5 - distToEnemy);
            }

            return { move: m, score };
        });

        scored.sort((a,b) => b.score - a.score);
        return scored.map(s => s.move);
    }

    // minimax con alpha-beta
    function minimax(state, depth, alpha, beta, maximizingPlayer, currentVal) {
        // terminal checks: vittoria per vite
        const aiPl = aiVal === 1 ? state.players.p1 : state.players.p2;
        const huPl = aiVal === 1 ? state.players.p2 : state.players.p1;
        if (aiPl.lives <= 0 || huPl.lives <= 0 || depth === 0) {
            return evaluateState(state, aiVal);
        }

        const moves = generateMoves(state, currentVal);
        let ordered = orderMoves(state, moves, currentVal);
        // limito il branching per performance
        if (ordered.length > MAX_MOVES) ordered = ordered.slice(0, MAX_MOVES);

        if (maximizingPlayer) {
            let value = -Infinity;
            for (const mv of ordered) {
                const child = applyMove(state, mv, currentVal);
                const score = minimax(child, depth - 1, alpha, beta, false, -currentVal);
                if (score > value) value = score;
                if (value > alpha) alpha = value;
                if (alpha >= beta) break; // beta cut-off
            }
            return value;
        } else {
            let value = +Infinity;
            for (const mv of ordered) {
                const child = applyMove(state, mv, currentVal);
                const score = minimax(child, depth - 1, alpha, beta, true, -currentVal);
                if (score < value) value = score;
                if (value < beta) beta = value;
                if (alpha >= beta) break;
            }
            return value;
        }
    }

    // --- ricerca radice: genera mosse per AI, minimax over di esse e ritorna la migliore ---
    const rootState = cloneState(App.game);
    const rootMoves = generateMoves(rootState, aiVal);
    const orderedRootMoves = orderMoves(rootState, rootMoves, aiVal).slice(0, MAX_MOVES);

    let best = null;
    let bestScore = -Infinity;

    for (const mv of orderedRootMoves) {
        const child = applyMove(rootState, mv, aiVal);
        const score = minimax(child, MAX_DEPTH - 1, -Infinity, Infinity, false, -aiVal);
        // tie-breaker: prefer moves shoot > move if score close
        if (score > bestScore || (Math.abs(score - bestScore) < 1e-6 && mv.btn === 0 && best && best.btn !== 0)) {
            bestScore = score;
            best = mv;
        }
    }

    // se null, fallback in posizione corrente
    if (!best) {
        const aiPl = aiVal === 1 ? App.game.players.p1 : App.game.players.p2;
        return { i: aiPl.i, j: aiPl.j, btn: 1 };
    }

    // ritorna mossa
    return { i: best.i, j: best.j, btn: best.btn };
}
