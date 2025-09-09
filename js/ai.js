const MEMORY = {
    lastPlayerPos: {
        i: 0,
        j: 0,
    },
    lastBotPos: {
        i: 7,
        j: 7,
    },
}


// Funzione che ritorna un valore che indica chi è in vantaggio. 
// Il valore è positivo per il bot (verde) e negativo per il giocatore (arancione)
function evalField(game = JSON.parse(JSON.stringify(App.game)), memory = JSON.parse(JSON.stringify(MEMORY)), lastMove = 'bot', depth = 0) {
    const MAX_DEPTH = 2;

    if (depth >= MAX_DEPTH) {
        return quickHeuristic(game, memory); // definisci una valutazione veloce e deterministica
    }


    // ⚠️lastMove indica chi HA FATTO l'ultima mossa⚠️
    let field = game.field;
    let botPlayer = game.players.p2;
    let botVal = -1;
    let realPlayer = game.players.p1;
    let realPlayerPos = getRealPlayerPosition(game, memory);
    let realPlayerVal = 1;

    let evaluation = 0;

    if (Array.isArray(realPlayerPos)) {
        // realPlayer è un array di posizioni [{i,j}, ...]
        let worst = Infinity;
        for (const pos of realPlayerPos) {
            // creiamo un nuovo gioco simulato per ogni posizione in cui il giocatore potrebbe essere e facciamo la media delle evaluation di ogniuno di quei games
            const newPossibleGame = JSON.parse(JSON.stringify(game));
            newPossibleGame.players.p1.i = pos.i;
            newPossibleGame.players.p1.j = pos.j;
            newPossibleGame.players.p1.isSquid = false;

            const newPossibleMemory = JSON.parse(JSON.stringify(memory));
            updateLastPositions(newPossibleGame, newPossibleMemory);


            let partialEvaluation = evalField(newPossibleGame, newPossibleMemory, 'player', depth + 1);
            if (partialEvaluation < worst) worst = partialEvaluation;
        }
        evaluation = worst;
    } else if (realPlayerPos && typeof realPlayerPos === 'object' && typeof realPlayerPos.i === 'number' && typeof realPlayerPos.j === 'number') {
        // realPlayerPos è una singola posizione {i,j}
        const pos = realPlayerPos;

        // considero la quantità di celle del mio colore rispetto a quelle del mio avversario (max putni +-63)
        const { minus1: greenCells, zero: neutralCells, plus1: orangeCells } = countAll(field);
        evaluation += (greenCells - orangeCells);

        // consideriamo il caso in cui siamo a tiro
        let inShootingDistance = (Math.abs(realPlayerPos.i - botPlayer.i) <= 2) && (Math.abs(realPlayerPos.j - botPlayer.j) <= 2);
        if (inShootingDistance) {
            // considero il caso in cui sono invisibile (con io intendo il bot)
            // considero anche il caso in cui c'è solo una cella in cui mi possa essere spostato (sono praticamente visibile)
            if (botPlayer.isSquid && field[botPlayer.i][botPlayer.j] == botVal && getAroundColorCells(memory.lastBotPos.i, memory.lastBotPos.j, botVal, field).length > 1) {
                // sono invisibile

                if (botPlayer.lives > 1) {
                    evaluation += Math.round(Math.random() * 50 + 300);
                } else {
                    evaluation += 70;
                }

                if (!(field[realPlayerPos.i][realPlayerPos.j] == botVal)) {
                    // se tocca l'altro player è visibile e il bot no è NO BRAINER
                    evaluation += 300
                }
            } else {
                // sono visibile

                // considero il caso in cui ho una sola vita (o meno) o l'altro portebbe colpirmi da invisibile
                if (botPlayer.lives <= 1 || (realPlayer.isSquid && field[realPlayerPos.i][realPlayerPos.j] == realPlayerVal)) {
                    evaluation -= 200;
                } else {
                    // ho piu di una vita

                    // considero i serbatoi
                    if (botPlayer.ammo > 0 && realPlayer.ammo === 0) {
                        evaluation += (lastMove === 'bot' ? 0 : 70);
                    } else {
                        // in genere è una situazione a vantaggio di chi ha più vite
                        evaluation += botPlayer.lives - realPlayer.lives;
                    }
                }
            }
        }

        // considero il tipo di cella in cui sono
        if (field[botPlayer.i][botPlayer.j] == botVal) {
            evaluation += 40;
        } else if (field[botPlayer.i][botPlayer.j] == 0) {
            evaluation -= 10;
        } else {
            evaluation -= 500;
        }

        // considero il caso in cui ho il serbatoio vuoto
        if (botPlayer.ammo <= 0) {
            // se sono in range per essere colpito
            if (inShootingDistance) {
                evaluation -= 100;
            } else {
                // non sono in range per essere colpito
                if (field[botPlayer.i][botPlayer.j] == botVal)
                    evaluation -= 20;
                else
                    evaluation -= 100;
            }
        }

        // considero la grandezza del campo di movimento del bot
        evaluation += getPlayerColorOnlyMovableCells(botPlayer.i, botPlayer.j, botVal, field).length * 5;

        // considero il tipo di cella in cui è l'altro player
        if (field[realPlayerPos.i][realPlayerPos.j] == botVal) {
            evaluation += 500;
        } else if (field[realPlayerPos.i][realPlayerPos.j] == 0) {
            evaluation += 50;
        } else {
            evaluation -= 50;
        }

    } else {
        // caso inatteso
        console.warn('realPlayer formato non riconosciuto', realPlayerPos);
    }

    return evaluation;
}
// Restituisce solo le celle del colore `val` vicine al blob attorno a (i,j).
// Comportamento simile a getPlayerMoovableCells ma *NON* aggiunge le 8 adiacenti:
// raccoglie solo le celle dei blob ortogonali di valore === val.
function getPlayerColorOnlyMovableCells(i = MEMORY.lastPlayerPos.i, j = MEMORY.lastPlayerPos.j, val = 1, field = App.game.field) {
    const N = SIZE;
    const NN = N * N;

    // validazione
    if (typeof i !== 'number' || typeof j !== 'number') return [];
    if (i < 0 || i >= N || j < 0 || j >= N) return [];

    const processedBlobVisited = new Uint8Array(NN); // evita ricalcoli degli stessi blob
    const resultVisited = new Uint8Array(NN);       // marca le celle risultanti (solo val)

    // Se la cella di partenza stessa è del valore val, includi il suo blob
    if (field[i][j] === val) {
        const startBlob = getOrthogonalBlobIndices(i, j, val, field, processedBlobVisited);
        for (let k = 0; k < startBlob.length; k++) {
            resultVisited[startBlob[k]] = 1;
        }
    }

    // scorri le 8 celle attorno e raccogli i blob ortogonali di quelle dello stesso valore
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di, nj = j + dj;
            if (ni < 0 || ni >= N || nj < 0 || nj >= N) continue;
            if (field[ni][nj] !== val) continue;

            const blobIndices = getOrthogonalBlobIndices(ni, nj, val, field, processedBlobVisited);
            for (let k = 0; k < blobIndices.length; k++) {
                resultVisited[blobIndices[k]] = 1;
            }
        }
    }

    // converte resultVisited in array di {i,j}
    const out = [];
    for (let idx = 0; idx < NN; idx++) {
        if (resultVisited[idx]) out.push({ i: Math.floor(idx / N), j: idx % N });
    }
    return out;
}



