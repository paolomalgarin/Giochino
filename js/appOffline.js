const SIZE = 8; // Dimensioni field
const App = {
    mode: 'host',   // 'host' o 'guest'
    host: null,
    guest: null,
    game: {
        container: null,
        field: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
        cells: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
        players: {
            p1: {
                isSquid: false,
                i: 0,
                j: 0,
                lives: 3,
                ammo: 3,
            },
            p2: {
                isSquid: false,
                i: SIZE - 1,
                j: SIZE - 1,
                lives: 3,
                ammo: 3,
            },
        },
        maxAmmo: 3,
        running: false,
    }
};
const AppLocal = {
    myTurn: false,
}








function resetGame() {
    App.game = {
        container: document.getElementById('game-container'),
        field: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
        cells: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
        players: {
            p1: {
                isSquid: false,
                i: 0,
                j: 0,
                lives: 3,
                ammo: 3,
            },
            p2: {
                isSquid: false,
                i: SIZE - 1,
                j: SIZE - 1,
                lives: 3,
                ammo: 3,
            },
        },
        maxAmmo: 3,
        running: true,
    }
    App.game.players.p1.ammo = App.game.maxAmmo;
    App.game.players.p2.ammo = App.game.maxAmmo;

    App.game.field[0][0] = 1;
    App.game.field[SIZE - 1][SIZE - 1] = -1;

    App.game.container.innerHTML = '';
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell${i}-${j}`;
            // cell.textContent = `${i}-${j}`;


            const powerup = document.createElement('div');
            powerup.className = 'powerup';
            powerup.id = `powerup${i}-${j}`;
            cell.appendChild(powerup);


            App.game.container.appendChild(cell);
            App.game.cells[i][j] = cell;
        }
    }


    const turn = document.getElementById('turn');
    turn.className = '';
    turn.style.display = 'block';
}

function drawGame() {
    const currentPlayer = App.mode === 'host' ? App.game.players.p1 : App.game.players.p2;
    let shootableCells = getNearbyCells(currentPlayer.i, currentPlayer.j);
    let walkableCells = getMoovableCells(currentPlayer.i, currentPlayer.j);
    const { walkableOnly: movCells, shootableOnly: shotCells, both: movShotCells } = splitCells(walkableCells, shootableCells);


    for (let i = 0; i < SIZE; i++)
        for (let j = 0; j < SIZE; j++) {
            let areMovesHidden = App.game.cells[i][j].className.includes('hideMoves');
            let classToAdd = areMovesHidden ? ' hideMoves' : '';
            switch (App.game.field[i][j]) {
                case 0:
                    App.game.cells[i][j].className = 'cell' + classToAdd;
                    // console.log(i, j, App.game.cells[i][j].className, App.game.cells[i][j]);
                    break;
                case 1:
                    if ((i + 1 >= SIZE || App.game.field[i + 1][j] == 1) && (i - 1 < 0 || App.game.field[i - 1][j] == 1) && (j + 1 >= SIZE || App.game.field[i][j + 1] == 1) && (j - 1 < 0 || App.game.field[i][j - 1] == 1))
                        App.game.cells[i][j].className = `cell tile p1 tileTypeFull` + classToAdd;
                    else if (!(App.game.cells[i][j].className.includes('tile') && App.game.cells[i][j].className.includes('p1')))
                        App.game.cells[i][j].className = `cell tile p1 tileType${Math.floor(Math.random() * 4) + 1}` + classToAdd;
                    break;
                case -1:
                    if ((i + 1 >= SIZE || App.game.field[i + 1][j] == 1) && (i - 1 < 0 || App.game.field[i - 1][j] == 1) && (j + 1 >= SIZE || App.game.field[i][j + 1] == 1) && (j - 1 < 0 || App.game.field[i][j - 1] == 1))
                        App.game.cells[i][j].className = `cell tile p2 tileTypeFull` + classToAdd;
                    else if (!(App.game.cells[i][j].className.includes('tile') && App.game.cells[i][j].className.includes('p2')))
                        App.game.cells[i][j].className = `cell tile p2 tileType${Math.floor(Math.random() * 4) + 1}` + classToAdd;
                    break;

                default:
                    App.game.cells[i][j].className = 'cell' + classToAdd;
                    break;
            }
            if (i == App.game.players.p1.i && j == App.game.players.p1.j) {
                App.game.cells[i][j].classList.add('player1');
                if (App.game.players.p1.isSquid) {
                    App.game.cells[i][j].classList.add('squid');
                    if (App.mode == 'guest' && App.game.field[i][j] == 1) {
                        App.game.cells[i][j].classList.add('invisible');
                    } else {
                        App.game.cells[i][j].classList.remove('invisible');
                    }
                } else {
                    App.game.cells[i][j].classList.remove('squid');
                    App.game.cells[i][j].classList.remove('invisible');
                }
            } else
                App.game.cells[i][j].classList.remove('player1');

            if (i == App.game.players.p2.i && j == App.game.players.p2.j) {
                App.game.cells[i][j].classList.add('player2');
                if (App.game.players.p2.isSquid) {
                    App.game.cells[i][j].classList.add('squid');
                    if (App.mode == 'host' && App.game.field[i][j] == -1) {
                        App.game.cells[i][j].classList.add('invisible');
                    } else {
                        App.game.cells[i][j].classList.remove('invisible');
                    }
                } else {
                    App.game.cells[i][j].classList.remove('squid');
                    App.game.cells[i][j].classList.remove('invisible');
                }
            } else
                App.game.cells[i][j].classList.remove('player2');


            if (isCellInArray(i, j, movCells)) {
                App.game.cells[i][j].classList.add('walkable');
                App.game.cells[i][j].classList.remove('shoot-and-walk');
                App.game.cells[i][j].classList.remove('shootable');
            } else if (isCellInArray(i, j, shotCells)) {
                App.game.cells[i][j].classList.add('shootable');
                App.game.cells[i][j].classList.remove('walkable');
                App.game.cells[i][j].classList.remove('shoot-and-walk');
            } else if (isCellInArray(i, j, movShotCells)) {
                App.game.cells[i][j].classList.add('shoot-and-walk');
                App.game.cells[i][j].classList.remove('shootable');
                App.game.cells[i][j].classList.remove('walkable');
            } else {
                App.game.cells[i][j].classList.remove('walkable');
                App.game.cells[i][j].classList.remove('shoot-and-walk');
                App.game.cells[i][j].classList.remove('shootable');
            }
        }


    let lifeFull = '<div class="life full"></div>';
    let lifeEmpty = '<div class="life empty"></div>';
    const hostLives = document.getElementById('host-lives'); // innerText = 'Host lives: ' + App.game.players.p1.lives;
    const guestLives = document.getElementById('guest-lives'); // innerText = 'Guest lives: ' + App.game.players.p2.lives;

    hostLives.innerHTML = '';
    for (let i = 0; i < 3; i++)
        if (i < App.game.players.p1.lives)
            hostLives.innerHTML += lifeFull;
        else
            hostLives.innerHTML += lifeEmpty;

    guestLives.innerHTML = '';
    for (let i = 0; i < 3; i++)
        if (i < App.game.players.p2.lives)
            guestLives.innerHTML += lifeFull;
        else
            guestLives.innerHTML += lifeEmpty;


    hostLives.style.setProperty('--ammo', ((App.game.players.p1.ammo / App.game.maxAmmo) * 100) + '%');
    guestLives.style.setProperty('--ammo', ((App.game.players.p2.ammo / App.game.maxAmmo) * 100) + '%');
}





function getNearbyCells(i, j, radius = 2) {
    const nearby = [];

    for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
            if (di === 0 && dj === 0) continue; // escludi il punto stesso

            const ni = i + di;
            const nj = j + dj;

            // escludi celle fuori dalla matrice
            if (ni < 0 || ni >= SIZE || nj < 0 || nj >= SIZE) continue;

            nearby.push({ i: ni, j: nj });
        }
    }

    return nearby;
}

function isCellInArray(i, j, cellsArray) {
    return Array.isArray(cellsArray) && cellsArray.some(cell => cell.i === i && cell.j === j);
}

function getMoovableCells(i, j) {
    const result = new Set();
    const addToResult = (x, y) => result.add(`${x},${y}`);

    // 8 spazi adiacenti (anche diagonali)
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di, nj = j + dj;
            if (ni >= 0 && ni < SIZE && nj >= 0 && nj < SIZE) {
                addToResult(ni, nj);
            }
        }
    }

    // Controlla se la cella è del colore giusto
    const myVal = App.mode === 'host' ? 1 : -1;
    if (App.game.field[i][j] === myVal) {
        // BFS/DFS per raccogliere tutto il blob conneso ortogonalmente
        const visited = new Set();
        const queue = [[i, j]];

        while (queue.length > 0) {
            const [ci, cj] = queue.shift();
            const key = `${ci},${cj}`;
            if (visited.has(key)) continue;
            visited.add(key);
            addToResult(ci, cj);

            // 4 direzioni ortogonali
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [di, dj] of dirs) {
                const ni = ci + di, nj = cj + dj;
                if (
                    ni >= 0 && ni < SIZE &&
                    nj >= 0 && nj < SIZE &&
                    App.game.field[ni][nj] === myVal &&
                    !visited.has(`${ni},${nj}`)
                ) {
                    queue.push([ni, nj]);
                }
            }
        }
    }

    // Converti in array di oggetti {i,j}
    return Array.from(result).map(s => {
        const [x, y] = s.split(',').map(Number);
        return { i: x, j: y };
    });
}


function splitCells(walkable, shootable) {
    const walkableSet = new Set(walkable.map(c => `${c.i},${c.j}`));
    const shootableSet = new Set(shootable.map(c => `${c.i},${c.j}`));

    const walkableOnly = [];
    const shootableOnly = [];
    const both = [];

    // celle walkable
    for (const cell of walkable) {
        const key = `${cell.i},${cell.j}`;
        if (shootableSet.has(key)) {
            both.push(cell);
        } else {
            walkableOnly.push(cell);
        }
    }

    // celle shootable che non sono già state messe in both
    for (const cell of shootable) {
        const key = `${cell.i},${cell.j}`;
        if (!walkableSet.has(key)) {
            shootableOnly.push(cell);
        }
    }

    return { walkableOnly, shootableOnly, both };
}



function showHideMoves() {
    for (let i = 0; i < SIZE; i++)
        for (let j = 0; j < SIZE; j++) {
            App.game.cells[i][j].classList.toggle('hideMoves');
        }
    document.getElementById('show-hide-moves').classList.toggle('show');
}


// helper: attende il click/pointerdown su una cella e rimuove tutti i listener
function waitForCellClick() {
    return new Promise(resolve => {
        const handlers = [];

        for (let i = 0; i < SIZE; i++) {
            for (let j = 0; j < SIZE; j++) {
                const cell = App.game.cells?.[i]?.[j];

                // se non è un element DOM valido, salta
                if (!cell || typeof cell.addEventListener !== 'function') continue;

                // pointerdown cattura sinistro/medio/destro e funziona bene anche su touch
                const onPointerDown = (ev) => {
                    ev.stopPropagation();
                    // ev.button: 0 = sinistro, 1 = centrale, 2 = destro
                    const btn = ev.button;
                    const currentPlayer = App.mode === 'host' ? App.game.players.p1 : App.game.players.p2;
                    const enemyPlayer = App.mode === 'host' ? App.game.players.p2 : App.game.players.p1;



                    // se è click sinistro e la cella è occupata, ignora
                    if (btn === 0 && currentPlayer.ammo <= 0) return;
                    if (btn !== 0 && (((enemyPlayer.i == i && enemyPlayer.j == j)) || ((currentPlayer.i == i && currentPlayer.j == j) && currentPlayer.isSquid))) return;
                    if (btn === 0 && App.game.field[i][j] == (App.mode == 'host' ? 1 : -1)) return;
                    if (!(isCellInArray(i, j, getNearbyCells(currentPlayer.i, currentPlayer.j)) || (currentPlayer.i == i && currentPlayer.j == j)) && btn === 0) return;
                    if (!isCellInArray(i, j, getMoovableCells(currentPlayer.i, currentPlayer.j)) && btn !== 0) return;

                    // rimuovi tutti i listener registrati
                    handlers.forEach(h => h.elem.removeEventListener(h.evType, h.fn));

                    // risolvi con la cella cliccata
                    resolve({ i, j, btn });
                };

                // evita che appaia il menu contestuale (solo se vogliamo usarlo come tasto di gioco)
                const onContextMenu = (ev) => {
                    ev.preventDefault();
                };

                cell.addEventListener('pointerdown', onPointerDown);
                cell.addEventListener('contextmenu', onContextMenu, { capture: true });

                handlers.push({ elem: cell, evType: 'pointerdown', fn: onPointerDown });
                handlers.push({ elem: cell, evType: 'contextmenu', fn: onContextMenu });
            }
        }

        // safety: se non abbiamo registrato listener (ad es. cells non pronte), risolvi null così il chiamante può ritentare
        if (handlers.length === 0) {
            setTimeout(() => resolve(null), 100);
        }
    });
}


// versione async di playGame che usa waitForCellClick()
async function playGame() {
    while (true) {
        let turn = true;
        resetGame();
        drawGame();
        App.game.running = true;
        AppLocal.myTurn = App.mode === 'host'; // il host inizia (se è questo il tuo rule)

        while (App.game.running) {
            // se non è il mio turno, aspettiamo un po' e ricontrolliamo.
            // Quando arriva un messaggio dall'altro client, manage*Messages() imposterà App e AppLocal.myTurn = true;
            if (!AppLocal.myTurn) {

                const enemyMode = App.mode == 'host' ? 'guest' : 'host';
                const { i, j, btn } = findBestMove(App.game);

                await new Promise(r => setTimeout(r, 500));

                makeMove(enemyMode, i, j, btn);
                updateLastPositions(App.game, MEMORY);

                drawGame();
                AppLocal.myTurn = true;
            } else {

                document.getElementById('turn').className = 'true';

                // ======= qui entra il blocco che volevi =======
                // attendo che l'utente clicchi una cella libera
                const { i, j, btn } = await waitForCellClick();

                makeMove(App.mode, i, j, btn);


                drawGame();

                // disabilito il mio turno e ridisegno
                AppLocal.myTurn = false;
                document.getElementById('turn').className = 'false';
                drawGame();
                // ======= fine del blocco =======
            }

            // qui puoi aggiungere logica per controllare vittoria/fine partita
            if (App.game.players.p1.lives <= 0) {
                App.game.running = false;
                App.game.winner = 'Guest (verde)';
            } else if (App.game.players.p2.lives <= 0) {
                App.game.running = false;
                App.game.winner = 'Host (arancione)';
            }
        }

        await new Promise(r => setTimeout(r, 2000));

        const winMessage = document.getElementById('win-message');

        document.getElementById('win-message').className = '';
        winMessage.classList.add(App.game.players.p2.lives <= 0 ? (App.game.players.p1.lives > 0 ? 'orange' : 'draw') : 'green');
        winMessage.classList.add('animate');

        winMessage.addEventListener('click', (e) => {
            document.getElementById('win-message').className = 'deanimate';
        }, { once: true });
    }
}


function makeMove(mode = 'host', i, j, btn) {
    // valori: host -> 1, guest -> -1
    const val = mode === 'host' ? 1 : -1;
    const currentPlayer = mode === 'host' ? App.game.players.p1 : App.game.players.p2;
    const enemyPlayer = mode === 'host' ? App.game.players.p2 : App.game.players.p1;

    if (btn == 0) {
        App.game.field[i][j] = val;

        if (mode === 'host') {
            App.game.players.p1.isSquid = false;
            App.game.players.p1.ammo -= 1;
        } else {
            App.game.players.p2.isSquid = false;
            App.game.players.p2.ammo -= 1;
        }

        if (i === enemyPlayer.i && j === enemyPlayer.j && App.game.field[enemyPlayer.i][enemyPlayer.j] === val) {
            if (mode === 'host')
                App.game.players.p2.lives -= 1;
            else
                App.game.players.p1.lives -= 1;
        }

        drawGame();
    } else {
        // aggiorno la posizione del giocatore corrente
        if (mode === 'host') {
            App.game.players.p1.i = i;
            App.game.players.p1.j = j;
            App.game.players.p1.isSquid = true;

            if (App.game.field[i][j] == val)
                App.game.players.p1.ammo = App.game.maxAmmo;
        } else {
            App.game.players.p2.i = i;
            App.game.players.p2.j = j;
            App.game.players.p2.isSquid = true;

            if (App.game.field[i][j] == val)
                App.game.players.p2.ammo = App.game.maxAmmo;
        }
    }


    if (App.game.field[currentPlayer.i][currentPlayer.j] === (-1 * val)) {
        if (mode === 'host')
            App.game.players.p1.lives -= 1;
        else
            App.game.players.p2.lives -= 1;
    }
}


playGame();