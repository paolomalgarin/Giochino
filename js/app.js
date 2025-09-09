const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
]; // Puoi mettere STUN se vuoi
const SIZE = 8; // Dimensioni field
const App = {
    mode: null,   // 'host' o 'guest'
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
                powerups: {
                    glasses: false,
                },
            },
            p2: {
                isSquid: false,
                i: SIZE - 1,
                j: SIZE - 1,
                lives: 3,
                ammo: 3,
                powerups: {
                    glasses: false,
                },
            },
        },
        powerups: {
            glasses: {
                i: -1,
                j: -1,
                spawnTurn: -1,
                active: false,
                activationTurn: -1,
                duration: 4,
            },
        },
        maxAmmo: 3,
        running: false,
        turn: 0,
    }
};
const AppLocal = {
    myTurn: false,
}



function encodeOffer(offerJSON) {
    // parse → tieni solo i campi minimi → string compatta → base64
    const obj = JSON.parse(offerJSON);
    const compact = JSON.stringify({
        id: obj.peerId,       // rinominato "peerId" in "id"
        s: obj.sdp.sdp,       // tieni solo la stringa SDP, senza type
        t: obj.sdp.type       // aggiungi comunque il type per sicurezza
    });
    return btoa(compact); // Base64 finale
}

function decodeOffer(code) {
    const decoded = atob(code);
    const obj = JSON.parse(decoded);
    // ricostruisci lo stesso schema dell’offer originale
    return JSON.stringify({
        peerId: obj.id,
        sdp: {
            type: obj.t,
            sdp: obj.s
        }
    });
}