function getRealPlayerPosition(game, memory) {
    const player = game.players.p1;
    const field = game.field;
    let isPlayerInvisible = player.isSquid && field[player.i][player.j] == 1;

    if (isPlayerInvisible) {
        // console.log('getRealPlayerPosition: player considered invisible, returning possible cells from memory.lastPlayerPos', memory.lastPlayerPos);
        return getPlayerMoovableCells(memory.lastPlayerPos.i, memory.lastPlayerPos.j, 1, field);
    } else {
        memory.lastPlayerPos = { i: player.i, j: player.j };
        return memory.lastPlayerPos;
    }
}


function updateLastPositions(game, memory) {
    let field = game.field;
    let realPlayer = game.players.p1;
    let botPlayer = game.players.p2;

    let isPlayerInvisible = realPlayer.isSquid && field[realPlayer.i][realPlayer.j] == 1;
    let isBotInvisible = botPlayer.isSquid && field[botPlayer.i][botPlayer.j] == -1;

    // log diagnostico (rimuovilo quando risolto)
    console.log('updateLastPositions called. isPlayerInvisible=', isPlayerInvisible, 'isBotInvisible=', isBotInvisible,
        'realPlayer.pos=', { i: realPlayer.i, j: realPlayer.j }, 'bot.pos=', { i: botPlayer.i, j: botPlayer.j },
        'memory.before=', memory.lastPlayerPos);

    if (!isBotInvisible)
        memory.lastBotPos = { i: botPlayer.i, j: botPlayer.j }
    if (!isPlayerInvisible)
        memory.lastPlayerPos = { i: realPlayer.i, j: realPlayer.j }
}



// Conta -1, 0 e 1 in un'unica scansione e ritorna {minus1, zero, plus1}
function countAll(field) {
    let minus1 = 0, zero = 0, plus1 = 0;
    for (let i = 0; i < field.length; i++) {
        const row = field[i];
        for (let j = 0; j < row.length; j++) {
            const v = row[j];
            if (v === -1) minus1++;
            else if (v === 1) plus1++;
            else zero++;
        }
    }
    return { minus1, zero, plus1 };
}





// Usa getOrthogonalBlobIndices su ogni cella attorno a (i,j) (default MEMORY.lastPlayerPos)
// Per ogni cella nel blob aggiunge anche le 8 adiacenti SOLO SE sono dello stesso valore 'val'; scarta duplicati con resultVisited.
// Restituisce array di {i,j}
function getPlayerMoovableCells(i, j, val = 1, field) { // (field = App.game.field)
    if (!field) throw new Error('getPlayerMoovableCells: missing field parameter');
    const N = SIZE;
    const NN = N * N;

    // validazione semplice
    if (typeof i !== 'number' || typeof j !== 'number') return [];
    if (i < 0 || i >= N || j < 0 || j >= N) return [];

    // flag per non rielaborare blob già visti
    const processedBlobVisited = new Uint8Array(NN);
    // flag per raccogliere il risultato (evita duplicati)
    const resultVisited = new Uint8Array(NN);

    // scorri le 8 celle attorno
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di, nj = j + dj;
            if (ni < 0 || ni >= N || nj < 0 || nj >= N) continue;

            if (field[ni][nj] !== val) continue; // non è del colore richiesto

            // prendi il blob ortogonale a partire da (ni,nj).
            // la funzione segna processedBlobVisited così non rifacciamo il blob
            const blobIndices = getOrthogonalBlobIndices(ni, nj, val, field, processedBlobVisited);

            // per ogni cella del blob, aggiungi la cella stessa + le 8 adiacenti
            // MA: aggiungi le 8 adiacenti solo se hanno valore === val
            for (let k = 0; k < blobIndices.length; k++) {
                const bIdx = blobIndices[k];
                const bi = Math.floor(bIdx / N);
                const bj = bIdx % N;

                // aggiungi la cella del blob (è già del valore val)
                if (!resultVisited[bIdx]) resultVisited[bIdx] = 1;

                // aggiungi le 8 adiacenti SOLO se sono dello stesso valore 'val'
                for (let adi = -1; adi <= 1; adi++) {
                    for (let adj = -1; adj <= 1; adj++) {
                        if (adi === 0 && adj === 0) continue;
                        const ai = bi + adi, aj = bj + adj;
                        if (ai < 0 || ai >= N || aj < 0 || aj >= N) continue;
                        const aIdx = ai * N + aj;
                        if (field[ai][aj] === val) {
                            // solo se dello stesso colore
                            resultVisited[aIdx] = 1;
                        }
                    }
                }
            }
        }
    }

    // converti resultVisited in array di {i,j}
    const out = [];
    for (let idx = 0; idx < NN; idx++) {
        if (resultVisited[idx]) out.push({ i: Math.floor(idx / N), j: idx % N });
    }

    return out;
}