// ---- GENERATE OFFER (Host) ----
async function generateOffer() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dc = pc.createDataChannel('game');

    dc.onopen = () => {
        onDataChannelOpen();
    }
    dc.onmessage = e => manageHostMessages(e);

    // Questo array serve a "ritardare" fino a che ICE non è pronto
    const offerPromise = new Promise(resolve => {
        pc.onicecandidate = ev => {
            if (!ev.candidate) resolve(pc.localDescription);
        };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const localDesc = await offerPromise;

    // Generiamo JSON che il player userà
    function generateUUID() {
        // Simple fallback UUID v4 generator
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }


    // const offerJSON = JSON.stringify({ peerId: (crypto.randomUUID ? crypto.randomUUID() : generateUUID()), sdp: localDesc }, null, 2);
    const offerJSON = JSON.stringify({ peerId: (crypto.randomUUID ? crypto.randomUUID() : generateUUID()), sdp: localDesc });
    return { pc, dc, offerJSON };
}

// ---- ACCEPT OFFER (Player) ----
async function acceptOffer(offerJSON) {
    try {
        const offerObj = JSON.parse(offerJSON);
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        pc.ondatachannel = ev => {
            App.guest.dc = ev.channel; // 👈 salva direttamente
            App.guest.dc.onopen = () => {
                onDataChannelOpen();
            }
            App.guest.dc.onmessage = e => manageGuestMessages(e);
        };

        const answerPromise = new Promise(resolve => {
            pc.onicecandidate = ev => {
                if (!ev.candidate) resolve(pc.localDescription);
            };
        });

        await pc.setRemoteDescription(offerObj.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const localDesc = await answerPromise;
        const answerJSON = JSON.stringify({ peerId: offerObj.peerId, sdp: localDesc }, null, 2);

        return { pc, answerJSON };
    } catch (se) {
        console.log('❌ Offer Json non valida (json mal formato)');
        console.error(se);
        return;
    }
}



async function createHost() {
    if (App.mode != 'host') {
        console.log(`⚠️ Devi essere in modalità host [mode: ${App.mode}]`);
        return;
    }

    console.log("=== Host genera offer ===");

    App.host = await generateOffer();
    let offer = encodeOffer(App.host.offerJSON);

    const offerTArea = document.getElementById('copy-offer');
    offerTArea && (offerTArea.value = offer);

    console.log("Offer JSON:\n", offer);
}

async function createGuest(offerJSON) {
    if (App.mode != 'guest') {
        console.log(`⚠️ Devi essere in modalità guest [mode: ${App.mode}]`);
        return;
    }

    offerJSON = decodeOffer(offerJSON);

    console.log("\n=== Guest accetta offer ===");

    App.guest = await acceptOffer(offerJSON);
    let answer = App.guest.answerJSON;

    const answerTArea = document.getElementById('copy-answer');
    answerTArea && (answerTArea.value = answer);

    console.log("Answer JSON:\n", answer);
}

async function processAnswer(answerJSON) {
    if (App.mode != 'host') {
        console.log(`⚠️ Devi essere in modalità host [mode: ${App.mode}]`);
        return;
    }

    console.log("\n=== Host setta remote description (answer) ===");

    await App.host.pc.setRemoteDescription(JSON.parse(answerJSON).sdp);
}



function sendMessage(msg) {
    if (App.mode === 'host' && App.host?.dc?.readyState === "open") {
        App.host.dc.send(msg);
        console.log("Host manda:", msg);
    } else if (App.mode === 'guest' && App.guest?.dc?.readyState === "open") {
        App.guest.dc.send(msg);
        console.log("Guest manda:", msg);
    } else {
        console.log("⚠️ DataChannel non è pronto per inviare messaggi");
    }
}





// style stuff
let hostCmds, guestCmds;

window.onload = () => {
    hostCmds = document.getElementById('host-cmds');
    guestCmds = document.getElementById('guest-cmds');
}

function setMode(mode) {
    App.mode = mode;
    console.log("Modalità selezionata:", mode);

    // Mostra/nascondi i comandi in base alla modalità
    if (mode === 'host') {
        hostCmds.style.display = 'flex';
        guestCmds.style.display = 'none';
    } else if (mode === 'guest') {
        hostCmds.style.display = 'none';
        guestCmds.style.display = 'flex';
    }

    const modeSelector = document.getElementById('mode-selector');
    const curentModeDisplay = document.getElementById('current-mode');

    modeSelector && modeSelector.parentNode && modeSelector.parentNode.removeChild(modeSelector);
    curentModeDisplay && (curentModeDisplay.innerText = App.mode);
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
                powerups: {
                    glasses: false,
                },
            },
            p2: {
                isSquid: false,
                i: SIZE - 1,
                j: SIZE - 1,
                lives: 3,
                ammo: 3,
                powerups: {
                    glasses: false,
                },
            },
        },
        powerups: {
            glasses: {
                i: -1,
                j: -1,
                spawnTurn: -1,
                active: false,
                activationTurn: -1,
                duration: 4,
            },
        },
        maxAmmo: 3,
        running: true,
        turn: 0,
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


function arePlayersInRange() {
    const p1 = App.game.players.p1;
    const p2 = App.game.players.p2;
    return (Math.abs(p1.i - p2.i) <= 2) && (Math.abs(p1.j - p2.j) <= 2);
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
                    // il player1 (host) è uno squid
                    App.game.cells[i][j].classList.add('squid');

                    if (App.mode == 'guest' && App.game.field[i][j] == 1) {
                        // il guest non deve vedere lo squid a meno che non abbia gli occhiali attivi e l'host sia in range allo stesso tempo
                        if (App.game.players.p2.powerups.glasses && arePlayersInRange())
                            App.game.cells[i][j].classList.remove('invisible');
                        else
                            App.game.cells[i][j].classList.add('invisible');
                    } else {
                        // il guest può vedere l'avversario
                        App.game.cells[i][j].classList.remove('invisible');
                    }
                } else {
                    // il player1 (host) non è uno squid
                    App.game.cells[i][j].classList.remove('squid');
                    App.game.cells[i][j].classList.remove('invisible');
                }
            } else
                App.game.cells[i][j].classList.remove('player1');

            if (i == App.game.players.p2.i && j == App.game.players.p2.j) {
                App.game.cells[i][j].classList.add('player2');
                if (App.game.players.p2.isSquid) {
                    // il player2 (guest) è uno squid
                    App.game.cells[i][j].classList.add('squid');
                    if (App.mode == 'host' && App.game.field[i][j] == -1) {
                        // l'host non deve vedere lo squid a meno che non abbia gli occhiali attivi e il guest sia in range allo stesso tempo
                        if (App.game.players.p1.powerups.glasses && arePlayersInRange())
                            App.game.cells[i][j].classList.remove('invisible');
                        else
                            App.game.cells[i][j].classList.add('invisible');
                    } else {
                        App.game.cells[i][j].classList.remove('invisible');
                    }
                } else {
                    // il player2 (guest) non è uno squid
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


            // gestisco i powerups
            const powerups = App.game.powerups;
            const currentTurn = App.game.turn;

            // glasses (se sono attivi e la casella è quella in cui sono i glasses la considero)
            if (powerups.glasses.active && (i === powerups.glasses.i && j === powerups.glasses.j)) {
                document.getElementById(`powerup${i}-${j}`).classList.add('glasses');

                // dopo 2 turni cambio la classe indicando che i glasses stanno per despawnare 
                if (currentTurn - powerups.glasses.spawnTurn >= 2)
                    document.getElementById(`powerup${i}-${j}`).classList.add('despawning');
                else
                    document.getElementById(`powerup${i}-${j}`).classList.remove('despawning');

            } else {
                document.getElementById(`powerup${i}-${j}`).classList.remove('glasses');
                document.getElementById(`powerup${i}-${j}`).classList.remove('despawning');
            }

            // ...
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



function manageHostMessages(e) {
    console.log("Host riceve:", e.data);

    const newApp = JSON.parse(e.data);
    const thisPcCells = App.game.cells;
    App.game = newApp.game;
    App.game.cells = thisPcCells;

    AppLocal.myTurn = true;

    drawGame();
}

function manageGuestMessages(e) {
    console.log("Host riceve:", e.data);

    const newApp = JSON.parse(e.data);
    const thisPcCells = App.game.cells;
    App.game = newApp.game;
    App.game.cells = thisPcCells;

    AppLocal.myTurn = true;

    drawGame();
}

function onDataChannelOpen() {
    if (App.mode == 'guest') {
        console.log("Guest: DataChannel aperto!");
    }

    if (App.mode == 'host') {
        console.log("Host: DataChannel aperto!");
    }


    let guestCmds = document.getElementById('guest-cmds');
    let hostCmds = document.getElementById('host-cmds');
    let gameField = document.getElementById('game-container');

    guestCmds && guestCmds.parentNode && guestCmds.parentNode.removeChild(guestCmds);
    hostCmds && hostCmds.parentNode && hostCmds.parentNode.removeChild(hostCmds);
    gameField && (gameField.style.display = 'flex');

    playGame();
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


function managePowerUps() {
    const powerups = App.game.powerups;
    const currentTurn = App.game.turn;
    const { p1, p2 } = App.game.players;

    // gestisco i glasses
    if (powerups.glasses.active) {
        // i glasses sono attivi -> devo eseguire il loro effetto

        // controllo se un player ci passa sopra
        if (p1.i === powerups.glasses.i && p1.j === powerups.glasses.j) {
            p1.powerups.glasses = true;
            powerups.glasses.i = -1;
            powerups.glasses.j = -1;
            powerups.glasses.activationTurn = currentTurn;
        } else if (p2.i === powerups.glasses.i && p2.j === powerups.glasses.j) {
            p2.powerups.glasses = true;
            powerups.glasses.i = -1;
            powerups.glasses.j = -1;
            powerups.glasses.activationTurn = currentTurn;
        }

        // controllo se sono despawnati (dopo 2 turni)
        if (currentTurn - powerups.glasses.activationTurn > powerups.glasses.duration && currentTurn - powerups.glasses.spawnTurn > powerups.glasses.duration) {
            powerups.glasses.active = false;
            p1.powerups.glasses = false;
            p2.powerups.glasses = false;
        }

        // setto lo stile della roba che fa capire ai giocatori cosa sta succedendo
        // p1
        if (p1.powerups.glasses) {
            const powerupIcon = document.getElementById('host-powerup-glasses');
            powerupIcon.style.display = 'block';
            powerupIcon.style.setProperty('--used-perc', ((currentTurn - powerups.glasses.activationTurn) / powerups.glasses.duration * 100) + '%');
        } else
            document.getElementById('host-powerup-glasses').style.display = 'none';
        // p2
        if (p2.powerups.glasses) {
            const powerupIcon = document.getElementById('guest-powerup-glasses');
            powerupIcon.style.display = 'block';
            powerupIcon.style.setProperty('--used-perc', ((currentTurn - powerups.glasses.activationTurn) / powerups.glasses.duration * 100) + '%');
        } else
            document.getElementById('guest-powerup-glasses').style.display = 'none';
    } else {
        // i glasses non sono attivi -> vedo se devono spownare

        // devo settare lo spawnTurn se sono disattivati e lo spawnTurn è passato
        if (powerups.glasses.spawnTurn < currentTurn) {
            powerups.glasses.spawnTurn = currentTurn + 20;
        } else if (powerups.glasses.spawnTurn == currentTurn) {
            // se il turno è quello di spawn li faccio spawnare
            powerups.glasses.active = true;
            let randN, randN2;

            let maxSearches = 100, searches = 0; // just for safety
            do {
                randN = Math.floor(Math.random() * SIZE);  // questo decide dove sulla diagonale centrale
                randN2 = Math.floor(Math.random() * 2) - 1;  // questo decide se un po sopra, sotto o esattamente sulla diagonale

                if (randN === 7 && randN2 === -1)
                    randN2 = 1;
                else if (randN === 0 && randN2 === 1)
                    randN2 = -1;

                powerups.glasses.i = (SIZE - 1) - randN + randN2;
                powerups.glasses.j = randN;

                searches++;
                // do while per evitare che spownino sui giocatori ma che si ferma dopo 100 iterazioni per sicurezza
            } while (((p1.i === powerups.glasses.i && p1.j === powerups.glasses.j) || (p2.i === powerups.glasses.i && p2.j === powerups.glasses.j)) && searches < maxSearches);
        }

        // rimuovo il powerup a tutti i giocatori
        p1.powerups.glasses = false;
        p2.powerups.glasses = false;

        // setto lo stile della roba che fa capire ai giocatori cosa sta succedendo
        document.getElementById('host-powerup-glasses').style.display = 'none';
        document.getElementById('guest-powerup-glasses').style.display = 'none';
    }
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
        resetGame();
        drawGame();
        App.game.running = true;
        AppLocal.myTurn = App.mode === 'host'; // il host inizia (se è questo il tuo rule)

        while (App.game.running) {
            // se non è il mio turno, aspettiamo un po' e ricontrolliamo.
            // Quando arriva un messaggio dall'altro client, manage*Messages() imposterà App e AppLocal.myTurn = true;
            if (!AppLocal.myTurn) {
                // piccolo sleep non bloccante
                await new Promise(r => setTimeout(r, 100));
                continue;
            }

            document.getElementById('turn').className = 'true';

            // valori: host -> 1, guest -> -1
            const val = App.mode === 'host' ? 1 : -1;
            const currentPlayer = App.mode === 'host' ? App.game.players.p1 : App.game.players.p2;
            const enemyPlayer = App.mode === 'host' ? App.game.players.p2 : App.game.players.p1;


            // ============== qui gestisco i powerups ===============
            managePowerUps();
            drawGame();
            // =========== fine gestione powerups =============



            // ======= qui entra il blocco che volevi =======
            // attendo che l'utente clicchi una cella libera
            const { i, j, btn } = await waitForCellClick();

            if (btn == 0) {
                App.game.field[i][j] = val;

                if (App.mode === 'host') {
                    App.game.players.p1.isSquid = false;
                    App.game.players.p1.ammo -= 1;
                } else {
                    App.game.players.p2.isSquid = false;
                    App.game.players.p2.ammo -= 1;
                }

                if (i === enemyPlayer.i && j === enemyPlayer.j && App.game.field[enemyPlayer.i][enemyPlayer.j] === val) {
                    if (App.mode === 'host')
                        App.game.players.p2.lives -= 1;
                    else
                        App.game.players.p1.lives -= 1;
                }

                drawGame();
            } else {
                // aggiorno la posizione del giocatore corrente
                if (App.mode === 'host') {
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
                if (App.mode === 'host')
                    App.game.players.p1.lives -= 1;
                else
                    App.game.players.p2.lives -= 1;
            }

            // disabilito il mio turno e ridisegno
            AppLocal.myTurn = false;
            App.game.turn += 1;
            managePowerUps();
            document.getElementById('turn').className = 'false';
            drawGame();
            // ======= fine del blocco =======

            // qui puoi aggiungere logica per controllare vittoria/fine partita
            if (App.game.players.p1.lives <= 0) {
                App.game.running = false;
                App.game.winner = 'Guest (verde)';
            } else if (App.game.players.p2.lives <= 0) {
                App.game.running = false;
                App.game.winner = 'Host (arancione)';
            }

            // invio lo stato aggiornato all'altro peer
            sendMessage(JSON.stringify(App));

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