// Restituisce un array di indici (i*SIZE+j) del blob ortogonalmente connesso
// Parte da (si,sj), assume processedBlobVisited è Uint8Array(length=SIZE*SIZE)
// e lo marca per evitare rielaborazioni successive.
function getOrthogonalBlobIndices(si, sj, val, field, processedBlobVisited) {
    const N = SIZE;
    if (si < 0 || si >= N || sj < 0 || sj >= N) return [];
    const startIdx = si * N + sj;
    if (field[si][sj] !== val || processedBlobVisited[startIdx]) return [];

    const blob = [];
    const queue = [startIdx];
    let qh = 0;

    while (qh < queue.length) {
        const idx = queue[qh++];

        if (processedBlobVisited[idx]) continue;
        processedBlobVisited[idx] = 1;
        blob.push(idx);

        const ci = Math.floor(idx / N);
        const cj = idx % N;

        // espandi solo in 4 direzioni (ortogonali)
        if (ci > 0) {
            const ni = ci - 1, nj = cj, nidx = ni * N + nj;
            if (!processedBlobVisited[nidx] && field[ni][nj] === val) queue.push(nidx);
        }
        if (ci + 1 < N) {
            const ni = ci + 1, nj = cj, nidx = ni * N + nj;
            if (!processedBlobVisited[nidx] && field[ni][nj] === val) queue.push(nidx);
        }
        if (cj > 0) {
            const ni = ci, nj = cj - 1, nidx = ni * N + nj;
            if (!processedBlobVisited[nidx] && field[ni][nj] === val) queue.push(nidx);
        }
        if (cj + 1 < N) {
            const ni = ci, nj = cj + 1, nidx = ni * N + nj;
            if (!processedBlobVisited[nidx] && field[ni][nj] === val) queue.push(nidx);
        }
    }

    return blob; // array di indici
}


function getAroundColorCells(i, j, val, field) {
    const N = SIZE;
    let cells = [];

    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di, nj = j + dj;
            if (ni < 0 || ni >= N || nj < 0 || nj >= N) continue;

            if (field[ni][nj] === val) {
                cells.push({ i: ni, j: nj });
            }
        }
    }

    return cells;
}







function evaluateAllMoves(player = 'bot', game = App.game, memory = MEMORY) {
    const currentPlayer = player == 'host' ? game.players.p1 : game.players.p2;
    const currentVal = player == 'host' ? 1 : -1;

    let shootableCells = currentPlayer.ammo > 0 ? getNearbyCells(currentPlayer.i, currentPlayer.j) : [];
    let walkableCells = getMoovableCells(currentPlayer.i, currentPlayer.j);

    let allMoves = [];

    shootableCells.forEach(shCell => {
        const newPossibleGame = JSON.parse(JSON.stringify(game));
        newPossibleGame.field[shCell.i][shCell.j] = currentVal;
        if (player == 'host') newPossibleGame.players.p1.ammo = Math.max(0, newPossibleGame.players.p1.ammo - 1);
        else newPossibleGame.players.p2.ammo = Math.max(0, newPossibleGame.players.p2.ammo - 1);

        const sameMemory = JSON.parse(JSON.stringify(memory));

        allMoves.push({
            move: {
                i: shCell.i,
                j: shCell.j,
                btn: 0,
            },
            eval: evalField(newPossibleGame, sameMemory, player),
        });
    });

    walkableCells.forEach(walCell => {
        const newPossibleGame = JSON.parse(JSON.stringify(game));
        const f = newPossibleGame.field;
        if (player == 'host') {
            newPossibleGame.players.p1.i = walCell.i;
            newPossibleGame.players.p1.j = walCell.j;
            newPossibleGame.players.p1.isSquid = (f[walCell.i][walCell.j] == currentVal);
            newPossibleGame.players.p1.lives -= (f[walCell.i][walCell.j] == -currentVal ? 1 : 0);
        } else {
            newPossibleGame.players.p2.i = walCell.i;
            newPossibleGame.players.p2.j = walCell.j;
            newPossibleGame.players.p2.isSquid = (f[walCell.i][walCell.j] == currentVal);
            newPossibleGame.players.p2.lives -= (f[walCell.i][walCell.j] == -currentVal ? 1 : 0);
        }
        const newPossibleMemory = JSON.parse(JSON.stringify(memory));
        // updateLastPositions(newPossibleGame, newPossibleMemory);

        allMoves.push({
            move: {
                i: walCell.i,
                j: walCell.j,
                btn: 1,
            },
            eval: evalField(newPossibleGame, newPossibleMemory, player),
        });
    });

    return allMoves;
}









// findBestMove: valuta tutte le mosse legali del bot (senza modificare permanentemente App)
function findBestMove() {
    const memCopy = JSON.parse(JSON.stringify(MEMORY));
    const allMoves = evaluateAllMoves('bot', App.game, memCopy);

    if (allMoves.length === 0) return null; // nessuna mossa disponibile

    let bestMove = allMoves[0];
    for (let i = 1; i < allMoves.length; i++) {
        if (allMoves[i].eval > bestMove.eval) {
            bestMove = allMoves[i];
        }
    }

    console.log(bestMove);
    return bestMove.move;
}